// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/functions/account/passGeneratePost.js

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
import { buildHttpResponseFromLambdaResult, buildLambdaEventFromHttpRequest } from "../../lib/httpServerToLambdaAdaptor.js";
import { initializeSalt, hashSub } from "../../services/subHasher.js";
import { createPass } from "../../services/passService.js";
import { consumeTokenForActivity } from "../../services/tokenEnforcement.js";
import { publishActivityEvent } from "../../lib/activityAlert.js";
import { loadPassTypesFromRoot, getPassTypeById, loadCatalogFromRoot } from "../../services/productCatalog.js";
import { decodeJwtToken } from "../../lib/jwtHelper.js";

const logger = createLogger({ source: "app/functions/account/passGeneratePost.js" });

/* v8 ignore start */
export function apiEndpoint(app) {
  app.post("/api/v1/pass/generate", async (httpRequest, httpResponse) => {
    const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
    const lambdaResult = await ingestHandler(lambdaEvent);
    return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
  });
}
/* v8 ignore stop */

export async function ingestHandler(event) {
  validateEnv(["PASSES_DYNAMODB_TABLE_NAME", "BUNDLE_DYNAMODB_TABLE_NAME"]);

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

  // Parse request body
  const requestBody = parseRequestBody(event);
  if (event.body && !requestBody) {
    return http400BadRequestResponse({ request, headers: responseHeaders, message: "Invalid JSON in request body" });
  }

  if (!requestBody?.passTypeId) {
    return http400BadRequestResponse({ request, headers: responseHeaders, message: "Missing required field: passTypeId" });
  }

  const { passTypeId, notes } = requestBody;

  // Look up pass type definition
  const passTypesConfig = loadPassTypesFromRoot();
  const passTypeDef = getPassTypeById(passTypesConfig, passTypeId);
  if (!passTypeDef) {
    return http400BadRequestResponse({ request, headers: responseHeaders, message: `Unknown pass type: ${passTypeId}` });
  }

  if (!passTypeDef.tokenCostToIssue || passTypeDef.tokenCostToIssue <= 0) {
    return http400BadRequestResponse({ request, headers: responseHeaders, message: `Pass type ${passTypeId} is not user-issuable` });
  }

  // Determine which activity this maps to
  const activityId = passTypeId === "digital-pass" ? "generate-pass-digital" : "generate-pass-physical";

  // Consume tokens via tokenEnforcement
  const catalog = loadCatalogFromRoot();
  const tokenResult = await consumeTokenForActivity(userSub, activityId, catalog);
  if (!tokenResult.consumed) {
    return http403ForbiddenResponse({
      request,
      headers: responseHeaders,
      message: "Insufficient tokens",
    });
  }

  logger.info({ message: "Generating user pass", passTypeId, hashedSub, activityId });

  try {
    const pass = await createPass({
      passTypeId,
      bundleId: passTypeDef.bundleId,
      validityPeriod: passTypeDef.defaultValidityPeriod,
      maxUses: passTypeDef.defaultMaxUses || 1,
      issuedBy: hashedSub,
      createdBy: "user",
      notes,
    });

    logger.info({ message: "User pass created", passTypeId, code: pass.code });
    await publishActivityEvent({
      event: "pass-generated",
      summary: `User pass generated: ${passTypeId}`,
      userSub,
      detail: { passTypeId, bundleId: pass.bundleId, issuedBy: hashedSub },
    });

    return http200OkResponse({
      request,
      headers: responseHeaders,
      data: {
        code: pass.code,
        url: `${getBaseUrl(event)}/bundles.html?pass=${pass.code}`,
        passTypeId: pass.passTypeId,
        bundleId: pass.bundleId,
        validFrom: pass.validFrom,
        validUntil: pass.validUntil || null,
        maxUses: pass.maxUses,
        tokensConsumed: tokenResult.cost,
        tokensRemaining: tokenResult.tokensRemaining,
      },
    });
  } catch (error) {
    logger.error({ message: "Error creating user pass", error: error.message, stack: error.stack });
    return http500ServerErrorResponse({
      request,
      headers: responseHeaders,
      message: "Failed to create pass",
      error: { detail: error.message },
    });
  }
}

function getBaseUrl(event) {
  // Try to derive from request headers, fall back to env
  const host = event.headers?.host || event.headers?.Host;
  if (host) {
    const proto = host.includes("localhost") ? "http" : "https";
    return `${proto}://${host}`;
  }
  return process.env.APEX_URL || "https://submit.diyaccounting.co.uk";
}
