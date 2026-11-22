// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/companies-house/companiesHouseFormStatusGet.js
// Polls the Companies House XML Gateway for the outcome of one form filed through the shared
// filing route, for each form whose row in web/public/lib/companies-house-forms.js says sharedPoll:
// GET /api/v1/companies-house/forms/{kind}/{submissionNumber}. The kind in the path is the form's,
// so its catalogue activity's path decides the bundle the poll needs.

import { extractRequest, http200OkResponse, buildValidationError, getHeader } from "../../lib/httpResponseHelper.js";
import { validateEnv } from "../../lib/env.js";
import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";
import { enforceBundles } from "../../services/bundleManagement.js";
import { http403ForbiddenFromBundleEnforcement } from "../../services/companiesHouseApi.js";
import { answerSubmissionPoll } from "../../services/companiesHouseSubmissionPollAnswer.js";
import { initializeSalt } from "../../services/subHasher.js";
import { readOwnPresenterFromHeaders } from "../../services/companiesHouseOwnPresenter.js";
import { COMPANIES_HOUSE_FORMS } from "../../../web/public/lib/companies-house-forms.js";

const SUBMISSION_NUMBER_LENGTH = 6;

// Server hook for Express app, and construction of a Lambda-like event from HTTP request)
/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "get", "/api/v1/companies-house/forms/:kind/:submissionNumber", ingestHandler);
  registerLambdaRoute(app, "head", "/api/v1/companies-house/forms/:kind/:submissionNumber", ingestHandler);
}
/* v8 ignore stop */

export function extractAndValidateParameters(event, errorMessages) {
  const pathParams = event.pathParameters || {};
  const kind = String(pathParams.kind || "");
  if (!COMPANIES_HOUSE_FORMS[kind]?.sharedPoll) {
    errorMessages.push("Invalid kind - must be a form polled through this route");
  }
  const submissionNumber = (pathParams.submissionNumber || "").trim();
  if (submissionNumber.length !== SUBMISSION_NUMBER_LENGTH) {
    errorMessages.push(`Invalid submissionNumber - must be ${SUBMISSION_NUMBER_LENGTH} characters`);
  }
  return { kind, submissionNumber };
}

// HTTP request/response, aware Lambda ingestHandler function
export async function ingestHandler(event) {
  await initializeSalt();
  validateEnv(["COMPANIES_HOUSE_XMLGW_URI", "RECEIPTS_DYNAMODB_TABLE_NAME", "COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME"]);

  const { request } = extractRequest(event);
  const responseHeaders = { "Content-Type": "application/json" };

  const errorMessages = [];
  const { kind, submissionNumber } = extractAndValidateParameters(event, errorMessages);
  // The kind is checked before the bundle check, so a path no form's activity covers is refused
  // here and never reaches a check that knows no activity for it.
  if (errorMessages.length > 0) {
    return buildValidationError(request, errorMessages, responseHeaders);
  }

  let userSub;
  try {
    ({ userSub } = await enforceBundles(event));
  } catch (error) {
    return http403ForbiddenFromBundleEnforcement(error, request);
  }

  if (event?.requestContext?.http?.method === "HEAD") {
    return http200OkResponse({ request, headers: { ...responseHeaders }, data: {} });
  }

  const ownPresenter = readOwnPresenterFromHeaders(event.headers, errorMessages);
  if (errorMessages.length > 0) {
    return buildValidationError(request, errorMessages, responseHeaders);
  }

  // Forwarded to the gateway call so the simulator's Gov-Test-Scenario handling can be driven
  // from the page's developer-mode field; the real gateway ignores headers it does not know.
  const govTestScenario = getHeader(event.headers, "Gov-Test-Scenario");
  return answerSubmissionPoll({
    request,
    responseHeaders,
    poll: { userSub, submissionNumber, govTestScenario, ownPresenter, kind },
  });
}
