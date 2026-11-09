// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability BILL-56 Delete generated passes
// - **Use when:** a user removes passes they generated from the My generated passes list.
// - **Does:** The passDeletePost.js ingestHandler takes 1 to 100 pass codes and, for each pass the caller's hashed sub issued, sets deletedAt and expires the pass at once through dynamoDbPassRepository.expirePassAsDeleted. It answers deleted, not_found_or_not_yours or already_deleted per code. passMyPassesGet.js leaves deleted passes out; a later redemption is refused as expired.
// - **Run:** `POST /api/v1/pass/delete` with body `{ "codes": ["..."] }`
// - **Entry:** `app/functions/account/passDeletePost.js:ingestHandler`
// - **Files:** app/functions/account/passDeletePost.js, app/unit-tests/functions/passDeletePost.test.js, app/unit-tests/data/dynamoDbPassRepository.expirePassAsDeleted.test.js
// - **Keywords:** pass, delete pass, remove pass, expire pass, soft delete
// - **Related:** BILL-09, BILL-10
// @end-capability

// app/functions/account/passDeletePost.js

import { validateEnv } from "../../lib/env.js";
import { createLogger } from "../../lib/logger.js";
import {
  extractRequest,
  http200OkResponse,
  http400BadRequestResponse,
  http403ForbiddenResponse,
  http500ServerErrorResponse,
  parseRequestBody,
} from "../../lib/httpResponseHelper.js";
import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";
import { initializeSalt, hashSub } from "../../services/subHasher.js";
import { expirePassAsDeleted, getPass } from "../../data/dynamoDbPassRepository.js";
import { decodeJwtToken } from "../../lib/jwtHelper.js";
import { corsOriginHeaders } from "../../lib/corsOrigins.js";

export const MAX_CODES_PER_DELETE = 100;

const logger = createLogger({ source: "app/functions/account/passDeletePost.js" });

/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "post", "/api/v1/pass/delete", ingestHandler);
}
/* v8 ignore stop */

function validateCodes(body) {
  const codes = body?.codes;
  if (!Array.isArray(codes) || codes.length < 1 || codes.length > MAX_CODES_PER_DELETE) {
    return { error: `codes must be a list of 1 to ${MAX_CODES_PER_DELETE} pass codes` };
  }
  if (!codes.every((code) => typeof code === "string" && /^[A-Za-z0-9-]{1,100}$/.test(code))) {
    return { error: "every code must be a pass code string" };
  }
  return { codes: [...new Set(codes)] };
}

export async function ingestHandler(event) {
  validateEnv(["PASSES_DYNAMODB_TABLE_NAME"]);

  await initializeSalt();

  const { request } = extractRequest(event);
  const responseHeaders = { "Content-Type": "application/json", ...corsOriginHeaders(event?.headers) };

  let decodedToken;
  try {
    decodedToken = decodeJwtToken(event.headers);
  } catch {
    return http403ForbiddenResponse({ request, headers: responseHeaders, message: "Authentication required" });
  }

  const hashedSub = hashSub(decodedToken.sub);

  const { codes, error } = validateCodes(parseRequestBody(event));
  if (error) {
    return http400BadRequestResponse({ request, headers: responseHeaders, message: error });
  }

  logger.info({ message: "Deleting user passes", hashedSub, count: codes.length });

  try {
    const results = [];
    for (const code of codes) {
      const deleted = await expirePassAsDeleted(code, hashedSub, new Date().toISOString());
      if (deleted) {
        results.push({ code, status: "deleted" });
        continue;
      }
      const stored = await getPass(code);
      const alreadyDeleted = Boolean(stored?.deletedAt) && stored.issuedBy === hashedSub;
      results.push({ code, status: alreadyDeleted ? "already_deleted" : "not_found_or_not_yours" });
    }

    return http200OkResponse({
      request,
      headers: responseHeaders,
      data: { results, deletedCount: results.filter((result) => result.status === "deleted").length },
    });
  } catch (err) {
    logger.error({ message: "Error deleting user passes", error: err.message, stack: err.stack });
    return http500ServerErrorResponse({
      request,
      headers: responseHeaders,
      message: "Failed to delete passes",
      error: { detail: err.message },
    });
  }
}
