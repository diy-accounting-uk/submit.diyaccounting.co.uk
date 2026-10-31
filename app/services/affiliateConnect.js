// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/affiliateConnect.js

import { createLogger } from "../lib/logger.js";
import { getStripeClient } from "../lib/stripeClient.js";
import { recordAffiliateAccountStatus } from "../data/dynamoDbPassRepository.js";

const logger = createLogger({ source: "app/services/affiliateConnect.js" });

export const AFFILIATE_PRODUCT_DESCRIPTION =
  "Shares DIY Accounting Submit, a UK software service for Making Tax Digital submissions, and earns a commission on referred customers.";
export const AFFILIATE_RETURN_PATH = "bundles.html";
export const AFFILIATE_SECTION_ANCHOR = "affiliateApplySection";

/**
 * Create the Connect account of an affiliate: UK only, Stripe-hosted onboarding and Express
 * dashboard, the platform liable for losses and paying the fees, transfers as the one capability, and a prefilled product description because a transfers-only GB account pauses without a business profile.
 */
export async function createConnectAccount(stripe, { referrerHash }) {
  return stripe.accounts.create({
    country: "GB",
    controller: {
      stripe_dashboard: { type: "express" },
      fees: { payer: "application" },
      losses: { payments: "application" },
      requirement_collection: "stripe",
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
