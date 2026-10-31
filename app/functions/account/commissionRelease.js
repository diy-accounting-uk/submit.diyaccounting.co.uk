// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability BILL-47 Release held commission lines daily
// - **Use when:** a held referral commission line has passed its release time and must become payable, or stay held for a reason.
// - **Does:** The commissionRelease.js handler runs daily on a schedule. For each held pointer that is due, it re-checks the holds on the line: conversion volume, the card of the referrer or a shared card, a customer older than the referral, an early cancel, an unapproved affiliate and a credit referrer with no live subscription. A line with a hold keeps its reasons and its pointer. A line with none becomes payable in one transaction that also adds its amount to the monthly, tax-year or credit cap totals, and a cap that refuses keeps the line held.
// - **Run:** no command; see Does and Entry
// - **Entry:** `app/functions/account/commissionRelease.js:handler`
// - **Files:** app/functions/account/commissionRelease.js, app/unit-tests/functions/commissionRelease.test.js, app/data/dynamoDbBundleRepository.js, app/unit-tests/data/dynamoDbBundleRepository.byHashedSub.test.js, referrals.toml
// - **Keywords:** commission, release, held line, payable, volume hold, card hold, cap, tax year, scheduled lambda
// - **Related:** BILL-46
// @end-capability

// app/functions/account/commissionRelease.js

import { createLogger } from "../../lib/logger.js";
import { validateEnv } from "../../lib/env.js";
import { loadReferralConfig, getTier } from "../../services/referralConfig.js";
import { loadCatalogFromRoot, getCatalogBundleById, getBundlePriceForInterval } from "../../services/productCatalog.js";
import {
  getLine,
  queryDueHeldPointers,
  deleteHeldPointer,
  queryConversions,
  queryCardPayers,
  setHoldReasons,
  releaseLine,
} from "../../data/dynamoDbCommissionRepository.js";
import { getAffiliate } from "../../data/dynamoDbPassRepository.js";
import { getSubscription } from "../../data/dynamoDbSubscriptionRepository.js";
import { getBundlesByHashedSub } from "../../data/dynamoDbBundleRepository.js";

const logger = createLogger({ source: "app/functions/account/commissionRelease.js" });

const DAY_MS = 24 * 60 * 60 * 1000;
const COMMISSION_PREFIX = "commission#";

/** The UK tax year a UTC instant falls in, as "2026-27"; the year starts on 6 April. */
export function taxYearOf(date) {
  const year = date.getUTCFullYear();
  const startsThisYear = date.getUTCMonth() > 3 || (date.getUTCMonth() === 3 && date.getUTCDate() >= 6);
  const startYear = startsThisYear ? year : year - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

function liveBundles(bundles) {
  return bundles.filter((bundle) => bundle.stripeSubscriptionId && bundle.subscriptionStatus === "active");
}

async function evaluateHolds({ line, referrerHash, tier, config, bundles }) {
  const reasons = [];

  const conversions = await queryConversions(referrerHash, line.referralCode);
  if (conversions.some((item) => item.conversions > config.ledger.volumeHoldConversionsPerDay)) {
    reasons.push("volume");
  }

  if (line.cardFingerprint) {
    const payers = await queryCardPayers(line.cardFingerprint);
    const payerHashes = payers.map((payer) => String(payer.sk).slice("payer#".length));
    if (payerHashes.includes(referrerHash)) reasons.push("card_referrer");
    if (payerHashes.some((hash) => hash !== line.redeemerHash)) reasons.push("card_shared");
  }

  if (line.customerCreatedAt && line.redeemedAt && line.customerCreatedAt < line.redeemedAt) {
    reasons.push("customer_predates_referral");
  }

  const subscription = await getSubscription(`stripe#${line.subscriptionId}`);
  if (subscription?.status === "canceled" && subscription.canceledAt && line.firstPaidAt) {
    const lifetimeMs = new Date(subscription.canceledAt).getTime() - new Date(line.firstPaidAt).getTime();
    if (lifetimeMs < config.ledger.earlyCancelDays * DAY_MS) reasons.push("early_cancel");
  }

  if (tier.form === "cash") {
    const affiliate = await getAffiliate(referrerHash);
    if (affiliate?.state !== "approved") reasons.push("affiliate_not_approved");
  } else if (liveBundles(bundles).length === 0) {
    reasons.push("no_subscription");
  }

  return reasons;
}

/** The credit cap in pence: capCreditMonths times the monthly price of the referrer's dearest live bundle. */
function creditCapPence(tier, bundles, catalog) {
  let highest = 0;
  for (const bundle of liveBundles(bundles)) {
    const price = getBundlePriceForInterval(getCatalogBundleById(catalog, bundle.bundleId), "month");
    if (price && price.amount > highest) highest = price.amount;
  }
  return tier.capCreditMonths * highest;
}

function totalsFor(line, tier, { payableMonth, payableTaxYear, bundles, catalog }) {
  if (tier.form === "credit") {
    return [{ sk: "totals#credit", field: "creditPence", cap: creditCapPence(tier, bundles, catalog), reason: "cap_credit" }];
  }
  const totals = [];
  if (tier.capMonthPence) {
    totals.push({ sk: `totals#month#${payableMonth}`, field: "cashPence", cap: tier.capMonthPence, reason: "cap_month" });
  }
  if (tier.capTaxYearPence) {
    totals.push({ sk: `totals#taxyear#${payableTaxYear}`, field: "cashPence", cap: tier.capTaxYearPence, reason: "cap_tax_year" });
  }
  return totals;
}

export async function handler() {
  validateEnv([
    "COMMISSIONS_DYNAMODB_TABLE_NAME",
    "SUBSCRIPTIONS_DYNAMODB_TABLE_NAME",
    "BUNDLE_DYNAMODB_TABLE_NAME",
    "PASSES_DYNAMODB_TABLE_NAME",
  ]);

  const nowDate = new Date();
  const now = nowDate.toISOString();
  const config = loadReferralConfig();
  const catalog = loadCatalogFromRoot();
  const payableMonth = now.slice(0, 7);
  const payableTaxYear = taxYearOf(nowDate);

  const summary = { evaluated: 0, released: 0, held: 0, stale: 0 };
  const pointers = await queryDueHeldPointers(now);

  for (const pointer of pointers) {
    summary.evaluated += 1;
    const referrerHash = pointer.linePk.slice(COMMISSION_PREFIX.length);
    const line = await getLine(referrerHash, pointer.lineSk.slice("line#".length));
    if (!line || line.state !== "held") {
      await deleteHeldPointer(pointer.sk);
      summary.stale += 1;
      continue;
    }

    const tier = getTier(config, line.tier);
    const bundles = tier.form === "credit" ? await getBundlesByHashedSub(referrerHash) : [];
    const reasons = await evaluateHolds({ line, referrerHash, tier, config, bundles });

    const totals = reasons.length === 0 ? totalsFor(line, tier, { payableMonth, payableTaxYear, bundles, catalog }) : [];
    for (const total of totals) {
      if (total.cap !== null && line.amountPence > total.cap) reasons.push(total.reason);
    }
    if (reasons.length > 0) {
      await setHoldReasons(line, reasons, now);
      summary.held += 1;
      continue;
    }

    const outcome = await releaseLine(line, {
      now,
      payableMonth,
      payableTaxYear,
      totals: totals.map(({ sk, field, cap }) => ({ sk, field, cap })),
    });
    if (outcome.released) {
      summary.released += 1;
    } else if (outcome.totalsIndex >= 0) {
      await setHoldReasons(line, [totals[outcome.totalsIndex].reason], now);
      summary.held += 1;
    } else {
      summary.stale += 1;
    }
  }

  logger.info({ message: "Commission release finished", ...summary });
  return summary;
}
