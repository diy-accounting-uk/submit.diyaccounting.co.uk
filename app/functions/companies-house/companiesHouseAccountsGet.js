// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/companies-house/companiesHouseAccountsGet.js
// Polls the Companies House XML Gateway for the outcome of a submitted accounts filing. The
// gateway itself is the source of truth for status, so every call polls it directly rather than
// trusting a cached "already accepted" record; an accepted filing writes a receipt so it lands on
// the existing receipts page.

import { createLogger } from "../../lib/logger.js";
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
import {
  buildStatusRequest,
  resolvePresenterCredentials,
  postToGateway,
  parseGatewayResponse,
} from "../../services/companiesHouseXmlGateway.js";
import { putAsyncRequest, getAsyncRequest } from "../../data/dynamoDbAsyncRequestRepository.js";
import { putReceipt } from "../../data/dynamoDbReceiptRepository.js";
import { publishActivityEvent, resolveActorClass } from "../../lib/activityAlert.js";
import { initializeSalt } from "../../services/subHasher.js";

const logger = createLogger({ source: "app/functions/companies-house/companiesHouseAccountsGet.js" });

const SUBMISSION_NUMBER_LENGTH = 6;

// Server hook for Express app, and construction of a Lambda-like event from HTTP request)
/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "get", "/api/v1/companies-house/accounts/:submissionNumber", ingestHandler);
  registerLambdaRoute(app, "head", "/api/v1/companies-house/accounts/:submissionNumber", ingestHandler);
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

  const asyncRequestsTableName = process.env.COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME;
  const persistedRequest = await getAsyncRequest(userSub, submissionNumber, asyncRequestsTableName);

  if (persistedRequest?.status === "completed" || persistedRequest?.status === "failed") {
    return http200OkResponse({
      request,
      headers: { ...responseHeaders },
      data: persistedRequest.data,
    });
  }

  const { presenterId, presenterCode } = await resolvePresenterCredentials();
  const statusRequestXml = buildStatusRequest({ presenterId, presenterCode, submissionNumber });
  // Forwarded to the gateway call so the simulator's Gov-Test-Scenario handling can be driven
  // from the page's developer-mode field; the real gateway ignores headers it does not know.
  const govTestScenario = getHeader(event.headers, "Gov-Test-Scenario");
  const gatewayResponse = await postToGateway(statusRequestXml, govTestScenario ? { "Gov-Test-Scenario": govTestScenario } : {});
  const parsed = parseGatewayResponse(gatewayResponse.data);

  if (parsed.errors?.length) {
    logger.error({ message: "Companies House gateway returned errors while polling", submissionNumber, errors: parsed.errors });
    return http500ServerErrorResponse({
      request,
      headers: { ...responseHeaders },
      message: "Companies House gateway returned an error while polling this submission",
      error: { submissionNumber, errors: parsed.errors },
    });
  }

  // parseGatewayResponse() carries every Status element it found; a GetSubmissionStatus poll for
  // one submission number always answers with exactly one.
  const status = parsed.statuses[0];

  if (status.statusCode === "REJECT") {
    await putAsyncRequest(userSub, submissionNumber, "failed", status, asyncRequestsTableName);
    return http200OkResponse({ request, headers: { ...responseHeaders }, data: status });
  }

  if (status.statusCode === "ACCEPT") {
    const receiptId = `${new Date().toISOString()}-${submissionNumber}`;
    await putReceipt(userSub, receiptId, status, resolveActorClass());
    const data = { ...status, receiptId };
    await putAsyncRequest(userSub, submissionNumber, "completed", data, asyncRequestsTableName);
    await publishActivityEvent({
      event: "companies-house-accounts-accepted",
      summary: "Companies House micro-entity accounts accepted",
      userSub,
    });
    return http200OkResponse({ request, headers: { ...responseHeaders }, data });
  }

  // PENDING or PARKED: leave the request state as-is and hand the current snapshot back so the
  // page can keep polling.
  return http200OkResponse({ request, headers: { ...responseHeaders }, data: status });
}
