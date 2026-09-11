// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/asyncApiServices.js

import { createLogger } from "../lib/logger.js";
import { putAsyncRequest, getAsyncRequest } from "../data/dynamoDbAsyncRequestRepository.js";
import { http200OkResponse, http202AcceptedResponse } from "../lib/httpResponseHelper.js";

const logger = createLogger({ source: "app/services/asyncApiServices.js" });

const INITIAL_POLL_INTERVAL_MS = 100;

/**
 * Runs async processing locally (fire and forget) with flat async/await structure.
 * Used for local development when no SQS queue is configured.
 */
async function runLocalAsyncProcessing({ processor, payload, tableName, requestId, userId }) {
  try {
    const result = await processor(payload);
    logger.info({ message: "Local async processing completed successfully", requestId });

    if (!tableName) return;

    try {
      await complete({ asyncRequestsTableName: tableName, requestId, userSub: userId, result });
    } catch (dbError) {
      logger.error({ message: "Error updating status after local async success", error: dbError.message, requestId });
    }
  } catch (err) {
    logger.error({ message: "Unhandled error in local async processing", error: err.message, userId, requestId });

    if (!tableName) return;

    try {
      await error({ asyncRequestsTableName: tableName, requestId, userSub: userId, error: err });
    } catch (dbError) {
      logger.error({ message: "Error updating status after local async error", error: dbError.message, requestId });
    }
  }
}

const MAX_POLL_INTERVAL_MS = 400;

export class RequestFailedError extends Error {
  constructor(data) {
    super(data?.error || "Request processing failed");
    this.name = "RequestFailedError";
    this.data = data;
  }
}

/**
 * Initiates processing for a request, either synchronously or asynchronously.
 *
 * @param {Object} params - The parameters for initiation.
 * @param {Function} params.processor - The function to perform the actual work.
 * @param {string} params.userId - The user ID.
 * @param {string} params.requestId - The request ID.
 * @param {number} params.waitTimeMs - How long the client is willing to wait synchronously.
 * @param {Object} params.payload - Generic payload to pass to the processor.
 * @param {string} params.tableName - The DynamoDB table name for request tracking.
 * @param {string} params.queueUrl - The SQS queue URL for async processing.
 * @param {number} params.maxWaitMs - The threshold for forced synchronous processing.
 * @returns {Promise<Object|null>} The result if processed synchronously, or null if initiated asynchronously.
 */
export async function initiateProcessing({
  processor,
  userId,
  requestId,
  traceparent,
  correlationId,
  waitTimeMs,
  payload,
  tableName, // = process.env.ASYNC_REQUESTS_DYNAMODB_TABLE_NAME,
  queueUrl, // = process.env.SQS_QUEUE_URL,
  maxWaitMs = 25000,
}) {
  if (tableName) {
    logger.info({ message: "Marking request as processing in DynamoDB", userId, requestId, tableName });
    // Awaited so this write is guaranteed to land before the processor (below) is started.
    // The processor's own completion write targets the same DynamoDB item; if this "processing"
    // write were left unawaited (fire-and-forget) it could reach DynamoDB after a fast processor
    // already wrote "completed"/"failed", silently reverting the item back to "processing" and
    // stranding every future poll on a 202 that never resolves.
    try {
      await putAsyncRequest(userId, requestId, "processing", null, tableName);
    } catch (error) {
      logger.error({ message: "Error storing processing request", error: error.message, requestId, tableName });
    }
  }

  // Synchronous path: wait time header is large or no async tracking table is configured
  if (waitTimeMs >= maxWaitMs || !tableName) {
    logger.info({ message: "Executing synchronous processing", userId, requestId, waitTimeMs });
    return await processor(payload);
  }

  // Asynchronous path: start the process and return null immediately (to be followed by poll/wait)
  try {
    if (queueUrl && queueUrl !== "none") {
      logger.info({ message: "Enqueuing async request to SQS", userId, requestId, queueUrl });
      const { SQSClient, SendMessageCommand } = await import("@aws-sdk/client-sqs");
      const endpoint = process.env.AWS_ENDPOINT_URL_SQS || process.env.AWS_ENDPOINT_URL;
      const sqs = new SQSClient({
        region: process.env.AWS_REGION || "eu-west-2",
        ...(endpoint ? { endpoint } : {}),
      });
      await sqs.send(
        new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: JSON.stringify({ userId, requestId, traceparent, correlationId, payload }),
          MessageAttributes: {
            requestId: { DataType: "String", StringValue: requestId },
            userId: { DataType: "String", StringValue: userId },
          },
        }),
      );
      logger.info({ message: "Successfully enqueued async request", requestId });
    } else {
      logger.info({ message: "Starting async processing locally (no SQS queue URL)", userId, requestId });
      // Fire and forget for local development fallback
      runLocalAsyncProcessing({ processor, payload, tableName, requestId, userId });
    }
  } catch (error) {
    logger.error({ message: "Error in async processing initiation", error: error.message, userId, requestId });
    if (tableName) {
      // Awaited for the same reason as the "processing" write above: an unawaited write here
      // can be lost outright if the Lambda freezes once the 202 response is sent, leaving the
      // item stuck in "processing" and every later poll waiting on a "failed" status that never
      // arrives. Nothing else writes to this item in this branch - the enqueue itself failed, so
      // no message ever reached the queue and no processor run will write a competing status.
      try {
        await putAsyncRequest(userId, requestId, "failed", { error: error.message }, tableName);
      } catch (dbError) {
        logger.error({ message: "Error storing failed request state", error: dbError.message, requestId, tableName });
      }
    }
  }

  return null;
}

/**
 * Polls for the completion of an asynchronous request.
 *
 * @param {Object} params - The parameters for waiting.
 * @param {string} params.userId - The user ID.
 * @param {string} params.requestId - The request ID.
 * @param {number} params.waitTimeMs - Maximum time to poll in milliseconds.
 * @param {string} params.tableName - The DynamoDB table name for request tracking.
 * @returns {Promise<Object|null>} The result data if completed, or null if timeout.
 */
export async function wait({ userId, requestId, waitTimeMs, tableName }) {
  // = process.env.ASYNC_REQUESTS_DYNAMODB_TABLE_NAME
  if (!tableName || waitTimeMs <= 0) {
    return null;
  }

  logger.info({ message: `Waiting for ${waitTimeMs}ms for result to be ready`, userId, requestId });
  const start = Date.now();
  let pollIntervalMs = INITIAL_POLL_INTERVAL_MS;

  while (Date.now() - start < waitTimeMs) {
    try {
      const persistedRequest = await getAsyncRequest(userId, requestId, tableName);
      if (persistedRequest?.status === "completed") {
        return persistedRequest.data;
      } else if (persistedRequest?.status === "failed") {
        throw new RequestFailedError(persistedRequest.data);
      }
    } catch (error) {
      // Re-throw if it's a terminal processing failure
      if (error instanceof RequestFailedError) {
        throw error;
      }
      logger.warn({ message: "Error checking request status during wait", error: error.message, requestId });
    }

    // Sleep for dynamic duration to avoid busy-waiting (with exponential back-off)
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    pollIntervalMs = Math.min(pollIntervalMs * 2, MAX_POLL_INTERVAL_MS);
  }

  return null;
}

/**
 * Checks for the existence and status of a persisted request.
 *
 * @param {Object} params - The parameters for checking.
 * @param {string} params.userId - The user ID.
 * @param {string} params.requestId - The request ID.
 * @param {string} params.tableName - The DynamoDB table name for request tracking.
 * @returns {Promise<Object|null>} The result data if completed, null otherwise.
 */
export async function check({ userId, requestId, tableName }) {
  // = process.env.ASYNC_REQUESTS_DYNAMODB_TABLE_NAME
  if (!tableName) {
    return null;
  }

  logger.info({ message: "Checking persisted request status", requestId, tableName });
  try {
    const persistedRequest = await getAsyncRequest(userId, requestId, tableName);
    if (persistedRequest?.status === "completed") {
      return persistedRequest.data;
    } else if (persistedRequest?.status === "failed") {
      throw new RequestFailedError(persistedRequest.data);
    }
  } catch (error) {
    // Re-throw if it's a terminal processing failure
    if (error instanceof RequestFailedError) {
      throw error;
    }
    logger.warn({ message: "Error checking persisted request status", error: error.message, requestId });
  }

  return null;
}

/**
 * Formats the final HTTP response based on whether data is available.
 *
 * @param {Object} params - The parameters for responding.
 * @param {Object} params.request - The normalized request object.
 * @param {string} params.requestId - The request ID.
 * @param {Object} params.responseHeaders - Base headers for the response.
 * @param {Object} params.data - The result data (if available).
 * @param {string} params.dataKey - Optional key to wrap the data in the response body.
 * @returns {Object} A Lambda-compatible response object (200 OK or 202 Accepted).
 */
export function respond({ request, requestId, responseHeaders, data, dataKey }) {
  if (data) {
    if (data.statusCode && data.statusCode !== 200) {
      logger.info({ message: `Returning result with status ${data.statusCode}`, requestId });
      const { statusCode, ...rest } = data;
      const response = {
        statusCode,
        headers: { ...responseHeaders, "x-request-id": requestId, "x-correlationid": requestId },
      };
      if (statusCode !== 204) {
        response.body = JSON.stringify(rest);
      }
      return response;
    }

    logger.info({ message: "Returning HTTP 200 OK with result", requestId });

    // Ensure data is wrapped in the requested key if specified
    const responseData = dataKey && !Object.prototype.hasOwnProperty.call(data, dataKey) ? { [dataKey]: data } : data;

    return http200OkResponse({
      request,
      headers: { ...responseHeaders, "x-request-id": requestId },
      data: responseData,
    });
  }

  // No data yet: Return HTTP 202 Accepted with location header for client polling
  const locationUrl = `${request.origin}${request.pathname}`;
  logger.info({ message: "Yielding with HTTP 202 Accepted", requestId, location: locationUrl });
  return http202AcceptedResponse({
    request,
    headers: { ...responseHeaders, "x-request-id": requestId, "Retry-After": "5" },
    message: "Request accepted for processing",
    location: locationUrl,
  });
}

/**
 * Marks an asynchronous request as completed with a result.
 *
 * @param {Object} params - The parameters for completion.
 * @param {string} params.asyncRequestsTableName - The DynamoDB table name.
 * @param {string} params.requestId - The request ID.
 * @param {string} params.userSub - The user sub (ID).
 * @param {Object} params.result - The result data to store.
 */
export async function complete({ asyncRequestsTableName, requestId, userSub, result }) {
  logger.info({ message: "Marking async request as completed", requestId, userSub, asyncRequestsTableName });
  await putAsyncRequest(userSub, requestId, "completed", result, asyncRequestsTableName);
}

/**
 * Marks an asynchronous request as failed with an error.
 *
 * @param {Object} params - The parameters for failure.
 * @param {string} params.asyncRequestsTableName - The DynamoDB table name.
 * @param {string} params.requestId - The request ID.
 * @param {string} params.userSub - The user sub (ID).
 * @param {Object} params.error - The error object or message.
 */
export async function error({ asyncRequestsTableName, requestId, userSub, error }) {
  logger.info({ message: "Marking async request as failed", requestId, userSub, asyncRequestsTableName, error: error.message || error });
  const errorData = {
    message: error.message || error,
    ...(error.statusCode ? { statusCode: error.statusCode } : {}),
    ...(error.data ? { data: error.data } : {}),
  };
  await putAsyncRequest(userSub, requestId, "failed", errorData, asyncRequestsTableName);
}
