// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/functions/account/passPost.js

import { validateEnv } from "../../lib/env.js";
import { createLogger } from "../../lib/logger.js";
import {
  extractRequest,
  http200OkResponse,
  http400BadRequestResponse,
  http401UnauthorizedResponse,
  http500ServerErrorResponse,
  parseRequestBody,
} from "../../lib/httpResponseHelper.js";
import { decodeJwtToken } from "../../lib/jwtHelper.js";
import { buildHttpResponseFromLambdaResult, buildLambdaEventFromHttpRequest } from "../../lib/httpServerToLambdaAdaptor.js";
import { redeemPass } from "../../services/passService.js";
import { initializeEmailHashSecret } from "../../lib/emailHash.js";
import { initializeSalt } from "../../services/subHasher.js";
import { publishActivityEvent } from "../../lib/activityAlert.js";

const logger = createLogger({ source: "app/functions/account/passPost.js" });

/* v8 ignore start */
export function apiEndpoint(app) {
  app.post("/api/v1/pass", async (httpRequest, httpResponse) => {
    const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
    const lambdaResult = await ingestHandler(lambdaEvent);
    return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
  });
}
/* v8 ignore stop */

export async function ingestHandler(event) {
  await initializeSalt();
  validateEnv(["PASSES_DYNAMODB_TABLE_NAME", "BUNDLE_DYNAMODB_TABLE_NAME"]);

  try {
    await initializeEmailHashSecret();
  } catch (error) {
    logger.warn({ message: "Email hash secret not available", error: error.message });
  }

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

  const userId = decodedToken.sub;
  const userEmail = decodedToken.email;

  const requestBody = parseRequestBody(event);
  if (!requestBody || !requestBody.code) {
    return http400BadRequestResponse({
      request,
      headers: responseHeaders,
      message: "Missing required field: code",
    });
  }

  const { code } = requestBody;

  try {
    const result = await redeemPass(code, userEmail);

    if (!result.valid) {
      return http200OkResponse({
        request,
        headers: responseHeaders,
        data: { redeemed: false, reason: result.reason },
      });
    }

    // Check if this bundle requires a subscription (on-pass-on-subscription allocation)
    const { loadCatalogFromRoot } = await import("../../services/productCatalog.js");
    const catalog = loadCatalogFromRoot();
    const catBundle = (catalog.bundles || []).find((b) => b.id === result.bundleId);

    if (catBundle?.allocation === "on-pass-on-subscription") {
      const testPass = result.pass?.testPass || false;
      return http200OkResponse({
        request,
        headers: responseHeaders,
        data: { redeemed: false, valid: true, bundleId: result.bundleId, requiresSubscription: true, testPass },
      });
    }

    // Pass is valid — grant the bundle to the user
    const { grantBundle } = await import("./bundlePost.js");
    const grantQualifiers = result.pass?.testPass ? { synthetic: true } : undefined;
    const grantResult = await grantBundle(userId, { bundleId: result.bundleId, qualifiers: {} }, decodedToken, null, {
      skipCapCheck: true,
      grantQualifiers,
      viaPass: true,
    });

    logger.info({ message: "Pass redeemed and bundle granted", code, bundleId: result.bundleId, userId });
    await publishActivityEvent({
      event: "pass-redeemed",
      summary: "Pass redeemed: " + (result?.bundleId || "unknown"),
      userSub: userId,
      detail: { bundleId: result?.bundleId },
    });

    const testPass = result.pass?.testPass || false;
    return http200OkResponse({
      request,
      headers: responseHeaders,
      data: {
        redeemed: true,
        bundleId: result.bundleId,
        expiry: grantResult.expiry || null,
        grantStatus: grantResult.status,
        testPass,
      },
    });
  } catch (error) {
    logger.error({ message: "Error redeeming pass", error: error.message, stack: error.stack });
    return http500ServerErrorResponse({
      request,
      headers: responseHeaders,
      message: "Failed to redeem pass",
      error: { detail: error.message },
    });
  }
}
