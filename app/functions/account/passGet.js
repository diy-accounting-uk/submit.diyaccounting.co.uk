// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/functions/account/passGet.js

import { validateEnv } from "../../lib/env.js";
import { createLogger } from "../../lib/logger.js";
import { extractRequest, http200OkResponse, http400BadRequestResponse, http500ServerErrorResponse } from "../../lib/httpResponseHelper.js";
import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";
import { checkPass } from "../../services/passService.js";
import { initializeEmailHashSecret } from "../../lib/emailHash.js";

const logger = createLogger({ source: "app/functions/account/passGet.js" });

/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "get", "/api/v1/pass", ingestHandler);
}
/* v8 ignore stop */

export async function ingestHandler(event) {
  validateEnv(["PASSES_DYNAMODB_TABLE_NAME"]);

  try {
    await initializeEmailHashSecret();
  } catch (error) {
    logger.warn({ message: "Email hash secret not available", error: error.message });
  }

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

    return http200OkResponse({
      request,
      headers: responseHeaders,
      data: {
        valid: result.valid,
        reason: result.reason || undefined,
        bundleId: result.bundleId || undefined,
        usesRemaining: result.usesRemaining !== undefined ? result.usesRemaining : undefined,
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
