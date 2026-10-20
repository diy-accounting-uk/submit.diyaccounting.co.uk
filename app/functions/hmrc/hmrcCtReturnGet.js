// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/hmrc/hmrcCtReturnGet.js
// Polls HMRC's Transaction Engine for the outcome of a submitted Company Tax Return. A poll inside
// the interval HMRC named answers from the stored record and sends nothing. The accepted result
// carries the IRmark receipt and writes a receipt so it lands on the receipts page.

import {
  extractRequest,
  http200OkResponse,
  http404NotFoundResponse,
  buildValidationError,
  http502BadGatewayResponse,
  getHeader,
} from "../../lib/httpResponseHelper.js";
import { validateEnv } from "../../lib/env.js";
import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";
import { createLogger } from "../../lib/logger.js";
import { enforceBundles } from "../../services/bundleManagement.js";
import { http403ForbiddenFromBundleEnforcement } from "../../services/companiesHouseApi.js";
import { pollCtSubmission } from "../../services/hmrcCtSubmissionStatus.js";
import { initializeSalt } from "../../services/subHasher.js";

const logger = createLogger({ source: "app/functions/hmrc/hmrcCtReturnGet.js" });

// Server hook for Express app, and construction of a Lambda-like event from HTTP request)
/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "get", "/api/v1/hmrc/ct/return/:correlationId", ingestHandler);
  registerLambdaRoute(app, "head", "/api/v1/hmrc/ct/return/:correlationId", ingestHandler);
}
/* v8 ignore stop */

export function extractAndValidateParameters(event, errorMessages) {
  const correlationId = ((event.pathParameters || {}).correlationId || "").trim();
  if (!/^[0-9A-F]{1,32}$/.test(correlationId)) {
    errorMessages.push("Invalid correlationId - must be upper-case hex, at most 32 characters");
  }
  return { correlationId };
}

// HTTP request/response, aware Lambda ingestHandler function
export async function ingestHandler(event) {
  await initializeSalt();
  validateEnv(["RECEIPTS_DYNAMODB_TABLE_NAME", "COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME"]);

  const { request } = extractRequest(event);
  const responseHeaders = { "Content-Type": "application/json" };

  let userSub;
  try {
    ({ userSub } = await enforceBundles(event));
  } catch (error) {
    return http403ForbiddenFromBundleEnforcement(error, request);
  }

  if (event?.requestContext?.http?.method === "HEAD") {
    return http200OkResponse({ request, headers: { ...responseHeaders }, data: {} });
  }

  const errorMessages = [];
  const { correlationId } = extractAndValidateParameters(event, errorMessages);
  if (errorMessages.length > 0) {
    return buildValidationError(request, errorMessages, responseHeaders);
  }

  // Forwarded so the simulator's Gov-Test-Scenario handling can be driven from the page's
  // developer-mode field; HMRC's services ignore headers they do not know.
  const govTestScenario = getHeader(event.headers, "Gov-Test-Scenario");
  let result;
  try {
    result = await pollCtSubmission({ userSub, correlationId, govTestScenario });
  } catch (error) {
    logger.error({ message: "Polling the Transaction Engine failed", correlationId, error: error.message, stack: error.stack });
    return http502BadGatewayResponse({
      request,
      headers: { ...responseHeaders },
      message: "HMRC could not be polled for this Company Tax Return",
      error: { correlationId, detail: error.message },
    });
  }

  if (result.notFound) {
    return http404NotFoundResponse({ request, headers: { ...responseHeaders }, message: "Submission not found" });
  }

  return http200OkResponse({ request, headers: { ...responseHeaders }, data: result.data });
}
