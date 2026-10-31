// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability BILL-54 Pay referral commission in cash through Stripe Connect
// - **Use when:** an approved affiliate on a tier with `payout = "connect"` has payable cash commission lines that must reach their Stripe Connect account, or a paid line was reversed and must come off the next payout.
// - **Does:** The commissionCashPayout.js handler runs monthly on a schedule and does nothing while `payCash` in referrals.toml is false. It reads the Connect payable pointers by key and groups them by affiliate. For each affiliate that is approved, on a connect tier, with a Connect account whose transfers capability Stripe reports active, it first completes any pending payout, then nets the negative reversal lines against the positive lines, oldest first, inside the tier's monthly and tax-year caps less what was already paid. It pays only when the net reaches the tier's minPayoutPence: a pending payout item first, then one GBP transfer keyed by the affiliate and the month, then each line paid with the transfer id. Lines over a cap, a net under the minimum and a negative net stay payable for the next run.
// - **Run:** no command; see Does and Entry
// - **Entry:** `app/functions/account/commissionCashPayout.js:handler`; `app/functions/account/commissionCashPayout.js:selectPayout`
// - **Files:** app/functions/account/commissionCashPayout.js, app/unit-tests/functions/commissionCashPayout.test.js, app/data/dynamoDbCommissionRepository.js, app/data/dynamoDbPassRepository.js, app/test-support/stripeSimulator.js, app/lib/ukTaxYear.js, referrals.toml
// - **Keywords:** commission, cash, payout, stripe connect, transfer, affiliate, cap, tax year, minimum payout, reversal netting, scheduled lambda, kill switch
// - **Related:** BILL-46, BILL-47, BILL-51, BILL-52
// @end-capability

// app/functions/account/commissionCashPayout.js

import { createLogger } from "../../lib/logger.js";
import { validateEnv } from "../../lib/env.js";
import { getStripeClient } from "../../lib/stripeClient.js";
import { taxYearOf } from "../../lib/ukTaxYear.js";
import { loadReferralConfig } from "../../services/referralConfig.js";
import {
  commissionPk,
  getLineByKey,
  markLinePaid,
  markPayoutPaid,
  putPendingPayout,
  queryPayablePointers,
  queryPayouts,
  PAYABLE_CONNECT_PARTITION,
} from "../../data/dynamoDbCommissionRepository.js";
import { getAffiliate, recordAffiliateAccountStatus } from "../../data/dynamoDbPassRepository.js";

const logger = createLogger({ source: "app/functions/account/commissionCashPayout.js" });

export const transferIdempotencyKey = (referrerHash, month) => `commission-cash#${referrerHash}#${month}`;
export const transferGroup = (referrerHash, month) => `commission-cash-${referrerHash}-${month}`;

function connectTier(config, tierId) {
  const tier = config.tiers.find((candidate) => candidate.id === tierId);
  return tier?.payout === "connect" ? tier : null;
}

function capRoom(cap, used) {
  return Number.isInteger(cap) ? cap - used : Number.POSITIVE_INFINITY;
}

const releaseOrder = (line) => line.payableAt || line.chargedAt || line.sk;

/**
 * Choose the lines of one payout. Every negative line is netted in; positive lines join oldest
 * first while the net stays within `roomPence`. Returns the chosen lines, their net and the
 * positive lines left for a later run.
 */
export function selectPayout(lines, { roomPence }) {
  const negatives = lines.filter((line) => line.amountPence < 0);
  const positives = lines.filter((line) => line.amountPence > 0).sort((a, b) => releaseOrder(a).localeCompare(releaseOrder(b)));
  const chosen = [...negatives];
  const left = [];
  let netPence = negatives.reduce((sum, line) => sum + line.amountPence, 0);
  for (const line of positives) {
    if (netPence + line.amountPence <= roomPence) {
      chosen.push(line);
      netPence += line.amountPence;
    } else {
      left.push(line);
    }
  }
  return { chosen, netPence, left };
}

/**
 * Make the transfer of a pending payout, or find the one already made, then mark its lines and
 * the payout paid. Safe to repeat: the transfer is found by its group before a new one is made,
 * and the create carries a key fixed by the affiliate and the month.
 */
async function completePayout({ stripe, referrerHash, payout, now }) {
  const group = transferGroup(referrerHash, payout.month);
  const found = await stripe.transfers.list({ destination: payout.stripeAccountId, transfer_group: group, limit: 1 });
  const transfer =
    found.data?.[0] ??
    (await stripe.transfers.create(
      {
        amount: payout.amountPence,
        currency: "gbp",
        destination: payout.stripeAccountId,
        transfer_group: group,
        description: "Referral commission",
        metadata: { referrerHash, month: payout.month, lines: String(payout.lineSks.length) },
      },
      { idempotencyKey: transferIdempotencyKey(referrerHash, payout.month) },
    ));

  for (const sk of payout.lineSks) {
    const line = await getLineByKey(commissionPk(referrerHash), sk);
    if (!line || line.state === "paid") continue;
    const marked = await markLinePaid(line, { now, fields: { transferId: transfer.id, payoutMonth: payout.month } });
    if (!marked) {
      logger.error({ message: "Cash line in a made transfer was no longer payable", referrerHash, line: sk, transferId: transfer.id });
    }
  }
  await markPayoutPaid({ referrerHash, month: payout.month, transferId: transfer.id, now });
  return transfer;
}

async function payAffiliate({ config, referrerHash, lineSks, month, taxYear, now, summary }) {
  const affiliate = await getAffiliate(referrerHash);
  if (affiliate?.state !== "approved") return "notApproved";
  const tier = connectTier(config, affiliate.tier);
  if (!tier) return "notConnect";
  if (!affiliate.stripeAccountId) return "noAccount";

  const stripe = await getStripeClient({ test: affiliate.stripeTest === true });
  const account = await stripe.accounts.retrieve(affiliate.stripeAccountId);
  const transfersActive = account.capabilities?.transfers === "active";
  if (transfersActive !== (affiliate.transfersActive === true)) {
    await recordAffiliateAccountStatus({ referrerHash, detailsSubmitted: account.details_submitted === true, transfersActive, now });
  }
  if (!transfersActive) return "transfersInactive";

  const payouts = await queryPayouts(referrerHash);
  for (const pending of payouts.filter((payout) => payout.state === "pending")) {
    await completePayout({ stripe, referrerHash, payout: pending, now });
    summary.resumed += 1;
  }
  if (payouts.some((payout) => payout.month === month)) return "alreadyPaid";

  const livemode = affiliate.stripeTest !== true;
  const lines = [];
  for (const sk of lineSks) {
    const line = await getLineByKey(commissionPk(referrerHash), sk);
    if (line?.state === "payable" && line.livemode === livemode && connectTier(config, line.tier)) lines.push(line);
  }

  const paidMonthPence = payouts.filter((payout) => payout.month === month).reduce((sum, payout) => sum + payout.amountPence, 0);
  const paidTaxYearPence = payouts.filter((payout) => payout.taxYear === taxYear).reduce((sum, payout) => sum + payout.amountPence, 0);
  const roomPence = Math.min(capRoom(tier.capMonthPence, paidMonthPence), capRoom(tier.capTaxYearPence, paidTaxYearPence));
  const { chosen, netPence, left } = selectPayout(lines, { roomPence });
  summary.cappedLines += left.length;

  if (netPence <= 0) return "nothingDue";
  if (netPence < tier.minPayoutPence) return "belowMinimum";

  const payout = {
    month,
    taxYear,
    amountPence: netPence,
    lineSks: chosen.map((line) => line.sk),
    stripeAccountId: affiliate.stripeAccountId,
  };
  if (!(await putPendingPayout({ referrerHash, ...payout, now }))) return "alreadyPaid";
  const transfer = await completePayout({ stripe, referrerHash, payout, now });
  summary.paidPence += netPence;
  logger.info({ message: "Commission cash transfer made", referrerHash, month, amountPence: netPence, transferId: transfer.id });
  return "paid";
}

export async function handler() {
  validateEnv(["COMMISSIONS_DYNAMODB_TABLE_NAME", "PASSES_DYNAMODB_TABLE_NAME"]);

  const config = loadReferralConfig();
  if (!config.ledger.payCash) {
    logger.info({ message: "Commission cash payout switched off" });
    return { status: "off" };
  }

  const nowDate = new Date();
  const now = nowDate.toISOString();
  const month = now.slice(0, 7);
  const taxYear = taxYearOf(nowDate);
  const summary = {
    status: "ran",
    affiliates: 0,
    paid: 0,
    paidPence: 0,
    resumed: 0,
    belowMinimum: 0,
    nothingDue: 0,
    cappedLines: 0,
    alreadyPaid: 0,
    notApproved: 0,
    notConnect: 0,
    noAccount: 0,
    transfersInactive: 0,
    failed: 0,
  };

  const lineSksByReferrer = new Map();
  for (const pointer of await queryPayablePointers(PAYABLE_CONNECT_PARTITION)) {
    const referrerHash = pointer.linePk.slice("commission#".length);
    if (!lineSksByReferrer.has(referrerHash)) lineSksByReferrer.set(referrerHash, []);
    lineSksByReferrer.get(referrerHash).push(pointer.lineSk);
  }

  for (const [referrerHash, lineSks] of lineSksByReferrer) {
    summary.affiliates += 1;
    try {
      const outcome = await payAffiliate({ config, referrerHash, lineSks, month, taxYear, now, summary });
      summary[outcome] += 1;
    } catch (error) {
      logger.error({
        message: "Commission cash payout failed for an affiliate; its lines stay payable",
        referrerHash,
        error: error?.message,
      });
      summary.failed += 1;
    }
  }

  logger.info({ message: "Commission cash payout finished", ...summary });
  return summary;
}
