// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/functions/companies-house/companiesHouseRegisteredEmailEligibilityGet.js
// Checks whether a company can have its registered email address changed before the page lets
// the user go any further. This API changes an existing address, it does not set the first one,
// so the page must stop and say so when the eligibility check comes back anything other than
// COMPANY_VALID_FOR_SERVICE.

import { createLogger } from "../../lib/logger.js";
import {
  extractRequest,
  http200OkResponse,
  http400BadRequestResponse,
  http404NotFoundResponse,
  http401UnauthorizedResponse,
  buildValidationError,
} from "../../lib/httpResponseHelper.js";
import { validateEnv } from "../../lib/env.js";
import { buildHttpResponseFromLambdaResult, buildLambdaEventFromHttpRequest } from "../../lib/httpServerToLambdaAdaptor.js";
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

const logger = createLogger({ source: "app/functions/companies-house/companiesHouseRegisteredEmailEligibilityGet.js" });

// Server hook for Express app, and construction of a Lambda-like event from HTTP request)
/* v8 ignore start */
export function apiEndpoint(app) {
  app.get(
    "/api/v1/companies-house/company/:companyNumber/registered-email-address/eligibility",
    async (httpRequest, httpResponse) => {
      const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
      const lambdaResult = await ingestHandler(lambdaEvent);
      return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
    },
  );
  app.head(
    "/api/v1/companies-house/company/:companyNumber/registered-email-address/eligibility",
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
  const { valid, normalised } = isValidCompanyNumber(pathParams.companyNumber);
  if (!valid) {
    errorMessages.push("Invalid company number - must be 8 characters");
  }
  return { companyNumber: normalised };
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
  const { companyNumber } = extractAndValidateParameters(event, errorMessages);

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

  const { chResponse, eligibility } = await getRegisteredEmailEligibility(accessToken, companyNumber);

  if (chResponse.status === 404) {
    return http404NotFoundResponse({
      request,
      headers: { ...responseHeaders },
      message: "Company not found on the register",
      error: { companyNumber },
    });
  }

  if (chResponse.status === 400) {
    return http400BadRequestResponse({
      request,
      headers: { ...responseHeaders },
      message: "Companies House rejected the eligibility check",
      error: { companiesHouseResponseCode: chResponse.status, responseBody: chResponse.data },
    });
  }

  if (!chResponse.ok) {
    return httpResponseFromFilingResponse(request, chResponse, responseHeaders);
  }

  await publishActivityEvent({
    event: "companies-house-registered-email-eligibility-checked",
    summary: "Companies House registered email eligibility checked",
    userSub,
  });

  return http200OkResponse({
    request,
    headers: { ...responseHeaders },
    data: eligibility,
  });
}

// Service adaptor aware of the downstream service but not the consuming Lambda's incoming/outgoing HTTP request/response
export async function getRegisteredEmailEligibility(accessToken, companyNumber) {
  const chResponse = await companiesHouseFilingRequest(
    "GET",
    `/registered-email-address/company/${companyNumber}/eligibility`,
    { accessToken },
  );

  if (!chResponse.ok) {
    logger.warn({ message: "Companies House registered email eligibility check failed", companyNumber, status: chResponse.status });
    return { chResponse, eligibility: null };
  }

  const eligibility = { eligibilityStatusCode: chResponse.data.eligibility_status_code };

  return { chResponse, eligibility };
}
