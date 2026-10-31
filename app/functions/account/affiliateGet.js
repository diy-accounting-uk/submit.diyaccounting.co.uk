// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability BILL-49 Read an affiliate's tier and state
// - **Use when:** an operator must see the tier and state of a referrer before or after changing them.
// - **Does:** The affiliateGet.js ingestHandler reads the affiliate item of the referrer hash in the query, for an operator only. It answers the tier, the state and the times, or 404 when the referrer has no affiliate item.
// - **Run:** `GET /api/v1/affiliate?referrerHash=<hash>`
// - **Entry:** `app/functions/account/affiliateGet.js:ingestHandler`
// - **Files:** app/functions/account/affiliateGet.js, app/unit-tests/functions/affiliateGet.test.js, web/public/bundles.page.js
// - **Keywords:** affiliate, tier, state, referrer, operator
// - **Related:** BILL-46, BILL-48
// @end-capability

// app/functions/account/affiliateGet.js

import { validateEnv } from "../../lib/env.js";
import { createLogger } from "../../lib/logger.js";
import {
  extractRequest,
  http200OkResponse,
  http400BadRequestResponse,
  http401UnauthorizedResponse,
  http403ForbiddenResponse,
  http404NotFoundResponse,
  http500ServerErrorResponse,
} from "../../lib/httpResponseHelper.js";
import { decodeJwtToken } from "../../lib/jwtHelper.js";
import { isOperatorEmail } from "../../lib/operators.js";
import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";
import { getAffiliate } from "../../data/dynamoDbPassRepository.js";
import { REFERRER_HASH_PATTERN } from "./affiliatePost.js";

const logger = createLogger({ source: "app/functions/account/affiliateGet.js" });

/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "get", "/api/v1/affiliate", ingestHandler);
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
    logger.warn({ message: "Affiliate read refused, caller is not an operator" });
    return http403ForbiddenResponse({ request, headers: responseHeaders, message: "Not permitted to read affiliates" });
  }

  const referrerHash = event.queryStringParameters?.referrerHash;
  if (typeof referrerHash !== "string" || !REFERRER_HASH_PATTERN.test(referrerHash)) {
    return http400BadRequestResponse({ request, headers: responseHeaders, message: "Missing or invalid query: referrerHash" });
  }

  try {
    const item = await getAffiliate(referrerHash);
    if (!item) {
      return http404NotFoundResponse({ request, headers: responseHeaders, message: "No affiliate for that referrer" });
    }
    return http200OkResponse({
      request,
      headers: responseHeaders,
      data: {
        referrerHash,
        tier: item.tier,
        state: item.state,
        updatedAt: item.updatedAt ?? null,
        approvedAt: item.approvedAt ?? null,
      },
    });
  } catch (error) {
    logger.error({ message: "Error reading affiliate", error: error.message, stack: error.stack });
    return http500ServerErrorResponse({
      request,
      headers: responseHeaders,
      message: "Failed to read affiliate",
      error: { detail: error.message },
    });
  }
}
