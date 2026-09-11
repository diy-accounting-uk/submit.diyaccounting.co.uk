// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/sqsWorkerHelper.js
// Shared helpers for SQS worker Lambda handlers

import { validateEnv } from "./env.js";
import { context } from "./logger.js";
import { initializeSalt } from "../services/subHasher.js";

/**
 * Determine if an error is retryable (transient) or terminal.
 * @param {Error} error
 * @returns {boolean}
 */
export function isRetryableError(error) {
  // Explicitly marked retryable HMRC errors
  if (error.message?.includes("HMRC temporary error")) return true;

  // Fetch timeout
  if (error.name === "AbortError") return true;

  // Standard Node.js network errors
  const retryableCodes = ["ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "ESOCKETTIMEDOUT", "ECONNREFUSED", "EHOSTUNREACH"];
  if (error.code && retryableCodes.includes(error.code)) return true;

  // DynamoDB throughput or other transient AWS errors might have retryable: true
  if (error.retryable) return true;

  return false;
}

/**
 * Raised when an SQS record's body can't even be parsed, or is missing the ids needed to
 * process it. Always re-thrown for SQS redelivery regardless of a caller's error policy -
 * there is nowhere to persist a terminal outcome for a record we can't identify.
 */
class SqsRecordParseError extends Error {}

/**
 * Run the per-record loop every SQS worker Lambda repeats: env validation, salt
 * initialisation, JSON body parsing, id extraction, AsyncLocalStorage context, and error
 * handling.
 *
 * @param {Object} event - the Lambda SQS event ({ Records: [...] })
 * @param {Object} options
 * @param {string[]} options.requiredEnv - env vars checked with validateEnv() before any record runs
 * @param {Object} options.logger - the caller's logger (keeps each handler's own `source` binding)
 * @param {"rethrow"|"classify"} options.errorPolicy - what a record's error does:
 *   - "rethrow": always re-throw, so SQS retries or DLQs the message. For callers whose
 *     processor already persists its own outcome and leaves nothing that could get stuck in a
 *     half-finished state.
 *   - "classify": re-throw only when isRetryableError(error) is true; a terminal error goes to
 *     options.onTerminalError instead and the loop moves on. For callers polled for an async
 *     result, where a terminal error must be recorded rather than retried forever.
 * @param {string} [options.userContextKey="userSub"] - AsyncLocalStorage key (and log field
 *   name) the extracted user id is stored under; some callers read it back as "userId"
 * @param {(payload: any, ids: {userId: string, requestId: string, traceparent: string, correlationId: string}) => Promise<void>} options.processRecord
 *   - the caller's business logic for one record, including any success/failure persistence
 * @param {(error: Error, ids: {userId: string, requestId: string, traceparent: string, correlationId: string}) => Promise<void>} [options.onTerminalError]
 *   - called for a terminal error under the "classify" policy, after logging; required when errorPolicy is "classify"
 */
export async function processSqsRecords(
  event,
  { requiredEnv, logger, errorPolicy, userContextKey = "userSub", processRecord, onTerminalError },
) {
  await initializeSalt();
  validateEnv(requiredEnv);

  logger.info({ message: "SQS Worker entry", recordCount: event.Records?.length });

  for (const record of event.Records || []) {
    let userId;
    let requestId;
    let traceparent;
    let correlationId;
    try {
      let body;
      try {
        body = JSON.parse(record.body);
      } catch (parseError) {
        throw new SqsRecordParseError(`Failed to parse SQS message body: ${parseError.message}`);
      }
      userId = body.userId;
      requestId = body.requestId;
      traceparent = body.traceparent;
      correlationId = body.correlationId;

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
      context.set(userContextKey, userId);

      logger.info({ message: "Processing SQS message", [userContextKey]: userId, requestId, messageId: record.messageId });

      await processRecord(body.payload, { userId, requestId, traceparent, correlationId });
    } catch (error) {
      if (error instanceof SqsRecordParseError) {
        logger.error({ message: "Re-throwing malformed SQS record for redelivery", error: error.message, messageId: record.messageId });
        throw error;
      }

      if (errorPolicy === "rethrow") {
        logger.error({
          message: "Error processing SQS message",
          error: error.message,
          stack: error.stack,
          messageId: record.messageId,
          [userContextKey]: userId,
          requestId,
        });
        throw error;
      }

      if (isRetryableError(error)) {
        logger.warn({ message: "Transient error in worker, re-throwing for SQS retry", error: error.message, requestId });
        throw error;
      }

      logger.error({
        message: "Terminal error processing SQS message",
        error: error.message,
        stack: error.stack,
        messageId: record.messageId,
        [userContextKey]: userId,
        requestId,
      });
      await onTerminalError(error, { userId, requestId, traceparent, correlationId });
      // Do not re-throw terminal errors to avoid infinite SQS retry loops
    }
  }
}
