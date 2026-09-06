// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/functions/companies-house/companiesHouseTransactionPost.js

import { createLogger } from "../../lib/logger.js";
import {
  extractRequest,
  parseRequestBody,
  buildValidationError,
  http200OkResponse,
  http201CreatedResponse,
  http401UnauthorizedResponse,
} from "../../lib/httpResponseHelper.js";
import { validateEnv } from "../../lib/env.js";
import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";
import { enforceBundles } from "../../services/bundleManagement.js";
import { isValidCompanyNumber } from "../../services/companiesHouseApi.js";
import {
  companiesHouseFilingRequest,
  extractCompaniesHouseAccessTokenFromLambdaEvent,
  httpResponseFromFilingResponse,
  http403ForbiddenFromBundleEnforcement,
} from "../../services/companiesHouseFilingApi.js";
import { publishActivityEvent } from "../../lib/activityAlert.js";
import { initializeSalt } from "../../services/subHasher.js";

const logger = createLogger({ source: "app/functions/companies-house/companiesHouseTransactionPost.js" });

const MAX_DESCRIPTION_LENGTH = 200;

// Server hook for Express app, and construction of a Lambda-like event from HTTP request)
/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "post", "/api/v1/companies-house/transaction", ingestHandler);
  registerLambdaRoute(app, "head", "/api/v1/companies-house/transaction", ingestHandler);
}
/* v8 ignore stop */

export function extractAndValidateParameters(event, errorMessages) {
  const parsedBody = parseRequestBody(event) || {};
  const { companyNumber, description, reference } = parsedBody;

  const { valid, normalised } = isValidCompanyNumber(companyNumber);
  if (!valid) {
    errorMessages.push("Invalid company number - must be 8 characters");
  }

  const trimmedDescription = typeof description === "string" ? description.trim() : "";
  if (!trimmedDescription) {
    errorMessages.push("Missing description");
  } else if (trimmedDescription.length > MAX_DESCRIPTION_LENGTH) {
    errorMessages.push(`description must be at most ${MAX_DESCRIPTION_LENGTH} characters`);
  }

  return { companyNumber: normalised, description: trimmedDescription, reference };
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
  const { companyNumber, description, reference } = extractAndValidateParameters(event, errorMessages);

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

  const { chResponse, transaction } = await openTransaction(accessToken, companyNumber, description, reference);

  if (!chResponse.ok) {
    return httpResponseFromFilingResponse(request, chResponse, responseHeaders);
  }

  await publishActivityEvent({
    event: "companies-house-transaction-opened",
    summary: "Companies House transaction opened",
    userSub,
  });

  return http201CreatedResponse({
    request,
    headers: { ...responseHeaders },
    data: transaction,
  });
}

// Service adaptor aware of the downstream service but not the consuming Lambda's incoming/outgoing HTTP request/response
export async function openTransaction(accessToken, companyNumber, description, reference) {
  const chResponse = await companiesHouseFilingRequest("POST", "/transactions", {
    accessToken,
    body: {
      company_number: companyNumber,
      description,
      ...(reference !== undefined ? { reference } : {}),
    },
  });

  if (!chResponse.ok) {
    logger.warn({ message: "Companies House transaction open failed", companyNumber, status: chResponse.status });
    return { chResponse, transaction: null };
  }

  const data = chResponse.data;
  const transaction = {
    transactionId: data.id,
    status: data.status,
    companyNumber: data.company_number,
    companyName: data.company_name,
    links: data.links,
  };

  return { chResponse, transaction };
}
