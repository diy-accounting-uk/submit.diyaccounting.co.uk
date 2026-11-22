// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/companies-house/companiesHouseLastAccountsGet.js
// The figures of a company's last filed accounts, mapped on the server from the register's newest
// set of accounts, for the accounts forms' prior-year column; or why there are none to give.

import { createLogger } from "../../lib/logger.js";
import { extractRequest, http200OkResponse, buildValidationError } from "../../lib/httpResponseHelper.js";
import { validateEnv } from "../../lib/env.js";
import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";
import { enforceBundles } from "../../services/bundleManagement.js";
import {
  httpResponseFromCompaniesHouseResponse,
  isValidCompanyNumber,
  http403ForbiddenFromBundleEnforcement,
} from "../../services/companiesHouseApi.js";
import { readLastAccounts } from "../../services/companiesHouseLastAccounts.js";
import { publishActivityEvent } from "../../lib/activityAlert.js";
import { initializeSalt } from "../../services/subHasher.js";

const logger = createLogger({ source: "app/functions/companies-house/companiesHouseLastAccountsGet.js" });

// Server hook for Express app, and construction of a Lambda-like event from HTTP request)
/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "get", "/api/v1/companies-house/company/:companyNumber/last-accounts", ingestHandler);
  registerLambdaRoute(app, "head", "/api/v1/companies-house/company/:companyNumber/last-accounts", ingestHandler);
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
  validateEnv(["COMPANIES_HOUSE_BASE_URI", "COMPANIES_HOUSE_DOCUMENT_BASE_URI"]);

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

  const { chResponse, outcome, set, accounts, reason } = await readLastAccounts(companyNumber);

  if (chResponse) {
    logger.warn({ message: "Companies House last accounts lookup failed", companyNumber, status: chResponse.status });
    return httpResponseFromCompaniesHouseResponse(request, chResponse, responseHeaders);
  }
  if (outcome === "unreadable") {
    logger.warn({ message: "Companies House last accounts did not read as accounts", companyNumber, reason });
  }

  await publishActivityEvent({
    event: "company-last-accounts-read",
    summary: "Companies House last accounts read for the prior year",
    userSub,
  });

  return http200OkResponse({
    request,
    headers: { ...responseHeaders },
    data: {
      companyNumber,
      outcome,
      ...(set ? { set } : {}),
      ...(accounts ? { accounts } : {}),
      ...(reason ? { reason } : {}),
    },
  });
}
