// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/functions/bundlePost.js

import { loadCatalogFromRoot } from "../../services/productCatalog.js";
import { validateEnv } from "../../lib/env.js";
import { context, createLogger } from "../../lib/logger.js";
import {
  extractRequest,
  http200OkResponse,
  http400BadRequestResponse,
  http401UnauthorizedResponse,
  http403ForbiddenResponse,
  http404NotFoundResponse,
  http500ServerErrorResponse,
  parseRequestBody,
  getHeader,
} from "../../lib/httpResponseHelper.js";
import { decodeJwtToken } from "../../lib/jwtHelper.js";
import { buildHttpResponseFromLambdaResult, buildLambdaEventFromHttpRequest } from "../../lib/httpServerToLambdaAdaptor.js";
import { getUserBundles, deleteBundle } from "../../data/dynamoDbBundleRepository.js";
import { getAsyncRequest, putAsyncRequest } from "../../data/dynamoDbAsyncRequestRepository.js";
import * as asyncApiServices from "../../services/asyncApiServices.js";
import { initializeSalt } from "../../services/subHasher.js";
import { publishActivityEvent } from "../../lib/activityAlert.js";

const logger = createLogger({ source: "app/functions/account/bundlePost.js" });

function emitCapMetric(metricName, bundleId) {
  try {
    console.log(
      JSON.stringify({
        _aws: {
          Timestamp: Date.now(),
          CloudWatchMetrics: [
            {
              Namespace: "Submit/BundleCapacity",
              Dimensions: [["bundleId"]],
              Metrics: [{ Name: metricName, Unit: "Count" }],
            },
          ],
        },
        bundleId,
        [metricName]: 1,
      }),
    );
  } catch {
    // EMF emission is best-effort
  }
}

const MAX_WAIT_MS = 25_000;
const DEFAULT_WAIT_MS = 0;

function parseIsoDurationToDate(fromDate, iso) {
  // Minimal support for PnD, PnM, PnY
  const d = new Date(fromDate.getTime());
  // eslint-disable-next-line security/detect-unsafe-regex
  const m = String(iso || "").match(/^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)D)?$/);
  if (!m) {
    logger.warn({ message: "Unsupported ISO duration format, cannot parse:", iso });
    return d;
  }
  const years = parseInt(m[1] || "0", 10);
  const months = parseInt(m[2] || "0", 10);
  const days = parseInt(m[3] || "0", 10);
  d.setFullYear(d.getFullYear() + years);
  d.setMonth(d.getMonth() + months);
  d.setDate(d.getDate() + days);
  return d;
}

function getCatalogBundle(bundleId) {
  try {
    const catalog = loadCatalogFromRoot();
    const catalogBundle = (catalog.bundles || []).find((b) => b.id === bundleId) || null;
    logger.info({ message: "Loaded catalog bundle:", bundleId, catalogBundle });
    return catalogBundle;
  } catch (error) {
    logger.error({ message: "Failed to load product catalog:", error });
    return null;
  }
}

function qualifiersSatisfied(bundle, claims, requestQualifiers = {}) {
  const q = bundle?.qualifiers || {};
  if (q.requiresTransactionId) {
    const tx = requestQualifiers.transactionId || claims?.transactionId || claims?.["custom:transactionId"];
    if (!tx) {
      logger.warn({ message: "Missing required transactionId qualifier for bundle request" });
      return { ok: false, reason: "missing_transactionId" };
    }
  }
  if (q.subscriptionTier) {
    const tier = requestQualifiers.subscriptionTier || claims?.subscriptionTier || claims?.["custom:subscriptionTier"];
    if (tier !== q.subscriptionTier) {
      logger.warn({ message: "Subscription tier qualifier mismatch for bundle request:", expected: q.subscriptionTier, received: tier });
      return { ok: false, reason: "subscription_tier_mismatch" };
    }
  }
  // Reject unknown qualifier keys present in request
  const known = new Set(Object.keys(q));
  if (q.requiresTransactionId) known.add("transactionId");
  if (Object.prototype.hasOwnProperty.call(q, "subscriptionTier")) known.add("subscriptionTier");
  known.add("sandbox"); // System qualifier: test mode for sandbox passes
  for (const k of Object.keys(requestQualifiers || {})) {
    if (!known.has(k)) {
      logger.warn({ message: "Unknown qualifier in bundle request:", qualifier: k });
      return { ok: false, unknown: k };
    }
  }
  return { ok: true };
}

/* v8 ignore start */
export function apiEndpoint(app) {
  app.post("/api/v1/bundle", async (httpRequest, httpResponse) => {
    const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
    const lambdaResult = await ingestHandler(lambdaEvent);
    return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
  });
  app.head("/api/v1/bundle", async (httpRequest, httpResponse) => {
    httpResponse.status(200).send();
  });
}
/* v8 ignore stop */

export async function ingestHandler(event) {
  await initializeSalt();
  validateEnv(["BUNDLE_DYNAMODB_TABLE_NAME"]);

  const { request, requestId, traceparent, correlationId } = extractRequest(event);

  const asyncTableName = process.env.ASYNC_REQUESTS_DYNAMODB_TABLE_NAME;
  const asyncQueueUrl = process.env.SQS_QUEUE_URL;

  // If HEAD request, return 200 OK immediately after bundle enforcement
  if (event?.requestContext?.http?.method === "HEAD") {
    return http200OkResponse({
      request,
      headers: { "Content-Type": "application/json" },
      data: {},
    });
  }

  logger.info({ message: "Processing bundle request" });

  const responseHeaders = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };

  // Decode JWT token to get user ID
  let decodedToken;
  try {
    decodedToken = decodeJwtToken(event.headers);
  } catch (error) {
    return http401UnauthorizedResponse({
      request,
      headers: { ...responseHeaders },
      message: "Authentication required",
      error: error.message,
    });
  }
  const userId = decodedToken.sub;

  const requestBody = parseRequestBody(event);
  if (event.body && !requestBody) {
    return {
      statusCode: 400,
      headers: { ...responseHeaders, "x-request-id": requestId, "x-correlationid": requestId },
      body: JSON.stringify({ error: "Invalid JSON in request body" }),
    };
  }
  if (!requestBody || !requestBody.bundleId) {
    return {
      statusCode: 400,
      headers: { ...responseHeaders, "x-request-id": requestId, "x-correlationid": requestId },
      body: JSON.stringify({ error: "Missing bundleId in request" }),
    };
  }

  let result;
  try {
    const waitTimeMs = parseInt(getHeader(event.headers, "x-wait-time-ms") || DEFAULT_WAIT_MS, 10);

    logger.info({ message: "Processing bundle request for user", userId, bundleId: requestBody.bundleId, requestId, waitTimeMs });

    // Check if there is already a persisted request for this ID
    const isInitialRequest = getHeader(event.headers, "x-initial-request") === "true";
    let persistedRequest = null;
    if (!isInitialRequest) {
      persistedRequest = await getAsyncRequest(userId, requestId, asyncTableName);
    }

    if (persistedRequest) {
      logger.info({ message: "Persisted request found", status: persistedRequest.status, requestId });
    } else {
      // Not found: Initiate processing
      const processor = async ({ userId, requestBody, decodedToken, requestId }) => {
        return await grantBundle(userId, requestBody, decodedToken, requestId);
      };

      result = await asyncApiServices.initiateProcessing({
        processor,
        userId,
        requestId,
        traceparent,
        correlationId,
        waitTimeMs,
        payload: { userId, requestBody, decodedToken, requestId, traceparent, correlationId },
        tableName: asyncTableName,
        queueUrl: asyncQueueUrl,
        maxWaitMs: MAX_WAIT_MS,
      });
    }

    // If still no result (async path) and we have a wait time, poll for completion
    if (!result && waitTimeMs > 0) {
      result = await asyncApiServices.wait({ userId, requestId, waitTimeMs, tableName: asyncTableName });
    }

    // One last check before deciding whether to yield or return the final result
    if (!result) {
      result = await asyncApiServices.check({ userId, requestId, tableName: asyncTableName });
    }
  } catch (error) {
    if (error instanceof asyncApiServices.RequestFailedError) {
      result = error.data;
    } else {
      logger.error({ message: "Unexpected error granting bundle", error: error.message, stack: error.stack });
      return http500ServerErrorResponse({
        request,
        headers: { ...responseHeaders },
        message: "Internal server error",
        error: error.message,
      });
    }
  }

  if (result?.status === "cap_reached" || result?.error === "cap_reached") {
    return http403ForbiddenResponse({ request, headers: responseHeaders, message: "Bundle entitlement cap reached", error: result });
  }

  if (result?.status === "bundle_not_found" || result?.error === "bundle_not_found") {
    return http404NotFoundResponse({ request, headers: responseHeaders, message: "Bundle not found in catalog", error: result });
  }

  if (result?.status === "unknown_qualifier" || result?.error === "unknown_qualifier") {
    return http400BadRequestResponse({ request, headers: responseHeaders, message: "Unknown qualifier", error: result });
  }

  if (result?.status === "qualifier_mismatch" || result?.error === "qualifier_mismatch") {
    return http400BadRequestResponse({ request, headers: responseHeaders, message: "Qualifier mismatch", error: result });
  }

  return asyncApiServices.respond({
    request,
    requestId,
    responseHeaders,
    data: result,
  });
}

// SQS worker Lambda ingestHandler function
export async function workerHandler(event) {
  await initializeSalt();
  validateEnv(["BUNDLE_DYNAMODB_TABLE_NAME", "ASYNC_REQUESTS_DYNAMODB_TABLE_NAME"]);

  logger.info({ message: "SQS Worker entry", recordCount: event.Records?.length });

  for (const record of event.Records || []) {
    let userId;
    let requestId;
    let traceparent;
    let correlationId;
    try {
      const body = JSON.parse(record.body);
      userId = body.userId;
      requestId = body.requestId;
      traceparent = body.traceparent;
      correlationId = body.correlationId;
      const { requestBody, decodedToken } = body.payload;

      if (!userId || !requestId) {
        logger.error({ message: "SQS Message missing userId or requestId", recordId: record.messageId, body });
        continue;
      }

      if (!context.getStore()) {
        context.enterWith(new Map());
      }
      context.set("requestId", requestId);
      context.set("traceparent", traceparent);
      context.set("correlationId", correlationId);
      context.set("userId", userId);

      logger.info({ message: "Processing SQS message", userId, requestId, messageId: record.messageId });

      await grantBundle(userId, requestBody, decodedToken, requestId);

      logger.info({ message: "Successfully processed SQS message", requestId });
    } catch (error) {
      logger.error({
        message: "Error processing SQS message",
        error: error.message,
        stack: error.stack,
        messageId: record.messageId,
        userId,
        requestId,
      });
      // Re-throw to trigger SQS retry/DLQ
      throw error;
    }
  }
}

// Service adaptor aware of the downstream service but not the consuming Lambda's incoming/outgoing HTTP request/response
// eslint-disable-next-line sonarjs/cognitive-complexity
export async function grantBundle(userId, requestBody, decodedToken, requestId = null, { skipCapCheck = false, grantQualifiers } = {}) {
  logger.info({ message: "grantBundle entry", userId, requestedBundle: requestBody.bundleId, requestId, skipCapCheck, grantQualifiers });

  const requestedBundle = requestBody.bundleId;
  const qualifiers = requestBody.qualifiers || {};

  const currentBundles = await getUserBundles(userId);

  // If the user already has this bundle, remove it and grant a fresh one.
  // This handles: expired bundles, partially consumed tokens from previous passes,
  // and re-redemption of a new pass for the same bundle type.
  const existingBundle = currentBundles.find((bundle) => bundle?.bundleId === requestedBundle);
  if (existingBundle) {
    logger.info({ message: "Removing existing bundle before fresh grant", requestedBundle, expiry: existingBundle.expiry });
    await deleteBundle(userId, requestedBundle);
    const idx = currentBundles.indexOf(existingBundle);
    if (idx !== -1) currentBundles.splice(idx, 1);
  }

  const catalogBundle = getCatalogBundle(requestedBundle);

  if (!catalogBundle) {
    logger.error({ message: "[Catalog bundle] Bundle not found in catalog:", requestedBundle });
    const result = {
      status: "bundle_not_found",
      error: "bundle_not_found",
      message: `Bundle '${requestedBundle}' not found in catalog`,
      statusCode: 404,
    };
    if (requestId && process.env.ASYNC_REQUESTS_DYNAMODB_TABLE_NAME) {
      await putAsyncRequest(userId, requestId, "failed", result);
    }
    return result;
  }

  const check = qualifiersSatisfied(catalogBundle, decodedToken, qualifiers);
  if (check?.unknown) {
    logger.warn({ message: "[Catalog bundle] Unknown qualifier in bundle request:", qualifier: check.unknown });
    const result = { status: "unknown_qualifier", error: "unknown_qualifier", qualifier: check.unknown, statusCode: 400 };
    if (requestId && process.env.ASYNC_REQUESTS_DYNAMODB_TABLE_NAME) {
      await putAsyncRequest(userId, requestId, "failed", result);
    }
    return result;
  }
  if (check?.ok === false) {
    logger.warn({ message: "[Catalog bundle] Qualifier mismatch for bundle request:", reason: check.reason });
    const result = { status: "qualifier_mismatch", error: "qualifier_mismatch", statusCode: 400 };
    if (requestId && process.env.ASYNC_REQUESTS_DYNAMODB_TABLE_NAME) {
      await putAsyncRequest(userId, requestId, "failed", result);
    }
    return result;
  }

  if (catalogBundle.allocation === "automatic") {
    logger.info({ message: "[Catalog bundle] Bundle is automatic allocation, no action needed:", requestedBundle });
    const result = {
      status: "granted",
      granted: true,
      expiry: null,
      bundle: requestedBundle,
      bundles: currentBundles,
      statusCode: 201,
    };
    if (requestId && process.env.ASYNC_REQUESTS_DYNAMODB_TABLE_NAME) {
      await putAsyncRequest(userId, requestId, "completed", result);
    }
    return result;
  } else {
    logger.info({ message: "[Catalog bundle] Bundle requires manual allocation, proceeding:", requestedBundle });
  }

  // Global bundle capacity cap enforcement via atomic counter table.
  // The cap field is a GLOBAL limit on active (non-expired) allocations across ALL users.
  // Existing bundles are deleted and re-granted above, so this fires for every allocation.
  const cap = Number.isFinite(catalogBundle.cap) ? Number(catalogBundle.cap) : undefined;
  let capIncremented = false;
  if (typeof cap === "number" && !skipCapCheck && process.env.BUNDLE_CAPACITY_DYNAMODB_TABLE_NAME) {
    const { incrementCounter } = await import("../../data/dynamoDbCapacityRepository.js");
    const granted = await incrementCounter(requestedBundle, cap);
    if (!granted) {
      logger.info({ message: "[Catalog bundle] Bundle cap reached:", requestedBundle, cap });
      emitCapMetric("BundleCapReached", requestedBundle);
      const result = { status: "cap_reached", error: "cap_reached", statusCode: 403 };
      if (requestId && process.env.ASYNC_REQUESTS_DYNAMODB_TABLE_NAME) {
        await putAsyncRequest(userId, requestId, "failed", result);
      }
      return result;
    }
    capIncremented = true;
    logger.info({ message: "[Catalog bundle] Cap slot reserved:", requestedBundle, cap });
  } else if (typeof cap === "number") {
    logger.info({ message: "[Catalog bundle] Cap defined but no capacity table configured, skipping:", requestedBundle });
  } else {
    logger.info({ message: "[Catalog bundle] No cap defined for bundle:", requestedBundle });
  }

  logger.info({ message: "Granting bundle to user:", userId, requestedBundle });
  const expiry = catalogBundle.timeout ? parseIsoDurationToDate(new Date(), catalogBundle.timeout) : null;
  const expiryStr = expiry ? expiry.toISOString().slice(0, 10) : "";
  const newBundle = { bundleId: requestedBundle, expiry: expiryStr };
  const effectiveQualifiers = grantQualifiers || (Object.keys(qualifiers).length > 0 ? qualifiers : undefined);
  if (effectiveQualifiers && Object.keys(effectiveQualifiers).length > 0) {
    newBundle.qualifiers = effectiveQualifiers;
  }

  // Token tracking: set token fields from catalogue
  const tokensGranted = catalogBundle.tokensGranted ?? undefined;
  if (tokensGranted !== undefined) {
    newBundle.tokensGranted = tokensGranted;
    newBundle.tokensConsumed = 0;
    if (catalogBundle.tokenRefreshInterval && expiry) {
      newBundle.tokenResetAt = parseIsoDurationToDate(new Date(), catalogBundle.tokenRefreshInterval).toISOString();
    } else {
      newBundle.tokenResetAt = null;
    }
  }

  logger.info({ message: "New bundle details:", newBundle });
  currentBundles.push(newBundle);
  logger.info({ message: "Updated user bundles:", userId, currentBundles });

  // Persist the new bundle directly to DynamoDB.
  // We use putBundle directly (not updateUserBundles) because updateUserBundles
  // re-queries DynamoDB with eventually-consistent reads, which can miss the
  // delete we just performed above, causing it to skip writing the new bundle.
  try {
    const { putBundle } = await import("../../data/dynamoDbBundleRepository.js");
    await putBundle(userId, newBundle);
  } catch (error) {
    // Compensating write: if PutItem fails after cap counter increment, decrement the counter
    if (capIncremented) {
      try {
        const { decrementCounter } = await import("../../data/dynamoDbCapacityRepository.js");
        await decrementCounter(requestedBundle);
        logger.info({ message: "Compensating counter decrement after failed bundle persist", requestedBundle });
      } catch (decrementError) {
        logger.error({ message: "Failed compensating counter decrement", error: decrementError.message, requestedBundle });
      }
    }
    throw error;
  }

  emitCapMetric("BundleGranted", requestedBundle);
  logger.info({ message: "Bundle granted to user:", userId, newBundle });
  const bundleId = requestedBundle;
  await publishActivityEvent({
    event: "bundle-granted",
    summary: "Bundle granted: " + bundleId,
    userSub: userId,
    detail: { bundleId },
  });
  const result = {
    status: "granted",
    granted: true,
    expiry: expiryStr || null,
    bundle: requestedBundle,
    bundles: currentBundles,
    statusCode: 201,
  };

  if (requestId && process.env.ASYNC_REQUESTS_DYNAMODB_TABLE_NAME) {
    try {
      if (result.status === "cap_reached") {
        await putAsyncRequest(userId, requestId, "failed", result, process.env.ASYNC_REQUESTS_DYNAMODB_TABLE_NAME);
      } else {
        logger.info({ message: "Updating AsyncRequest status to completed", userId, requestId });
        await putAsyncRequest(userId, requestId, "completed", result, process.env.ASYNC_REQUESTS_DYNAMODB_TABLE_NAME);
      }
    } catch (error) {
      logger.error({ message: "Error storing completed request", error: error.message, requestId });
    }
  }

  return result;
}
