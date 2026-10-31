// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability BILL-53 Read the caller's affiliate application
// - **Use when:** a signed-in user returns from Stripe onboarding, or opens the affiliate section, and must see where the application stands.
// - **Does:** The affiliateApplicationGet.js ingestHandler reads the caller's affiliate item. While the state is applied, or approved with transfers not yet active, it reads the Connect account from Stripe and stores details_submitted and the transfers capability. It answers the state, the tier and the two flags, or state null when the caller never applied. A Stripe read failure answers the stored values.
// - **Run:** `GET /api/v1/affiliate/application`
// - **Entry:** `app/functions/account/affiliateApplicationGet.js:ingestHandler`
// - **Files:** app/functions/account/affiliateApplicationGet.js, app/services/affiliateConnect.js, app/unit-tests/functions/affiliateApplicationGet.test.js, web/public/bundles.page.js
// - **Keywords:** affiliate, application, status, stripe connect, details_submitted, onboarding return
// - **Related:** BILL-48, BILL-49, BILL-52
// @end-capability

// app/functions/account/affiliateApplicationGet.js

import { validateEnv } from "../../lib/env.js";
import { createLogger } from "../../lib/logger.js";
import {
  extractRequest,
  http200OkResponse,
  http401UnauthorizedResponse,
  http500ServerErrorResponse,
} from "../../lib/httpResponseHelper.js";
import { decodeJwtToken } from "../../lib/jwtHelper.js";
import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";
import { initializeSalt, hashSub } from "../../services/subHasher.js";
import { needsAccountRefresh, refreshAffiliateAccount, toAffiliateView } from "../../services/affiliateConnect.js";
import { getAffiliate } from "../../data/dynamoDbPassRepository.js";

const logger = createLogger({ source: "app/functions/account/affiliateApplicationGet.js" });

/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "get", "/api/v1/affiliate/application", ingestHandler);
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
  try {
    let item = await getAffiliate(referrerHash);
    if (!item) {
      return http200OkResponse({ request, headers: responseHeaders, data: { state: null } });
    }
    if (needsAccountRefresh(item)) {
      try {
        item = await refreshAffiliateAccount({ referrerHash, item });
      } catch (error) {
        logger.warn({ message: "Affiliate account read failed, answering stored values", error: error.message });
      }
    }
    const view = toAffiliateView(referrerHash, item);
    delete view.referrerHash;
    return http200OkResponse({ request, headers: responseHeaders, data: view });
  } catch (error) {
    logger.error({ message: "Error reading affiliate application", error: error.message, stack: error.stack });
    return http500ServerErrorResponse({
      request,
      headers: responseHeaders,
      message: "Failed to read the affiliate application",
      error: { detail: error.message },
    });
  }
}
