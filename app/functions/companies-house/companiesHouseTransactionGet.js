// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/functions/companies-house/companiesHouseTransactionGet.js

import { createLogger } from "../../lib/logger.js";
import {
  extractRequest,
  http200OkResponse,
  http404NotFoundResponse,
  http401UnauthorizedResponse,
  buildValidationError,
} from "../../lib/httpResponseHelper.js";
import { validateEnv } from "../../lib/env.js";
import { buildHttpResponseFromLambdaResult, buildLambdaEventFromHttpRequest } from "../../lib/httpServerToLambdaAdaptor.js";
import { enforceBundles } from "../../services/bundleManagement.js";
import {
  companiesHouseFilingRequest,
  extractCompaniesHouseAccessTokenFromLambdaEvent,
  httpResponseFromFilingResponse,
  http403ForbiddenFromBundleEnforcement,
} from "../../services/companiesHouseFilingApi.js";
import { publishActivityEvent } from "../../lib/activityAlert.js";
import { initializeSalt } from "../../services/subHasher.js";

const logger = createLogger({ source: "app/functions/companies-house/companiesHouseTransactionGet.js" });

// Server hook for Express app, and construction of a Lambda-like event from HTTP request)
/* v8 ignore start */
export function apiEndpoint(app) {
  app.get("/api/v1/companies-house/transaction/:transactionId", async (httpRequest, httpResponse) => {
    const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
    const lambdaResult = await ingestHandler(lambdaEvent);
    return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
  });
  app.head("/api/v1/companies-house/transaction/:transactionId", async (httpRequest, httpResponse) => {
    const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
    const lambdaResult = await ingestHandler(lambdaEvent);
    return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
  });
}
/* v8 ignore stop */

export function extractAndValidateParameters(event, errorMessages) {
  const pathParams = event.pathParameters || {};
  const transactionId = (pathParams.transactionId || "").trim();
  if (!transactionId) {
    errorMessages.push("Missing transactionId");
  }
  return { transactionId };
}

// HTTP request/response, aware Lambda ingestHandler function
export async function ingestHandler(event) {
  await initializeSalt();
  validateEnv(["COMPANIES_HOUSE_FILING_BASE_URI"]);

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
  const { transactionId } = extractAndValidateParameters(event, errorMessages);

  if (errorMessages.length > 0) {
    return buildValidationError(request, errorMessages, responseHeaders);
  }

  const accessToken = extractCompaniesHouseAccessTokenFromLambdaEvent(event);
  if (!accessToken) {
    return http401UnauthorizedResponse({
      request,
      headers: { ...responseHeaders },
      message: "Missing Companies House access token",
      error: { code: "COMPANIES_HOUSE_UNAUTHORIZED" },
    });
  }

  const { chResponse, transaction } = await getTransaction(accessToken, transactionId);

  if (chResponse.status === 404) {
    return http404NotFoundResponse({
      request,
      headers: { ...responseHeaders },
      message: "Companies House transaction not found",
      error: { transactionId },
    });
  }

  if (!chResponse.ok) {
    return httpResponseFromFilingResponse(request, chResponse, responseHeaders);
  }

  await publishActivityEvent({
    event: "companies-house-transaction-viewed",
    summary: "Companies House transaction viewed",
    userSub,
  });

  return http200OkResponse({
    request,
    headers: { ...responseHeaders },
    data: transaction,
  });
}

// Service adaptor aware of the downstream service but not the consuming Lambda's incoming/outgoing HTTP request/response
export async function getTransaction(accessToken, transactionId) {
  const chResponse = await companiesHouseFilingRequest("GET", `/transactions/${transactionId}`, { accessToken });

  if (!chResponse.ok) {
    logger.warn({ message: "Companies House transaction lookup failed", transactionId, status: chResponse.status });
    return { chResponse, transaction: null };
  }

  const data = chResponse.data;
  // `filings` on the wire is an object keyed by submission id; map its values into an array
  // and carry the key as `id` so the page can render a stable list.
  const filings = Object.entries(data.filings || {}).map(([id, filing]) => ({
    id,
    type: filing.type,
    description: filing.description,
    status: filing.status,
    rejectReasons: filing.reject_reasons,
    processedAt: filing.processed_at,
  }));

  const transaction = {
    transactionId: data.id,
    status: data.status,
    companyNumber: data.company_number,
    companyName: data.company_name,
    createdAt: data.created_at,
    closedAt: data.closed_at,
    filings,
  };

  return { chResponse, transaction };
}
