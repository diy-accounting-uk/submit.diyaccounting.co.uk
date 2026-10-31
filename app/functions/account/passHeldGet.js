// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability BILL-50 List the passes held for review
// - **Use when:** an operator must see every pass held for review, whoever issued it, and release one.
// - **Does:** The passHeldGet.js ingestHandler lists the passes held for review, for an operator only. It calls passService.listHeldPasses, which Queries the issuedBy-index under the constant key "held". passService writes a held pointer item when a redemption brings a pass's useCount up to its reviewLimit and deletes it when a release lifts the hold. Each row carries code, issuer hash, use count, review limit and held time. The operator dashboard lists them with a Release button that posts to passReleasePost.js.
// - **Run:** `GET /api/v1/pass/held`
// - **Entry:** `app/functions/account/passHeldGet.js:ingestHandler`
// - **Files:** app/functions/account/passHeldGet.js, app/unit-tests/functions/passHeldGet.test.js, web/public/operator/dashboard.page.js, web/browser-tests/operatorHeldPasses.browser.test.js
// - **Keywords:** pass, held for review, held pointer, operator, release, issuedBy-index
// - **Related:** BILL-45, BILL-10, DATA-26
// @end-capability

// app/functions/account/passHeldGet.js

import { validateEnv } from "../../lib/env.js";
import { createLogger } from "../../lib/logger.js";
import {
  extractRequest,
  http200OkResponse,
  http401UnauthorizedResponse,
  http403ForbiddenResponse,
  http500ServerErrorResponse,
} from "../../lib/httpResponseHelper.js";
import { decodeJwtToken } from "../../lib/jwtHelper.js";
import { isOperatorEmail } from "../../lib/operators.js";
import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";
import { listHeldPasses } from "../../services/passService.js";

const logger = createLogger({ source: "app/functions/account/passHeldGet.js" });

/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "get", "/api/v1/pass/held", ingestHandler);
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
    logger.warn({ message: "Held pass list refused, caller is not an operator" });
    return http403ForbiddenResponse({ request, headers: responseHeaders, message: "Not permitted to list held passes" });
  }

  try {
    const passes = await listHeldPasses();
    return http200OkResponse({ request, headers: responseHeaders, data: { passes } });
  } catch (error) {
    logger.error({ message: "Error listing held passes", error: error.message, stack: error.stack });
    return http500ServerErrorResponse({
      request,
      headers: responseHeaders,
      message: "Failed to list held passes",
      error: { detail: error.message },
    });
  }
}
