// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/hmrcAssistHandler.js
// The async ingest and worker Lambda pair shared by the four HMRC Assist handlers. Each handler
// file supplies its route, its async table, its body validation and its HMRC call; everything
// else (bundle enforcement, fraud prevention headers, the async request lifecycle, HMRC error
// mapping) is here once.

import { createLogger } from "./logger.js";
import {
  extractRequest,
  http200OkResponse,
  parseRequestBody,
  buildValidationError,
  http401UnauthorizedResponse,
  http500ServerErrorResponse,
  getHeader,
  serializeResponseHeaders,
} from "./httpResponseHelper.js";
import { validateEnv } from "./env.js";
import { processSqsRecords } from "./sqsWorkerHelper.js";
import { registerLambdaRoute } from "./httpServerToLambdaAdaptor.js";
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
} from "../services/hmrcApi.js";
import { enforceBundles } from "../services/bundleManagement.js";
import * as asyncApiServices from "../services/asyncApiServices.js";
import { getAsyncRequest } from "../data/dynamoDbAsyncRequestRepository.js";
import { buildFraudHeaders, detectVendorPublicIp } from "./buildFraudHeaders.js";
import { initializeSalt } from "../services/subHasher.js";

const logger = createLogger({ source: "app/lib/hmrcAssistHandler.js" });

const MAX_WAIT_MS = 25000;
const DEFAULT_WAIT_MS = 0;

/**
 * The HMRC base URI for the signed-in account: the sandbox for a synthetic account.
 * @param {string} hmrcAccount - "synthetic" or "live"
 * @returns {string}
 */
export function hmrcBaseUriFor(hmrcAccount) {
  return hmrcAccount === "synthetic" ? process.env.HMRC_SANDBOX_BASE_URI : process.env.HMRC_BASE_URI;
}

/**
 * POST one HMRC Assist request: validates fraud prevention headers for synthetic accounts when
 * asked, builds the version 1.0 headers and posts. The caller maps the result.
 *
 * @param {Object} params
 * @param {string} params.url - The full HMRC URL
 * @param {Object|undefined} params.body - The JSON body, absent for the Income Tax report
 * @param {string} params.acceptVersion - HMRC API version for the Accept header
 * @param {Object} params.context - The payload fields carried by the async request
 * @returns {Promise<{hmrcResponse: Object, hmrcResponseBody: Object}>}
 */
export async function postHmrcAssist({ url, body, acceptVersion, context: requestContext }) {
  const {
    hmrcAccessToken,
    govClientHeaders,
    testScenario,
    hmrcAccount,
    userSub,
    runFraudPreventionHeaderValidation,
    requestId,
    traceparent,
    correlationId,
  } = requestContext;

  if (hmrcAccount === "synthetic" && runFraudPreventionHeaderValidation) {
    try {
      await validateFraudPreventionHeaders(hmrcAccessToken, govClientHeaders, userSub, requestId, traceparent, correlationId);
    } catch (error) {
      logger.error({ message: `Error validating fraud prevention headers: ${error.message}` });
    }
  }

  const hmrcRequestHeaders = buildHmrcHeaders(
    hmrcAccessToken,
    govClientHeaders,
    testScenario,
    requestId,
    traceparent,
    correlationId,
    acceptVersion,
  );
  return hmrcHttpPost(url, hmrcRequestHeaders, govClientHeaders, body, userSub);
}

/**
 * Make the ingest and worker handlers for one HMRC Assist endpoint.
 *
 * @param {Object} config
 * @param {string} config.sourceName - The handler file path, for logs
 * @param {string} config.route - The Express route the local server registers
 * @param {string} config.asyncTableEnvName - Env var naming the async requests table
 * @param {string} config.operationName - Human name for log lines
 * @param {(body: Object, errorMessages: string[]) => Object} config.validateBody - Reads and validates the body fields
 * @param {(params: Object, requestContext: Object) => Promise<{hmrcResponse: Object, hmrcResponseBody: Object, data: Object|null}>} config.call -
 *   Makes the HMRC call and stores what must be stored; data is the success body, or { statusCode: 204 }
 */
export function createAssistHandlers({ sourceName, route, asyncTableEnvName, operationName, validateBody, call }) {
  const handlerLogger = createLogger({ source: sourceName });
  const requiredEnv = [
    "HMRC_BASE_URI",
    "HMRC_SANDBOX_BASE_URI",
    "BUNDLE_DYNAMODB_TABLE_NAME",
    "HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME",
    "RECEIPTS_DYNAMODB_TABLE_NAME",
    asyncTableEnvName,
  ];

  /* v8 ignore start */
  function apiEndpoint(app) {
    registerLambdaRoute(app, "post", route, ingestHandler);
    app.head(route, async (httpRequest, httpResponse) => {
      httpResponse.status(200).send();
    });
  }
  /* v8 ignore stop */

  function extractAndValidateParameters(event, errorMessages) {
    const parsedBody = parseRequestBody(event);
    if (parsedBody === null) errorMessages.push("Request body is not valid JSON");
    const body = parsedBody || {};
    const params = validateBody(body, errorMessages);

    const hmrcAccountHeader = getHeader(event.headers, "hmrcAccount") || "";
    const hmrcAccount = hmrcAccountHeader.toLowerCase();
    if (hmrcAccount && hmrcAccount !== "synthetic" && hmrcAccount !== "live") {
      errorMessages.push("Invalid hmrcAccount header. Must be either 'synthetic' or 'live' if provided.");
    }
    const runFraudPreventionHeaderValidation =
      body.runFraudPreventionHeaderValidation === true || body.runFraudPreventionHeaderValidation === "true";

    return { ...params, hmrcAccount, runFraudPreventionHeaderValidation };
  }

  async function runCall(payload) {
    const { hmrcResponse, hmrcResponseBody, data } = await call(payload.params, payload);
    const serializableHmrcResponse = {
      ok: hmrcResponse.ok,
      status: hmrcResponse.status,
      statusText: hmrcResponse.statusText,
      headers: Object.fromEntries(serializeResponseHeaders(hmrcResponse.headers)),
    };
    return { data, hmrcResponse: serializableHmrcResponse, hmrcResponseBody };
  }

  async function ingestHandler(event) {
    await initializeSalt();
    await detectVendorPublicIp();
    validateEnv([...requiredEnv, "SQS_QUEUE_URL"]);

    const { request, requestId, traceparent, correlationId } = extractRequest(event);
    const asyncRequestsTableName = process.env[asyncTableEnvName];
    const sqsQueueUrl = process.env.SQS_QUEUE_URL;

    let errorMessages = [];

    let userSub;
    let bundleIds = [];
    try {
      ({ userSub, bundleIds } = await enforceBundles(event));
    } catch (error) {
      return http403ForbiddenFromBundleEnforcement(error, request);
    }

    if (event?.requestContext?.http?.method === "HEAD") {
      return http200OkResponse({ request, headers: { "Content-Type": "application/json" }, data: {} });
    }

    const { govClientHeaders, govClientErrorMessages } = buildFraudHeaders(event, { bundleIds });
    errorMessages = errorMessages.concat(govClientErrorMessages || []);

    const { hmrcAccount, runFraudPreventionHeaderValidation, ...params } = extractAndValidateParameters(event, errorMessages);
    const responseHeaders = { ...govClientHeaders };

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
    if (govTestScenarioHeader === "SUBMIT_API_HTTP_500") {
      return http500ServerErrorResponse({
        request,
        headers: { ...responseHeaders },
        message: `Simulated server error for testing scenario: ${govTestScenarioHeader}`,
      });
    }

    const waitTimeMs = parseInt(getHeader(event.headers, "x-wait-time-ms") || DEFAULT_WAIT_MS, 10);

    const payload = {
      params,
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

    handlerLogger.info({ message: "Handler entry", operationName, waitTimeMs, requestId, isInitialRequest });

    let result = null;
    try {
      if (persistedRequest) {
        if (persistedRequest.status === "completed") {
          result = persistedRequest.data;
        } else if (persistedRequest.status === "failed") {
          throw new asyncApiServices.RequestFailedError(persistedRequest.data);
        }
      } else {
        result = await asyncApiServices.initiateProcessing({
          processor: runCall,
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

      if (!result && waitTimeMs > 0) {
        result = await asyncApiServices.wait({ userId: userSub, requestId, waitTimeMs, tableName: asyncRequestsTableName });
      }
      if (!result) {
        result = await asyncApiServices.check({ userId: userSub, requestId, tableName: asyncRequestsTableName });
      }
    } catch (error) {
      if (error instanceof asyncApiServices.RequestFailedError) {
        result = error.data;
      } else {
        handlerLogger.error({ message: `Unexpected error during ${operationName}`, error: error.message, stack: error.stack });
        return http500ServerErrorResponse({
          request,
          headers: { ...responseHeaders },
          message: "Internal server error",
          error: error.message,
        });
      }
    }

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
      data: result ? result.data : null,
    });
  }

  async function workerHandler(event) {
    const asyncRequestsTableName = process.env[asyncTableEnvName];

    return processSqsRecords(event, {
      requiredEnv,
      logger: handlerLogger,
      errorPolicy: "classify",
      processRecord: async (payload, { userId: userSub, requestId }) => {
        const result = await runCall(payload);

        if (!result.hmrcResponse.ok && [429, 503, 504].includes(result.hmrcResponse.status)) {
          throw new Error(`HMRC temporary error ${result.hmrcResponse.status}`);
        }

        await asyncApiServices.complete({ asyncRequestsTableName, requestId, userSub, result });
        handlerLogger.info({ message: "Successfully processed SQS message", requestId });
      },
      onTerminalError: async (error, { userId: userSub, requestId }) => {
        await asyncApiServices.error({ asyncRequestsTableName, requestId, userSub, error });
      },
    });
  }

  return { apiEndpoint, extractAndValidateParameters, ingestHandler, workerHandler };
}
