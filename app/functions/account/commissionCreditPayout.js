// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability BILL-51 Pay referral commission as Stripe balance credit
// - **Use when:** a referrer on the credit form has payable commission lines that must reach their Stripe customer balance, or a paid line was reversed and the unused credit must come back.
// - **Does:** The commissionCreditPayout.js handler runs monthly on a schedule and does nothing while `payCredit` in referrals.toml is false. It reads the payable pointers by key, then for each live credit line finds the referrer's Stripe customer from their bundles (a bundle with a subscription and a customer id) and creates a negative customer balance transaction, keyed by the line so a retry cannot pay twice. A reversal line debits back the unused credit, capped at the credit left on the customer. The line becomes paid in one conditional update. A referrer with no customer or no live subscription keeps the line payable and is counted in the run summary.
// - **Run:** no command; see Does and Entry
// - **Entry:** `app/functions/account/commissionCreditPayout.js:handler`
// - **Files:** app/functions/account/commissionCreditPayout.js, app/unit-tests/functions/commissionCreditPayout.test.js, app/data/dynamoDbCommissionRepository.js, app/lib/stripeClient.js, referrals.toml
// - **Keywords:** commission, credit, payout, customer balance, balance transaction, referral, scheduled lambda, kill switch
// - **Related:** BILL-46, BILL-47
// @end-capability

// app/functions/account/commissionCreditPayout.js

import { createLogger } from "../../lib/logger.js";
import { validateEnv } from "../../lib/env.js";
import { getStripeClient } from "../../lib/stripeClient.js";
import { loadReferralConfig } from "../../services/referralConfig.js";
import { getLineByKey, queryPayablePointers, markLinePaid, PAYABLE_CREDIT_PARTITION } from "../../data/dynamoDbCommissionRepository.js";
import { getBundlesByHashedSub } from "../../data/dynamoDbBundleRepository.js";

const logger = createLogger({ source: "app/functions/account/commissionCreditPayout.js" });

const COMMISSION_PREFIX = "commission#";
const IDEMPOTENCY_ERROR = "idempotency_error";

function stripeCustomerOf(bundles) {
  const live = bundles.find((bundle) => bundle.stripeCustomerId && bundle.stripeSubscriptionId && bundle.subscriptionStatus === "active");
  return live?.stripeCustomerId ?? null;
}

/** The balance transaction already created for this line, found by its metadata, or null. */
async function findExistingTransaction(stripe, customerId, line) {
  const page = await stripe.customers.listBalanceTransactions(customerId, { limit: 100 });
  return (page.data ?? []).find((transaction) => transaction.metadata?.line === line.sk) ?? null;
}

async function createBalanceTransaction(stripe, customerId, line, referrerHash, amount) {
  return stripe.customers.createBalanceTransaction(
    customerId,
    {
      amount,
      currency: "gbp",
      description: amount < 0 ? "Referral credit" : "Referral credit returned",
      metadata: { invoiceId: line.invoiceId, line: line.sk },
    },
    { idempotencyKey: `commission-credit#${referrerHash}#${line.sk}` },
  );
}

async function payLine({ stripe, line, referrerHash, customerId, now }) {
  const existing = await findExistingTransaction(stripe, customerId, line);
  if (existing) return markLinePaid(line, { now, fields: { balanceTransactionId: existing.id } });

  if (line.amountPence > 0) {
    const transaction = await createBalanceTransaction(stripe, customerId, line, referrerHash, -line.amountPence);
    return markLinePaid(line, { now, fields: { balanceTransactionId: transaction.id } });
  }

  const wanted = -line.amountPence;
  const customer = await stripe.customers.retrieve(customerId);
  const creditLeft = Math.max(0, -(customer.balance ?? 0));
  const debit = Math.min(wanted, creditLeft);
  const shortfallPence = wanted - debit;
  if (debit === 0) return markLinePaid(line, { now, fields: { shortfallPence } });
  const transaction = await createBalanceTransaction(stripe, customerId, line, referrerHash, debit);
  return markLinePaid(line, { now, fields: { balanceTransactionId: transaction.id, shortfallPence } });
}

export async function handler() {
  validateEnv(["COMMISSIONS_DYNAMODB_TABLE_NAME", "BUNDLE_DYNAMODB_TABLE_NAME"]);

  const config = loadReferralConfig();
  if (!config.ledger.payCredit) {
    logger.info({ message: "Commission credit payout switched off" });
    return { status: "off" };
  }

  const now = new Date().toISOString();
  const summary = { status: "ran", considered: 0, paid: 0, debited: 0, alreadyPaid: 0, skipped: 0, noCustomer: 0, failed: 0 };
  const stripe = await getStripeClient({ test: false });
  const customerByReferrer = new Map();

  const pointers = await queryPayablePointers(PAYABLE_CREDIT_PARTITION);
  for (const pointer of pointers) {
    summary.considered += 1;
    const referrerHash = pointer.linePk.slice(COMMISSION_PREFIX.length);
    const line = await getLineByKey(pointer.linePk, pointer.lineSk);
    if (!line || line.state !== "payable" || line.form !== "credit" || line.livemode !== true) {
      summary.skipped += 1;
      continue;
    }

    if (!customerByReferrer.has(referrerHash)) {
      customerByReferrer.set(referrerHash, stripeCustomerOf(await getBundlesByHashedSub(referrerHash)));
    }
    const customerId = customerByReferrer.get(referrerHash);
    if (!customerId) {
      logger.warn({
        message: "Credit line kept payable: referrer has no Stripe customer or live subscription",
        referrerHash,
        line: line.sk,
      });
      summary.noCustomer += 1;
      continue;
    }

    try {
      const updated = await payLine({ stripe, line, referrerHash, customerId, now });
      if (!updated) summary.alreadyPaid += 1;
      else if (line.amountPence > 0) summary.paid += 1;
      else summary.debited += 1;
    } catch (error) {
      const idempotencyMismatch = error?.code === IDEMPOTENCY_ERROR || error?.type === "StripeIdempotencyError";
      logger.error({
        message: idempotencyMismatch
          ? "Credit line left payable: its idempotency key was used with different parameters"
          : "Credit line left payable: Stripe call failed",
        referrerHash,
        line: line.sk,
        error: error?.message,
      });
      summary.failed += 1;
    }
  }

  logger.info({ message: "Commission credit payout finished", ...summary });
  return summary;
}
