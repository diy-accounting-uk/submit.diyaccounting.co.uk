// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/functions/hmrc/hmrcVatReturnGet.js

import { createLogger, context } from "../../lib/logger.js";
import {
  extractRequest,
  http200OkResponse,
  http400BadRequestResponse,
  buildValidationError,
  http401UnauthorizedResponse,
  http500ServerErrorResponse,
  getHeader,
} from "../../lib/httpResponseHelper.js";
import { validateEnv } from "../../lib/env.js";
import { buildHttpResponseFromLambdaResult, buildLambdaEventFromHttpRequest } from "../../lib/httpServerToLambdaAdaptor.js";
import {
  UnauthorizedTokenError,
  validateHmrcAccessToken,
  hmrcHttpGet,
  extractHmrcAccessTokenFromLambdaEvent,
  http403ForbiddenFromHmrcResponse,
  http404NotFoundFromHmrcResponse,
  http500ServerErrorFromHmrcResponse,
  http403ForbiddenFromBundleEnforcement,
  validateFraudPreventionHeaders,
  buildHmrcHeaders,
} from "../../services/hmrcApi.js";
import { enforceBundles } from "../../services/bundleManagement.js";
import { isValidVrn, isValidIsoDate } from "../../lib/hmrcValidation.js";
import { findObligationByDateRange, obligationLookupWindow, describeObligationPeriod } from "../../lib/obligationFormatter.js";
import { getVatObligations } from "./hmrcVatObligationGet.js";
import * as asyncApiServices from "../../services/asyncApiServices.js";
import { getAsyncRequest } from "../../data/dynamoDbAsyncRequestRepository.js";
import { buildFraudHeaders, detectVendorPublicIp } from "../../lib/buildFraudHeaders.js";
import { initializeSalt } from "../../services/subHasher.js";
import { publishActivityEvent } from "../../lib/activityAlert.js";

const logger = createLogger({ source: "app/functions/hmrc/hmrcVatReturnGet.js" });

const MAX_WAIT_MS = 25000;
const DEFAULT_WAIT_MS = 0;

/**
 * Serialize response headers to a plain object with lowercase keys
 * Handles both Headers objects (with forEach) and plain objects
 * @param {Headers|Object|null} headers - Response headers
 * @returns {Array<[string, string]>} Array of [key, value] pairs for Object.fromEntries
 */
function serializeResponseHeaders(headers) {
  if (!headers) {
    return [];
  }
  if (typeof headers.forEach === "function") {
    const headerEntries = {};
    headers.forEach((value, key) => {
      headerEntries[key.toLowerCase()] = value;
    });
    return Object.entries(headerEntries);
  }
  return Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]);
}

// Server hook for Express app, and construction of a Lambda-like event from HTTP request)
/* v8 ignore start */
export function apiEndpoint(app) {
  // New endpoint using query parameters for date-based period lookup
  app.get(`/api/v1/hmrc/vat/return`, async (httpRequest, httpResponse) => {
    const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
    const lambdaResult = await ingestHandler(lambdaEvent);
    return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
  });
  app.head("/api/v1/hmrc/vat/return", async (httpRequest, httpResponse) => {
    httpResponse.status(200).send();
  });
}
/* v8 ignore stop */

export function extractAndValidateParameters(event, errorMessages) {
  const queryParams = event.queryStringParameters || {};
  const { vrn, periodStart, periodEnd, periodKey, runFraudPreventionHeaderValidation, allowSyntheticObligations } = queryParams;
  const { "Gov-Test-Scenario": testScenario } = queryParams;

  // Collect validation errors for required fields and formats
  if (!vrn) errorMessages.push("Missing vrn parameter");

  // Either periodKey (direct) or periodStart+periodEnd (resolved from obligations) is required
  if (!periodKey) {
    if (!periodStart) errorMessages.push("Missing periodStart parameter");
    if (!periodEnd) errorMessages.push("Missing periodEnd parameter");
  }

  if (vrn && !isValidVrn(vrn)) errorMessages.push("Invalid VAT registration number format - must be 9 digits");

  // Validate date formats - log rejected values for debugging
  if (periodStart && !isValidIsoDate(periodStart)) {
    logger.warn({ message: "Rejected periodStart - invalid date format", rejectedValue: periodStart });
    errorMessages.push(`Invalid periodStart format '${periodStart}' - must be YYYY-MM-DD`);
  }
  if (periodEnd && !isValidIsoDate(periodEnd)) {
    logger.warn({ message: "Rejected periodEnd - invalid date format", rejectedValue: periodEnd });
    errorMessages.push(`Invalid periodEnd format '${periodEnd}' - must be YYYY-MM-DD`);
  }

  // Extract HMRC account (synthetic/live) from header hmrcAccount
  const hmrcAccountHeader = getHeader(event.headers, "hmrcAccount") || "";
  const hmrcAccount = hmrcAccountHeader.toLowerCase();
  if (hmrcAccount && hmrcAccount !== "synthetic" && hmrcAccount !== "live") {
    errorMessages.push("Invalid hmrcAccount header. Must be either 'synthetic' or 'live' if provided.");
  }

  const runFraudPreventionHeaderValidationBool =
    runFraudPreventionHeaderValidation === true || runFraudPreventionHeaderValidation === "true";

  // In synthetic mode, use any available fulfilled obligation only when the caller opts in. An absent
  // or falsy value keeps strict obligation matching, since HMRC's sandbox can return an
  // already-fulfilled period.
  const allowSyntheticObligationsBool =
    hmrcAccount === "synthetic" && (allowSyntheticObligations === true || allowSyntheticObligations === "true");

  return {
    vrn,
    periodStart,
    periodEnd,
    periodKey: periodKey || null,
    testScenario,
    hmrcAccount,
    runFraudPreventionHeaderValidation: runFraudPreventionHeaderValidationBool,
    allowSyntheticObligations: allowSyntheticObligationsBool,
  };
}

// HTTP request/response, aware Lambda ingestHandler function
// TODO: Remove all but the initial wait and async options.
// eslint-disable-next-line sonarjs/cognitive-complexity -- async polling + error handling is inherently complex
export async function ingestHandler(event) {
  await initializeSalt();
  await detectVendorPublicIp();
  validateEnv([
    "HMRC_BASE_URI",
    "HMRC_SANDBOX_BASE_URI",
    "BUNDLE_DYNAMODB_TABLE_NAME",
    "HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME",
    "HMRC_VAT_RETURN_GET_ASYNC_REQUESTS_TABLE_NAME",
    "SQS_QUEUE_URL",
  ]);

  const { request, requestId, traceparent, correlationId } = extractRequest(event);

  const asyncRequestsTableName = process.env.HMRC_VAT_RETURN_GET_ASYNC_REQUESTS_TABLE_NAME;
  const sqsQueueUrl = process.env.SQS_QUEUE_URL;

  let errorMessages = [];

  // Bundle enforcement
  let userSub;
  let bundleIds = [];
  try {
    ({ userSub, bundleIds } = await enforceBundles(event));
  } catch (error) {
    return http403ForbiddenFromBundleEnforcement(error, request);
  }

  // If HEAD request, return 200 OK immediately after bundle enforcement
  if (event?.requestContext?.http?.method === "HEAD") {
    return http200OkResponse({
      request,
      headers: { "Content-Type": "application/json" },
      data: {},
    });
  }

  const { govClientHeaders, govClientErrorMessages } = buildFraudHeaders(event, { bundleIds });
  errorMessages = errorMessages.concat(govClientErrorMessages || []);

  // Extract and validate parameters
  const {
    vrn,
    periodStart,
    periodEnd,
    periodKey: directPeriodKey,
    testScenario,
    hmrcAccount,
    runFraudPreventionHeaderValidation,
    allowSandboxObligations,
  } = extractAndValidateParameters(event, errorMessages);

  const responseHeaders = { ...govClientHeaders };

  // Non-authorization validation errors
  if (errorMessages.length > 0) {
    const hmrcAccessTokenMaybe = extractHmrcAccessTokenFromLambdaEvent(event);
    if (!hmrcAccessTokenMaybe) errorMessages.push("Missing Authorization Bearer token");
    return buildValidationError(request, errorMessages, responseHeaders);
  }

  // Validate token after validating other inputs
  const hmrcAccessToken = extractHmrcAccessTokenFromLambdaEvent(event);
  if (!hmrcAccessToken) {
    return http400BadRequestResponse({
      request,
      headers: { ...responseHeaders },
      message: "Missing Authorization Bearer token",
    });
  }
  try {
    validateHmrcAccessToken(hmrcAccessToken);
  } catch (err) {
    if (err instanceof UnauthorizedTokenError) {
      return http401UnauthorizedResponse({ request, headers: { ...responseHeaders }, message: err.message, error: {} });
    }
    return buildValidationError(request, [err.toString()], responseHeaders);
  }

  // Keep local override for test scenarios in a consistent variable name
  const govTestScenarioHeader = getHeader(govClientHeaders, "Gov-Test-Scenario") || testScenario;

  // Simulate an immediate API (this lambda) failure for testing, mirroring POST ingestHandler
  logger.info({ "Checking for test scenario": govTestScenarioHeader });
  if (govTestScenarioHeader === "SUBMIT_API_HTTP_500") {
    return http500ServerErrorResponse({
      request,
      headers: { ...responseHeaders },
      message: `Simulated server error for testing scenario: ${govTestScenarioHeader}`,
    });
  }

  // Detect poll vs initial request, and look up any persisted async record before doing
  // periodKey resolution. After a submission is recorded, HMRC may no longer surface the
  // obligation in the status we filter on, so re-resolving on a poll would 404 spuriously.
  const isInitialRequest = getHeader(event.headers, "x-initial-request") === "true";
  let persistedRequest = null;
  if (!isInitialRequest) {
    persistedRequest = await getAsyncRequest(userSub, requestId, asyncRequestsTableName);
  }

  // Resolve periodKey: either use the directly provided periodKey or resolve from obligations.
  // Skip entirely on polls where we already have a persisted record — the result is cached.
  let normalizedPeriodKey = null;
  // Sandbox-only: further fulfilled obligations to try in turn if normalizedPeriodKey's return 404s
  // (the sandbox does not hold a canned return for every fulfilled obligation it lists).
  let sandboxFallbackPeriodKeys = [];
  if (!persistedRequest) {
    if (directPeriodKey) {
      normalizedPeriodKey = directPeriodKey.toUpperCase();
      logger.info({ message: "Using directly provided periodKey", periodKey: normalizedPeriodKey });
    }

    // Resolve periodKey from obligations using the period date range (only if not provided directly)
    // Note: Do NOT pass the test scenario to obligations - it should only apply to the VAT return call
    if (!normalizedPeriodKey) {
      logger.info({ message: "Resolving periodKey from date range", periodStart, periodEnd, vrn });
      try {
        // Query every obligation in the window, whatever its status: an obligation still marked
        // open tells the customer their return has not been filed yet, which beats a bare miss.
        const { obligations, hmrcResponse } = await getVatObligations(
          vrn,
          hmrcAccessToken,
          govClientHeaders,
          null, // Don't pass test scenario to obligations - apply only to the VAT return GET
          hmrcAccount,
          obligationLookupWindow(periodStart, periodEnd),
          userSub,
          runFraudPreventionHeaderValidation,
          requestId,
          traceparent,
          correlationId,
        );

        if (!hmrcResponse.ok) {
          logger.error({ message: "Failed to fetch obligations for period resolution", status: hmrcResponse.status });
          return buildValidationError(request, [`Failed to resolve period key: HMRC returned ${hmrcResponse.status}`], responseHeaders);
        }

        // obligations is the full HMRC response body containing { obligations: [...] }
        const obligationsArray = obligations?.obligations || [];
        const matchedObligation = findObligationByDateRange(obligationsArray, periodStart, periodEnd);
        let resolvedPeriodKey = matchedObligation?.status === "F" ? matchedObligation.periodKey : null;

        // The requested dates can match a fulfilled obligation exactly and still 404 in the
        // sandbox - it doesn't hold a canned return for every fulfilled obligation it lists.
        // Keep the other fulfilled obligations from the same window as fallbacks to try in turn.
        if (resolvedPeriodKey && allowSandboxObligations) {
          sandboxFallbackPeriodKeys = obligationsArray
            .filter((o) => o.status === "F" && o.periodKey !== resolvedPeriodKey)
            .map((o) => o.periodKey.toUpperCase());
        }

        // If no matching obligation found and allowSandboxObligations is enabled (sandbox only),
        // use the first available fulfilled obligation instead of erroring. The sandbox may hold
        // no canned return for that period, so keep the rest as fallbacks to try in turn.
        if (!resolvedPeriodKey && allowSandboxObligations) {
          const fulfilledObligations = obligationsArray.filter((o) => o.status === "F");
          if (fulfilledObligations.length > 0) {
            resolvedPeriodKey = fulfilledObligations[0].periodKey;
            sandboxFallbackPeriodKeys = fulfilledObligations.slice(1).map((o) => o.periodKey.toUpperCase());
            logger.info({
              message: "allowSandboxObligations: Using first available fulfilled obligation",
              requestedPeriod: { periodStart, periodEnd },
              usedObligation: fulfilledObligations[0],
              fallbackCount: sandboxFallbackPeriodKeys.length,
            });
          }
        }

        if (!resolvedPeriodKey) {
          logger.error({
            message: "No matching obligation found for date range",
            periodStart,
            periodEnd,
            obligations: obligationsArray,
            allowSandboxObligations,
          });
          const stillOpen = matchedObligation?.status === "O";
          const detail = stillOpen
            ? ` HMRC still shows ${describeObligationPeriod(matchedObligation)} as open, so no return has been filed for it yet.`
            : "";
          return buildValidationError(
            request,
            [`No submitted VAT return found for period ${periodStart} to ${periodEnd}.${detail}`],
            responseHeaders,
          );
        }

        normalizedPeriodKey = resolvedPeriodKey.toUpperCase();
        logger.info({ message: "Resolved periodKey from date range", periodStart, periodEnd, resolvedPeriodKey: normalizedPeriodKey });
      } catch (error) {
        logger.error({ message: "Error resolving periodKey from obligations", error: error.message });
        return http500ServerErrorResponse({
          request,
          headers: { ...responseHeaders },
          message: `Failed to resolve period key: ${error.message}`,
        });
      }
    }
  }

  const waitTimeMs = parseInt(getHeader(event.headers, "x-wait-time-ms") || DEFAULT_WAIT_MS, 10);

  const payload = {
    vrn,
    periodKey: normalizedPeriodKey,
    sandboxFallbackPeriodKeys,
    allowSandboxObligations,
    hmrcAccessToken,
    govClientHeaders,
    testScenario: govTestScenarioHeader,
    hmrcAccount,
    userSub,
    runFraudPreventionHeaderValidation,
    requestId,
    traceparent,
    correlationId,
  };

  logger.info({ message: "Handler entry", waitTimeMs, requestId, isInitialRequest });

  let result = null;
  try {
    if (persistedRequest) {
      logger.info({ message: "Found persisted request", requestId, status: persistedRequest.status });
      if (persistedRequest.status === "completed") {
        result = persistedRequest.data;
      } else if (persistedRequest.status === "failed") {
        throw new asyncApiServices.RequestFailedError(persistedRequest.data);
      }
      // If processing, result stays null and we skip initiation
    } else {
      logger.info({ message: "Initiating new processing", requestId });
      const processor = async (payload) => {
        const { vatReturn, hmrcResponse, periodKey: usedPeriodKey } = await getVatReturnWithSandboxFallback(
          payload.vrn,
          [payload.periodKey, ...(payload.sandboxFallbackPeriodKeys || [])],
          payload.hmrcAccessToken,
          payload.govClientHeaders,
          payload.testScenario,
          payload.hmrcAccount,
          payload.userSub,
          payload.runFraudPreventionHeaderValidation,
          payload.requestId,
          payload.traceparent,
          payload.correlationId,
          payload.allowSandboxObligations,
        );

        const serializableHmrcResponse = {
          ok: hmrcResponse.ok,
          status: hmrcResponse.status,
          statusText: hmrcResponse.statusText,
          headers: Object.fromEntries(serializeResponseHeaders(hmrcResponse.headers)),
        };
        return { vatReturn, hmrcResponse: serializableHmrcResponse, periodKey: usedPeriodKey };
      };

      result = await asyncApiServices.initiateProcessing({
        processor,
        userId: userSub,
        requestId,
        traceparent,
        correlationId,
        waitTimeMs,
        payload,
        tableName: asyncRequestsTableName,
        queueUrl: sqsQueueUrl,
        maxWaitMs: MAX_WAIT_MS,
      });
    }

    // If still no result (async path) and we have a wait time, poll for completion
    if (!result && waitTimeMs > 0) {
      result = await asyncApiServices.wait({ userId: userSub, requestId, waitTimeMs, tableName: asyncRequestsTableName });
    }

    // One last check before deciding whether to yield or return the final result
    if (!result) {
      result = await asyncApiServices.check({ userId: userSub, requestId, tableName: asyncRequestsTableName });
    }
  } catch (error) {
    if (error instanceof asyncApiServices.RequestFailedError) {
      result = error.data;
    } else {
      logger.error({ message: "Unexpected error during VAT return retrieval", error: error.message, stack: error.stack });
      return http500ServerErrorResponse({
        request,
        headers: { ...responseHeaders },
        message: "Internal server error",
        error: error.message,
      });
    }
  }

  // Map HMRC error responses to our HTTP responses
  if (result && result.hmrcResponse && !result.hmrcResponse.ok) {
    const status = result.hmrcResponse.status;
    if (status === 403) return http403ForbiddenFromHmrcResponse(hmrcAccessToken, result.hmrcResponse, responseHeaders);
    if (status === 404) return http404NotFoundFromHmrcResponse(request, result.hmrcResponse, responseHeaders);
    return http500ServerErrorFromHmrcResponse(request, result.hmrcResponse, responseHeaders);
  }

  return asyncApiServices.respond({
    request,
    requestId,
    responseHeaders,
    data: result ? result.vatReturn : null,
  });
}

// SQS worker Lambda ingestHandler function
export async function workerHandler(event) {
  await initializeSalt();
  validateEnv([
    "HMRC_BASE_URI",
    "HMRC_SANDBOX_BASE_URI",
    "BUNDLE_DYNAMODB_TABLE_NAME",
    "HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME",
    "HMRC_VAT_RETURN_GET_ASYNC_REQUESTS_TABLE_NAME",
  ]);

  const asyncRequestsTableName = process.env.HMRC_VAT_RETURN_GET_ASYNC_REQUESTS_TABLE_NAME;

  logger.info({ message: "SQS Worker entry", recordCount: event.Records?.length });

  for (const record of event.Records || []) {
    let userSub;
    let requestId;
    let traceparent;
    let correlationId;
    try {
      const body = JSON.parse(record.body);
      userSub = body.userId;
      requestId = body.requestId;
      traceparent = body.traceparent;
      correlationId = body.correlationId;
      const payload = body.payload;

      if (!userSub || !requestId) {
        logger.error({ message: "SQS Message missing userId or requestId", recordId: record.messageId, body });
        continue;
      }

      if (!context.getStore()) {
        context.enterWith(new Map());
      }
      context.set("requestId", requestId);
      context.set("traceparent", traceparent);
      context.set("correlationId", correlationId);
      context.set("userSub", userSub);

      logger.info({ message: "Processing SQS message", userSub, requestId, messageId: record.messageId });

      const {
        vatReturn,
        hmrcResponse,
        periodKey: usedPeriodKey,
      } = await getVatReturnWithSandboxFallback(
        payload.vrn,
        [payload.periodKey, ...(payload.sandboxFallbackPeriodKeys || [])],
        payload.hmrcAccessToken,
        payload.govClientHeaders,
        payload.testScenario,
        payload.hmrcAccount,
        payload.userSub,
        payload.runFraudPreventionHeaderValidation,
        payload.requestId,
        payload.traceparent,
        payload.correlationId,
        payload.allowSandboxObligations,
      );

      const serializableHmrcResponse = {
        ok: hmrcResponse.ok,
        status: hmrcResponse.status,
        statusText: hmrcResponse.statusText,
        headers: Object.fromEntries(serializeResponseHeaders(hmrcResponse.headers)),
      };

      const result = { vatReturn, hmrcResponse: serializableHmrcResponse, periodKey: usedPeriodKey };

      if (!hmrcResponse.ok) {
        // Distinguish retryable errors (e.g. 429, 503, 504)
        const isRetryable = [429, 503, 504].includes(hmrcResponse.status);
        if (isRetryable) {
          throw new Error(`HMRC temporary error ${hmrcResponse.status}`);
        }

        await asyncApiServices.complete({
          asyncRequestsTableName,
          requestId,
          userSub,
          result,
        });
        continue;
      }

      await asyncApiServices.complete({
        asyncRequestsTableName,
        requestId,
        userSub,
        result,
      });

      logger.info({ message: "Successfully processed SQS message", requestId });
    } catch (error) {
      const isRetryable = isRetryableError(error);

      if (isRetryable) {
        logger.warn({ message: "Transient error in worker, re-throwing for SQS retry", error: error.message, requestId });
        throw error;
      }

      logger.error({
        message: "Terminal error processing SQS message",
        error: error.message,
        stack: error.stack,
        messageId: record.messageId,
        userSub,
        requestId,
      });
      if (userSub && requestId) {
        await asyncApiServices.error({
          asyncRequestsTableName,
          requestId,
          userSub,
          error,
        });
      }
      // Do not re-throw terminal errors to avoid infinite SQS retry loops
    }
  }
}

/**
 * Determine if an error is retryable (transient) or terminal.
 * @param {Error} error
 * @returns {boolean}
 */
function isRetryableError(error) {
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

// Service adaptor aware of the downstream service but not the consuming Lambda's incoming/outgoing HTTP request/response
export async function getVatReturn(
  vrn,
  periodKey,
  hmrcAccessToken,
  govClientHeaders,
  testScenario,
  hmrcAccount,
  auditForUserSub,
  runFraudPreventionHeaderValidation = false,
  requestId = undefined,
  traceparent = undefined,
  correlationId = undefined,
) {
  // Validate fraud prevention headers for sandbox accounts
  if (hmrcAccount === "sandbox" && runFraudPreventionHeaderValidation) {
    logger.info({ message: "Validating fraud prevention headers for sandbox account", hmrcAccount, runFraudPreventionHeaderValidation });
    try {
      await validateFraudPreventionHeaders(hmrcAccessToken, govClientHeaders, auditForUserSub, requestId, traceparent, correlationId);
    } catch (error) {
      logger.error({ message: `Error validating fraud prevention headers: ${error.message}` });
    }
  } else {
    logger.info({
      message: "Skipping fraud prevention header validation for HMRC API request",
      hmrcAccount,
      runFraudPreventionHeaderValidation,
    });
  }

  const hmrcRequestUrl = `/organisations/vat/${vrn}/returns/${periodKey}`;
  let hmrcResponse = {};
  /* v8 ignore start */
  if (testScenario === "SUBMIT_HMRC_API_HTTP_500") {
    logger.error({ message: `Simulated server error for testing scenario: ${testScenario}` });
    hmrcResponse.ok = false;
    hmrcResponse.status = 500;
  } else if (testScenario === "SUBMIT_HMRC_API_HTTP_503") {
    logger.error({ message: `Simulated server unavailable for testing scenario: ${testScenario}` });
    hmrcResponse.ok = false;
    hmrcResponse.status = 503;
  } else {
    if (testScenario === "SUBMIT_HMRC_API_HTTP_SLOW_10S") {
      // Strip Gov-Test-Scenario from headers to avoid triggering reject from HMRC
      delete govClientHeaders["Gov-Test-Scenario"];
      const slowTime = 10000;
      logger.warn({ message: `Simulating slow HMRC API response for testing scenario (waiting...): ${testScenario}`, slowTime });
      await new Promise((resolve) => setTimeout(resolve, slowTime));
      logger.warn({ message: `Simulating slow HMRC API response for testing scenario (waited): ${testScenario}`, slowTime });
    }
    const hmrcRequestHeaders = buildHmrcHeaders(hmrcAccessToken, govClientHeaders, testScenario, requestId, traceparent, correlationId);
    /* v8 ignore stop */
    hmrcResponse = await hmrcHttpGet(
      hmrcRequestUrl,
      hmrcRequestHeaders,
      govClientHeaders,
      testScenario === "SUBMIT_HMRC_API_HTTP_SLOW_10S" ? null : testScenario,
      hmrcAccount,
      {},
      auditForUserSub,
    );
  }

  if (!hmrcResponse.ok) {
    // Workers of this function may choose to map these to HTTP responses
    return { hmrcResponse, vatReturn: null };
  }
  await publishActivityEvent({
    event: "vat-return-queried",
    summary: "VAT return queried",
    userSub: auditForUserSub,
  });
  return { hmrcResponse, vatReturn: hmrcResponse.data, hmrcRequestUrl };
}

/**
 * Look up a VAT return, trying each candidate periodKey in turn.
 *
 * With allowSandboxObligations, periodKey resolution falls back to "any fulfilled
 * obligation" when none matches the requested date range exactly, but the sandbox
 * does not hold a canned return for every fulfilled obligation it lists (one period
 * key can 404 while another in the same obligations list has data). Only continue to
 * the next candidate on a sandbox 404 - a live account's 404 is a genuine miss, and a
 * non-404 error (403, 500, ...) is returned immediately rather than masked by a retry.
 *
 * @param {string} vrn
 * @param {string[]} periodKeys - candidates in priority order; only the first is tried
 *   outside the sandbox fallback case
 * @returns {Promise<{hmrcResponse: object, vatReturn: object|null, periodKey: string}>}
 */
export async function getVatReturnWithSandboxFallback(
  vrn,
  periodKeys,
  hmrcAccessToken,
  govClientHeaders,
  testScenario,
  hmrcAccount,
  auditForUserSub,
  runFraudPreventionHeaderValidation = false,
  requestId = undefined,
  traceparent = undefined,
  correlationId = undefined,
  allowSandboxObligations = false,
) {
  const candidates = (Array.isArray(periodKeys) ? periodKeys : [periodKeys]).filter(Boolean);
  let attempt = null;
  for (let i = 0; i < candidates.length; i++) {
    const periodKey = candidates[i];
    const outcome = await getVatReturn(
      vrn,
      periodKey,
      hmrcAccessToken,
      govClientHeaders,
      testScenario,
      hmrcAccount,
      auditForUserSub,
      runFraudPreventionHeaderValidation,
      requestId,
      traceparent,
      correlationId,
    );
    attempt = { ...outcome, periodKey };

    const isSandboxNotFound = allowSandboxObligations && hmrcAccount === "sandbox" && attempt.hmrcResponse.status === 404;
    const hasMoreCandidates = i < candidates.length - 1;
    if (attempt.hmrcResponse.ok || !isSandboxNotFound || !hasMoreCandidates) {
      return attempt;
    }
    logger.info({
      message: "allowSandboxObligations: return lookup 404'd for period, trying next fulfilled obligation",
      periodKey,
      nextPeriodKey: candidates[i + 1],
    });
  }
  return attempt;
}
