// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/hmrc/hmrcItsaBsasForeignPropertyAdjustPost.js

import { createLogger } from "../../lib/logger.js";
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
import { processSqsRecords } from "../../lib/sqsWorkerHelper.js";
import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";
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
import { isValidNino, isValidTaxYear, resolveForeignPropertyEntryKey, resolveItsaSubmissionModel } from "../../lib/hmrcValidation.js";
import { buildForeignFhlEeaSection, buildForeignPropertyEntries, ForeignPropertyValidationError } from "../../lib/foreignPropertyBody.js";
import * as asyncApiServices from "../../services/asyncApiServices.js";
import { getAsyncRequest } from "../../data/dynamoDbAsyncRequestRepository.js";
import { buildFraudHeaders, detectVendorPublicIp } from "../../lib/buildFraudHeaders.js";
import { initializeSalt } from "../../services/subHasher.js";
import { publishActivityEvent } from "../../lib/activityAlert.js";

const logger = createLogger({ source: "app/functions/hmrc/hmrcItsaBsasForeignPropertyAdjustPost.js" });

const MAX_WAIT_MS = 25000;
const DEFAULT_WAIT_MS = 0;

// Business Source Adjustable Summary v7.0 - the API version this endpoint requires.
const HMRC_API_VERSION = "7.0";

// HMRC's calculationId is either an 8-digit id or a UUID - see the BSAS 7.0 spec.
const CALCULATION_ID_PATTERN = /^(\d{8}|[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;

const FOREIGN_LEVEL_DETAIL_START_YEAR = 2024;

/**
 * Build the Business Source Adjustable Summary v7.0 "Submit Foreign Property Accounting
 * Adjustments" request body. The shape follows the tax year: a list of countries up to 2023-24,
 * foreignProperty.countryLevelDetail for 2024-25 and 2025-26, and foreignProperty.propertyLevelDetail
 * from 2026-27. zeroAdjustments is the alternative to the list from 2024-25. foreignFhlEea sits
 * beside foreignProperty up to 2024-25. A body with both figures and zeroAdjustments, with
 * neither, or with a key the tax year does not take, is refused here rather than sent.
 * @param {string} taxYear - A valid tax year in YYYY-YY form
 * @param {Object} adjustDetails - foreignProperty (list of entries), foreignFhlEea, zeroAdjustments
 * @returns {Object} the HMRC request body
 * @throws {ForeignPropertyValidationError}
 */
export function buildBsasForeignPropertyAdjustRequestBody(taxYear, { foreignProperty, foreignFhlEea, zeroAdjustments } = {}) {
  const entries = buildForeignPropertyEntries(taxYear, foreignProperty);
  const fhl = buildForeignFhlEeaSection(foreignFhlEea);
  const hasZeroAdjustments = zeroAdjustments === true;
  const hasAdjustments = entries.length > 0 || Boolean(fhl);
  const hasLevelDetail = Number(taxYear.slice(0, 4)) >= FOREIGN_LEVEL_DETAIL_START_YEAR;

  if (fhl && resolveItsaSubmissionModel(taxYear) !== "dated") {
    throw new ForeignPropertyValidationError(
      "RULE_INCORRECT_OR_EMPTY_BODY_SUBMITTED",
      "foreignFhlEea is only available up to tax year 2024-25",
    );
  }
  if (hasZeroAdjustments && hasAdjustments) {
    throw new ForeignPropertyValidationError("RULE_BOTH_ADJUSTMENTS_SUPPLIED", "Both adjustments and zero adjustments must not be present");
  }
  if (hasZeroAdjustments && !hasLevelDetail) {
    throw new ForeignPropertyValidationError(
      "RULE_INCORRECT_OR_EMPTY_BODY_SUBMITTED",
      "zeroAdjustments is only available from tax year 2024-25",
    );
  }
  if (!hasZeroAdjustments && !hasAdjustments) {
    throw new ForeignPropertyValidationError("RULE_INCORRECT_OR_EMPTY_BODY_SUBMITTED", "An empty or non-matching body was submitted");
  }

  if (hasZeroAdjustments) return { foreignProperty: { zeroAdjustments: true } };

  const body = {};
  if (entries.length > 0) {
    const listKey = resolveForeignPropertyEntryKey(taxYear) === "propertyId" ? "propertyLevelDetail" : "countryLevelDetail";
    body.foreignProperty = hasLevelDetail ? { [listKey]: entries } : entries;
  }
  if (fhl) body.foreignFhlEea = fhl;
  return body;
}

/**
 * Check an adjustment body before HMRC sees it.
 * @param {string} taxYear - A valid tax year in YYYY-YY form
 * @param {Object} adjustDetails
 * @returns {string[]} the error messages, empty when the body is acceptable
 */
export function findBsasForeignPropertyAdjustBodyErrors(taxYear, adjustDetails) {
  try {
    buildBsasForeignPropertyAdjustRequestBody(taxYear, adjustDetails);
    return [];
  } catch (error) {
    if (error instanceof ForeignPropertyValidationError) return [error.message];
    throw error;
  }
}

// Server hook for Express app, and construction of a Lambda-like event from HTTP request)
/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "post", "/api/v1/hmrc/itsa/bsas/foreign-property/adjust", ingestHandler);
}
/* v8 ignore stop */

export function extractAndValidateParameters(event, errorMessages) {
  const parsedBody = parseRequestBody(event);
  const { nino, calculationId, taxYear, foreignProperty, foreignFhlEea, zeroAdjustments, runFraudPreventionHeaderValidation } =
    parsedBody || {};

  if (!nino) errorMessages.push("Missing nino parameter from body");
  if (nino && !isValidNino(nino)) errorMessages.push("Invalid nino format");

  if (!calculationId) errorMessages.push("Missing calculationId parameter from body");
  if (calculationId && !CALCULATION_ID_PATTERN.test(calculationId)) errorMessages.push("Invalid calculationId format");

  if (!taxYear) errorMessages.push("Missing taxYear parameter from body");
  if (taxYear && !isValidTaxYear(taxYear)) errorMessages.push("Invalid taxYear format - must be YYYY-YY");

  // Reject a body HMRC always rejects before ever calling HMRC, the same way an invalid nino or
  // calculationId never reaches HMRC.
  if (taxYear && isValidTaxYear(taxYear)) {
    errorMessages.push(...findBsasForeignPropertyAdjustBodyErrors(taxYear, { foreignProperty, foreignFhlEea, zeroAdjustments }));
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
    calculationId,
    taxYear,
    foreignProperty,
    foreignFhlEea,
    zeroAdjustments: zeroAdjustments === true,
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
    "HMRC_ITSA_BSAS_FOREIGN_PROPERTY_ADJUST_POST_ASYNC_REQUESTS_TABLE_NAME",
    "SQS_QUEUE_URL",
  ]);

  const { request, requestId, traceparent, correlationId } = extractRequest(event);

  const asyncRequestsTableName = process.env.HMRC_ITSA_BSAS_FOREIGN_PROPERTY_ADJUST_POST_ASYNC_REQUESTS_TABLE_NAME;
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
  const { nino, calculationId, taxYear, foreignProperty, foreignFhlEea, zeroAdjustments, hmrcAccount, runFraudPreventionHeaderValidation } =
    extractAndValidateParameters(event, errorMessages);

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
    calculationId,
    taxYear,
    foreignProperty,
    foreignFhlEea,
    zeroAdjustments,
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
        const { adjustResult, hmrcResponse, hmrcResponseBody } = await adjustBsasForeignProperty(
          payload.nino,
          payload.calculationId,
          payload.taxYear,
          {
            foreignProperty: payload.foreignProperty,
            foreignFhlEea: payload.foreignFhlEea,
            zeroAdjustments: payload.zeroAdjustments,
          },
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

        return { adjustResult, hmrcResponse: serializableHmrcResponse, hmrcResponseBody };
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
      logger.error({ message: "Unexpected error during BSAS foreign property adjustment", error: error.message, stack: error.stack });
      return http500ServerErrorResponse({
        request,
        headers: { ...responseHeaders },
        message: "Internal server error",
        error: error.message,
      });
    }
  }

  // Map HMRC error responses to our HTTP responses. A 400 is the caller's to fix (a malformed
  // adjustment, not a system fault), so it comes back as a 400 carrying HMRC's own message, the
  // way hmrcItsaBsasSelfEmploymentAdjustPost.js's adjustBsasSelfEmployment does.
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
    data: result ? result.adjustResult : null,
  });
}

// SQS worker Lambda ingestHandler function
export async function workerHandler(event) {
  const asyncRequestsTableName = process.env.HMRC_ITSA_BSAS_FOREIGN_PROPERTY_ADJUST_POST_ASYNC_REQUESTS_TABLE_NAME;

  return processSqsRecords(event, {
    requiredEnv: [
      "HMRC_BASE_URI",
      "HMRC_SANDBOX_BASE_URI",
      "BUNDLE_DYNAMODB_TABLE_NAME",
      "HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME",
      "HMRC_ITSA_BSAS_FOREIGN_PROPERTY_ADJUST_POST_ASYNC_REQUESTS_TABLE_NAME",
    ],
    logger,
    errorPolicy: "classify",
    processRecord: async (payload, { userId: userSub, requestId }) => {
      const { adjustResult, hmrcResponse, hmrcResponseBody } = await adjustBsasForeignProperty(
        payload.nino,
        payload.calculationId,
        payload.taxYear,
        {
          foreignProperty: payload.foreignProperty,
          foreignFhlEea: payload.foreignFhlEea,
          zeroAdjustments: payload.zeroAdjustments,
        },
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

      const result = { adjustResult, hmrcResponse: serializableHmrcResponse, hmrcResponseBody };

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
        return;
      }

      await asyncApiServices.complete({
        asyncRequestsTableName,
        requestId,
        userSub,
        result,
      });

      logger.info({ message: "Successfully processed SQS message", requestId });
    },
    onTerminalError: async (error, { userId: userSub, requestId }) => {
      await asyncApiServices.error({
        asyncRequestsTableName,
        requestId,
        userSub,
        error,
      });
    },
  });
}

// Service adaptor aware of the downstream service but not the consuming Lambda's incoming/outgoing HTTP request/response
export async function adjustBsasForeignProperty(
  nino,
  calculationId,
  taxYear,
  adjustDetails,
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

  const hmrcRequestBody = buildBsasForeignPropertyAdjustRequestBody(taxYear, adjustDetails);

  // hmrcHttpPost does not prepend the HMRC base URI itself - the caller builds the full URL.
  const hmrcBase = hmrcAccount === "synthetic" ? process.env.HMRC_SANDBOX_BASE_URI : process.env.HMRC_BASE_URI;
  const hmrcRequestUrl = `${hmrcBase}/individuals/self-assessment/adjustable-summary/${nino}/foreign-property/${calculationId}/adjust/${taxYear}`;
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
    const httpResult = await hmrcHttpPost(hmrcRequestUrl, hmrcRequestHeaders, govClientHeaders, hmrcRequestBody, auditForUserSub);
    hmrcResponse = httpResult.hmrcResponse;
    hmrcResponseBody = httpResult.hmrcResponseBody;
  }

  if (!hmrcResponse.ok) {
    return { hmrcResponse, hmrcResponseBody, adjustResult: null };
  }
  await publishActivityEvent({
    event: "itsa-bsas-foreign-property-adjusted",
    summary: "ITSA foreign property business source adjustable summary adjusted",
    userSub: auditForUserSub,
  });
  return { hmrcResponse, hmrcResponseBody, adjustResult: hmrcResponseBody ?? {}, hmrcRequestUrl };
}
