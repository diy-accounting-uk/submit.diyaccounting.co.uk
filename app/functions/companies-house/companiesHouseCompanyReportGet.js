// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/companies-house/companiesHouseCompanyReportGet.js
// One route for every company report: GET /api/v1/companies-house/company/{companyNumber}/reports/{report}.
// Each report is a module that reads the register through the shared Companies House cache; the
// route checks the activity, the company number and the report's name, and answers JSON for every
// outcome.

import { createLogger } from "../../lib/logger.js";
import {
  extractRequest,
  http200OkResponse,
  http404NotFoundResponse,
  http500ServerErrorResponse,
  buildValidationError,
} from "../../lib/httpResponseHelper.js";
import { validateEnv } from "../../lib/env.js";
import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";
import { enforceBundles } from "../../services/bundleManagement.js";
import { LOOKUP_CALLS, lookupLimitResponse, lookupRefusalSeconds } from "../../services/companiesHouseLookupLimit.js";
import { isValidCompanyNumber, http403ForbiddenFromBundleEnforcement } from "../../services/companiesHouseApi.js";
import { withCompaniesHouseCallLimit } from "../../services/companiesHouseCache.js";
import { initializeSalt } from "../../services/subHasher.js";

const logger = createLogger({ source: "app/functions/companies-house/companiesHouseCompanyReportGet.js" });

// The reports the route answers, by the name in its path.
export const REPORT_NAMES = ["filings", "people", "capital", "charges", "history", "accounts"];

// Each report's module: (companyNumber) => Promise<object>. A report named here with no module yet
// answers 404 as an unknown report does. The route runs a module under a limit of the calls it
// charges the account for, so a module that reads more lists than that gets a partial answer.
export const REPORT_MODULES = {};

/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "get", "/api/v1/companies-house/company/:companyNumber/reports/:report", ingestHandler);
}
/* v8 ignore stop */

export function extractAndValidateParameters(event, errorMessages) {
  const pathParams = event.pathParameters || {};
  const { valid, normalised } = isValidCompanyNumber(pathParams.companyNumber);
  if (!valid) errorMessages.push("Invalid company number - must be 8 characters");
  return { companyNumber: normalised, report: String(pathParams.report || "") };
}

export async function ingestHandler(event) {
  await initializeSalt();
  validateEnv(["COMPANIES_HOUSE_BASE_URI"]);

  const { request } = extractRequest(event);
  const responseHeaders = { "Content-Type": "application/json" };

  let userSub;
  try {
    ({ userSub } = await enforceBundles(event));
  } catch (error) {
    return http403ForbiddenFromBundleEnforcement(error, request);
  }

  const errorMessages = [];
  const { companyNumber, report } = extractAndValidateParameters(event, errorMessages);
  if (errorMessages.length > 0) return buildValidationError(request, errorMessages, responseHeaders);

  const buildReport = REPORT_NAMES.includes(report) ? REPORT_MODULES[report] : undefined;
  if (!buildReport) {
    return http404NotFoundResponse({
      request,
      headers: { ...responseHeaders },
      message: `No company report named ${report}`,
      error: { reason: "unknown_report", reports: REPORT_NAMES },
    });
  }

  const refusalSeconds = await lookupRefusalSeconds(userSub, LOOKUP_CALLS.report);
  if (refusalSeconds) return lookupLimitResponse(request, responseHeaders, refusalSeconds);

  try {
    const data = await withCompaniesHouseCallLimit(LOOKUP_CALLS.report, () => buildReport(companyNumber));
    return http200OkResponse({ request, headers: { ...responseHeaders }, data: { companyNumber, report, ...data } });
  } catch (error) {
    logger.error({ message: "Company report failed", report, error: error.message });
    return http500ServerErrorResponse({ request, headers: { ...responseHeaders }, message: "The company report could not be built" });
  }
}
