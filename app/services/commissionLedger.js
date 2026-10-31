// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability BILL-46 Accrue and reverse referral commission lines
// - **Use when:** a referred customer pays an invoice, or a charge behind a commission line is refunded or disputed.
// - **Does:** accrueCommission runs on invoice.paid. It records the card that paid, finds the referrer from the account's referral claim, fixes the tier on the anchor at the first paid invoice, and writes one commission line for the share of the net charge that falls inside the tier's paid months. The line starts held until its release time. reverseCommissionForCharge turns a held or payable line into reversed, and offsets a paid line with a negative line. referrals.toml sets the tiers and the accrue switch.
// - **Run:** no command; see Does and Entry
// - **Entry:** `app/services/commissionLedger.js:accrueCommission`; `app/services/commissionLedger.js:reverseCommissionForCharge`; `app/services/commissionLedger.js:computeCommission`
// - **Files:** app/services/commissionLedger.js, app/services/referralConfig.js, referrals.toml, app/data/dynamoDbCommissionRepository.js, app/functions/billing/billingWebhookPost.js, app/unit-tests/services/commissionLedger.test.js, app/unit-tests/services/referralConfig.test.js
// - **Keywords:** referral, commission, affiliate, ledger, invoice.paid, refund, dispute, reversal, tier, held line
// - **Related:** BILL-28
// @end-capability

// app/services/commissionLedger.js

import { createLogger } from "../lib/logger.js";
import { loadReferralConfig, getTier, resolveTierId } from "./referralConfig.js";
import { getReferralClaim, getRedemption, getAffiliate } from "../data/dynamoDbPassRepository.js";
import {
  getAnchor,
  getChargePointer,
  getLineByKey,
  putAnchorWithConversion,
  putCardPayer,
  putLineWithPointers,
  putReversalLine,
  reverseHeldLine,
  reversePayableLine,
  reversalSk,
} from "../data/dynamoDbCommissionRepository.js";

const logger = createLogger({ source: "app/services/commissionLedger.js" });

// Pinned because an invoice from basil on carries no `charge`.
export const INVOICE_API_VERSION = "2024-12-18.acacia";

const MS_PER_MONTH = (365.2425 / 12) * 24 * 60 * 60 * 1000;

/** The number of whole months between two instants, nearest month, never below zero. */
export function wholeMonthsBetween(start, end) {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Math.max(0, Math.round(ms / MS_PER_MONTH));
}

/**
 * The commission on one charge. The tier pays for `months` months from the anchor's window start;
 * a line that spans months pays only for those inside the window.
 */
export function computeCommission({ netPence, rateBps, months, windowStart, periodStart, periodEnd }) {
  const lineMonths = Math.max(1, wholeMonthsBetween(periodStart, periodEnd));
  const startIndex = wholeMonthsBetween(windowStart, periodStart);
  const eligibleMonths = Math.min(Math.max(months - startIndex, 0), lineMonths);
  const amountPence = Math.floor((netPence * rateBps * eligibleMonths) / (10000 * lineMonths));
  return { lineMonths, eligibleMonths, amountPence };
}

const toIso = (seconds) => new Date(seconds * 1000).toISOString();

function isAccrualActor(subRecord, invoice) {
  if (subRecord.actor) return subRecord.actor === "customer";
  return invoice.livemode === true;
}

/**
 * Record the commission line, if any, for a paid invoice. Throws on a storage or Stripe failure;
 * the caller isolates it.
 */
export async function accrueCommission({ invoice, subscriptionId, subRecord, stripe, nowIso = new Date().toISOString() }) {
  const config = loadReferralConfig();
  if (!config.ledger.accrue) {
    logger.info({ message: "Commission accrual switched off", invoiceId: invoice.id });
    return { status: "off" };
  }
  if (!isAccrualActor(subRecord, invoice)) return { status: "not-customer" };

  const { hashedSub } = subRecord;
  const full = await stripe.invoices.retrieve(
    invoice.id,
    { expand: ["charge.balance_transaction", "customer"] },
    { apiVersion: INVOICE_API_VERSION },
  );
  const charge = full.charge;
  if (!charge || typeof charge === "string") return { status: "no-charge" };
  const balanceTransaction = charge.balance_transaction;
  if (!balanceTransaction || typeof balanceTransaction === "string") {
    logger.error({ message: "Commission accrual: charge has no balance transaction", invoiceId: invoice.id, chargeId: charge.id });
    return { status: "no-balance-transaction" };
  }
  if ((balanceTransaction.currency || charge.currency || full.currency) !== "gbp") return { status: "not-gbp" };

  const fingerprint = charge.payment_method_details?.card?.fingerprint || null;
  if (fingerprint) await putCardPayer(fingerprint, hashedSub, nowIso);

  const claim = await getReferralClaim(hashedSub);
  if (!claim?.code) return { status: "not-referred" };
  const referralCode = claim.code;

  const redemption = await getRedemption(referralCode, hashedSub);
  if (!redemption?.issuedBy) {
    logger.warn({ message: "Referral claim has no redemption record", invoiceId: invoice.id });
    return { status: "no-redemption" };
  }
  const referrerHash = redemption.issuedBy;

  const line = full.lines?.data?.find((l) => l.type === "subscription");
  if (!line?.period?.start || !line?.period?.end) return { status: "no-period" };
  const periodStart = toIso(line.period.start);
  const periodEnd = toIso(line.period.end);
  const chargedAt = toIso(charge.created);

  let anchor = await getAnchor(referrerHash, hashedSub);
  if (!anchor) {
    const tier = getTier(config, resolveTierId(config, await getAffiliate(referrerHash)));
    const candidate = {
      referralCode,
      tier: tier.id,
      rateBps: tier.rateBps,
      form: tier.form,
      payout: tier.payout,
      months: tier.months,
      holdDays: tier.holdDays,
      windowStart: periodStart,
      firstPaidAt: chargedAt,
      subscriptionId,
      createdAt: nowIso,
    };
    const written = await putAnchorWithConversion({
      referrerHash,
      redeemerHash: hashedSub,
      anchor: candidate,
      referralCode,
      day: chargedAt.slice(0, 10),
    });
    anchor = written ? candidate : await getAnchor(referrerHash, hashedSub);
  }

  const { lineMonths, eligibleMonths, amountPence } = computeCommission({
    netPence: balanceTransaction.net,
    rateBps: anchor.rateBps,
    months: anchor.months,
    windowStart: anchor.windowStart,
    periodStart,
    periodEnd,
  });
  if (amountPence <= 0) return { status: "no-commission" };

  const refunded = charge.refunded === true || charge.amount_refunded > 0;
  const disputed = Boolean(charge.disputed);
  const reversed = refunded || disputed;
  const releaseAt = new Date(new Date(chargedAt).getTime() + anchor.holdDays * 24 * 60 * 60 * 1000).toISOString();

  const record = {
    referrerHash,
    invoiceId: invoice.id,
    chargeId: charge.id,
    subscriptionId,
    redeemerHash: hashedSub,
    referralCode,
    tier: anchor.tier,
    form: anchor.form,
    payout: anchor.payout,
    rateBps: anchor.rateBps,
    grossPence: charge.amount,
    feePence: balanceTransaction.fee,
    netPence: balanceTransaction.net,
    currency: "gbp",
    eligibleMonths,
    lineMonths,
    amountPence,
    state: reversed ? "reversed" : "held",
    releaseAt,
    chargedAt,
    periodStart,
    periodEnd,
    firstPaidAt: anchor.firstPaidAt,
    livemode: full.livemode === true,
    customerCreatedAt: typeof full.customer === "object" && full.customer?.created ? toIso(full.customer.created) : null,
    redeemedAt: redemption.redeemedAt || null,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  if (fingerprint) record.cardFingerprint = fingerprint;
  if (reversed) {
    record.reversedAt = nowIso;
    record.reversalReason = disputed ? "dispute" : "refund";
  } else {
    record.holdReasons = [];
  }

  const written = await putLineWithPointers(record);
  logger.info({ message: written ? "Commission line recorded" : "Commission line already recorded", invoiceId: invoice.id, amountPence });
  return { status: written ? "recorded" : "duplicate" };
}

function totalsFor(line, tier) {
  if (line.form === "credit") return [{ sk: "totals#credit", field: "creditPence" }];
  const totals = [];
  if (tier.capMonthPence) totals.push({ sk: `totals#month#${line.payableMonth}`, field: "cashPence" });
  if (tier.capTaxYearPence) totals.push({ sk: `totals#taxyear#${line.payableTaxYear}`, field: "cashPence" });
  return totals;
}

/**
 * Reverse the commission line behind a refunded or disputed charge. A partial refund reverses the
 * whole line. Runs whether or not accrual is switched on.
 */
export async function reverseCommissionForCharge(chargeId, reason, { nowIso = new Date().toISOString() } = {}) {
  const pointer = await getChargePointer(chargeId);
  if (!pointer) return { status: "no-line" };
  const line = await getLineByKey(pointer.linePk, pointer.lineSk);
  if (!line) return { status: "no-line" };

  switch (line.state) {
    case "held": {
      const done = await reverseHeldLine(line, { reason, now: nowIso });
      return { status: done ? "reversed" : "changed" };
    }
    case "payable": {
      const tier = getTier(loadReferralConfig(), line.tier);
      const done = await reversePayableLine(line, { reason, now: nowIso, totals: totalsFor(line, tier) });
      return { status: done ? "reversed" : "changed" };
    }
    case "paid": {
      const reversal = {
        ...line,
        sk: reversalSk(line.invoiceId),
        amountPence: -line.amountPence,
        state: "payable",
        reversalOf: line.sk,
        reversalReason: reason,
        reversedAt: nowIso,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      delete reversal.paidAt;
      delete reversal.holdReasons;
      const done = await putReversalLine(reversal);
      return { status: done ? "reversal-line" : "duplicate" };
    }
    default:
      return { status: "already-reversed" };
  }
}
