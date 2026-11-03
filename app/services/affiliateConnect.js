// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/affiliateConnect.js

import { createLogger } from "../lib/logger.js";
import { getStripeClient } from "../lib/stripeClient.js";
import { recordAffiliateAccountStatus } from "../data/dynamoDbPassRepository.js";
import { loadReferralConfig } from "./referralConfig.js";

const logger = createLogger({ source: "app/services/affiliateConnect.js" });

export const AFFILIATE_PRODUCT_DESCRIPTION =
  "Shares DIY Accounting Submit, a UK software service for Making Tax Digital submissions, and earns a commission on referred customers.";
export const AFFILIATE_RETURN_PATH = "bundles.html";
export const AFFILIATE_SECTION_ANCHOR = "affiliateApplySection";

/**
 * Whether the platform collects the account's requirements through the API. True only for a
 * synthetic caller in an environment that the test-journey list names, so that the commission
 * journeys can onboard a test account without the hosted page. Every other caller uses the
 * Stripe-hosted onboarding.
 */
export function collectsRequirementsInApplication({ test }) {
  if (test !== true) return false;
  return (loadReferralConfig().ledger.testJourneyEnvironments || []).includes(process.env.ENVIRONMENT_NAME);
}

/**
 * Create the Connect account of an affiliate: UK only, the platform liable for losses and paying
 * the fees, transfers as the one capability, and a prefilled product description because a
 * transfers-only GB account pauses without a business profile. Stripe hosts the onboarding and the
 * Express dashboard, except when the platform collects the requirements (no Stripe dashboard).
 */
export async function createConnectAccount(stripe, { referrerHash, platformCollected = false }) {
  return stripe.accounts.create({
    country: "GB",
    controller: {
      stripe_dashboard: { type: platformCollected ? "none" : "express" },
      fees: { payer: "application" },
      losses: { payments: "application" },
      requirement_collection: platformCollected ? "application" : "stripe",
    },
    capabilities: { transfers: { requested: true } },
    business_profile: { product_description: AFFILIATE_PRODUCT_DESCRIPTION },
    metadata: { referrerHash },
  });
}

/** A one-use Stripe-hosted onboarding link for the account. The link goes only to the signed-in applicant. */
export async function createOnboardingLink(stripe, { accountId, baseUrl }) {
  const page = `${baseUrl}${AFFILIATE_RETURN_PATH}`;
  return stripe.accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    return_url: `${page}?affiliate=return#${AFFILIATE_SECTION_ANCHOR}`,
    refresh_url: `${page}?affiliate=refresh#${AFFILIATE_SECTION_ANCHOR}`,
  });
}

/**
 * Read the Connect account behind an affiliate item from Stripe and store what it reports.
 * Returns the item as stored.
 */
export async function refreshAffiliateAccount({ referrerHash, item, nowIso = new Date().toISOString() }) {
  const stripe = await getStripeClient({ test: item.stripeTest === true });
  const account = await stripe.accounts.retrieve(item.stripeAccountId);
  const stored = await recordAffiliateAccountStatus({
    referrerHash,
    detailsSubmitted: account.details_submitted === true,
    transfersActive: account.capabilities?.transfers === "active",
    now: nowIso,
  });
  logger.info({
    message: "Affiliate account read",
    referrerHash,
    detailsSubmitted: stored.detailsSubmitted,
    transfersActive: stored.transfersActive,
  });
  return stored;
}

/**
 * Whether a read of the affiliate should ask Stripe for the account first: while the application is
 * open, and after approval until the transfers capability is active.
 */
export function needsAccountRefresh(item) {
  if (!item?.stripeAccountId) return false;
  return item.state === "applied" || (item.state === "approved" && item.transfersActive !== true);
}

/** The fields of an affiliate item that the applicant and the operator may see. */
export function toAffiliateView(referrerHash, item) {
  return {
    referrerHash,
    tier: item.tier,
    state: item.state,
    updatedAt: item.updatedAt ?? null,
    approvedAt: item.approvedAt ?? null,
    hasConnectAccount: Boolean(item.stripeAccountId),
    detailsSubmitted: item.detailsSubmitted === true,
    transfersActive: item.transfersActive === true,
  };
}
