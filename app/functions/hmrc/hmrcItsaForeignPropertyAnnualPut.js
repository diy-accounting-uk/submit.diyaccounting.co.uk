// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/hmrc/hmrcItsaForeignPropertyAnnualPut.js

import { createLogger } from "../../lib/logger.js";
import {
  extractRequest,
  parseRequestBody,
  buildValidationError,
  http401UnauthorizedResponse,
  http403ForbiddenResponse,
  http500ServerErrorResponse,
  getHeader,
} from "../../lib/httpResponseHelper.js";
import { validateEnv } from "../../lib/env.js";
import { processSqsRecords } from "../../lib/sqsWorkerHelper.js";
import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";
import {
  UnauthorizedTokenError,
  validateHmrcAccessToken,
  hmrcHttpPut,
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
import { putReceipt } from "../../data/dynamoDbReceiptRepository.js";
import { buildFraudHeaders, detectVendorPublicIp } from "../../lib/buildFraudHeaders.js";
import { initializeSalt } from "../../services/subHasher.js";
import { publishActivityEvent, publishActivityFailureEvent, resolveActorClass } from "../../lib/activityAlert.js";
import { emitMetric } from "../../lib/emfMetrics.js";

const logger = createLogger({ source: "app/functions/hmrc/hmrcItsaForeignPropertyAnnualPut.js" });

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
 * Record a failed ITSA foreign property annual submission: one business metric and one activity
 * event.
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
    event: "itsa-foreign-property-annual-submission-failed",
    summary,
    failure,
    userSub,
    actor,
    detail,
  });
}

// Allowances that HMRC accepts for tax years up to 2024-25 only.
const ALLOWANCES_UP_TO_2024_25 = ["zeroEmissionsGoodsVehicleAllowance", "electricChargePointAllowance"];

function hasEnteredValue(value) {
  return value !== undefined && value !== null && value !== "";
}

/**
 * Build the Property Business v6.0 "Create and Amend a Foreign Property Annual Submission"
 * request body for a tax year.
 *
 * Up to 2024-25 the body can carry foreignFhlEea beside foreignProperty, keyed by countryCode.
 * 2025-26 keys each entry by countryCode, and 2026-27 on by propertyId. Each entry holds
 * adjustments and allowances, with Structures and Buildings Allowance rows passed through.
 * Empty sections and entries are dropped and amounts rounded to two places. The body is refused
 * before HMRC sees it when it is empty, repeats a key, carries an allowance the tax year does not
 * take, or mixes the property income allowance with other allowances or a private use adjustment.
 * @param {string} taxYear - A valid tax year in YYYY-YY form
 * @param {Object} annualDetails
 * @param {Object} [annualDetails.foreignFhlEea] - tax years up to 2024-25 only
 * @param {Array<Object>} [annualDetails.foreignProperty] - one entry per country or property
 * @returns {Object} the HMRC request body
 * @throws {ForeignPropertyValidationError}
 */
export function buildForeignPropertyAnnualRequestBody(taxYear, { foreignFhlEea, foreignProperty } = {}) {
  const dated = resolveItsaSubmissionModel(taxYear) === "dated";
  const body = {};

  const fhlSection = buildForeignFhlEeaSection(foreignFhlEea);
  if (fhlSection) {
    if (!dated) {
      throw new ForeignPropertyValidationError(
        "RULE_INCORRECT_OR_EMPTY_BODY_SUBMITTED",
        "foreignFhlEea is only available up to tax year 2024-25",
      );
    }
    checkAllowanceRules(fhlSection, "foreignFhlEea");
    body.foreignFhlEea = fhlSection;
  }

  const entries = buildForeignPropertyEntries(taxYear, foreignProperty);
  const keyName = resolveForeignPropertyEntryKey(taxYear);
  for (const entry of entries) {
    const label = `${keyName} ${entry[keyName]}`;
    if (!dated) {
      for (const name of ALLOWANCES_UP_TO_2024_25) {
        if (hasEnteredValue(entry.allowances?.[name])) {
          throw new ForeignPropertyValidationError(
            "RULE_INCORRECT_OR_EMPTY_BODY_SUBMITTED",
            `${name} is only available up to tax year 2024-25 (${label})`,
          );
        }
      }
    }
    checkAllowanceRules(entry, label);
  }
  if (entries.length > 0) body.foreignProperty = entries;

  if (Object.keys(body).length === 0) {
    throw new ForeignPropertyValidationError("RULE_INCORRECT_OR_EMPTY_BODY_SUBMITTED", "An empty or non-matching body was submitted");
  }
  return body;
}

function checkAllowanceRules(section, label) {
  const { propertyIncomeAllowance, ...itemised } = section.allowances || {};
  if (!hasEnteredValue(propertyIncomeAllowance)) return;
  if (Object.keys(itemised).length > 0) {
    throw new ForeignPropertyValidationError(
      "RULE_BOTH_ALLOWANCES_SUPPLIED",
      `Both allowances and property income allowance must not be present at the same time (${label})`,
    );
  }
  if (hasEnteredValue(section.adjustments?.privateUseAdjustment)) {
    throw new ForeignPropertyValidationError(
      "RULE_PROPERTY_INCOME_ALLOWANCE",
      `Property income allowance must not be present alongside a private use adjustment (${label})`,
    );
  }
}

/**
 * Check an annual submission body before HMRC sees it.
 * @param {string} taxYear - A valid tax year in YYYY-YY form
 * @param {Object} annualDetails - foreignFhlEea, foreignProperty
 * @returns {string[]} the error messages, empty when the body is acceptable
 */
export function findForeignPropertyAnnualBodyErrors(taxYear, annualDetails) {
  try {
    buildForeignPropertyAnnualRequestBody(taxYear, annualDetails);
    return [];
  } catch (error) {
    if (error instanceof ForeignPropertyValidationError) return [error.message];
    throw error;
  }
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
  registerLambdaRoute(app, "put", "/api/v1/hmrc/itsa/foreign-property/annual", ingestHandler);
}
/* v8 ignore stop */

export function extractAndValidateParameters(event, errorMessages) {
  const parsedBody = parseRequestBody(event);
  const { nino, businessId, taxYear, foreignFhlEea, foreignProperty, runFraudPreventionHeaderValidation } = parsedBody || {};

  if (!nino) errorMessages.push("Missing nino parameter from body");
  if (nino && !isValidNino(nino)) errorMessages.push("Invalid nino format");

  if (!businessId) errorMessages.push("Missing businessId parameter from body");
  if (businessId && !BUSINESS_ID_PATTERN.test(businessId)) errorMessages.push("Invalid businessId format");

  if (!taxYear) errorMessages.push("Missing taxYear parameter from body");
  if (taxYear && !isValidTaxYear(taxYear)) errorMessages.push("Invalid taxYear format - must be YYYY-YY");

  // Reject a body HMRC always rejects before ever calling HMRC, the same way an invalid nino or
  // businessId never reaches HMRC.
  if (taxYear && isValidTaxYear(taxYear)) {
    errorMessages.push(...findForeignPropertyAnnualBodyErrors(taxYear, { foreignFhlEea, foreignProperty }));
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
    // The builder drops empty sections and entries, and HMRC validates the amounts.
    foreignFhlEea,
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
    "HMRC_ITSA_FOREIGN_PROPERTY_ANNUAL_PUT_ASYNC_REQUESTS_TABLE_NAME",
    "SQS_QUEUE_URL",
  ]);

  const { request, requestId, traceparent, correlationId } = extractRequest(event);

  const asyncRequestsTableName = process.env.HMRC_ITSA_FOREIGN_PROPERTY_ANNUAL_PUT_ASYNC_REQUESTS_TABLE_NAME;
  const sqsQueueUrl = process.env.SQS_QUEUE_URL;

  let errorMessages = [];

  // Bundle enforcement
  let userSub;
  let bundleIds = [];
  try {
    ({ userSub, bundleIds } = await enforceBundles(event));
  } catch (error) {
    await recordSubmissionFailure({ failure: "access-denied", summary: "ITSA foreign property annual submission blocked: no entitlement" });
    return http403ForbiddenFromBundleEnforcement(error, request);
  }

  const { govClientHeaders, govClientErrorMessages } = buildFraudHeaders(event, { bundleIds });
  errorMessages = errorMessages.concat(govClientErrorMessages || []);

  // Extract and validate parameters
  const { nino, businessId, taxYear, foreignFhlEea, foreignProperty, hmrcAccount, runFraudPreventionHeaderValidation } =
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
    businessId,
    taxYear,
    foreignFhlEea,
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

  // Token enforcement: consume 1 token for the annual submission (the "value action") - initial
  // request only. Priced under self-employed-year-end, like the other year-end writes.
  if (isInitialRequest) {
    const activityId = "self-employed-year-end";
    try {
      const { hasTokensForActivity } = await import("../../services/tokenEnforcement.js");
      const { loadCatalogFromRoot } = await import("../../services/productCatalog.js");
      const catalog = loadCatalogFromRoot();
      const tokenCheck = await hasTokensForActivity(userSub, activityId, catalog);
      if (!tokenCheck.available) {
        logger.info({ message: "Token enforcement blocked submission", activityId, reason: tokenCheck.reason });
        await recordSubmissionFailure({
          failure: "tokens-exhausted",
          summary: "ITSA foreign property annual submission blocked: submission allowance used up",
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
        summary: "ITSA foreign property annual submission failed while checking the submission allowance",
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
        const { annualSubmission, hmrcResponse, hmrcResponseBody, receiptBody } = await putItsaForeignPropertyAnnual(
          payload.nino,
          payload.businessId,
          payload.taxYear,
          {
            foreignFhlEea: payload.foreignFhlEea,
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

        const resultData = {
          annualSubmission,
          hmrcResponse: serializableHmrcResponse,
          hmrcResponseBody,
          correlationId: serializableHmrcResponse.headers["x-correlationid"] ?? null,
        };

        if (!hmrcResponse.ok) {
          return resultData;
        }

        if (payload.userSub && payload.businessId && payload.taxYear) {
          const timestamp = new Date().toISOString();
          const receiptId = `${timestamp}-${payload.businessId}-${payload.taxYear}`;
          await putReceipt(payload.userSub, receiptId, receiptBody, resolveActorClass());
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
      logger.error({ message: "Unexpected error during foreign property annual submission", error: error.message, stack: error.stack });
      await recordSubmissionFailure({
        failure: "internal-error",
        summary: "ITSA foreign property annual submission failed unexpectedly",
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
  // malformed submission, not a system fault), so it comes back as a 400 carrying HMRC's own
  // message, the way hmrcItsaForeignPropertyPeriodPut.js's amendForeignPropertyPeriod does.
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
    // HMRC answers the save with no body, so the id the page shows rides beside whatever HMRC sent.
    data: result?.annualSubmission ? { ...result.annualSubmission, correlationId: result.correlationId ?? null } : null,
  });
}

// SQS worker Lambda ingestHandler function
export async function workerHandler(event) {
  const asyncRequestsTableName = process.env.HMRC_ITSA_FOREIGN_PROPERTY_ANNUAL_PUT_ASYNC_REQUESTS_TABLE_NAME;

  return processSqsRecords(event, {
    requiredEnv: [
      "HMRC_BASE_URI",
      "HMRC_SANDBOX_BASE_URI",
      "RECEIPTS_DYNAMODB_TABLE_NAME",
      "BUNDLE_DYNAMODB_TABLE_NAME",
      "HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME",
      "HMRC_ITSA_FOREIGN_PROPERTY_ANNUAL_PUT_ASYNC_REQUESTS_TABLE_NAME",
    ],
    logger,
    errorPolicy: "classify",
    processRecord: async (payload, { userId: userSub, requestId }) => {
      const { annualSubmission, hmrcResponse, hmrcResponseBody, receiptBody } = await putItsaForeignPropertyAnnual(
        payload.nino,
        payload.businessId,
        payload.taxYear,
        {
          foreignFhlEea: payload.foreignFhlEea,
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

      const result = {
        annualSubmission,
        hmrcResponse: serializableHmrcResponse,
        hmrcResponseBody,
        correlationId: serializableHmrcResponse.headers["x-correlationid"] ?? null,
      };

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

      if (userSub && payload.businessId && payload.taxYear) {
        const timestamp = new Date().toISOString();
        const receiptId = `${timestamp}-${payload.businessId}-${payload.taxYear}`;
        await putReceipt(userSub, receiptId, receiptBody, resolveActorClass());
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
        summary: "ITSA foreign property annual submission failed in the background worker",
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
export async function putItsaForeignPropertyAnnual(
  nino,
  businessId,
  taxYear,
  annualDetails,
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

  const hmrcRequestBody = buildForeignPropertyAnnualRequestBody(taxYear, annualDetails);

  // hmrcHttpPut, like hmrcHttpPost, does not prepend the HMRC base URI itself - the caller
  // builds the full URL.
  const hmrcBase = hmrcAccount === "synthetic" ? process.env.HMRC_SANDBOX_BASE_URI : process.env.HMRC_BASE_URI;
  const hmrcRequestUrl = `${hmrcBase}/individuals/business/property/foreign/${nino}/${businessId}/annual/${taxYear}`;
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
    const httpResult = await hmrcHttpPut(hmrcRequestUrl, hmrcRequestHeaders, govClientHeaders, hmrcRequestBody, auditForUserSub);
    hmrcResponse = httpResult.hmrcResponse;
    hmrcResponseBody = httpResult.hmrcResponseBody;
  }

  if (!hmrcResponse.ok) {
    await recordSubmissionFailure({
      failure: "hmrc-rejected",
      summary: "ITSA foreign property annual submission rejected by HMRC",
      userSub: auditForUserSub,
      detail: { hmrcStatus: hmrcResponse.status },
    });
    return { hmrcResponse, hmrcResponseBody, annualSubmission: null };
  }

  const responseHeaderEntries = Object.fromEntries(serializeResponseHeaders(hmrcResponse.headers));
  const receiptBody = {
    businessId,
    taxYear,
    ...hmrcRequestBody,
    correlationId: responseHeaderEntries["x-correlationid"],
  };

  emitSubmissionMetric("ItsaSubmissionSuccess", resolveActorClass());
  await publishActivityEvent({
    event: "itsa-foreign-property-annual-submission-filed",
    summary: "ITSA foreign property annual submission filed",
    userSub: auditForUserSub,
  });
  const { chargeTokenOnSuccess } = await import("../../services/tokenEnforcement.js");
  await chargeTokenOnSuccess(auditForUserSub, "self-employed-year-end");
  // HMRC answers the amend with no body, so annualSubmission carries the model: the async response
  // needs data to finish, and the page needs to know which body shape was sent.
  const annualSubmission = { model: resolveItsaSubmissionModel(taxYear), ...(hmrcResponseBody || {}) };
  return { hmrcResponse, hmrcResponseBody, annualSubmission, receiptBody, hmrcRequestUrl };
}
