// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability BILL-52 Start an affiliate application through Stripe Connect
// - **Use when:** a signed-in user applies to become an affiliate, or returns to finish a Stripe onboarding they left.
// - **Does:** The affiliateApplicationPost.js ingestHandler creates a UK Connect account for the caller on first use and stores its id on the affiliate item with the state applied. It answers a new Stripe-hosted onboarding link for the caller only. It refuses an approved or ended affiliate with 409. A synthetic test user gets a Stripe test-mode account.
// - **Run:** `POST /api/v1/affiliate/application`
// - **Entry:** `app/functions/account/affiliateApplicationPost.js:ingestHandler`
// - **Files:** app/functions/account/affiliateApplicationPost.js, app/services/affiliateConnect.js, app/unit-tests/functions/affiliateApplicationPost.test.js, app/test-support/stripeSimulator.js, web/public/bundles.page.js
// - **Keywords:** affiliate, apply, application, stripe connect, onboarding, account link, kyc
// - **Related:** BILL-48, BILL-49, BILL-53
// @end-capability

// app/functions/account/affiliateApplicationPost.js

import { validateEnv } from "../../lib/env.js";
import { createLogger } from "../../lib/logger.js";
import {
  extractRequest,
  http200OkResponse,
  http401UnauthorizedResponse,
  http409ConflictResponse,
  http500ServerErrorResponse,
} from "../../lib/httpResponseHelper.js";
import { decodeJwtToken } from "../../lib/jwtHelper.js";
import { isSyntheticTestUserEmail } from "../../lib/syntheticTestUser.js";
import { publishActivityEvent } from "../../lib/activityAlert.js";
import { getStripeClient } from "../../lib/stripeClient.js";
import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";
import { initializeSalt, hashSub } from "../../services/subHasher.js";
import { createConnectAccount, createOnboardingLink } from "../../services/affiliateConnect.js";
import { getAffiliate, startAffiliateApplication } from "../../data/dynamoDbPassRepository.js";

const logger = createLogger({ source: "app/functions/account/affiliateApplicationPost.js" });

const APPLICATION_TIER = "casual";

/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "post", "/api/v1/affiliate/application", ingestHandler);
}
/* v8 ignore stop */

export async function ingestHandler(event) {
  validateEnv(["PASSES_DYNAMODB_TABLE_NAME"]);
  await initializeSalt();

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

  const referrerHash = hashSub(decodedToken.sub);
  const test = isSyntheticTestUserEmail(decodedToken.email || "");

  try {
    let item = await getAffiliate(referrerHash);
    if (item?.state === "approved" || item?.state === "ended") {
      return http409ConflictResponse({
        request,
        headers: responseHeaders,
        message: item.state === "approved" ? "You are already an approved affiliate" : "This affiliate has ended",
      });
    }

    const stripe = await getStripeClient({ test: item?.stripeAccountId ? item.stripeTest === true : test });
    let applicationStarted = false;
    if (!item?.stripeAccountId) {
      const account = await createConnectAccount(stripe, { referrerHash });
      applicationStarted = await startAffiliateApplication({
        referrerHash,
        tier: APPLICATION_TIER,
        stripeAccountId: account.id,
        stripeTest: test,
        now: new Date().toISOString(),
      });
      item = await getAffiliate(referrerHash);
    }

    const baseUrl = process.env.DIY_SUBMIT_BASE_URL || "https://submit.diyaccounting.co.uk/";
    const link = await createOnboardingLink(stripe, { accountId: item.stripeAccountId, baseUrl });

    if (applicationStarted) {
      await publishActivityEvent({
        event: "affiliate-application-started",
        site: "submit",
        summary: `Affiliate application started: ${referrerHash}`,
        flow: "user-journey",
        userSub: decodedToken.sub,
      });
    }

    return http200OkResponse({ request, headers: responseHeaders, data: { state: item.state, url: link.url } });
  } catch (error) {
    logger.error({ message: "Error starting affiliate application", error: error.message, stack: error.stack });
    return http500ServerErrorResponse({
      request,
      headers: responseHeaders,
      message: "Failed to start the affiliate application",
      error: { detail: error.message },
    });
  }
}
