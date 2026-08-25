// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/functions/hmrcVatReturnPost.js

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
import { putReceipt } from "../../data/dynamoDbReceiptRepository.js";
import { getAsyncRequest } from "../../data/dynamoDbAsyncRequestRepository.js";
import { buildHttpResponseFromLambdaResult, buildLambdaEventFromHttpRequest } from "../../lib/httpServerToLambdaAdaptor.js";
import { enforceBundles } from "../../services/bundleManagement.js";
import {
  UnauthorizedTokenError,
  validateHmrcAccessToken,
  http403ForbiddenFromBundleEnforcement,
  generateHmrcErrorResponseWithRetryAdvice,
  hmrcHttpPost,
  validateFraudPreventionHeaders,
  buildHmrcHeaders,
} from "../../services/hmrcApi.js";
import { isValidVrn, isValidIsoDate } from "../../lib/hmrcValidation.js";
import { findPeriodKeyByDateRange } from "../../lib/obligationFormatter.js";
import { getVatObligations } from "./hmrcVatObligationGet.js";
import {
  detectRequestFormat,
  buildVatReturnBody,
  buildVatReturnBodyFromLegacy,
  isValidMonetaryAmount,
  isValidWholeAmount,
} from "../../lib/vatReturnTypes.js";
import * as asyncApiServices from "../../services/asyncApiServices.js";
import { buildFraudHeaders, detectVendorPublicIp } from "../../lib/buildFraudHeaders.js";
import { initializeSalt } from "../../services/subHasher.js";
import { publishActivityEvent, publishActivityFailureEvent, resolveActorClass } from "../../lib/activityAlert.js";
import { emitMetric } from "../../lib/emfMetrics.js";

const logger = createLogger({ source: "app/functions/hmrc/hmrcVatReturnPost.js" });

const MAX_WAIT_MS = 25000;
const DEFAULT_WAIT_MS = 0;

const BUSINESS_METRICS_NAMESPACE = "Submit/Business";

function emitSubmissionMetric(metricName, actor) {
  emitMetric({ namespace: BUSINESS_METRICS_NAMESPACE, metricName, dimensions: { Actor: actor } });
}

/**
 * Record a failed VAT filing attempt: one business metric and one activity event.
 *
 * A failed filing is a customer-facing incident, so every meaningful failure path
 * reports itself the same way the success path does. The event carries the failure
 * category and the hashed sub only — no VRN, no customer details, no HMRC payloads.
 *
 * @param {Object} params
 * @param {string} params.failure - Failure category
 * @param {string} params.summary - Human-readable summary for alerting
 * @param {string} [params.userSub]
 * @param {Object} [params.detail] - Additional non-identifying detail fields
 */
async function recordSubmissionFailure({ failure, summary, userSub, detail = {} }) {
  const actor = resolveActorClass();
  emitSubmissionMetric("VatSubmissionFailure", actor);
  await publishActivityFailureEvent({
    event: "vat-return-failed",
    summary,
    failure,
    userSub,
    actor,
    detail,
  });
}

// Server hook for Express app, and construction of a Lambda-like event from HTTP request)
/* v8 ignore start */
export function apiEndpoint(app) {
  app.post("/api/v1/hmrc/vat/return", async (httpRequest, httpResponse) => {
    const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
    const lambdaResult = await ingestHandler(lambdaEvent);
    return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
  });
  app.head("/api/v1/hmrc/vat/return", async (httpRequest, httpResponse) => {
    httpResponse.status(200).send();
  });
}
/* v8 ignore stop */

// eslint-disable-next-line sonarjs/cognitive-complexity
export function extractAndValidateParameters(event, errorMessages) {
  const parsedBody = parseRequestBody(event);
  const {
    vatNumber,
    // Period dates for server-side resolution via obligations API
    periodStart,
    periodEnd,
    accessToken,
    runFraudPreventionHeaderValidation,
    // Sandbox-only option: allow using any available open obligation if dates don't match
    allowSandboxObligations,
    // Legacy single-field format
    vatDue,
    // New 9-box format fields
    vatDueSales,
    vatDueAcquisitions,
    vatReclaimedCurrPeriod,
    totalValueSalesExVAT,
    totalValuePurchasesExVAT,
    totalValueGoodsSuppliedExVAT,
    totalAcquisitionsExVAT,
    // Optional: declaration confirmation (required for new format in Phase 4)
    declarationConfirmed,
  } = parsedBody || {};

  // Use 'hmrcAccessToken' internally for clarity when interacting with HMRC APIs
  const hmrcAccessToken = accessToken;

  // Detect request format (9-box or legacy)
  const requestFormat = detectRequestFormat(parsedBody);

  // Collect validation errors for required fields
  if (!vatNumber) errorMessages.push("Missing vatNumber parameter from body");

  // periodStart and periodEnd are required - periodKey is resolved from obligations
  if (!periodStart) errorMessages.push("Missing periodStart parameter from body");
  if (!periodEnd) errorMessages.push("Missing periodEnd parameter from body");

  // Validate date formats - log rejected values for debugging
  if (periodStart && !isValidIsoDate(periodStart)) {
    logger.warn({ message: "Rejected periodStart - invalid date format", rejectedValue: periodStart });
    errorMessages.push(`Invalid periodStart format '${periodStart}' - must be YYYY-MM-DD`);
  }
  if (periodEnd && !isValidIsoDate(periodEnd)) {
    logger.warn({ message: "Rejected periodEnd - invalid date format", rejectedValue: periodEnd });
    errorMessages.push(`Invalid periodEnd format '${periodEnd}' - must be YYYY-MM-DD`);
  }

  // Format-specific validation
  let vatReturnData = null;
  if (requestFormat === "nine-box") {
    // New 9-box format validation
    if (vatDueSales === undefined) errorMessages.push("Missing vatDueSales (Box 1)");
    if (vatDueAcquisitions === undefined) errorMessages.push("Missing vatDueAcquisitions (Box 2)");
    if (vatReclaimedCurrPeriod === undefined) errorMessages.push("Missing vatReclaimedCurrPeriod (Box 4)");
    if (totalValueSalesExVAT === undefined) errorMessages.push("Missing totalValueSalesExVAT (Box 6)");
    if (totalValuePurchasesExVAT === undefined) errorMessages.push("Missing totalValuePurchasesExVAT (Box 7)");
    if (totalValueGoodsSuppliedExVAT === undefined) errorMessages.push("Missing totalValueGoodsSuppliedExVAT (Box 8)");
    if (totalAcquisitionsExVAT === undefined) errorMessages.push("Missing totalAcquisitionsExVAT (Box 9)");

    // Validate decimal fields (Boxes 1, 2, 4) - log rejected values for debugging
    if (vatDueSales !== undefined && !isValidMonetaryAmount(Number(vatDueSales))) {
      logger.warn({ message: "Rejected vatDueSales (Box 1) - invalid monetary format", rejectedValue: vatDueSales });
      errorMessages.push("Invalid vatDueSales (Box 1) - must be a valid monetary amount with max 2 decimal places");
    }
    if (vatDueAcquisitions !== undefined && !isValidMonetaryAmount(Number(vatDueAcquisitions))) {
      logger.warn({ message: "Rejected vatDueAcquisitions (Box 2) - invalid monetary format", rejectedValue: vatDueAcquisitions });
      errorMessages.push("Invalid vatDueAcquisitions (Box 2) - must be a valid monetary amount with max 2 decimal places");
    }
    if (vatReclaimedCurrPeriod !== undefined && !isValidMonetaryAmount(Number(vatReclaimedCurrPeriod))) {
      logger.warn({ message: "Rejected vatReclaimedCurrPeriod (Box 4) - invalid monetary format", rejectedValue: vatReclaimedCurrPeriod });
      errorMessages.push("Invalid vatReclaimedCurrPeriod (Box 4) - must be a valid monetary amount with max 2 decimal places");
    }

    // Validate integer fields (Boxes 6-9) - log rejected values for debugging
    if (totalValueSalesExVAT !== undefined && !isValidWholeAmount(Math.round(Number(totalValueSalesExVAT)))) {
      logger.warn({ message: "Rejected totalValueSalesExVAT (Box 6) - must be whole number", rejectedValue: totalValueSalesExVAT });
      errorMessages.push("Invalid totalValueSalesExVAT (Box 6) - must be a whole number");
    }
    if (totalValuePurchasesExVAT !== undefined && !isValidWholeAmount(Math.round(Number(totalValuePurchasesExVAT)))) {
      logger.warn({ message: "Rejected totalValuePurchasesExVAT (Box 7) - must be whole number", rejectedValue: totalValuePurchasesExVAT });
      errorMessages.push("Invalid totalValuePurchasesExVAT (Box 7) - must be a whole number");
    }
    if (totalValueGoodsSuppliedExVAT !== undefined && !isValidWholeAmount(Math.round(Number(totalValueGoodsSuppliedExVAT)))) {
      logger.warn({
        message: "Rejected totalValueGoodsSuppliedExVAT (Box 8) - must be whole number",
        rejectedValue: totalValueGoodsSuppliedExVAT,
      });
      errorMessages.push("Invalid totalValueGoodsSuppliedExVAT (Box 8) - must be a whole number");
    }
    if (totalAcquisitionsExVAT !== undefined && !isValidWholeAmount(Math.round(Number(totalAcquisitionsExVAT)))) {
      logger.warn({ message: "Rejected totalAcquisitionsExVAT (Box 9) - must be whole number", rejectedValue: totalAcquisitionsExVAT });
      errorMessages.push("Invalid totalAcquisitionsExVAT (Box 9) - must be a whole number");
    }

    // Build VAT return data if no errors
    if (errorMessages.length === 0 || (errorMessages.length === 1 && !hmrcAccessToken)) {
      vatReturnData = buildVatReturnBody({
        periodKey: null, // Will be resolved from obligations
        vatDueSales: Number(vatDueSales),
        vatDueAcquisitions: Number(vatDueAcquisitions),
        vatReclaimedCurrPeriod: Number(vatReclaimedCurrPeriod),
        totalValueSalesExVAT: Number(totalValueSalesExVAT),
        totalValuePurchasesExVAT: Number(totalValuePurchasesExVAT),
        totalValueGoodsSuppliedExVAT: Number(totalValueGoodsSuppliedExVAT),
        totalAcquisitionsExVAT: Number(totalAcquisitionsExVAT),
      });
    }
  } else {
    // Legacy single-field format validation
    if (vatDue !== 0 && !vatDue) errorMessages.push("Missing vatDue parameter from body");

    const numVatDue = typeof vatDue === "number" ? vatDue : Number(vatDue);
    if (vatDue !== undefined && vatDue !== null && Number.isNaN(numVatDue)) {
      errorMessages.push("Invalid vatDue - must be a number");
    }

    // Build VAT return data from legacy format
    if (errorMessages.length === 0 || (errorMessages.length === 1 && !hmrcAccessToken)) {
      vatReturnData = buildVatReturnBodyFromLegacy({ periodKey: null, vatDue: numVatDue });
    }
  }

  if (vatNumber && !isValidVrn(vatNumber)) {
    // Log VRN validation failure - VRN itself is logged as it's not PII (it's a public business identifier)
    logger.warn({ message: "Rejected vatNumber - invalid VRN format", rejectedVrnLength: vatNumber?.length });
    errorMessages.push("Invalid vatNumber format - must be 9 digits");
  }

  // Extract HMRC account (sandbox/live) from header hmrcAccount
  const hmrcAccountHeader = getHeader(event.headers, "hmrcAccount") || "";
  const hmrcAccount = hmrcAccountHeader.toLowerCase();
  if (hmrcAccount && hmrcAccount !== "sandbox" && hmrcAccount !== "live") {
    errorMessages.push("Invalid hmrcAccount header. Must be either 'sandbox' or 'live' if provided.");
  }

  const runFraudPreventionHeaderValidationBool =
    runFraudPreventionHeaderValidation === true || runFraudPreventionHeaderValidation === "true";

  // In sandbox mode, default to allowing sandbox obligations (use any available open obligation)
  // unless explicitly disabled. This provides flexibility for unpredictable HMRC sandbox responses.
  const allowSandboxObligationsBool = hmrcAccount === "sandbox" && allowSandboxObligations !== false && allowSandboxObligations !== "false";

  return {
    vatNumber,
    periodStart,
    periodEnd,
    hmrcAccessToken,
    vatReturnData,
    requestFormat,
    hmrcAccount,
    runFraudPreventionHeaderValidation: runFraudPreventionHeaderValidationBool,
    allowSandboxObligations: allowSandboxObligationsBool,
    declarationConfirmed,
  };
}

// HTTP request/response, aware Lambda ingestHandler function
// TODO: Remove all but the initial wait and async options.
export async function ingestHandler(event) {
  await initializeSalt();
  await detectVendorPublicIp();
  validateEnv([
    "HMRC_BASE_URI",
    "RECEIPTS_DYNAMODB_TABLE_NAME",
    "BUNDLE_DYNAMODB_TABLE_NAME",
    "HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME",
    "HMRC_VAT_RETURN_POST_ASYNC_REQUESTS_TABLE_NAME",
    "SQS_QUEUE_URL",
  ]);

  // trace: 1
  const { request, requestId, traceparent, correlationId } = extractRequest(event);

  const asyncRequestsTableName = process.env.HMRC_VAT_RETURN_POST_ASYNC_REQUESTS_TABLE_NAME;
  const sqsQueueUrl = process.env.SQS_QUEUE_URL;

  let errorMessages = [];

  // Bundle enforcement
  let userSub;
  let bundleIds = [];
  try {
    ({ userSub, bundleIds } = await enforceBundles(event));
  } catch (error) {
    // Note: Tracing headers (x-request-id, traceparent) are available via context
    // but not currently included in 403 error responses. The request URL is passed
    // for logging purposes. See httpResponseHelper.js for response header handling.
    await recordSubmissionFailure({ failure: "access-denied", summary: "VAT return blocked: no entitlement" });
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

  // Extract and validate parameters
  const {
    vatNumber,
    periodStart,
    periodEnd,
    hmrcAccessToken,
    vatReturnData,
    requestFormat,
    hmrcAccount,
    runFraudPreventionHeaderValidation,
    allowSandboxObligations,
  } = extractAndValidateParameters(event, errorMessages);

  // Generate Gov-Client headers and collect any header-related validation errors
  const { govClientHeaders, govClientErrorMessages } = buildFraudHeaders(event, { bundleIds });
  const govTestScenarioHeader = getHeader(govClientHeaders, "Gov-Test-Scenario");
  errorMessages = errorMessages.concat(govClientErrorMessages || []);

  // periodKey will be resolved from obligations
  let normalizedPeriodKey = null;

  const responseHeaders = { ...govClientHeaders };

  // Non-authorization validation errors (collect field/header issues first)
  if (errorMessages.length > 0) {
    if (!hmrcAccessToken) errorMessages.push("Missing accessToken parameter from body");
    return buildValidationError(request, errorMessages, responseHeaders);
  }

  // Validate token format only after other validation passes
  try {
    validateHmrcAccessToken(hmrcAccessToken);
  } catch (err) {
    await recordSubmissionFailure({
      failure: "auth-expired",
      summary: "VAT return rejected: HMRC authorisation invalid",
      userSub,
    });
    // If token is explicitly unauthorized, return 401; otherwise return 400 with validation message only
    if (err instanceof UnauthorizedTokenError) {
      return http401UnauthorizedResponse({
        request,
        headers: { ...responseHeaders },
        message: err.message,
        error: {},
      });
    }
    return buildValidationError(request, [err.toString()], responseHeaders);
  }

  logger.info({ "Checking for test scenario": govTestScenarioHeader });
  if (govTestScenarioHeader === "SUBMIT_API_HTTP_500") {
    return http500ServerErrorResponse({
      request,
      headers: { ...responseHeaders },
      message: `Simulated server error for testing scenario: ${govTestScenarioHeader}`,
    });
  }

  // Detect poll vs initial request, and look up any persisted async record before doing
  // any work that depends on live HMRC state (periodKey resolution, token consumption).
  // After a successful submission HMRC flips the obligation status O→F, so re-resolving
  // the periodKey on a poll would 404 and surface a spurious error to the customer.
  const isInitialRequest = getHeader(event.headers, "x-initial-request") === "true";
  let persistedRequest = null;
  if (!isInitialRequest) {
    persistedRequest = await getAsyncRequest(userSub, requestId, asyncRequestsTableName);
  }

  if (!persistedRequest) {
    // Resolve periodKey from obligations using the period date range
    logger.info({ message: "Resolving periodKey from date range", periodStart, periodEnd, vatNumber });
    try {
      const { obligations, hmrcResponse } = await getVatObligations(
        vatNumber,
        hmrcAccessToken,
        govClientHeaders,
        govTestScenarioHeader,
        hmrcAccount,
        { from: periodStart, to: periodEnd, status: "O" },
        userSub,
        runFraudPreventionHeaderValidation,
        requestId,
        traceparent,
        correlationId,
      );

      if (!hmrcResponse.ok) {
        logger.error({ message: "Failed to fetch obligations for period resolution", status: hmrcResponse.status });
        await recordSubmissionFailure({
          failure: "obligation-lookup-failed",
          summary: "VAT return blocked: could not read obligations from HMRC",
          userSub,
          detail: { hmrcStatus: hmrcResponse.status },
        });
        return buildValidationError(request, [`Failed to resolve period key: HMRC returned ${hmrcResponse.status}`], responseHeaders);
      }

      // obligations is the full HMRC response body containing { obligations: [...] }
      const obligationsArray = obligations?.obligations || [];
      let resolvedPeriodKey = findPeriodKeyByDateRange(obligationsArray, periodStart, periodEnd);

      // If no matching obligation found and allowSandboxObligations is enabled (sandbox only),
      // use the first available open obligation instead of erroring
      if (!resolvedPeriodKey && allowSandboxObligations) {
        const openObligations = obligationsArray.filter((o) => o.status === "O");
        if (openObligations.length > 0) {
          const year = periodStart.substring(2, 4); // Get last two digits of year
          const rawPeriodKey = openObligations[0].periodKey;
          const last2DigitsOfPeriodKey = rawPeriodKey.substring(2, 4);
          resolvedPeriodKey = `${year}${last2DigitsOfPeriodKey}`;
          logger.info({
            message: "allowSandboxObligations: Using first available open obligation with the requested year injected",
            requestedPeriod: { periodStart, periodEnd },
            rawPeriodKey: rawPeriodKey,
            usedObligation: resolvedPeriodKey,
          });
        } else {
          // No open obligations at all so generate one using the 2 digits year and quarter from the requested periodStart
          const year = periodStart.substring(2, 4); // Get last two digits of year
          const month = parseInt(periodStart.substring(5, 7), 10); // Get month as integer
          const quarter = Math.floor((month - 1) / 3) + 1; // Calculate quarter (1-4)
          resolvedPeriodKey = `A${year}${quarter}`; // Format as 'AYYQ'
          logger.info({
            message: "allowSandboxObligations: No open obligations found, generating periodKey from periodStart",
            requestedPeriod: { periodStart, periodEnd },
            usedObligation: resolvedPeriodKey,
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
        await recordSubmissionFailure({
          failure: "obligation-not-matched",
          summary: "VAT return blocked: no open obligation for the requested period",
          userSub,
        });
        return buildValidationError(request, [`No open VAT obligation found for period ${periodStart} to ${periodEnd}`], responseHeaders);
      }

      normalizedPeriodKey = resolvedPeriodKey.toUpperCase();
      logger.info({ message: "Resolved periodKey from date range", periodStart, periodEnd, resolvedPeriodKey: normalizedPeriodKey });
    } catch (error) {
      logger.error({ message: "Error resolving periodKey from obligations", error: error.message });
      await recordSubmissionFailure({
        failure: "internal-error",
        summary: "VAT return failed while resolving the obligation period",
        userSub,
      });
      return http500ServerErrorResponse({
        request,
        headers: { ...responseHeaders },
        message: `Failed to resolve period key: ${error.message}`,
      });
    }
  }

  // Token enforcement: consume 1 token for VAT submission (the "value action") — initial request only
  if (isInitialRequest) {
    const activityId = "submit-vat";
    try {
      const { consumeTokenForActivity } = await import("../../services/tokenEnforcement.js");
      const { loadCatalogFromRoot } = await import("../../services/productCatalog.js");
      const catalog = loadCatalogFromRoot();
      const tokenResult = await consumeTokenForActivity(userSub, activityId, catalog);
      if (!tokenResult.consumed) {
        logger.info({ message: "Token enforcement blocked submission", activityId, reason: tokenResult.reason });
        await recordSubmissionFailure({
          failure: "tokens-exhausted",
          summary: "VAT return blocked: submission allowance used up",
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
        summary: "VAT return failed while checking the submission allowance",
        userSub,
      });
      return http500ServerErrorResponse({
        request,
        headers: { ...responseHeaders },
        message: "Token enforcement failed",
      });
    }
  }

  const waitTimeMs = parseInt(getHeader(event.headers, "x-wait-time-ms") || DEFAULT_WAIT_MS, 10);

  // trace: 2
  const payload = {
    vatNumber,
    periodKey: normalizedPeriodKey,
    vatReturnData,
    requestFormat,
    hmrcAccount,
    hmrcAccessToken,
    govClientHeaders,
    userSub,
    govTestScenarioHeader,
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
      // trace: 3
      const processor = async (payload) => {
        const { receipt, hmrcResponse, hmrcResponseBody } = await submitVat(
          payload.periodKey,
          payload.vatReturnData,
          payload.vatNumber,
          payload.hmrcAccount,
          payload.hmrcAccessToken,
          payload.govClientHeaders,
          payload.userSub,
          payload.govTestScenarioHeader,
          payload.runFraudPreventionHeaderValidation,
          payload.requestId,
          payload.traceparent,
          payload.correlationId,
        );

        const serializableHmrcResponse = {
          ok: hmrcResponse.ok,
          status: hmrcResponse.status,
          statusText: hmrcResponse.statusText,
          headers: {},
        };
        if (hmrcResponse.headers) {
          if (typeof hmrcResponse.headers.forEach === "function") {
            hmrcResponse.headers.forEach((v, k) => {
              serializableHmrcResponse.headers[k.toLowerCase()] = v;
            });
          } else {
            Object.keys(hmrcResponse.headers).forEach((k) => {
              serializableHmrcResponse.headers[k.toLowerCase()] = hmrcResponse.headers[k];
            });
          }
        }

        const resultData = {
          receipt,
          hmrcResponse: serializableHmrcResponse,
          hmrcResponseBody,
          periodKey: payload.periodKey, // Include resolved periodKey in response
        };

        if (!hmrcResponse.ok) {
          return resultData;
        }

        const formBundleNumber = receipt?.formBundleNumber ?? receipt?.formBundle;
        let receiptId;
        if (payload.userSub && formBundleNumber) {
          const timestamp = new Date().toISOString();
          receiptId = `${timestamp}-${formBundleNumber}`;
          await putReceipt(payload.userSub, receiptId, receipt);
          resultData.receiptId = receiptId;
        }

        return resultData;
      };

      // trace: 4
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
      logger.error({ message: "Unexpected error during VAT submission", error: error.message, stack: error.stack });
      await recordSubmissionFailure({
        failure: "internal-error",
        summary: "VAT return failed unexpectedly",
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

  if (result && result.hmrcResponse && !result.hmrcResponse.ok) {
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
    data: result,
  });
}

// SQS worker Lambda ingestHandler function
export async function workerHandler(event) {
  await initializeSalt();
  validateEnv([
    "HMRC_BASE_URI",
    "RECEIPTS_DYNAMODB_TABLE_NAME",
    "BUNDLE_DYNAMODB_TABLE_NAME",
    "HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME",
    "HMRC_VAT_RETURN_POST_ASYNC_REQUESTS_TABLE_NAME",
  ]);

  const asyncRequestsTableName = process.env.HMRC_VAT_RETURN_POST_ASYNC_REQUESTS_TABLE_NAME;

  logger.info({ message: "SQS Worker entry", recordCount: event.Records?.length });

  for (const record of event.Records || []) {
    let userSub;
    let requestId;
    // trace: 5
    let traceparent;
    let correlationId;
    try {
      const body = JSON.parse(record.body);
      userSub = body.userId;
      requestId = body.requestId;
      // trace: 6
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
      // trace: 7
      context.set("traceparent", traceparent);
      context.set("correlationId", correlationId);
      context.set("userSub", userSub);

      logger.info({ message: "Processing SQS message", userSub, requestId, messageId: record.messageId });

      // trace: 8
      const { receipt, hmrcResponse, hmrcResponseBody } = await submitVat(
        payload.periodKey,
        payload.vatReturnData,
        payload.vatNumber,
        payload.hmrcAccount,
        payload.hmrcAccessToken,
        payload.govClientHeaders,
        payload.userSub,
        payload.govTestScenarioHeader,
        payload.runFraudPreventionHeaderValidation,
        payload.requestId,
        payload.traceparent,
        payload.correlationId,
      );

      const serializableHmrcResponse = {
        ok: hmrcResponse.ok,
        status: hmrcResponse.status,
        statusText: hmrcResponse.statusText,
        headers: {},
      };
      if (hmrcResponse.headers) {
        if (typeof hmrcResponse.headers.forEach === "function") {
          hmrcResponse.headers.forEach((v, k) => {
            serializableHmrcResponse.headers[k.toLowerCase()] = v;
          });
        } else {
          Object.keys(hmrcResponse.headers).forEach((k) => {
            serializableHmrcResponse.headers[k.toLowerCase()] = hmrcResponse.headers[k];
          });
        }
      }

      const result = {
        receipt,
        hmrcResponse: serializableHmrcResponse,
        hmrcResponseBody,
        periodKey: payload.periodKey, // Include resolved periodKey in response
      };

      if (!hmrcResponse.ok) {
        // Distinguish retryable errors (e.g. 429, 503, 504)
        const isRetryable = [429, 503, 504].includes(hmrcResponse.status);
        if (isRetryable) {
          throw new Error(`HMRC temporary error ${hmrcResponse.status}: ${JSON.stringify(hmrcResponseBody)}`);
        }

        await asyncApiServices.complete({
          asyncRequestsTableName,
          requestId,
          userSub,
          result,
        });
        continue;
      }

      const formBundleNumber = receipt?.formBundleNumber ?? receipt?.formBundle;
      let receiptId;
      if (userSub && formBundleNumber) {
        const timestamp = new Date().toISOString();
        receiptId = `${timestamp}-${formBundleNumber}`;
        await putReceipt(userSub, receiptId, receipt);
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
        summary: "VAT return failed in the background worker",
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

// Service adaptor for aware of the downstream service but not the consuming Lambda's incoming/outgoing HTTP request/response
// trace: 9
export async function submitVat(
  periodKey,
  vatReturnData,
  vatNumber,
  hmrcAccount,
  hmrcAccessToken,
  govClientHeaders,
  auditForUserSub,
  govTestScenarioHeader,
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

  // Use the pre-built VAT return data (supports both legacy and 9-box formats)
  const hmrcRequestBody = {
    ...vatReturnData,
    periodKey, // Ensure normalized period key is used
  };
  let hmrcResponseBody;
  let hmrcResponse = {};

  const hmrcBase = hmrcAccount === "sandbox" ? process.env.HMRC_SANDBOX_BASE_URI : process.env.HMRC_BASE_URI;
  const hmrcRequestUrl = `${hmrcBase}/organisations/vat/${vatNumber}/returns`;
  /* v8 ignore start */
  if (govTestScenarioHeader === "SUBMIT_HMRC_API_HTTP_500") {
    logger.error({ message: `Simulated server error for testing scenario: ${govTestScenarioHeader}` });
    hmrcResponse.ok = false;
    hmrcResponse.status = 500;
  } else if (govTestScenarioHeader === "SUBMIT_HMRC_API_HTTP_503") {
    logger.error({ message: `Simulated server unavailable for testing scenario: ${govTestScenarioHeader}` });
    hmrcResponse.ok = false;
    hmrcResponse.status = 503;
  } else {
    if (govTestScenarioHeader === "SUBMIT_HMRC_API_HTTP_SLOW_10S") {
      // Strip Gov-Test-Scenario from headers to avoid triggering reject from HMRC
      delete hmrcRequestHeaders["Gov-Test-Scenario"];
      delete govClientHeaders["Gov-Test-Scenario"];
      const slowTime = 10000;
      logger.warn({ message: `Simulating slow HMRC API response for testing scenario (waiting...): ${govTestScenarioHeader}`, slowTime });
      await new Promise((resolve) => setTimeout(resolve, slowTime));
      logger.warn({ message: `Simulating slow HMRC API response for testing scenario (waited): ${govTestScenarioHeader}`, slowTime });
    }
    // trace: 10
    const hmrcRequestHeaders = buildHmrcHeaders(
      hmrcAccessToken,
      govClientHeaders,
      govTestScenarioHeader,
      requestId,
      traceparent,
      correlationId,
    );
    /* v8 ignore stop */
    logHmrcRequestDetails(hmrcRequestUrl, hmrcRequestHeaders, govClientHeaders, hmrcRequestBody);
    const httpResult = await hmrcHttpPost(hmrcRequestUrl, hmrcRequestHeaders, govClientHeaders, hmrcRequestBody, auditForUserSub);
    logger.info({ message: `Received HMRC response: ${JSON.stringify(httpResult.hmrcResponse)}`, httpResult });
    hmrcResponse = httpResult.hmrcResponse;
    hmrcResponseBody = httpResult.hmrcResponseBody;
  }

  const actor = resolveActorClass();
  if (hmrcResponse.ok) {
    emitSubmissionMetric("VatSubmissionSuccess", actor);
    await publishActivityEvent({
      event: "vat-return-submitted",
      summary: "VAT return submitted",
      actor,
    });
  } else {
    await recordSubmissionFailure({
      failure: "hmrc-rejected",
      summary: "VAT return rejected by HMRC",
      userSub: auditForUserSub,
      detail: { hmrcStatus: hmrcResponse.status },
    });
  }

  return { hmrcRequestBody, receipt: hmrcResponseBody, hmrcResponse, hmrcResponseBody, hmrcRequestUrl };
}

function logHmrcRequestDetails(hmrcRequestUrl, hmrcRequestHeaders, govClientHeaders, hmrcRequestBody) {
  logger.info({
    message: `Request to POST ${hmrcRequestUrl}`,
    url: hmrcRequestUrl,
    headers: {
      ...hmrcRequestHeaders,
      ...govClientHeaders,
    },
    body: hmrcRequestBody,
    environment: {
      // nodeEnv: process.env.NODE_ENV,
    },
  });
}
