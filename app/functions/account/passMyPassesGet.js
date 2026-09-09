// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/account/passMyPassesGet.js

import { validateEnv } from "../../lib/env.js";
import { createLogger } from "../../lib/logger.js";
import { extractRequest, http200OkResponse, http403ForbiddenResponse, http500ServerErrorResponse } from "../../lib/httpResponseHelper.js";
import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";
import { initializeSalt, hashSub } from "../../services/subHasher.js";
import { getPassesByIssuer } from "../../data/dynamoDbPassRepository.js";
import { decodeJwtToken } from "../../lib/jwtHelper.js";

const logger = createLogger({ source: "app/functions/account/passMyPassesGet.js" });

/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "get", "/api/v1/pass/my-passes", ingestHandler);
}
/* v8 ignore stop */

export async function ingestHandler(event) {
  validateEnv(["PASSES_DYNAMODB_TABLE_NAME"]);

  await initializeSalt();

  const { request } = extractRequest(event);
  const responseHeaders = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };

  // Authenticate
  let decodedToken;
  try {
    decodedToken = decodeJwtToken(event.headers);
  } catch {
    return http403ForbiddenResponse({ request, headers: responseHeaders, message: "Authentication required" });
  }

  const userSub = decodedToken.sub;
  const hashedSub = hashSub(userSub);

  // Parse query params
  const queryParams = event.queryStringParameters || {};
  const limit = Math.min(parseInt(queryParams.limit || "20", 10), 50);

  logger.info({ message: "Listing user passes", hashedSub, limit });

  try {
    const result = await getPassesByIssuer(hashedSub, { limit });

    // Map passes to safe public-facing format
    const passes = result.items.map((pass) => ({
      code: pass.code,
      passTypeId: pass.passTypeId,
      bundleId: pass.bundleId,
      validFrom: pass.validFrom,
      validUntil: pass.validUntil || null,
      maxUses: pass.maxUses,
      useCount: pass.useCount,
      createdAt: pass.createdAt,
      notes: pass.notes || null,
      revokedAt: pass.revokedAt || null,
    }));

    return http200OkResponse({
      request,
      headers: responseHeaders,
      data: {
        passes,
        count: passes.length,
      },
    });
  } catch (error) {
    logger.error({ message: "Error listing user passes", error: error.message, stack: error.stack });
    return http500ServerErrorResponse({
      request,
      headers: responseHeaders,
      message: "Failed to list passes",
      error: { detail: error.message },
    });
  }
}
