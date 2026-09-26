// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/companies-house/companiesHousePscVerificationStatementGet.js
// Polls the Companies House XML Gateway for the outcome of a submitted PSC verification
// statement, through the poll logic companiesHouseConfirmationStatementGet.js shares via
// companiesHouseSubmissionStatus.js.

import {
  extractRequest,
  http200OkResponse,
  buildValidationError,
  http500ServerErrorResponse,
  getHeader,
} from "../../lib/httpResponseHelper.js";
import { validateEnv } from "../../lib/env.js";
import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";
import { enforceBundles } from "../../services/bundleManagement.js";
import { http403ForbiddenFromBundleEnforcement } from "../../services/companiesHouseApi.js";
import { pollSubmission } from "../../services/companiesHouseSubmissionStatus.js";
import { initializeSalt } from "../../services/subHasher.js";

const SUBMISSION_NUMBER_LENGTH = 6;

// Server hook for Express app, and construction of a Lambda-like event from HTTP request)
/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "get", "/api/v1/companies-house/psc-verification-statement/:submissionNumber", ingestHandler);
  registerLambdaRoute(app, "head", "/api/v1/companies-house/psc-verification-statement/:submissionNumber", ingestHandler);
}
/* v8 ignore stop */

export function extractAndValidateParameters(event, errorMessages) {
  const pathParams = event.pathParameters || {};
  const submissionNumber = (pathParams.submissionNumber || "").trim();
  if (submissionNumber.length !== SUBMISSION_NUMBER_LENGTH) {
    errorMessages.push(`Invalid submissionNumber - must be ${SUBMISSION_NUMBER_LENGTH} characters`);
  }
  return { submissionNumber };
}

// HTTP request/response, aware Lambda ingestHandler function
export async function ingestHandler(event) {
  await initializeSalt();
  validateEnv(["COMPANIES_HOUSE_XMLGW_URI", "RECEIPTS_DYNAMODB_TABLE_NAME", "COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME"]);

  const { request } = extractRequest(event);
  const responseHeaders = { "Content-Type": "application/json" };

  let userSub;
  try {
    ({ userSub } = await enforceBundles(event));
  } catch (error) {
    return http403ForbiddenFromBundleEnforcement(error, request);
  }

  if (event?.requestContext?.http?.method === "HEAD") {
    return http200OkResponse({
      request,
      headers: { ...responseHeaders },
      data: {},
    });
  }

  const errorMessages = [];
  const { submissionNumber } = extractAndValidateParameters(event, errorMessages);

  if (errorMessages.length > 0) {
    return buildValidationError(request, errorMessages, responseHeaders);
  }

  // Forwarded to the gateway call so the simulator's Gov-Test-Scenario handling can be driven
  // from the page's developer-mode field; the real gateway ignores headers it does not know.
  const govTestScenario = getHeader(event.headers, "Gov-Test-Scenario");
  const result = await pollSubmission({
    userSub,
    submissionNumber,
    govTestScenario,
    kind: "psc-verification-statement",
    acceptedEvent: "companies-house-psc-verification-statement-accepted",
    acceptedSummary: "Companies House PSC verification statement accepted",
  });

  if (result.errors) {
    return http500ServerErrorResponse({
      request,
      headers: { ...responseHeaders },
      message: "Companies House gateway returned an error while polling this submission",
      error: { submissionNumber, errors: result.errors },
    });
  }

  return http200OkResponse({ request, headers: { ...responseHeaders }, data: result.data });
}
