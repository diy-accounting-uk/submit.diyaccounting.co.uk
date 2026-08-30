// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/functions/account/bundleDelete.js

import { validateEnv } from "../../lib/env.js";
import { context, createLogger } from "../../lib/logger.js";
import {
  extractRequest,
  parseRequestBody,
  http200OkResponse,
  http401UnauthorizedResponse,
  http404NotFoundResponse,
  http500ServerErrorResponse,
  buildValidationError,
  getHeader,
} from "../../lib/httpResponseHelper.js";
import { decodeJwtToken } from "../../lib/jwtHelper.js";
import { buildHttpResponseFromLambdaResult, buildLambdaEventFromHttpRequest } from "../../lib/httpServerToLambdaAdaptor.js";
import { updateUserBundles } from "../../services/bundleManagement.js";
import { getUserBundles } from "../../data/dynamoDbBundleRepository.js";
import { getAsyncRequest, putAsyncRequest } from "../../data/dynamoDbAsyncRequestRepository.js";
import * as asyncApiServices from "../../services/asyncApiServices.js";
import { initializeSalt } from "../../services/subHasher.js";
import { publishActivityEvent } from "../../lib/activityAlert.js";

const logger = createLogger({ source: "app/functions/account/bundleDelete.js" });

const MAX_WAIT_MS = 25_000;
const DEFAULT_WAIT_MS = 0; // Fire-and-forget by default for Phase 1 async rollout

// Server hook for Express app, and construction of a Lambda-like event from HTTP request)
/* v8 ignore start */
export function apiEndpoint(app) {
  app.delete("/api/v1/bundle", async (httpRequest, httpResponse) => {
    const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
    const lambdaResult = await ingestHandler(lambdaEvent);
    return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
  });
  // Also support deletion via path parameter for parity with API Gateway
  app.delete("/api/v1/bundle/:id", async (httpRequest, httpResponse) => {
    const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
    const lambdaResult = await ingestHandler(lambdaEvent);
    return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
  });
  app.head("/api/v1/bundle", async (httpRequest, httpResponse) => {
    httpResponse.status(200).send();
  });
  app.head("/api/v1/bundle/:id", async (httpRequest, httpResponse) => {
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
    return { userId: null, bundleToRemove: null, removeAll: false };
  }

  const userId = decodedToken.sub;
  const body = parseRequestBody(event);

  // Accept bundle id via body.bundleId, path parameter {id}, or query parameter bundleId
  const pathId = event?.pathParameters?.id;
  const queryId = event?.queryStringParameters?.bundleId;
  const bundleToRemove = body?.bundleId || pathId || queryId;

  // Accept removeAll via body.removeAll or query removeAll=true
  const removeAll = Boolean(body?.removeAll || String(event?.queryStringParameters?.removeAll || "").toLowerCase() === "true");

  // Collect validation errors
  if (!bundleToRemove && !removeAll) {
    errorMessages.push("Missing bundle Id in request");
  }

  return { userId, bundleToRemove, removeAll };
}

// HTTP request/response, aware Lambda ingestHandler function
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

  logger.info({ message: "Deleting user bundle" });

  const errorMessages = [];
  // Extract and validate parameters
  const { userId, bundleToRemove, removeAll } = extractAndValidateParameters(event, errorMessages);

  const responseHeaders = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };

  // Authentication errors
  if (!userId) {
    return http401UnauthorizedResponse({
      request,
      headers: { ...responseHeaders },
      message: "Authentication required",
      error: {},
    });
  }

  // Validation errors
  if (errorMessages.length > 0) {
    return buildValidationError(request, errorMessages, responseHeaders);
  }

  let result;
  // Processing
  try {
    const waitTimeMs = parseInt(getHeader(event.headers, "x-wait-time-ms") || DEFAULT_WAIT_MS, 10);

    logger.info({ message: "Processing bundle delete for user", userId, bundleToRemove, removeAll, requestId, waitTimeMs });

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
      const processor = async ({ userId, bundleToRemove, removeAll, requestId }) => {
        return await deleteUserBundle(userId, bundleToRemove, removeAll, requestId);
      };

      result = await asyncApiServices.initiateProcessing({
        processor,
        userId,
        requestId,
        traceparent,
        correlationId,
        waitTimeMs,
        payload: { userId, bundleToRemove, removeAll, requestId, traceparent, correlationId },
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
      logger.error({ message: "Error deleting bundle", error: error.message, stack: error.stack });
      return http500ServerErrorResponse({
        request,
        headers: { ...responseHeaders },
        message: "Internal server error",
        error: error.message,
      });
    }
  }

  if (result?.status === "not_found" || result?.error === "not_found") {
    return http404NotFoundResponse({ request, headers: responseHeaders, message: "Bundle not found", error: result });
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
      const { bundleToRemove, removeAll } = body.payload;

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

      await deleteUserBundle(userId, bundleToRemove, removeAll, requestId);

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
export async function deleteUserBundle(userId, bundleToRemove, removeAll, requestId = null) {
  logger.info({ message: "deleteUserBundle entry", userId, bundleToRemove, removeAll, requestId });
  const currentBundles = await getUserBundles(userId);

  let result;
  if (removeAll) {
    // Use DynamoDB as primary storage via updateUserBundles
    await updateUserBundles(userId, []);
    logger.info({ message: `All bundles removed for user ${userId}` });
    result = {
      statusCode: 204,
      status: "removed_all",
      message: "All bundles removed",
      bundles: [],
    };
  } else {
    logger.info({ message: `Removing bundle ${bundleToRemove} for user ${userId}` });
    const bundlesAfterRemoval = currentBundles.filter((bundle) => (bundle?.bundleId || bundle) !== bundleToRemove);

    if (bundlesAfterRemoval.length === currentBundles.length) {
      logger.error({ message: `Bundle ${bundleToRemove} not found for user ${userId}` });
      result = {
        status: "not_found",
        statusCode: 404,
      };
    } else {
      // Use DynamoDB as primary storage via updateUserBundles
      await updateUserBundles(userId, bundlesAfterRemoval);
      logger.info({ message: `Bundle ${bundleToRemove} removed for user ${userId}` });
      const bundleId = bundleToRemove;
      await publishActivityEvent({
        event: "bundle-deleted",
        summary: "Bundle deleted: " + bundleId,
        userSub: userId,
        detail: { bundleId },
      });
      result = {
        statusCode: 204,
        status: "removed",
        message: "Bundle removed",
        bundle: bundleToRemove,
        bundles: bundlesAfterRemoval,
      };
    }
  }

  if (requestId && process.env.ASYNC_REQUESTS_DYNAMODB_TABLE_NAME) {
    try {
      if (result.status === "not_found") {
        await putAsyncRequest(userId, requestId, "failed", result, process.env.ASYNC_REQUESTS_DYNAMODB_TABLE_NAME);
      } else {
        logger.info({ message: "Updating AsyncRequest status to completed", userId, requestId });
        await putAsyncRequest(userId, requestId, "completed", result, process.env.ASYNC_REQUESTS_DYNAMODB_TABLE_NAME);
      }
    } catch (error) {
      logger.error({ message: "Error storing async request result", error: error.message, requestId });
    }
  }

  return result;
}
