// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/companies-house/companiesHouseTransactionPut.js

import { createLogger } from "../../lib/logger.js";
import {
  extractRequest,
  parseRequestBody,
  buildValidationError,
  http200OkResponse,
  http409ConflictResponse,
  http422UnprocessableEntityResponse,
  http500ServerErrorResponse,
  http401UnauthorizedResponse,
} from "../../lib/httpResponseHelper.js";
import { validateEnv } from "../../lib/env.js";
import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";
import { enforceBundles } from "../../services/bundleManagement.js";
import {
  companiesHouseFilingRequest,
  extractCompaniesHouseAccessTokenFromLambdaEvent,
  httpResponseFromFilingResponse,
  http403ForbiddenFromBundleEnforcement,
} from "../../services/companiesHouseFilingApi.js";
import { publishActivityEvent } from "../../lib/activityAlert.js";
import { initializeSalt } from "../../services/subHasher.js";

const logger = createLogger({ source: "app/functions/companies-house/companiesHouseTransactionPut.js" });

// Server hook for Express app, and construction of a Lambda-like event from HTTP request)
/* v8 ignore start */
// No HEAD registration here: this path is shared with companiesHouseTransactionGet.js (GET and
// PUT on the same "/transaction/{transactionId}"), which registers the HEAD route for it. A
// second app.head() on the same path would only ever be dead code behind the first, and API
// Gateway's own auto-HEAD route wiring (ApiStack.java) already dedupes the same way per path.
export function apiEndpoint(app) {
  registerLambdaRoute(app, "put", "/api/v1/companies-house/transaction/:transactionId", ingestHandler);
}
/* v8 ignore stop */

export function extractAndValidateParameters(event, errorMessages) {
  const pathParams = event.pathParameters || {};
  const transactionId = (pathParams.transactionId || "").trim();
  if (!transactionId) {
    errorMessages.push("Missing transactionId");
  }

  const parsedBody = parseRequestBody(event) || {};
  const { status } = parsedBody;
  if (status !== "closed") {
    errorMessages.push('status must be "closed" - this route only closes a transaction');
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

  const { chResponse } = await closeTransaction(accessToken, transactionId);

  // Neither filing this route closes is chargeable, so a 202 always means we built the wrong
  // transaction - treat it as an error rather than a filing outcome the page could act on.
  if (chResponse.status === 202) {
    return http500ServerErrorResponse({
      request,
      headers: { ...responseHeaders },
      message: "This filing needs a payment, which this service does not support",
      error: {
        companiesHouseResponseCode: chResponse.status,
        xPaymentRequired: chResponse.headers?.["x-payment-required"] || chResponse.headers?.["X-Payment-Required"],
      },
    });
  }

  if (chResponse.status === 422) {
    const validationErrors = (chResponse.data?.validationStatus?.errors || []).map((entry) => ({
      type: entry.type,
      error: entry.error,
      locationType: entry.location_type,
      location: entry.location,
      errorValues: entry.error_values,
    }));
    return http422UnprocessableEntityResponse({
      request,
      headers: { ...responseHeaders },
      data: { isValid: false, errors: validationErrors },
    });
  }

  if (chResponse.status === 403) {
    return http409ConflictResponse({
      request,
      headers: { ...responseHeaders },
      message: "The transaction is already closed",
      error: { transactionId },
    });
  }

  if (!chResponse.ok) {
    return httpResponseFromFilingResponse(request, chResponse, responseHeaders);
  }

  await publishActivityEvent({
    event: "companies-house-filing-submitted",
    summary: "Companies House filing submitted",
    userSub,
  });

  return http200OkResponse({
    request,
    headers: { ...responseHeaders },
    data: { transactionId, status: "closed" },
  });
}

// Service adaptor aware of the downstream service but not the consuming Lambda's incoming/outgoing HTTP request/response
export async function closeTransaction(accessToken, transactionId) {
  const chResponse = await companiesHouseFilingRequest("PUT", `/transactions/${transactionId}`, {
    accessToken,
    body: { status: "closed" },
  });

  if (!chResponse.ok && chResponse.status !== 422 && chResponse.status !== 403) {
    logger.warn({ message: "Companies House transaction close failed", transactionId, status: chResponse.status });
  }

  return { chResponse };
}
