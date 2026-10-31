// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability BILL-08 Check a pass's validity
// - **Use when:** a pass code must be checked before login, without consuming a use.
// - **Does:** The passGet.js ingestHandler calls passService.checkPass to report whether a code is valid. For an email-restricted pass with no email supplied, it reports valid but email-restricted, and does not increment the use count.
// - **Run:** `GET /api/v1/pass`
// - **Entry:** `app/functions/account/passGet.js:ingestHandler`
// - **Files:** app/functions/account/passGet.js
// - **Keywords:** pass, check pass, validity, pre-login, checkPass, email restricted
// - **Related:** BILL-10
// @end-capability

// app/functions/account/passGet.js

import { validateEnv } from "../../lib/env.js";
import { createLogger } from "../../lib/logger.js";
import { extractRequest, http200OkResponse, http400BadRequestResponse, http500ServerErrorResponse } from "../../lib/httpResponseHelper.js";
import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";
import { checkPass } from "../../services/passService.js";
import { publishActivityEvent } from "../../lib/activityAlert.js";

const logger = createLogger({ source: "app/functions/account/passGet.js" });

/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "get", "/api/v1/pass", ingestHandler);
}
/* v8 ignore stop */

export async function ingestHandler(event) {
  validateEnv(["PASSES_DYNAMODB_TABLE_NAME"]);

  const { request } = extractRequest(event);
  const responseHeaders = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };

  const code =
    event?.queryStringParameters?.code ||
    (event?.requestContext?.http?.path || "").split("?code=")[1] ||
    new URLSearchParams(event?.rawQueryString || "").get("code");

  if (!code) {
    return http400BadRequestResponse({
      request,
      headers: responseHeaders,
      message: "Missing required query parameter: code",
    });
  }

  try {
    const result = await checkPass(code);

    // A visit to a pass link reaches here from bundles.html before any sign-in. The event names the
    // issuer's hash and the pass type, never the code, so the lake can count visits per issuer.
    if (result.pass?.issuedBy) {
      await publishActivityEvent({
        event: "pass-link-visited",
        summary: "Pass link opened",
        actor: "visitor",
        flow: "user-journey",
        detail: { passTypeId: result.pass.passTypeId, issuedBy: result.pass.issuedBy, valid: result.valid },
      });
    }

    return http200OkResponse({
      request,
      headers: responseHeaders,
      data: {
        valid: result.valid,
        reason: result.reason || undefined,
        bundleId: result.bundleId || undefined,
        usesRemaining: result.usesRemaining !== undefined ? result.usesRemaining : undefined,
        emailRestricted: result.emailRestricted || undefined,
      },
    });
  } catch (error) {
    logger.error({ message: "Error checking pass", error: error.message, stack: error.stack });
    return http500ServerErrorResponse({
      request,
      headers: responseHeaders,
      message: "Failed to check pass",
      error: { detail: error.message },
    });
  }
}
