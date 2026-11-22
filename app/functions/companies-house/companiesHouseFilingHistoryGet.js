// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/companies-house/companiesHouseFilingHistoryGet.js
// Public-data proxy for a company's filing history, every category, so the company lookup can list
// what the company has filed.

import { createLogger } from "../../lib/logger.js";
import { extractRequest, http200OkResponse, buildValidationError } from "../../lib/httpResponseHelper.js";
import { validateEnv } from "../../lib/env.js";
import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";
import { enforceBundles } from "../../services/bundleManagement.js";
import {
  companiesHouseFilingHistory,
  httpResponseFromCompaniesHouseResponse,
  isValidCompanyNumber,
  http403ForbiddenFromBundleEnforcement,
} from "../../services/companiesHouseApi.js";
import { publishActivityEvent } from "../../lib/activityAlert.js";
import { initializeSalt } from "../../services/subHasher.js";

const logger = createLogger({ source: "app/functions/companies-house/companiesHouseFilingHistoryGet.js" });

// Server hook for Express app, and construction of a Lambda-like event from HTTP request)
/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "get", "/api/v1/companies-house/company/:companyNumber/filing-history", ingestHandler);
  registerLambdaRoute(app, "head", "/api/v1/companies-house/company/:companyNumber/filing-history", ingestHandler);
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

// One filing as the register lists it: what was filed, when, and whether it has a document.
export function mapFiling(item) {
  return {
    transactionId: item.transaction_id,
    date: item.date,
    category: item.category,
    subcategory: item.subcategory,
    type: item.type,
    description: item.description,
    descriptionValues: item.description_values,
    actionDate: item.action_date,
    pages: item.pages,
    paperFiled: item.paper_filed === true,
    hasDocument: Boolean(item.links?.document_metadata),
  };
}

// HTTP request/response, aware Lambda ingestHandler function
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

  const chResponse = await companiesHouseFilingHistory(companyNumber);

  if (!chResponse.ok) {
    logger.warn({ message: "Companies House filing history lookup failed", companyNumber, status: chResponse.status });
    return httpResponseFromCompaniesHouseResponse(request, chResponse, responseHeaders);
  }

  await publishActivityEvent({
    event: "company-filing-history-viewed",
    summary: "Companies House filing history viewed",
    userSub,
  });

  return http200OkResponse({
    request,
    headers: { ...responseHeaders },
    data: {
      companyNumber,
      totalCount: chResponse.data.totalCount,
      truncated: chResponse.data.truncated,
      filings: chResponse.data.items.map(mapFiling),
    },
  });
}
