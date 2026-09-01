// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/functions/account/bundleGet.js

import { validateEnv } from "../../lib/env.js";
import { createLogger, context } from "../../lib/logger.js";
import {
  extractRequest,
  http200OkResponse,
  http401UnauthorizedResponse,
  http500ServerErrorResponse,
} from "../../lib/httpResponseHelper.js";
import { decodeJwtToken } from "../../lib/jwtHelper.js";
import { buildHttpResponseFromLambdaResult, buildLambdaEventFromHttpRequest } from "../../lib/httpServerToLambdaAdaptor.js";
import { getUserBundles } from "../../data/dynamoDbBundleRepository.js";
import { v4 as uuidv4 } from "uuid";
import * as asyncApiServices from "../../services/asyncApiServices.js";
import { initializeSalt, hashSub } from "../../services/subHasher.js";
import { incrementRateCounter } from "../../data/dynamoDbSecurityStateRepository.js";
import { publishActivityFailureEvent, resolveActorClass } from "../../lib/activityAlert.js";

const logger = createLogger({ source: "app/functions/account/bundleGet.js" });

// Threshold for the bundle-endpoint burst detector (issue #10 acceptance criteria 3 and 6):
// a module constant, not configuration, so the alert's own description can name it exactly.
export const BUNDLE_GET_BURST_PER_MINUTE = 500;

/**
 * Fixed one-minute bucket key for the burst counter. A sliding window would need a read per
 * request; a fixed bucket needs one atomic ADD whose return value is the count. The edge is a
 * consumer spreading requests across a minute boundary can reach about 1000 before tripping
 * the threshold - acceptable for a detector whose purpose is to catch bulk extraction.
 *
 * @param {Date} [date]
 * @returns {number}
 */
export function nowMinute(date = new Date()) {
  return Math.floor(date.getTime() / 60000);
}

/**
 * Increments the caller's one-minute request counter and, on crossing the threshold, reports
 * one burst event. Never blocks the request: a counter failure is logged and swallowed, and
 * the check is a no-op when the security state table isn't configured (simulator, local dev).
 *
 * @param {string} userId - raw sub; hashed before it reaches DynamoDB or the activity event
 */
async function checkBundleGetBurst(userId) {
  if (!process.env.SECURITY_STATE_DYNAMODB_TABLE_NAME) return;

  try {
    const hashedSub = hashSub(userId);
    const hits = await incrementRateCounter({ hashedSub, minute: nowMinute() });
    if (hits === BUNDLE_GET_BURST_PER_MINUTE + 1 && resolveActorClass() === "customer") {
      await publishActivityFailureEvent({
        event: "api-burst-detected",
        summary: `Bundle reads: ${hits - 1} in one minute from one consumer`,
        failure: "burst-threshold",
        flow: "operational",
        userSub: userId,
        detail: { endpoint: "GET /api/v1/bundle", threshold: BUNDLE_GET_BURST_PER_MINUTE },
      });
    }
  } catch (error) {
    logger.warn({ message: "Bundle burst counter failed", error: error.message });
  }
}

// Server hook for Express app, and construction of a Lambda-like event from HTTP request)
/* v8 ignore start */
export function apiEndpoint(app) {
  app.get("/api/v1/bundle", async (httpRequest, httpResponse) => {
    const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
    const lambdaResult = await ingestHandler(lambdaEvent);
    return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
  });
  app.head("/api/v1/bundle", async (httpRequest, httpResponse) => {
    httpResponse.status(200).send();
  });
}
/* v8 ignore stop */

export function extractAndValidateParameters(event, errorMessages) {
  // Decode JWT token to get user ID
  let decodedToken;
  try {
    decodedToken = decodeJwtToken(event.headers);
  } catch {
    // JWT decoding failed - authentication error
    errorMessages.push("Invalid or missing authentication token");
    return { userId: null };
  }

  const userId = decodedToken.sub;
  return { userId };
}

// HTTP request/response, aware Lambda ingestHandler function
export async function ingestHandler(event) {
  await initializeSalt();
  validateEnv(["BUNDLE_DYNAMODB_TABLE_NAME"]);

  const { request, requestId: extractedRequestId } = extractRequest(event);
  const requestId = extractedRequestId || uuidv4();
  if (!extractedRequestId) {
    context.set("requestId", requestId);
  }
  const errorMessages = [];

  // If HEAD request, return 200 OK immediately after bundle enforcement
  if (event?.requestContext?.http?.method === "HEAD") {
    return http200OkResponse({
      request,
      headers: { "Content-Type": "application/json" },
      data: {},
    });
  }

  logger.info({ message: "Retrieving user bundles" });

  // Extract and validate parameters
  const { userId } = extractAndValidateParameters(event, errorMessages);

  const responseHeaders = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" };

  // Authentication errors - extractAndValidateParameters only adds JWT decode errors
  if (errorMessages.length > 0 || !userId) {
    return http401UnauthorizedResponse({
      request,
      headers: { ...responseHeaders },
      message: "Authentication required",
      error: {},
    });
  }

  await checkBundleGetBurst(userId);

  let result;
  // Processing
  try {
    logger.info({ message: "Retrieving bundles for request", requestId });
    result = await retrieveUserBundles(userId, requestId);
  } catch (error) {
    if (error instanceof asyncApiServices.RequestFailedError) {
      result = error.data;
    } else {
      logger.error({ message: "Error retrieving bundles", error: error.message, stack: error.stack });
      return http500ServerErrorResponse({
        request,
        headers: { ...responseHeaders },
        message: "Internal server error",
        error: error.message,
      });
    }
  }

  return asyncApiServices.respond({
    request,
    requestId,
    responseHeaders,
    data: result,
    dataKey: "bundles",
  });
}

// Service adaptor aware of the downstream service but not the consuming Lambda's incoming/outgoing HTTP request/response
export async function retrieveUserBundles(userId, requestId = null) {
  logger.info({ message: "retrieveUserBundles entry", userId, requestId });
  try {
    const { loadCatalogFromRoot, getCappedBundleIds } = await import("../../services/productCatalog.js");

    // Load user bundles from DynamoDB
    const userBundles = await getUserBundles(userId);
    logger.info({ message: "Successfully retrieved bundles from repository", userId, count: userBundles.length });

    // Load catalogue (synchronous file read)
    let catalog;
    try {
      catalog = loadCatalogFromRoot();
    } catch (error) {
      logger.warn({ message: "Failed to load catalogue, returning user bundles only", error: error.message });
      return { bundles: userBundles, tokensRemaining: 0 };
    }

    // Load capacity counters for capped bundles
    const cappedBundleIds = getCappedBundleIds(catalog);
    let counters = {};
    if (cappedBundleIds.length > 0 && process.env.BUNDLE_CAPACITY_DYNAMODB_TABLE_NAME) {
      try {
        const { getCounters } = await import("../../data/dynamoDbCapacityRepository.js");
        counters = await getCounters(cappedBundleIds);
      } catch (error) {
        logger.warn({ message: "Failed to load capacity counters", error: error.message });
      }
    }

    // Build a lookup of capped bundle cap values
    const capValues = {};
    for (const b of catalog.bundles || []) {
      if (Number.isFinite(b.cap)) {
        capValues[b.id] = b.cap;
      }
    }

    function isCapacityAvailable(bundleId) {
      if (!(bundleId in capValues)) return true;
      const counter = counters[bundleId];
      const activeCount = counter ? counter.activeCount || 0 : 0;
      return activeCount < capValues[bundleId];
    }

    // Lazy token refresh for user bundles
    const now = new Date().toISOString();
    for (const bundle of userBundles) {
      if (bundle.tokenResetAt && bundle.tokenResetAt <= now && bundle.tokensGranted !== undefined) {
        const catBundle = (catalog.bundles || []).find((b) => b.id === bundle.bundleId);
        if (catBundle?.tokenRefreshInterval) {
          const { resetTokens } = await import("../../data/dynamoDbBundleRepository.js");
          const nextReset = addDurationSimple(new Date(), catBundle.tokenRefreshInterval);
          const tokensGranted = catBundle.tokensGranted ?? bundle.tokensGranted;
          await resetTokens(userId, bundle.bundleId, tokensGranted, nextReset.toISOString());
          bundle.tokensConsumed = 0;
          bundle.tokensGranted = tokensGranted;
          bundle.tokenResetAt = nextReset.toISOString();
        }
      }
    }

    // Build the union response: user bundles + unallocated catalogue bundles
    const userBundleIds = new Set(userBundles.map((b) => b.bundleId));
    const result = [];

    for (const bundle of userBundles) {
      const tokensRemaining =
        bundle.tokensGranted !== undefined ? Math.max(0, bundle.tokensGranted - (bundle.tokensConsumed || 0)) : undefined;
      result.push({
        ...bundle,
        allocated: true,
        bundleCapacityAvailable: isCapacityAvailable(bundle.bundleId),
        ...(tokensRemaining !== undefined ? { tokensRemaining } : {}),
      });
    }

    for (const catBundle of catalog.bundles || []) {
      if (!userBundleIds.has(catBundle.id)) {
        result.push({
          bundleId: catBundle.id,
          allocated: false,
          bundleCapacityAvailable: isCapacityAvailable(catBundle.id),
        });
      }
    }

    let totalTokensRemaining = 0;
    for (const bundle of userBundles) {
      if (bundle.tokensGranted !== undefined) {
        totalTokensRemaining += Math.max(0, bundle.tokensGranted - (bundle.tokensConsumed || 0));
      }
    }

    return { bundles: result, tokensRemaining: totalTokensRemaining };
  } catch (error) {
    logger.error({ message: "Error retrieving user bundles", error: error.message, userId, requestId });
    throw error;
  }
}

function addDurationSimple(fromDate, iso) {
  const d = new Date(fromDate.getTime());
  // eslint-disable-next-line security/detect-unsafe-regex
  const m = String(iso || "").match(/^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)D)?$/);
  if (!m) return d;
  d.setFullYear(d.getFullYear() + parseInt(m[1] || "0", 10));
  d.setMonth(d.getMonth() + parseInt(m[2] || "0", 10));
  d.setDate(d.getDate() + parseInt(m[3] || "0", 10));
  return d;
}
