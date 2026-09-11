// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/hmrc/hmrcItsaTaxLiabilityAdjustmentsPut.js

import { createLogger, context } from "../../lib/logger.js";
import {
  extractRequest,
  parseRequestBody,
  buildValidationError,
  http401UnauthorizedResponse,
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

const logger = createLogger({ source: "app/functions/hmrc/hmrcItsaTaxLiabilityAdjustmentsPut.js" });

const MAX_WAIT_MS = 25000;
const DEFAULT_WAIT_MS = 0;

// Individuals Tax Liability Adjustments v1.0 - the API version this endpoint requires.
const HMRC_API_VERSION = "1.0";

const BUSINESS_METRICS_NAMESPACE = "Submit/Business";

function emitSubmissionMetric(metricName, actor) {
  emitMetric({ namespace: BUSINESS_METRICS_NAMESPACE, metricName, dimensions: { Actor: actor } });
}

async function recordSubmissionFailure({ failure, summary, userSub, detail = {} }) {
  const actor = resolveActorClass();
  emitSubmissionMetric("ItsaSubmissionFailure", actor);
  await publishActivityFailureEvent({
    event: "itsa-tax-liability-adjustments-failed",
    summary,
    failure,
    userSub,
    actor,
    detail,
  });
}

/**
 * Round a money value to 2 decimal places, matching the Individuals Tax Liability Adjustments
 * v1.0 schema.
 * @param {number|string} value
 * @returns {number}
 */
function roundToTwoDecimalPlaces(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

/**
 * Build a money-valued section for the HMRC request body. HMRC rejects an empty object at
 * either of these paths, so a section with no entered values is left out of the body entirely.
 * @param {Object|undefined} section - the caller's object of numeric fields
 * @returns {Object|undefined} the section with numeric values, or undefined if it has nothing in it
 */
function buildMoneySection(section) {
  if (!section || typeof section !== "object") return undefined;
  const entries = Object.entries(section).filter(([, value]) => value !== undefined && value !== null && value !== "");
  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries.map(([key, value]) => [key, roundToTwoDecimalPlaces(value)]));
}

/**
 * A tax liability adjustments submission was rejected before it ever reached HMRC, because the
 * body we would have sent is entirely empty.
 */
export class TaxLiabilityAdjustmentsValidationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "TaxLiabilityAdjustmentsValidationError";
    this.code = code;
  }
}

/**
 * Build the Individuals Tax Liability Adjustments v1.0 request body: carryBackLossesDecrease
 * and taxRefundedOrSetOff, each included only when the caller entered a value for at least one
 * of their fields. HMRC rejects an entirely empty body, so a body with nothing in either
 * section is rejected here rather than sent.
 *
 * taxRefundedOrSetOff sits behind HMRC's own release flag and is test-only until HMRC releases
 * it, so no page offers it yet - but a caller that does supply it is not refused here, the way
 * every other write handler in this repo defers box-level validation to HMRC.
 * @param {Object} details - carryBackLossesDecrease, taxRefundedOrSetOff
 * @returns {Object} the HMRC request body
 */
export function buildTaxLiabilityAdjustmentsRequestBody(details) {
  const hmrcRequestBody = {};

  const carryBackLossesDecrease = buildMoneySection(details.carryBackLossesDecrease);
  if (carryBackLossesDecrease) hmrcRequestBody.carryBackLossesDecrease = carryBackLossesDecrease;

  const taxRefundedOrSetOff = buildMoneySection(details.taxRefundedOrSetOff);
  if (taxRefundedOrSetOff) hmrcRequestBody.taxRefundedOrSetOff = taxRefundedOrSetOff;

  if (Object.keys(hmrcRequestBody).length === 0) {
    throw new TaxLiabilityAdjustmentsValidationError(
      "RULE_INCORRECT_OR_EMPTY_BODY_SUBMITTED",
      "An empty or non-matching body was submitted",
    );
  }

  return hmrcRequestBody;
}

/**
 * Serialize response headers to a plain object with lowercase keys
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
  registerLambdaRoute(app, "put", "/api/v1/hmrc/itsa/tax-liability-adjustments", ingestHandler);
}
/* v8 ignore stop */

export function extractAndValidateParameters(event, errorMessages) {
  const parsedBody = parseRequestBody(event);
  const { nino, taxYear, carryBackLossesDecrease, taxRefundedOrSetOff, suspendTemporalValidations, runFraudPreventionHeaderValidation } =
    parsedBody || {};

  if (!nino) errorMessages.push("Missing nino parameter from body");
  if (nino && !isValidNino(nino)) errorMessages.push("Invalid nino format");

  if (!taxYear) errorMessages.push("Missing taxYear parameter from body");
  if (taxYear && !isValidTaxYear(taxYear)) errorMessages.push("Invalid taxYear format - must be YYYY-YY");

  // Reject a body HMRC always rejects (entirely empty) before ever calling HMRC.
  try {
    buildTaxLiabilityAdjustmentsRequestBody({ carryBackLossesDecrease, taxRefundedOrSetOff });
  } catch (error) {
    if (error instanceof TaxLiabilityAdjustmentsValidationError) {
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
  const suspendTemporalValidationsBool = suspendTemporalValidations === true || suspendTemporalValidations === "true";

  return {
    nino,
    taxYear,
    // Pass through whatever the caller sent and let buildTaxLiabilityAdjustmentsRequestBody
    // drop either one that ends up empty - HMRC rejects an empty object at either path.
    carryBackLossesDecrease: carryBackLossesDecrease || {},
    taxRefundedOrSetOff: taxRefundedOrSetOff || {},
    suspendTemporalValidations: suspendTemporalValidationsBool,
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
    "HMRC_ITSA_TAX_LIABILITY_ADJUSTMENTS_PUT_ASYNC_REQUESTS_TABLE_NAME",
    "SQS_QUEUE_URL",
  ]);

  const { request, requestId, traceparent, correlationId } = extractRequest(event);

  const asyncRequestsTableName = process.env.HMRC_ITSA_TAX_LIABILITY_ADJUSTMENTS_PUT_ASYNC_REQUESTS_TABLE_NAME;
  const sqsQueueUrl = process.env.SQS_QUEUE_URL;

  let errorMessages = [];

  // Bundle enforcement
  let userSub;
  let bundleIds = [];
  try {
    ({ userSub, bundleIds } = await enforceBundles(event));
  } catch (error) {
    await recordSubmissionFailure({
      failure: "access-denied",
      summary: "ITSA tax liability adjustments submission blocked: no entitlement",
    });
    return http403ForbiddenFromBundleEnforcement(error, request);
  }

  const { govClientHeaders, govClientErrorMessages } = buildFraudHeaders(event, { bundleIds });
  errorMessages = errorMessages.concat(govClientErrorMessages || []);

  // Extract and validate parameters
  const { nino, taxYear, carryBackLossesDecrease, taxRefundedOrSetOff, suspendTemporalValidations, hmrcAccount, runFraudPreventionHeaderValidation } =
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
    taxYear,
    carryBackLossesDecrease,
    taxRefundedOrSetOff,
    suspendTemporalValidations,
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

  // No token charge here: tax liability adjustments is a free year-end working step, the second
  // half of a carry-back claim, and sits outside the per-business token metering because HMRC
  // scopes it to the person and the tax year rather than to a business.

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
        const { taxLiabilityAdjustments, hmrcResponse, hmrcResponseBody, receiptBody } = await putItsaTaxLiabilityAdjustments(
          payload.nino,
          payload.taxYear,
          { carryBackLossesDecrease: payload.carryBackLossesDecrease, taxRefundedOrSetOff: payload.taxRefundedOrSetOff },
          payload.suspendTemporalValidations,
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

        const resultData = { taxLiabilityAdjustments, hmrcResponse: serializableHmrcResponse, hmrcResponseBody };

        if (!hmrcResponse.ok) {
          return resultData;
        }

        if (payload.userSub && payload.taxYear) {
          const timestamp = new Date().toISOString();
          const receiptId = `${timestamp}-${payload.taxYear}`;
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
      logger.error({
        message: "Unexpected error during tax liability adjustments submission",
        error: error.message,
        stack: error.stack,
      });
      await recordSubmissionFailure({
        failure: "internal-error",
        summary: "ITSA tax liability adjustments submission failed unexpectedly",
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

  // Map HMRC error responses to our HTTP responses. A 400 is the caller's to fix, so it comes
  // back as a 400 carrying HMRC's own message.
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
    data: result ? result.taxLiabilityAdjustments : null,
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
    "HMRC_ITSA_TAX_LIABILITY_ADJUSTMENTS_PUT_ASYNC_REQUESTS_TABLE_NAME",
  ]);

  const asyncRequestsTableName = process.env.HMRC_ITSA_TAX_LIABILITY_ADJUSTMENTS_PUT_ASYNC_REQUESTS_TABLE_NAME;

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

      const { taxLiabilityAdjustments, hmrcResponse, hmrcResponseBody, receiptBody } = await putItsaTaxLiabilityAdjustments(
        payload.nino,
        payload.taxYear,
        { carryBackLossesDecrease: payload.carryBackLossesDecrease, taxRefundedOrSetOff: payload.taxRefundedOrSetOff },
        payload.suspendTemporalValidations,
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

      const result = { taxLiabilityAdjustments, hmrcResponse: serializableHmrcResponse, hmrcResponseBody };

      if (!hmrcResponse.ok) {
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

      if (userSub && payload.taxYear) {
        const timestamp = new Date().toISOString();
        const receiptId = `${timestamp}-${payload.taxYear}`;
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
        summary: "ITSA tax liability adjustments submission failed in the background worker",
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
  if (error.message?.includes("HMRC temporary error")) return true;
  if (error.name === "AbortError") return true;
  const retryableCodes = ["ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "ESOCKETTIMEDOUT", "ECONNREFUSED", "EHOSTUNREACH"];
  if (error.code && retryableCodes.includes(error.code)) return true;
  if (error.retryable) return true;
  return false;
}

// Service adaptor aware of the downstream service but not the consuming Lambda's incoming/outgoing HTTP request/response
export async function putItsaTaxLiabilityAdjustments(
  nino,
  taxYear,
  adjustmentsDetails,
  suspendTemporalValidations,
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

  const hmrcRequestBody = buildTaxLiabilityAdjustmentsRequestBody(adjustmentsDetails);

  const hmrcBase = hmrcAccount === "synthetic" ? process.env.HMRC_SANDBOX_BASE_URI : process.env.HMRC_BASE_URI;
  const hmrcRequestUrl = `${hmrcBase}/individuals/tax-liability/adjustments/${nino}/${taxYear}`;
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
    // HMRC's sandbox needs this header when a test year has not really ended, since tax
    // liability adjustments are otherwise refused until the tax year is over.
    if (suspendTemporalValidations) hmrcRequestHeaders.suspendTemporalValidations = "true";
    const httpResult = await hmrcHttpPut(hmrcRequestUrl, hmrcRequestHeaders, govClientHeaders, hmrcRequestBody, auditForUserSub);
    hmrcResponse = httpResult.hmrcResponse;
    hmrcResponseBody = httpResult.hmrcResponseBody;
  }

  if (!hmrcResponse.ok) {
    await recordSubmissionFailure({
      failure: "hmrc-rejected",
      summary: "ITSA tax liability adjustments submission rejected by HMRC",
      userSub: auditForUserSub,
      detail: { hmrcStatus: hmrcResponse.status },
    });
    return { hmrcResponse, hmrcResponseBody, taxLiabilityAdjustments: null };
  }

  const responseHeaderEntries = Object.fromEntries(serializeResponseHeaders(hmrcResponse.headers));
  const receiptBody = {
    taxYear,
    ...hmrcRequestBody,
    correlationId: responseHeaderEntries["x-correlationid"],
  };

  emitSubmissionMetric("ItsaSubmissionSuccess", resolveActorClass());
  await publishActivityEvent({
    event: "itsa-tax-liability-adjustments-filed",
    summary: "ITSA tax liability adjustments filed",
    userSub: auditForUserSub,
  });
  return { hmrcResponse, hmrcResponseBody, taxLiabilityAdjustments: hmrcResponseBody, receiptBody, hmrcRequestUrl };
}
