// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability BILL-45 Release a pass held for review
// - **Use when:** an operator must let a digital pass that reached its review limit be used again.
// - **Does:** The passReleasePost.js ingestHandler raises a pass's reviewLimit by an amount, sets it to a value, or removes it, for an operator only. It calls passService.releasePass and answers the pass's new limit and use count.
// - **Run:** `POST /api/v1/pass/release`
// - **Entry:** `app/functions/account/passReleasePost.js:ingestHandler`
// - **Files:** app/functions/account/passReleasePost.js, app/unit-tests/functions/passReleasePost.test.js
// - **Keywords:** pass, release, held for review, reviewLimit, operator
// - **Related:** BILL-07, BILL-09
// @end-capability

// app/functions/account/passReleasePost.js

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
  parseRequestBody,
} from "../../lib/httpResponseHelper.js";
import { decodeJwtToken } from "../../lib/jwtHelper.js";
import { isOperatorEmail } from "../../lib/operators.js";
import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";
import { releasePass } from "../../services/passService.js";

const logger = createLogger({ source: "app/functions/account/passReleasePost.js" });

/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "post", "/api/v1/pass/release", ingestHandler);
}
/* v8 ignore stop */

const isPositiveInteger = (value) => Number.isInteger(value) && value > 0;

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
    logger.warn({ message: "Pass release refused, caller is not an operator" });
    return http403ForbiddenResponse({ request, headers: responseHeaders, message: "Not permitted to release passes" });
  }

  const requestBody = parseRequestBody(event);
  if (event.body && !requestBody) {
    return http400BadRequestResponse({ request, headers: responseHeaders, message: "Invalid JSON in request body" });
  }
  if (!requestBody || typeof requestBody.code !== "string" || !requestBody.code) {
    return http400BadRequestResponse({ request, headers: responseHeaders, message: "Missing required field: code" });
  }

  const { code, raiseBy, reviewLimit, remove } = requestBody;
  const changes = [raiseBy !== undefined, reviewLimit !== undefined, remove !== undefined];
  if (changes.filter(Boolean).length !== 1) {
    return http400BadRequestResponse({
      request,
      headers: responseHeaders,
      message: "Give exactly one of raiseBy, reviewLimit or remove",
    });
  }
  if (
    (raiseBy !== undefined && !isPositiveInteger(raiseBy)) ||
    (reviewLimit !== undefined && !isPositiveInteger(reviewLimit)) ||
    (remove !== undefined && remove !== true)
  ) {
    return http400BadRequestResponse({
      request,
      headers: responseHeaders,
      message: "raiseBy and reviewLimit must be positive whole numbers; remove must be true",
    });
  }

  try {
    const pass = await releasePass(code, { raiseBy, reviewLimit, remove });
    if (!pass) {
      return http404NotFoundResponse({ request, headers: responseHeaders, message: "Pass not found" });
    }
    logger.info({ message: "Pass review limit changed", code });
    return http200OkResponse({
      request,
      headers: responseHeaders,
      data: {
        code: pass.code,
        useCount: pass.useCount,
        reviewLimit: pass.reviewLimit ?? null,
        heldForReview: pass.reviewLimit !== undefined && pass.useCount >= pass.reviewLimit,
      },
    });
  } catch (error) {
    logger.error({ message: "Error releasing pass", error: error.message, stack: error.stack });
    return http500ServerErrorResponse({
      request,
      headers: responseHeaders,
      message: "Failed to release pass",
      error: { detail: error.message },
    });
  }
}
