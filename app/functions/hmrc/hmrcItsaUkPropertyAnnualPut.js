// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/hmrc/hmrcItsaUkPropertyAnnualPut.js

import { createLogger, context } from "../../lib/logger.js";
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
import { isValidNino, isValidTaxYear } from "../../lib/hmrcValidation.js";
import * as asyncApiServices from "../../services/asyncApiServices.js";
import { getAsyncRequest } from "../../data/dynamoDbAsyncRequestRepository.js";
import { putReceipt } from "../../data/dynamoDbReceiptRepository.js";
import { buildFraudHeaders, detectVendorPublicIp } from "../../lib/buildFraudHeaders.js";
import { initializeSalt } from "../../services/subHasher.js";
import { publishActivityEvent, publishActivityFailureEvent, resolveActorClass } from "../../lib/activityAlert.js";
import { emitMetric } from "../../lib/emfMetrics.js";

const logger = createLogger({ source: "app/functions/hmrc/hmrcItsaUkPropertyAnnualPut.js" });

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
 * Record a failed ITSA UK property annual submission: one business metric and one activity
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
    event: "itsa-uk-property-annual-submission-failed",
    summary,
    failure,
    userSub,
    actor,
    detail,
  });
}

/**
 * Round a money value to 2 decimal places, the way every amount in the Property Business v6.0
 * schema is specified ("up to 2 decimal places").
 * @param {number|string} value
 * @returns {number}
 */
function roundToTwoDecimalPlaces(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

/**
 * True when the caller entered a value at all - the money-field test throughout this repo,
 * kept here as its own name so the boolean-aware sections below read the same way.
 * @param {*} value
 * @returns {boolean}
 */
function hasEnteredValue(value) {
  return value !== undefined && value !== null && value !== "";
}

/**
 * Build a flat money section, dropping any field the caller left unanswered. HMRC rejects an
 * empty object at a section's path - so a section with no entered values must be left out of
 * the body entirely, never sent as {}.
 * @param {Object|undefined} section - the caller's object of numeric fields
 * @returns {Object|undefined} the section with numeric values, or undefined if it has nothing in it
 */
function buildMoneySection(section) {
  if (!section || typeof section !== "object") return undefined;
  const entries = Object.entries(section).filter(([, value]) => hasEnteredValue(value));
  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries.map(([key, value]) => [key, roundToTwoDecimalPlaces(value)]));
}

/**
 * An annual submission was rejected before it ever reached HMRC, because the body we would
 * have sent is one HMRC always rejects (empty, both allowance forms at once, or the property
 * income allowance alongside a private use adjustment). Thrown from
 * buildUkPropertyAnnualRequestBody and turned into a 400 by the caller, the same way a bad
 * nino or businessId never reaches HMRC either.
 */
export class UkPropertyAnnualSubmissionValidationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "UkPropertyAnnualSubmissionValidationError";
    this.code = code;
  }
}

/**
 * Build the "adjustments" section. balancingCharge, privateUseAdjustment and
 * businessPremisesRenovationAllowanceBalancingCharges are money fields; nonResidentLandlord and
 * rentARoom.jointlyLet are booleans, where a customer's "no" (false) is an answer and belongs
 * in the body, and only an unanswered field is dropped. buildMoneySection's undefined/null/""
 * test would otherwise let a false survive by accident, so the two booleans are handled apart
 * from the money fields rather than folded into that same filter.
 * @param {Object|undefined} adjustments
 * @returns {Object|undefined}
 */
function buildAdjustmentsSection(adjustments) {
  if (!adjustments || typeof adjustments !== "object") return undefined;
  const { nonResidentLandlord, rentARoom, ...flatAdjustments } = adjustments;

  const hmrcAdjustments = buildMoneySection(flatAdjustments) || {};

  if (typeof nonResidentLandlord === "boolean") {
    hmrcAdjustments.nonResidentLandlord = nonResidentLandlord;
  }
  if (rentARoom && typeof rentARoom.jointlyLet === "boolean") {
    hmrcAdjustments.rentARoom = { jointlyLet: rentARoom.jointlyLet };
  }

  return Object.keys(hmrcAdjustments).length > 0 ? hmrcAdjustments : undefined;
}

/**
 * Build the "allowances" section: either propertyIncomeAllowance on its own, or the itemised
 * set (the capital allowance fields plus the two structured building allowance arrays). HMRC
 * rejects a body carrying both forms with RULE_BOTH_ALLOWANCES_SUPPLIED, so this function
 * rejects it first rather than let HMRC find out.
 * @param {Object|undefined} allowances
 * @returns {Object|undefined}
 */
function buildAllowancesSection(allowances) {
  if (!allowances || typeof allowances !== "object") return undefined;

  const { propertyIncomeAllowance, structuredBuildingAllowance, enhancedStructuredBuildingAllowance, ...itemised } = allowances;

  const itemisedMoney = buildMoneySection(itemised);
  const hasStructuredBuildingAllowance = Array.isArray(structuredBuildingAllowance) && structuredBuildingAllowance.length > 0;
  const hasEnhancedStructuredBuildingAllowance =
    Array.isArray(enhancedStructuredBuildingAllowance) && enhancedStructuredBuildingAllowance.length > 0;
  const hasItemisedAllowance = Boolean(itemisedMoney) || hasStructuredBuildingAllowance || hasEnhancedStructuredBuildingAllowance;
  const hasPropertyIncomeAllowance = hasEnteredValue(propertyIncomeAllowance);

  if (hasPropertyIncomeAllowance && hasItemisedAllowance) {
    throw new UkPropertyAnnualSubmissionValidationError(
      "RULE_BOTH_ALLOWANCES_SUPPLIED",
      "Both allowances and property income allowance must not be present at the same time",
    );
  }

  const hmrcAllowances = {};
  if (hasPropertyIncomeAllowance) hmrcAllowances.propertyIncomeAllowance = roundToTwoDecimalPlaces(propertyIncomeAllowance);
  if (itemisedMoney) Object.assign(hmrcAllowances, itemisedMoney);
  if (hasStructuredBuildingAllowance) hmrcAllowances.structuredBuildingAllowance = structuredBuildingAllowance;
  if (hasEnhancedStructuredBuildingAllowance) hmrcAllowances.enhancedStructuredBuildingAllowance = enhancedStructuredBuildingAllowance;

  return Object.keys(hmrcAllowances).length > 0 ? hmrcAllowances : undefined;
}

/**
 * Build the Property Business v6.0 "Create and Amend UK Property Annual Submission" request
 * body: everything wrapped in ukProperty, holding adjustments and/or allowances, each included
 * only when the caller entered a value for at least one of their fields. HMRC rejects an
 * entirely empty body, and separately rejects a propertyIncomeAllowance sitting alongside a
 * privateUseAdjustment - both checked here rather than sent and left for HMRC to catch.
 * @param {Object} annualDetails - adjustments, allowances
 * @returns {Object} the HMRC request body
 */
export function buildUkPropertyAnnualRequestBody(annualDetails) {
  const adjustments = buildAdjustmentsSection(annualDetails.adjustments);
  const allowances = buildAllowancesSection(annualDetails.allowances);

  const hasPropertyIncomeAllowance = hasEnteredValue(annualDetails.allowances?.propertyIncomeAllowance);
  const hasPrivateUseAdjustment = hasEnteredValue(annualDetails.adjustments?.privateUseAdjustment);
  if (hasPropertyIncomeAllowance && hasPrivateUseAdjustment) {
    throw new UkPropertyAnnualSubmissionValidationError(
      "RULE_PROPERTY_INCOME_ALLOWANCE",
      "Property income allowance must not be present alongside a private use adjustment",
    );
  }

  const ukProperty = {};
  if (adjustments) ukProperty.adjustments = adjustments;
  if (allowances) ukProperty.allowances = allowances;

  if (Object.keys(ukProperty).length === 0) {
    throw new UkPropertyAnnualSubmissionValidationError(
      "RULE_INCORRECT_OR_EMPTY_BODY_SUBMITTED",
      "An empty or non-matching body was submitted",
    );
  }

  return { ukProperty };
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
  registerLambdaRoute(app, "put", "/api/v1/hmrc/itsa/uk-property/annual", ingestHandler);
}
/* v8 ignore stop */

export function extractAndValidateParameters(event, errorMessages) {
  const parsedBody = parseRequestBody(event);
  const { nino, businessId, taxYear, adjustments, allowances, runFraudPreventionHeaderValidation } = parsedBody || {};

  if (!nino) errorMessages.push("Missing nino parameter from body");
  if (nino && !isValidNino(nino)) errorMessages.push("Invalid nino format");

  if (!businessId) errorMessages.push("Missing businessId parameter from body");
  if (businessId && !BUSINESS_ID_PATTERN.test(businessId)) errorMessages.push("Invalid businessId format");

  if (!taxYear) errorMessages.push("Missing taxYear parameter from body");
  if (taxYear && !isValidTaxYear(taxYear)) errorMessages.push("Invalid taxYear format - must be YYYY-YY");

  // Reject a body HMRC always rejects (empty, both allowance forms at once, or the property
  // income allowance alongside a private use adjustment) before ever calling HMRC, the same
  // way an invalid nino or businessId never reaches HMRC.
  try {
    buildUkPropertyAnnualRequestBody({ adjustments, allowances });
  } catch (error) {
    if (error instanceof UkPropertyAnnualSubmissionValidationError) {
      errorMessages.push(error.message);
    } else {
      throw error;
    }
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
    // Pass through whatever the caller sent and let buildUkPropertyAnnualRequestBody drop any
    // section that ends up empty - HMRC rejects an empty object at any of their paths.
    adjustments: adjustments || {},
    allowances: allowances || {},
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
    "HMRC_ITSA_UK_PROPERTY_ANNUAL_PUT_ASYNC_REQUESTS_TABLE_NAME",
    "SQS_QUEUE_URL",
  ]);

  const { request, requestId, traceparent, correlationId } = extractRequest(event);

  const asyncRequestsTableName = process.env.HMRC_ITSA_UK_PROPERTY_ANNUAL_PUT_ASYNC_REQUESTS_TABLE_NAME;
  const sqsQueueUrl = process.env.SQS_QUEUE_URL;

  let errorMessages = [];

  // Bundle enforcement
  let userSub;
  let bundleIds = [];
  try {
    ({ userSub, bundleIds } = await enforceBundles(event));
  } catch (error) {
    await recordSubmissionFailure({ failure: "access-denied", summary: "ITSA UK property annual submission blocked: no entitlement" });
    return http403ForbiddenFromBundleEnforcement(error, request);
  }

  const { govClientHeaders, govClientErrorMessages } = buildFraudHeaders(event, { bundleIds });
  errorMessages = errorMessages.concat(govClientErrorMessages || []);

  // Extract and validate parameters
  const { nino, businessId, taxYear, adjustments, allowances, hmrcAccount, runFraudPreventionHeaderValidation } =
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
    adjustments,
    allowances,
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
      const { consumeTokenForActivity } = await import("../../services/tokenEnforcement.js");
      const { loadCatalogFromRoot } = await import("../../services/productCatalog.js");
      const catalog = loadCatalogFromRoot();
      const tokenResult = await consumeTokenForActivity(userSub, activityId, catalog);
      if (!tokenResult.consumed) {
        logger.info({ message: "Token enforcement blocked submission", activityId, reason: tokenResult.reason });
        await recordSubmissionFailure({
          failure: "tokens-exhausted",
          summary: "ITSA UK property annual submission blocked: submission allowance used up",
          userSub,
        });
        return http403ForbiddenResponse({
          request,
          headers: responseHeaders,
          message: "Token limit reached",
          error: { reason: "tokens_exhausted", tokensRemaining: 0 },
        });
      }
      logger.info({ message: "Token consumed for submission", activityId, tokensRemaining: tokenResult.tokensRemaining });
    } catch (error) {
      logger.error({ message: "Token enforcement error", error: error.message, stack: error.stack });
      await recordSubmissionFailure({
        failure: "internal-error",
        summary: "ITSA UK property annual submission failed while checking the submission allowance",
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
        const { annualSubmission, hmrcResponse, hmrcResponseBody, receiptBody } = await putItsaUkPropertyAnnual(
          payload.nino,
          payload.businessId,
          payload.taxYear,
          {
            adjustments: payload.adjustments,
            allowances: payload.allowances,
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

        const resultData = { annualSubmission, hmrcResponse: serializableHmrcResponse, hmrcResponseBody };

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
      logger.error({ message: "Unexpected error during UK property annual submission", error: error.message, stack: error.stack });
      await recordSubmissionFailure({
        failure: "internal-error",
        summary: "ITSA UK property annual submission failed unexpectedly",
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
  // message, the way hmrcItsaUkPropertyPeriodPut.js's amendUkPropertyPeriod does.
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
    data: result ? result.annualSubmission : null,
  });
}

// SQS worker Lambda ingestHandler function
export async function workerHandler(event) {
  await initializeSalt();
  validateEnv([
    "HMRC_BASE_URI",
    "HMRC_SANDBOX_BASE_URI",
    "RECEIPTS_DYNAMODB_TABLE_NAME",
    "BUNDLE_DYNAMODB_TABLE_NAME",
    "HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME",
    "HMRC_ITSA_UK_PROPERTY_ANNUAL_PUT_ASYNC_REQUESTS_TABLE_NAME",
  ]);

  const asyncRequestsTableName = process.env.HMRC_ITSA_UK_PROPERTY_ANNUAL_PUT_ASYNC_REQUESTS_TABLE_NAME;

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

      const { annualSubmission, hmrcResponse, hmrcResponseBody, receiptBody } = await putItsaUkPropertyAnnual(
        payload.nino,
        payload.businessId,
        payload.taxYear,
        {
          adjustments: payload.adjustments,
          allowances: payload.allowances,
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

      const result = { annualSubmission, hmrcResponse: serializableHmrcResponse, hmrcResponseBody };

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
      await recordSubmissionFailure({
        failure: "internal-error",
        summary: "ITSA UK property annual submission failed in the background worker",
        userSub,
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
export async function putItsaUkPropertyAnnual(
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

  const hmrcRequestBody = buildUkPropertyAnnualRequestBody(annualDetails);

  // hmrcHttpPut, like hmrcHttpPost, does not prepend the HMRC base URI itself - the caller
  // builds the full URL.
  const hmrcBase = hmrcAccount === "synthetic" ? process.env.HMRC_SANDBOX_BASE_URI : process.env.HMRC_BASE_URI;
  const hmrcRequestUrl = `${hmrcBase}/individuals/business/property/uk/${nino}/${businessId}/annual/${taxYear}`;
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
      summary: "ITSA UK property annual submission rejected by HMRC",
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
    event: "itsa-uk-property-annual-submission-filed",
    summary: "ITSA UK property annual submission filed",
    userSub: auditForUserSub,
  });
  return { hmrcResponse, hmrcResponseBody, annualSubmission: hmrcResponseBody, receiptBody, hmrcRequestUrl };
}
