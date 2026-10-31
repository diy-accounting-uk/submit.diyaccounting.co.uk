// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability BILL-48 Set an affiliate's tier and state
// - **Use when:** an operator must approve a referrer as an affiliate, change the referrer's tier, or end the affiliate.
// - **Does:** The affiliatePost.js ingestHandler checks the tier against referrals.toml and the state against applied, approved or ended, for an operator only. It writes the affiliate item of the referrer hash with the tier, the state and the time. An approved state also writes approvedAt. Approving a tier paid through Stripe Connect needs a stored Connect account that has submitted its details, else 409; it reads the account from Stripe first when the stored flag is false. Ending needs neither.
// - **Run:** `POST /api/v1/affiliate`
// - **Entry:** `app/functions/account/affiliatePost.js:ingestHandler`
// - **Files:** app/functions/account/affiliatePost.js, app/unit-tests/functions/affiliatePost.test.js, web/public/bundles.page.js
// - **Keywords:** affiliate, approve, tier, referrer, operator, referrals.toml
// - **Related:** BILL-46, BILL-49
// @end-capability

// app/functions/account/affiliatePost.js

import { validateEnv } from "../../lib/env.js";
import { createLogger } from "../../lib/logger.js";
import {
  extractRequest,
  http200OkResponse,
  http400BadRequestResponse,
  http401UnauthorizedResponse,
  http403ForbiddenResponse,
  http409ConflictResponse,
  http500ServerErrorResponse,
  parseRequestBody,
} from "../../lib/httpResponseHelper.js";
import { decodeJwtToken } from "../../lib/jwtHelper.js";
import { isOperatorEmail } from "../../lib/operators.js";
import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";
import { loadReferralConfig } from "../../services/referralConfig.js";
import { refreshAffiliateAccount } from "../../services/affiliateConnect.js";
import { getAffiliate, putAffiliate } from "../../data/dynamoDbPassRepository.js";

const logger = createLogger({ source: "app/functions/account/affiliatePost.js" });

export const AFFILIATE_STATES = ["applied", "approved", "ended"];
export const REFERRER_HASH_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "post", "/api/v1/affiliate", ingestHandler);
}
/* v8 ignore stop */

export async function ingestHandler(event) {
  validateEnv(["PASSES_DYNAMODB_TABLE_NAME"]);

  const { request } = extractRequest(event);
  const responseHeaders = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };

  let decodedToken;
  try {
    decodedToken = decodeJwtToken(event.headers);
  } catch (error) {
    return http401UnauthorizedResponse({
      request,
      headers: responseHeaders,
      message: "Authentication required",
      error: error.message,
    });
  }
  if (!(await isOperatorEmail(decodedToken.email))) {
    logger.warn({ message: "Affiliate change refused, caller is not an operator" });
    return http403ForbiddenResponse({ request, headers: responseHeaders, message: "Not permitted to set affiliates" });
  }

  const requestBody = parseRequestBody(event);
  if (event.body && !requestBody) {
    return http400BadRequestResponse({ request, headers: responseHeaders, message: "Invalid JSON in request body" });
  }
  const { referrerHash, tier, state } = requestBody || {};
  if (typeof referrerHash !== "string" || !REFERRER_HASH_PATTERN.test(referrerHash)) {
    return http400BadRequestResponse({ request, headers: responseHeaders, message: "Missing or invalid field: referrerHash" });
  }
  const tiers = loadReferralConfig().tiers;
  const tierIds = tiers.map((t) => t.id);
  const tierConfig = tiers.find((t) => t.id === tier);
  if (!tierConfig) {
    return http400BadRequestResponse({ request, headers: responseHeaders, message: `tier must be one of ${tierIds.join(", ")}` });
  }
  if (!AFFILIATE_STATES.includes(state)) {
    return http400BadRequestResponse({
      request,
      headers: responseHeaders,
      message: `state must be one of ${AFFILIATE_STATES.join(", ")}`,
    });
  }

  try {
    if (state === "approved" && tierConfig.payout === "connect") {
      let existing = await getAffiliate(referrerHash);
      if (existing?.stripeAccountId && existing.detailsSubmitted !== true) {
        existing = await refreshAffiliateAccount({ referrerHash, item: existing });
      }
      if (!existing?.stripeAccountId || existing.detailsSubmitted !== true) {
        return http409ConflictResponse({
          request,
          headers: responseHeaders,
          message: "This tier is paid through Stripe Connect; the applicant has not finished Stripe onboarding",
        });
      }
    }
    const item = await putAffiliate({ referrerHash, tier, state, now: new Date().toISOString() });
    logger.info({ message: "Affiliate set", referrerHash, tier, state });
    return http200OkResponse({
      request,
      headers: responseHeaders,
      data: {
        referrerHash,
        tier: item.tier,
        state: item.state,
        updatedAt: item.updatedAt,
        approvedAt: item.approvedAt ?? null,
      },
    });
  } catch (error) {
    logger.error({ message: "Error setting affiliate", error: error.message, stack: error.stack });
    return http500ServerErrorResponse({
      request,
      headers: responseHeaders,
      message: "Failed to set affiliate",
      error: { detail: error.message },
    });
  }
}
