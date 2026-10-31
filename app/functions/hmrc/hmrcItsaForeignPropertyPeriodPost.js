// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability HMRC-39 Submit and manage foreign property periodic updates and property details
// - **Use when:** quarterly or cumulative foreign property income and expense updates, or the foreign properties of a business, must be filed, read or changed.
// - **Does:** Three Lambdas create, read and amend foreign property periodic updates. Three more list, add and change the foreign properties of a business from 2026-27. foreignPropertyPeriod.html sends one entry per country.
// - **Run:** `POST /api/v1/hmrc/itsa/foreign-property/period`; `GET /api/v1/hmrc/itsa/foreign-property/period`; `PUT /api/v1/hmrc/itsa/foreign-property/period`; `GET /api/v1/hmrc/itsa/foreign-property/details`; `POST /api/v1/hmrc/itsa/foreign-property/details`; `PUT /api/v1/hmrc/itsa/foreign-property/details`; `npm run test:itsaForeignPropertyPeriodBehaviour-simulator`
// - **Entry:** `app/functions/hmrc/hmrcItsaForeignPropertyPeriodPost.js:ingestHandler`; `app/functions/hmrc/hmrcItsaForeignPropertyPeriodPut.js:ingestHandler`; `app/functions/hmrc/hmrcItsaForeignPropertyDetailsPost.js:ingestHandler`
// - **Files:** app/functions/hmrc/hmrcItsaForeignPropertyPeriodPost.js, app/functions/hmrc/hmrcItsaForeignPropertyPeriodGet.js, app/functions/hmrc/hmrcItsaForeignPropertyPeriodPut.js, app/functions/hmrc/hmrcItsaForeignPropertyDetailsGet.js, app/functions/hmrc/hmrcItsaForeignPropertyDetailsPost.js, app/functions/hmrc/hmrcItsaForeignPropertyDetailsPut.js, app/lib/foreignPropertyBody.js, app/unit-tests/lib/foreignPropertyBody.test.js, app/unit-tests/functions/hmrcItsaForeignPropertyPeriodPost.test.js, app/unit-tests/functions/hmrcItsaForeignPropertyPeriodPost.activity.test.js, app/unit-tests/functions/hmrcItsaForeignPropertyPeriodGet.test.js, app/unit-tests/functions/hmrcItsaForeignPropertyPeriodPut.test.js, app/unit-tests/functions/hmrcItsaForeignPropertyPeriodPut.activity.test.js, app/unit-tests/functions/hmrcItsaForeignPropertyDetailsGet.test.js, app/unit-tests/functions/hmrcItsaForeignPropertyDetailsPost.test.js, app/unit-tests/functions/hmrcItsaForeignPropertyDetailsPut.test.js, web/public/hmrc/itsa/foreignPropertyPeriod.html, web/public/hmrc/itsa/foreignPropertyPeriodAmend.html, web/public/hmrc/itsa/foreignPropertyPeriods.html, web/public/hmrc/itsa/foreignPropertyPeriodView.html, web/public/hmrc/itsa/foreignPropertyDetails.html, web/browser-tests/foreignPropertyEntries.browser.test.js, web/browser-tests/foreignPropertyPeriodFields.browser.test.js, web/browser-tests/foreignPropertyDetails.browser.test.js, behaviour-tests/itsaForeignPropertyPeriod.behaviour.test.js
// - **Keywords:** foreign property period, overseas rental income, country code, foreign property details, property id, cumulative update, itsa foreign property
// - **Related:** HMRC-14, HMRC-40
// @end-capability

// app/functions/hmrc/hmrcItsaForeignPropertyPeriodPost.js

import { createLogger } from "../../lib/logger.js";
import {
  extractRequest,
  http200OkResponse,
  parseRequestBody,
  buildValidationError,
  http401UnauthorizedResponse,
  http403ForbiddenResponse,
  http500ServerErrorResponse,
  getHeader,
} from "../../lib/httpResponseHelper.js";
import { validateEnv } from "../../lib/env.js";
import { processSqsRecords } from "../../lib/sqsWorkerHelper.js";
import { buildHttpResponseFromLambdaResult, buildLambdaEventFromHttpRequest } from "../../lib/httpServerToLambdaAdaptor.js";
import {
  UnauthorizedTokenError,
  validateHmrcAccessToken,
  hmrcHttpPost,
  hmrcHttpPut,
  extractHmrcAccessTokenFromLambdaEvent,
  generateHmrcErrorResponseWithRetryAdvice,
  http400BadRequestFromHmrcResponse,
  http403ForbiddenFromBundleEnforcement,
  validateFraudPreventionHeaders,
  buildHmrcHeaders,
} from "../../services/hmrcApi.js";
import { enforceBundles } from "../../services/bundleManagement.js";
import { isValidNino, isValidIsoDate, isValidTaxYear, resolveItsaSubmissionModel } from "../../lib/hmrcValidation.js";
import { buildForeignPropertyEntries, buildForeignFhlEeaSection, ForeignPropertyValidationError } from "../../lib/foreignPropertyBody.js";
import * as asyncApiServices from "../../services/asyncApiServices.js";
import { getAsyncRequest } from "../../data/dynamoDbAsyncRequestRepository.js";
import { putReceipt } from "../../data/dynamoDbReceiptRepository.js";
import { buildFraudHeaders, detectVendorPublicIp } from "../../lib/buildFraudHeaders.js";
import { initializeSalt } from "../../services/subHasher.js";
import { publishActivityEvent, publishActivityFailureEvent, resolveActorClass } from "../../lib/activityAlert.js";
import { emitMetric } from "../../lib/emfMetrics.js";

const logger = createLogger({ source: "app/functions/hmrc/hmrcItsaForeignPropertyPeriodPost.js" });

const MAX_WAIT_MS = 25000;
const DEFAULT_WAIT_MS = 0;

// Property Business v6.0 - the API version this endpoint requires.
const HMRC_API_VERSION = "6.0";

const BUSINESS_ID_PATTERN = /^X[A-Za-z0-9]IS\d{11}$/;

const BUSINESS_METRICS_NAMESPACE = "Submit/Business";

function emitSubmissionMetric(metricName, actor) {
  emitMetric({ namespace: BUSINESS_METRICS_NAMESPACE, metricName, dimensions: { Actor: actor } });
}

/**
 * Record a failed ITSA foreign property quarterly update attempt: one business metric and one
 * activity event.
 *
 * A failed filing is a customer-facing incident, so every meaningful failure path reports
 * itself the same way the success path does. The event carries the failure category and the
 * hashed sub only - no NINO, no business id, no HMRC payload.
 *
 * @param {Object} params
 * @param {string} params.failure - Failure category
 * @param {string} params.summary - Human-readable summary for alerting
 * @param {string} [params.userSub]
 * @param {Object} [params.detail] - Additional non-identifying detail fields
 */
async function recordSubmissionFailure({ failure, summary, userSub, detail = {} }) {
  const actor = resolveActorClass();
  emitSubmissionMetric("ItsaSubmissionFailure", actor);
  await publishActivityFailureEvent({
    event: "itsa-foreign-property-period-failed",
    summary,
    failure,
    userSub,
    actor,
    detail,
  });
}

/**
 * Build the Property Business v6.0 "Create a Foreign Property Period Summary" request body, for
 * tax years 2024-25 and earlier. fromDate and toDate are always required. foreignFhlEea and the
 * foreignNonFhlProperty entries (keyed by countryCode) are each included only when they hold
 * a figure.
 * @param {string} taxYear - Tax year in YYYY-YY form
 * @param {Object} periodDetails - fromDate, toDate, foreignFhlEea, foreignNonFhlProperty
 * @returns {Object} the HMRC request body
 * @throws {ForeignPropertyValidationError}
 */
export function buildForeignPropertyPeriodRequestBody(taxYear, periodDetails) {
  const hmrcRequestBody = {
    fromDate: periodDetails.fromDate,
    toDate: periodDetails.toDate,
    ...buildDatedSections(taxYear, periodDetails),
  };
  return hmrcRequestBody;
}

/**
 * Build the foreignFhlEea and foreignNonFhlProperty sections shared by the dated create and amend.
 * @param {string} taxYear
 * @param {Object} periodDetails
 * @returns {Object} the sections that hold a figure
 * @throws {ForeignPropertyValidationError}
 */
export function buildDatedSections(taxYear, periodDetails) {
  const sections = {};
  const foreignFhlEea = buildForeignFhlEeaSection(periodDetails.foreignFhlEea);
  if (foreignFhlEea) sections.foreignFhlEea = foreignFhlEea;
  const foreignNonFhlProperty = buildForeignPropertyEntries(taxYear, periodDetails.foreignNonFhlProperty);
  if (foreignNonFhlProperty.length > 0) sections.foreignNonFhlProperty = foreignNonFhlProperty;
  return sections;
}

/**
 * Build the Property Business v6.0 cumulative period summary request body, for tax years
 * 2025-26 onwards. The entries sit in one foreignProperty list, keyed by countryCode in 2025-26
 * and by propertyId from 2026-27. fromDate and toDate are included only when the caller
 * supplied both: present for a quarterly obligation, absent for an annual or latent one.
 * @param {string} taxYear - Tax year in YYYY-YY form
 * @param {Object} periodDetails - fromDate, toDate, foreignProperty
 * @returns {Object} the HMRC request body
 * @throws {ForeignPropertyValidationError}
 */
export function buildForeignPropertyCumulativeRequestBody(taxYear, periodDetails) {
  const hmrcRequestBody = {};
  if (periodDetails.fromDate && periodDetails.toDate) {
    hmrcRequestBody.fromDate = periodDetails.fromDate;
    hmrcRequestBody.toDate = periodDetails.toDate;
  }
  const foreignProperty = buildForeignPropertyEntries(taxYear, periodDetails.foreignProperty);
  if (foreignProperty.length > 0) hmrcRequestBody.foreignProperty = foreignProperty;
  return hmrcRequestBody;
}

/**
 * Check a period request body before HMRC sees it: the sections must suit the tax year's
 * model, and the body must hold at least one figure.
 * @param {string} taxYear - A valid tax year in YYYY-YY form
 * @param {Object} periodDetails - the caller's fields
 * @returns {string[]} the error messages, empty when the body is acceptable
 */
export function findForeignPropertyPeriodBodyErrors(taxYear, periodDetails) {
  const messages = [];
  const cumulative = resolveItsaSubmissionModel(taxYear) === "cumulative";
  if (cumulative) {
    if (periodDetails.foreignFhlEea !== undefined) messages.push("foreignFhlEea is only available up to tax year 2024-25");
    if (periodDetails.foreignNonFhlProperty !== undefined) {
      messages.push("foreignNonFhlProperty is only available up to tax year 2024-25, send foreignProperty");
    }
  } else if (periodDetails.foreignProperty !== undefined) {
    messages.push("foreignProperty is only available from tax year 2025-26, send foreignFhlEea and foreignNonFhlProperty");
  }
  if (messages.length > 0) return messages;
  try {
    const body = cumulative
      ? buildForeignPropertyCumulativeRequestBody(taxYear, periodDetails)
      : buildDatedSections(taxYear, periodDetails);
    const hasFigures = cumulative ? body.foreignProperty : body.foreignFhlEea || body.foreignNonFhlProperty;
    if (!hasFigures) messages.push("No foreign property figures were supplied");
  } catch (error) {
    if (error instanceof ForeignPropertyValidationError) {
      messages.push(error.message);
    } else {
      throw error;
    }
  }
  return messages;
}

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
  app.post("/api/v1/hmrc/itsa/foreign-property/period", async (httpRequest, httpResponse) => {
    const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
    const lambdaResult = await ingestHandler(lambdaEvent);
    return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
  });
  app.head("/api/v1/hmrc/itsa/foreign-property/period", async (httpRequest, httpResponse) => {
    httpResponse.status(200).send();
  });
}
/* v8 ignore stop */

export function extractAndValidateParameters(event, errorMessages) {
  const parsedBody = parseRequestBody(event);
  const {
    nino,
    businessId,
    taxYear,
    fromDate,
    toDate,
    foreignFhlEea,
    foreignNonFhlProperty,
    foreignProperty,
    runFraudPreventionHeaderValidation,
  } = parsedBody || {};

  if (!nino) errorMessages.push("Missing nino parameter from body");
  if (nino && !isValidNino(nino)) errorMessages.push("Invalid nino format");

  if (!businessId) errorMessages.push("Missing businessId parameter from body");
  if (businessId && !BUSINESS_ID_PATTERN.test(businessId)) errorMessages.push("Invalid businessId format");

  if (!taxYear) errorMessages.push("Missing taxYear parameter from body");
  if (taxYear && !isValidTaxYear(taxYear)) errorMessages.push("Invalid taxYear format - must be YYYY-YY");

  // The dated model (2024-25 and earlier) always identifies the period by fromDate/toDate. The
  // cumulative model (2025-26 and later) carries them only for a quarterly obligation - an
  // annual or latent one carries neither - so both are optional there, but one without the
  // other is never valid.
  const submissionModel = taxYear && isValidTaxYear(taxYear) ? resolveItsaSubmissionModel(taxYear) : "dated";

  if (submissionModel === "cumulative") {
    if (Boolean(fromDate) !== Boolean(toDate)) {
      errorMessages.push("fromDate and toDate must both be present or both be absent");
    }
    if (fromDate && !isValidIsoDate(fromDate)) errorMessages.push("Invalid fromDate format - must be YYYY-MM-DD");
    if (toDate && !isValidIsoDate(toDate)) errorMessages.push("Invalid toDate format - must be YYYY-MM-DD");
  } else {
    if (!fromDate) errorMessages.push("Missing fromDate parameter from body");
    if (fromDate && !isValidIsoDate(fromDate)) errorMessages.push("Invalid fromDate format - must be YYYY-MM-DD");

    if (!toDate) errorMessages.push("Missing toDate parameter from body");
    if (toDate && !isValidIsoDate(toDate)) errorMessages.push("Invalid toDate format - must be YYYY-MM-DD");
  }

  if (taxYear && isValidTaxYear(taxYear)) {
    errorMessages.push(
      ...findForeignPropertyPeriodBodyErrors(taxYear, { fromDate, toDate, foreignFhlEea, foreignNonFhlProperty, foreignProperty }),
    );
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
    businessId,
    taxYear,
    fromDate,
    toDate,
    // The builders drop empty sections and entries, and HMRC validates the amounts.
    foreignFhlEea,
    foreignNonFhlProperty,
    foreignProperty,
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
    "RECEIPTS_DYNAMODB_TABLE_NAME",
    "BUNDLE_DYNAMODB_TABLE_NAME",
    "HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME",
    "HMRC_ITSA_FOREIGN_PROPERTY_PERIOD_POST_ASYNC_REQUESTS_TABLE_NAME",
    "SQS_QUEUE_URL",
  ]);

  const { request, requestId, traceparent, correlationId } = extractRequest(event);

  const asyncRequestsTableName = process.env.HMRC_ITSA_FOREIGN_PROPERTY_PERIOD_POST_ASYNC_REQUESTS_TABLE_NAME;
  const sqsQueueUrl = process.env.SQS_QUEUE_URL;

  let errorMessages = [];

  // Bundle enforcement
  let userSub;
  let bundleIds = [];
  try {
    ({ userSub, bundleIds } = await enforceBundles(event));
  } catch (error) {
    await recordSubmissionFailure({ failure: "access-denied", summary: "ITSA foreign property quarterly update blocked: no entitlement" });
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
    nino,
    businessId,
    taxYear,
    fromDate,
    toDate,
    foreignFhlEea,
    foreignNonFhlProperty,
    foreignProperty,
    hmrcAccount,
    runFraudPreventionHeaderValidation,
  } = extractAndValidateParameters(event, errorMessages);

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
    businessId,
    taxYear,
    fromDate,
    toDate,
    foreignFhlEea,
    foreignNonFhlProperty,
    foreignProperty,
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

  // Token enforcement: consume 1 token for the quarterly update (the "value action") - initial request only
  if (isInitialRequest) {
    const activityId = "self-employed";
    try {
      const { hasTokensForActivity } = await import("../../services/tokenEnforcement.js");
      const { loadCatalogFromRoot } = await import("../../services/productCatalog.js");
      const catalog = loadCatalogFromRoot();
      const tokenCheck = await hasTokensForActivity(userSub, activityId, catalog);
      if (!tokenCheck.available) {
        logger.info({ message: "Token enforcement blocked submission", activityId, reason: tokenCheck.reason });
        await recordSubmissionFailure({
          failure: "tokens-exhausted",
          summary: "ITSA foreign property quarterly update blocked: submission allowance used up",
          userSub,
        });
        return http403ForbiddenResponse({
          request,
          headers: responseHeaders,
          message: "Token limit reached",
          error: { reason: "tokens_exhausted", tokensRemaining: 0 },
        });
      }
    } catch (error) {
      logger.error({ message: "Token enforcement error", error: error.message, stack: error.stack });
      await recordSubmissionFailure({
        failure: "internal-error",
        summary: "ITSA foreign property quarterly update failed while checking the submission allowance",
        userSub,
      });
      return http500ServerErrorResponse({
        request,
        headers: { ...responseHeaders },
        message: "Token enforcement failed",
      });
    }
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
        const { periodSummary, hmrcResponse, hmrcResponseBody } = await createForeignPropertyPeriod(
          payload.nino,
          payload.businessId,
          payload.taxYear,
          {
            fromDate: payload.fromDate,
            toDate: payload.toDate,
            foreignFhlEea: payload.foreignFhlEea,
            foreignNonFhlProperty: payload.foreignNonFhlProperty,
            foreignProperty: payload.foreignProperty,
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

        const resultData = { periodSummary, hmrcResponse: serializableHmrcResponse, hmrcResponseBody };

        if (!hmrcResponse.ok) {
          return resultData;
        }

        // The dated create answers a submissionId to key the receipt on; the cumulative
        // create-or-amend answers nothing (204), so the receipt keys on the tax year instead.
        const receiptKey = periodSummary?.submissionId || payload.taxYear;
        if (payload.userSub && receiptKey) {
          const timestamp = new Date().toISOString();
          const receiptId = `${timestamp}-${receiptKey}`;
          await putReceipt(payload.userSub, receiptId, periodSummary, resolveActorClass());
          resultData.receiptId = receiptId;
        }

        return resultData;
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
      logger.error({ message: "Unexpected error during foreign property period creation", error: error.message, stack: error.stack });
      await recordSubmissionFailure({
        failure: "internal-error",
        summary: "ITSA foreign property quarterly update failed unexpectedly",
        userSub,
      });
      return http500ServerErrorResponse({
        request,
        headers: { ...responseHeaders },
        message: "Internal server error",
        error: error.message,
      });
    }
  }

  // Map HMRC error responses to our HTTP responses. A 400 is the caller's to fix (a
  // malformed period, not a system fault), so it comes back as a 400 carrying HMRC's own
  // message, the way hmrcVatPaymentsGet.js and its siblings map their 400s.
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
    data: result ? result.periodSummary : null,
  });
}

// SQS worker Lambda ingestHandler function
export async function workerHandler(event) {
  const asyncRequestsTableName = process.env.HMRC_ITSA_FOREIGN_PROPERTY_PERIOD_POST_ASYNC_REQUESTS_TABLE_NAME;

  return processSqsRecords(event, {
    requiredEnv: [
      "HMRC_BASE_URI",
      "HMRC_SANDBOX_BASE_URI",
      "RECEIPTS_DYNAMODB_TABLE_NAME",
      "BUNDLE_DYNAMODB_TABLE_NAME",
      "HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME",
      "HMRC_ITSA_FOREIGN_PROPERTY_PERIOD_POST_ASYNC_REQUESTS_TABLE_NAME",
    ],
    logger,
    errorPolicy: "classify",
    processRecord: async (payload, { userId: userSub, requestId }) => {
      const { periodSummary, hmrcResponse, hmrcResponseBody } = await createForeignPropertyPeriod(
        payload.nino,
        payload.businessId,
        payload.taxYear,
        {
          fromDate: payload.fromDate,
          toDate: payload.toDate,
          foreignFhlEea: payload.foreignFhlEea,
          foreignNonFhlProperty: payload.foreignNonFhlProperty,
          foreignProperty: payload.foreignProperty,
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

      const result = { periodSummary, hmrcResponse: serializableHmrcResponse, hmrcResponseBody };

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

      const receiptKey = periodSummary?.submissionId || payload.taxYear;
      if (userSub && receiptKey) {
        const timestamp = new Date().toISOString();
        const receiptId = `${timestamp}-${receiptKey}`;
        await putReceipt(userSub, receiptId, periodSummary, resolveActorClass());
        result.receiptId = receiptId;
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
      await recordSubmissionFailure({
        failure: "internal-error",
        summary: "ITSA foreign property quarterly update failed in the background worker",
        userSub,
      });
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
export async function createForeignPropertyPeriod(
  nino,
  businessId,
  taxYear,
  periodDetails,
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

  // The tax year decides which HMRC operation this create actually is - the same fork
  // hmrcItsaSelfEmploymentPeriodPost.js's createSelfEmploymentPeriod makes. 2024-25 and
  // earlier POSTs a new dated period, answering 200 with a submissionId. 2025-26 and later
  // has no separate create: it PUTs the year's running total to the cumulative resource,
  // answering 204 with nothing.
  const submissionModel = resolveItsaSubmissionModel(taxYear);
  const hmrcRequestBody =
    submissionModel === "cumulative"
      ? buildForeignPropertyCumulativeRequestBody(taxYear, periodDetails)
      : buildForeignPropertyPeriodRequestBody(taxYear, periodDetails);

  // hmrcHttpPost/hmrcHttpPut, unlike hmrcHttpGet, do not prepend the HMRC base URI themselves -
  // the caller builds the full URL, the way hmrcVatReturnPost.js's submitVat does.
  const hmrcBase = hmrcAccount === "synthetic" ? process.env.HMRC_SANDBOX_BASE_URI : process.env.HMRC_BASE_URI;
  const hmrcRequestUrl =
    submissionModel === "cumulative"
      ? `${hmrcBase}/individuals/business/property/foreign/${nino}/${businessId}/cumulative/${taxYear}`
      : `${hmrcBase}/individuals/business/property/foreign/${nino}/${businessId}/period/${taxYear}`;
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
    const hmrcHttpVerb = submissionModel === "cumulative" ? hmrcHttpPut : hmrcHttpPost;
    const httpResult = await hmrcHttpVerb(hmrcRequestUrl, hmrcRequestHeaders, govClientHeaders, hmrcRequestBody, auditForUserSub);
    hmrcResponse = httpResult.hmrcResponse;
    hmrcResponseBody = httpResult.hmrcResponseBody;
  }

  if (!hmrcResponse.ok) {
    await recordSubmissionFailure({
      failure: "hmrc-rejected",
      summary: "ITSA foreign property quarterly update rejected by HMRC",
      userSub: auditForUserSub,
      detail: { hmrcStatus: hmrcResponse.status },
    });
    return { hmrcResponse, hmrcResponseBody, periodSummary: null };
  }
  emitSubmissionMetric("ItsaSubmissionSuccess", resolveActorClass());
  await publishActivityEvent({
    event: "itsa-foreign-property-period-created",
    summary: "ITSA foreign property quarterly update filed",
    userSub: auditForUserSub,
  });
  const { chargeTokenOnSuccess } = await import("../../services/tokenEnforcement.js");
  await chargeTokenOnSuccess(auditForUserSub, "self-employed");
  // Our own response says which model was used and carries the submissionId only when HMRC
  // gave one - the dated create does, the cumulative create-or-amend's 204 does not.
  const periodSummary = {
    model: submissionModel,
    ...(hmrcResponseBody?.submissionId ? { submissionId: hmrcResponseBody.submissionId } : {}),
  };
  return { hmrcResponse, hmrcResponseBody, periodSummary, hmrcRequestUrl };
}
