// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/hmrc/hmrcItsaCalculationTriggerPost.js

import { createLogger, context } from "../../lib/logger.js";
import {
  extractRequest,
  http200OkResponse,
  parseRequestBody,
  buildValidationError,
  http401UnauthorizedResponse,
  http500ServerErrorResponse,
  getHeader,
  serializeResponseHeaders,
} from "../../lib/httpResponseHelper.js";
import { validateEnv } from "../../lib/env.js";
import { buildHttpResponseFromLambdaResult, buildLambdaEventFromHttpRequest } from "../../lib/httpServerToLambdaAdaptor.js";
import {
  UnauthorizedTokenError,
  validateHmrcAccessToken,
  hmrcHttpPost,
  extractHmrcAccessTokenFromLambdaEvent,
  generateHmrcErrorResponseWithRetryAdvice,
  http400BadRequestFromHmrcResponse,
  http403ForbiddenFromBundleEnforcement,
  validateFraudPreventionHeaders,
  buildHmrcHeaders,
} from "../../services/hmrcApi.js";
import { enforceBundles } from "../../services/bundleManagement.js";
import { isValidNino, isValidTaxYear } from "../../lib/hmrcValidation.js";
import * as asyncApiServices from "../../services/asyncApiServices.js";
import { getAsyncRequest } from "../../data/dynamoDbAsyncRequestRepository.js";
import { buildFraudHeaders, detectVendorPublicIp } from "../../lib/buildFraudHeaders.js";
import { initializeSalt } from "../../services/subHasher.js";
import { publishActivityEvent } from "../../lib/activityAlert.js";
import { getItsaCalculation } from "./hmrcItsaCalculationGet.js";

const logger = createLogger({ source: "app/functions/hmrc/hmrcItsaCalculationTriggerPost.js" });

const MAX_WAIT_MS = 25000;
const DEFAULT_WAIT_MS = 0;

// Individual Calculations v8.0 - the API version this endpoint requires.
const HMRC_API_VERSION = "8.0";

// The three calculationType values the trigger path accepts. HMRC's own scope narrows this
// further by tax year (intent-to-amend only applies from 2025-26), but that rule belongs to
// HMRC's business validation, not to a format check made before the request is ever sent.
const CALCULATION_TYPES = ["in-year", "intent-to-finalise", "intent-to-amend"];

// HMRC's calculation runs asynchronously after a 202: "it is recommended you wait at least 5
// seconds before calling the retrieval endpoint" (Individual Calculations 8.0 spec).
const MIN_CALCULATION_WAIT_MS = 5000;

// The retrieval endpoint answers 404 while the calculation is still running. This worker polls
// it a bounded number of times rather than forever, so a stuck sandbox calculation fails the
// request instead of holding the worker Lambda open indefinitely.
const CALCULATION_RETRIEVE_MAX_ATTEMPTS = 5;
const CALCULATION_RETRIEVE_RETRY_DELAY_MS = 3000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Server hook for Express app, and construction of a Lambda-like event from HTTP request)
/* v8 ignore start */
export function apiEndpoint(app) {
  app.post("/api/v1/hmrc/itsa/calculation/trigger", async (httpRequest, httpResponse) => {
    const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
    const lambdaResult = await ingestHandler(lambdaEvent);
    return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
  });
  app.head("/api/v1/hmrc/itsa/calculation/trigger", async (httpRequest, httpResponse) => {
    httpResponse.status(200).send();
  });
}
/* v8 ignore stop */

export function extractAndValidateParameters(event, errorMessages) {
  const parsedBody = parseRequestBody(event);
  const { nino, taxYear, calculationType, runFraudPreventionHeaderValidation } = parsedBody || {};

  if (!nino) errorMessages.push("Missing nino parameter from body");
  if (nino && !isValidNino(nino)) errorMessages.push("Invalid nino format");

  if (!taxYear) errorMessages.push("Missing taxYear parameter from body");
  if (taxYear && !isValidTaxYear(taxYear)) errorMessages.push("Invalid taxYear format - must be YYYY-YY");

  if (!calculationType) errorMessages.push("Missing calculationType parameter from body");
  if (calculationType && !CALCULATION_TYPES.includes(calculationType)) {
    errorMessages.push(`Invalid calculationType - must be one of ${CALCULATION_TYPES.join(", ")}`);
  }

  // Extract HMRC account (synthetic/live) from header hmrcAccount
  const hmrcAccountHeader = getHeader(event.headers, "hmrcAccount") || "";
  const hmrcAccount = hmrcAccountHeader.toLowerCase();
  if (hmrcAccount && hmrcAccount !== "synthetic" && hmrcAccount !== "live") {
    errorMessages.push("Invalid hmrcAccount header. Must be either 'synthetic' or 'live' if provided.");
  }

  const runFraudPreventionHeaderValidationBool =
    runFraudPreventionHeaderValidation === true || runFraudPreventionHeaderValidation === "true";

  return {
    nino,
    taxYear,
    calculationType,
    hmrcAccount,
    runFraudPreventionHeaderValidation: runFraudPreventionHeaderValidationBool,
  };
}

// HTTP request/response, aware Lambda ingestHandler function
export async function ingestHandler(event) {
  await initializeSalt();
  await detectVendorPublicIp();
  validateEnv([
    "HMRC_BASE_URI",
    "HMRC_SANDBOX_BASE_URI",
    "BUNDLE_DYNAMODB_TABLE_NAME",
    "HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME",
    "HMRC_ITSA_CALCULATION_TRIGGER_POST_ASYNC_REQUESTS_TABLE_NAME",
    "SQS_QUEUE_URL",
  ]);

  const { request, requestId, traceparent, correlationId } = extractRequest(event);

  const asyncRequestsTableName = process.env.HMRC_ITSA_CALCULATION_TRIGGER_POST_ASYNC_REQUESTS_TABLE_NAME;
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
  const { nino, taxYear, calculationType, hmrcAccount, runFraudPreventionHeaderValidation } = extractAndValidateParameters(
    event,
    errorMessages,
  );

  const responseHeaders = { ...govClientHeaders };

  // Non-authorization validation errors
  if (errorMessages.length > 0) {
    const hmrcAccessTokenMaybe = extractHmrcAccessTokenFromLambdaEvent(event);
    if (!hmrcAccessTokenMaybe) errorMessages.push("Missing Authorization Bearer token");
    return buildValidationError(request, errorMessages, responseHeaders);
  }

  const hmrcAccessToken = extractHmrcAccessTokenFromLambdaEvent(event);
  if (!hmrcAccessToken) {
    return buildValidationError(request, ["Missing Authorization Bearer token"], responseHeaders);
  }
  try {
    validateHmrcAccessToken(hmrcAccessToken);
  } catch (err) {
    if (err instanceof UnauthorizedTokenError) {
      return http401UnauthorizedResponse({ request, headers: { ...responseHeaders }, message: err.message, error: {} });
    }
    return buildValidationError(request, [err.toString()], responseHeaders);
  }

  const govTestScenarioHeader = getHeader(govClientHeaders, "Gov-Test-Scenario");

  logger.info({ "Checking for test scenario": govTestScenarioHeader });
  if (govTestScenarioHeader === "SUBMIT_API_HTTP_500") {
    return http500ServerErrorResponse({
      request,
      headers: { ...responseHeaders },
      message: `Simulated server error for testing scenario: ${govTestScenarioHeader}`,
    });
  }

  const waitTimeMs = parseInt(getHeader(event.headers, "x-wait-time-ms") || DEFAULT_WAIT_MS, 10);

  const payload = {
    nino,
    taxYear,
    calculationType,
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

  const isInitialRequest = getHeader(event.headers, "x-initial-request") === "true";
  let persistedRequest = null;
  if (!isInitialRequest) {
    persistedRequest = await getAsyncRequest(userSub, requestId, asyncRequestsTableName);
  }

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
        const { calculation, hmrcResponse, hmrcResponseBody } = await triggerAndAwaitItsaCalculation(
          payload.nino,
          payload.taxYear,
          payload.calculationType,
          payload.hmrcAccessToken,
          payload.govClientHeaders,
          payload.testScenario,
          payload.hmrcAccount,
          payload.userSub,
          payload.runFraudPreventionHeaderValidation,
          payload.requestId,
          payload.traceparent,
          payload.correlationId,
        );

        const serializableHmrcResponse = {
          ok: hmrcResponse.ok,
          status: hmrcResponse.status,
          statusText: hmrcResponse.statusText,
          headers: Object.fromEntries(serializeResponseHeaders(hmrcResponse.headers)),
        };

        return { calculation, hmrcResponse: serializableHmrcResponse, hmrcResponseBody };
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
      logger.error({ message: "Unexpected error during ITSA calculation trigger", error: error.message, stack: error.stack });
      return http500ServerErrorResponse({
        request,
        headers: { ...responseHeaders },
        message: "Internal server error",
        error: error.message,
      });
    }
  }

  // Map HMRC error responses to our HTTP responses. A 400 is the caller's to fix (a malformed
  // request or a business rule HMRC rejected, such as RULE_RECENT_SUBMISSIONS_EXIST), so it
  // comes back as a 400 carrying HMRC's own message, the way hmrcItsaBsasTriggerPost.js's
  // triggerBsas does.
  if (result && result.hmrcResponse && !result.hmrcResponse.ok) {
    if (result.hmrcResponse.status === 400) {
      result.hmrcResponse.data = result.hmrcResponseBody;
      return http400BadRequestFromHmrcResponse(request, result.hmrcResponse, responseHeaders);
    }
    return generateHmrcErrorResponseWithRetryAdvice(
      request,
      result.hmrcResponse,
      result.hmrcResponseBody,
      hmrcAccessToken,
      responseHeaders,
    );
  }

  return asyncApiServices.respond({
    request,
    requestId,
    responseHeaders,
    data: result ? result.calculation : null,
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
    "HMRC_ITSA_CALCULATION_TRIGGER_POST_ASYNC_REQUESTS_TABLE_NAME",
  ]);

  const asyncRequestsTableName = process.env.HMRC_ITSA_CALCULATION_TRIGGER_POST_ASYNC_REQUESTS_TABLE_NAME;

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

      const { calculation, hmrcResponse, hmrcResponseBody } = await triggerAndAwaitItsaCalculation(
        payload.nino,
        payload.taxYear,
        payload.calculationType,
        payload.hmrcAccessToken,
        payload.govClientHeaders,
        payload.testScenario,
        payload.hmrcAccount,
        payload.userSub,
        payload.runFraudPreventionHeaderValidation,
        payload.requestId,
        payload.traceparent,
        payload.correlationId,
      );

      const serializableHmrcResponse = {
        ok: hmrcResponse.ok,
        status: hmrcResponse.status,
        statusText: hmrcResponse.statusText,
        headers: Object.fromEntries(serializeResponseHeaders(hmrcResponse.headers)),
      };

      const result = { calculation, hmrcResponse: serializableHmrcResponse, hmrcResponseBody };

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

/**
 * Normalize a hmrcHttpGet-shaped result ({ok, status, data, response}) into the same
 * {ok, status, statusText, headers} shape hmrcHttpPost's raw Response carries, so the caller's
 * error mapping and header serialization work the same way regardless of which HTTP call
 * produced the final outcome.
 * @param {{ok: boolean, status: number, data: Object, response: Response}} getResult
 * @returns {{ok: boolean, status: number, statusText: string|undefined, headers: Headers|undefined}}
 */
function normalizeGetResponse(getResult) {
  return {
    ok: getResult.ok,
    status: getResult.status,
    statusText: getResult.response?.statusText,
    headers: getResult.response?.headers,
  };
}

// Service adaptor aware of the downstream service but not the consuming Lambda's incoming/outgoing HTTP request/response.
// Triggers a calculation, then waits and retrieves it - HMRC's calculation runs asynchronously
// behind the 202, so this is the one place the async pattern does more than carry a queue: the
// worker completes the request with the finished calculation body, and the page polls our own
// request id rather than HMRC's.
export async function triggerAndAwaitItsaCalculation(
  nino,
  taxYear,
  calculationType,
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
  // Validate fraud prevention headers for synthetic accounts
  if (hmrcAccount === "synthetic" && runFraudPreventionHeaderValidation) {
    logger.info("Validating fraud prevention headers for HMRC API request", hmrcAccount, runFraudPreventionHeaderValidation);
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

  // hmrcHttpPost does not prepend the HMRC base URI itself - the caller builds the full URL, the
  // way hmrcVatReturnPost.js's submitVat does. The trigger endpoint takes no request body: every
  // input is already in the path.
  const hmrcBase = hmrcAccount === "synthetic" ? process.env.HMRC_SANDBOX_BASE_URI : process.env.HMRC_BASE_URI;
  const hmrcRequestUrl = `${hmrcBase}/individuals/calculations/${nino}/self-assessment/${taxYear}/trigger/${calculationType}`;
  let hmrcResponse = {};
  let hmrcResponseBody;
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
    const hmrcRequestHeaders = buildHmrcHeaders(
      hmrcAccessToken,
      govClientHeaders,
      testScenario,
      requestId,
      traceparent,
      correlationId,
      HMRC_API_VERSION,
    );
    /* v8 ignore stop */
    const httpResult = await hmrcHttpPost(hmrcRequestUrl, hmrcRequestHeaders, govClientHeaders, {}, auditForUserSub);
    hmrcResponse = httpResult.hmrcResponse;
    hmrcResponseBody = httpResult.hmrcResponseBody;
  }

  if (!hmrcResponse.ok) {
    return { hmrcResponse, hmrcResponseBody, calculation: null };
  }

  const calculationId = hmrcResponseBody?.calculationId;
  await publishActivityEvent({
    event: "itsa-calculation-triggered",
    summary: "ITSA tax calculation triggered",
    userSub: auditForUserSub,
  });

  // HMRC recommends waiting at least 5 seconds before the calculation is ready to retrieve.
  await sleep(MIN_CALCULATION_WAIT_MS);

  let getResult;
  for (let attempt = 1; attempt <= CALCULATION_RETRIEVE_MAX_ATTEMPTS; attempt += 1) {
    getResult = await getItsaCalculation(
      nino,
      taxYear,
      calculationId,
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
    const notReady = !getResult.hmrcResponse.ok && getResult.hmrcResponse.status === 404;
    if (!notReady) break;
    logger.info({
      message: "Calculation not finished yet, retrying",
      calculationId,
      attempt,
      maxAttempts: CALCULATION_RETRIEVE_MAX_ATTEMPTS,
    });
    if (attempt < CALCULATION_RETRIEVE_MAX_ATTEMPTS) await sleep(CALCULATION_RETRIEVE_RETRY_DELAY_MS);
  }

  const normalizedRetrieveResponse = normalizeGetResponse(getResult.hmrcResponse);

  if (!getResult.hmrcResponse.ok) {
    return { hmrcResponse: normalizedRetrieveResponse, hmrcResponseBody: getResult.hmrcResponse.data, calculation: null };
  }

  return { hmrcResponse: normalizedRetrieveResponse, hmrcResponseBody: getResult.calculation, calculation: getResult.calculation };
}
