// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/functions/companies-house/companiesHouseRegisteredEmailAddressPost.js
// Adds a registered email address change resource to an open transaction. Unlike the office
// address filing there is no reference_etag: the body is just the new address and the section
// 88A(2) statement.

import { createLogger } from "../../lib/logger.js";
import {
  extractRequest,
  parseRequestBody,
  buildValidationError,
  http200OkResponse,
  http201CreatedResponse,
  http409ConflictResponse,
  http401UnauthorizedResponse,
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

const logger = createLogger({ source: "app/functions/companies-house/companiesHouseRegisteredEmailAddressPost.js" });

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Server hook for Express app, and construction of a Lambda-like event from HTTP request)
/* v8 ignore start */
export function apiEndpoint(app) {
  app.post(
    "/api/v1/companies-house/transaction/:transactionId/registered-email-address",
    async (httpRequest, httpResponse) => {
      const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
      const lambdaResult = await ingestHandler(lambdaEvent);
      return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
    },
  );
  app.head(
    "/api/v1/companies-house/transaction/:transactionId/registered-email-address",
    async (httpRequest, httpResponse) => {
      const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
      const lambdaResult = await ingestHandler(lambdaEvent);
      return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
    },
  );
}
/* v8 ignore stop */

export function extractAndValidateParameters(event, errorMessages) {
  const pathParams = event.pathParameters || {};
  const transactionId = (pathParams.transactionId || "").trim();
  if (!transactionId) {
    errorMessages.push("Missing transactionId");
  }

  const parsedBody = parseRequestBody(event) || {};
  const { registeredEmailAddress, acceptAppropriateEmailAddressStatement } = parsedBody;

  if (!registeredEmailAddress || !EMAIL_SHAPE.test(String(registeredEmailAddress).trim())) {
    errorMessages.push("Missing or invalid registeredEmailAddress");
  }

  if (acceptAppropriateEmailAddressStatement !== true) {
    errorMessages.push("The user must accept the section 88A(2) appropriate email address statement");
  }

  return { transactionId, registeredEmailAddress, acceptAppropriateEmailAddressStatement };
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
  const parameters = extractAndValidateParameters(event, errorMessages);

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

  const { chResponse, resource } = await putRegisteredEmailAddress(accessToken, parameters);

  // A 403 here carries two different meanings on this resource: the transaction is closed, or
  // the company has no registered email address yet (this API changes an existing address, it
  // does not set the first one). Both map to our 409, with the upstream body passed through so
  // the page can tell the user which one happened.
  if (chResponse.status === 403) {
    return http409ConflictResponse({
      request,
      headers: { ...responseHeaders },
      message: "The transaction is closed, or the company has no registered email address to change",
      error: { responseBody: chResponse.data },
    });
  }

  if (!chResponse.ok) {
    return httpResponseFromFilingResponse(request, chResponse, responseHeaders);
  }

  await publishActivityEvent({
    event: "companies-house-registered-email-address-filed",
    summary: "Companies House registered email address change filed",
    userSub,
  });

  return http201CreatedResponse({
    request,
    headers: { ...responseHeaders },
    data: resource,
  });
}

// Service adaptor aware of the downstream service but not the consuming Lambda's incoming/outgoing HTTP request/response
export async function putRegisteredEmailAddress(accessToken, parameters) {
  const { transactionId, registeredEmailAddress, acceptAppropriateEmailAddressStatement } = parameters;
  const chResponse = await companiesHouseFilingRequest("POST", `/transactions/${transactionId}/registered-email-address`, {
    accessToken,
    body: {
      registered_email_address: registeredEmailAddress,
      accept_appropriate_email_address_statement: acceptAppropriateEmailAddressStatement,
    },
  });

  if (!chResponse.ok) {
    logger.warn({ message: "Companies House registered email address filing failed", transactionId, status: chResponse.status });
    return { chResponse, resource: null };
  }

  const data = chResponse.data?.data || {};
  const resource = {
    registeredEmailAddress: data.registered_email_address,
    acceptAppropriateEmailAddressStatement: data.accept_appropriate_email_address_statement,
    etag: data.etag,
    kind: data.kind,
    createdAt: data.created_at,
    links: chResponse.data?.links,
  };

  return { chResponse, resource };
}
