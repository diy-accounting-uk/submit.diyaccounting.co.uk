// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/functions/companies-house/companiesHouseSearchGet.js

import { createLogger } from "../../lib/logger.js";
import { extractRequest, http200OkResponse, buildValidationError } from "../../lib/httpResponseHelper.js";
import { validateEnv } from "../../lib/env.js";
import { buildHttpResponseFromLambdaResult, buildLambdaEventFromHttpRequest } from "../../lib/httpServerToLambdaAdaptor.js";
import { enforceBundles } from "../../services/bundleManagement.js";
import {
  companiesHouseHttpGet,
  httpResponseFromCompaniesHouseResponse,
  http403ForbiddenFromBundleEnforcement,
} from "../../services/companiesHouseApi.js";
import { publishActivityEvent } from "../../lib/activityAlert.js";
import { initializeSalt } from "../../services/subHasher.js";

const logger = createLogger({ source: "app/functions/companies-house/companiesHouseSearchGet.js" });

const DEFAULT_ITEMS_PER_PAGE = 20;
const MIN_ITEMS_PER_PAGE = 1;
const MAX_ITEMS_PER_PAGE = 50;
const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 160;

// Server hook for Express app, and construction of a Lambda-like event from HTTP request)
/* v8 ignore start */
export function apiEndpoint(app) {
  app.get("/api/v1/companies-house/search", async (httpRequest, httpResponse) => {
    const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
    const lambdaResult = await ingestHandler(lambdaEvent);
    return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
  });
  app.head("/api/v1/companies-house/search", async (httpRequest, httpResponse) => {
    const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
    const lambdaResult = await ingestHandler(lambdaEvent);
    return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
  });
}
/* v8 ignore stop */

export function extractAndValidateParameters(event, errorMessages) {
  const queryParams = event.queryStringParameters || {};
  const { q, itemsPerPage: itemsPerPageRaw, startIndex: startIndexRaw } = queryParams;

  const trimmedQuery = (q || "").trim();
  if (trimmedQuery.length < MIN_QUERY_LENGTH || trimmedQuery.length > MAX_QUERY_LENGTH) {
    errorMessages.push(`Search term must be between ${MIN_QUERY_LENGTH} and ${MAX_QUERY_LENGTH} characters`);
  }

  let itemsPerPage = itemsPerPageRaw !== undefined ? parseInt(itemsPerPageRaw, 10) : DEFAULT_ITEMS_PER_PAGE;
  if (Number.isNaN(itemsPerPage)) itemsPerPage = DEFAULT_ITEMS_PER_PAGE;
  itemsPerPage = Math.min(MAX_ITEMS_PER_PAGE, Math.max(MIN_ITEMS_PER_PAGE, itemsPerPage));

  let startIndex = startIndexRaw !== undefined ? parseInt(startIndexRaw, 10) : 0;
  if (Number.isNaN(startIndex) || startIndex < 0) {
    errorMessages.push("startIndex must be a non-negative integer");
    startIndex = 0;
  }

  return { q: trimmedQuery, itemsPerPage, startIndex };
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
  const { q, itemsPerPage, startIndex } = extractAndValidateParameters(event, errorMessages);

  if (errorMessages.length > 0) {
    return buildValidationError(request, errorMessages, responseHeaders);
  }

  const { chResponse, results } = await searchCompanies(q, { itemsPerPage, startIndex });

  if (!chResponse.ok) {
    return httpResponseFromCompaniesHouseResponse(request, chResponse, responseHeaders);
  }

  await publishActivityEvent({
    event: "company-search-run",
    summary: "Companies House search run",
    userSub,
  });

  return http200OkResponse({
    request,
    headers: { ...responseHeaders },
    data: results,
  });
}

// Service adaptor aware of the downstream service but not the consuming Lambda's incoming/outgoing HTTP request/response
export async function searchCompanies(query, { itemsPerPage, startIndex } = {}) {
  const chResponse = await companiesHouseHttpGet("/search/companies", {
    q: query,
    items_per_page: itemsPerPage,
    start_index: startIndex,
  });

  if (!chResponse.ok) {
    logger.warn({ message: "Companies House search failed", status: chResponse.status });
    return { chResponse, results: null };
  }

  const items = (chResponse.data.items || []).map((item) => ({
    companyNumber: item.company_number,
    title: item.title,
    companyStatus: item.company_status,
    companyType: item.company_type,
    dateOfCreation: item.date_of_creation,
    addressSnippet: item.address_snippet,
  }));

  const results = {
    totalResults: chResponse.data.total_results ?? items.length,
    itemsPerPage: chResponse.data.items_per_page ?? itemsPerPage,
    startIndex: chResponse.data.start_index ?? startIndex,
    items,
  };

  return { chResponse, results };
}
