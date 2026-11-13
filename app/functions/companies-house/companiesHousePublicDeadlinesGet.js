// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability CH-20 Look up a company's filing deadlines with no sign-in
// - **Use when:** a director with no account wants to know when a company's accounts and confirmation statement are next due.
// - **Does:** companiesHousePublicDeadlinesGet.js answers GET /api/v1/public/company-deadlines with no authorizer. `number` returns one company's name, status, type, accounts due date and period, confirmation statement due date and last accounts type. `q` returns up to five matches by name or number. Every field is copied by name from the Companies House answer. It uses the one Companies House API key, writes the PublicCompanyDeadlines metrics, and sets Cache-Control on a found answer so CloudFront keeps it for ten minutes.
// - **Run:** `curl 'https://submit.diyaccounting.co.uk/api/v1/public/company-deadlines?number=00000006'`
// - **Entry:** `app/functions/companies-house/companiesHousePublicDeadlinesGet.js:ingestHandler`
// - **Files:** app/functions/companies-house/companiesHousePublicDeadlinesGet.js, app/unit-tests/functions/companiesHousePublicDeadlinesGet.test.js, web/public/company-filing-deadlines.html, web/public/lib/company-deadlines.js, infra/main/java/co/uk/diyaccounting/submit/stacks/EdgeStack.java
// - **Keywords:** company filing deadlines, accounts due, confirmation statement due, public lookup, no sign-in, companies house, cache, rate limit
// - **Related:** CH-03, CH-04
// @end-capability

// app/functions/companies-house/companiesHousePublicDeadlinesGet.js

import { createLogger } from "../../lib/logger.js";
import {
  extractRequest,
  http200OkResponse,
  http400BadRequestResponse,
  http404NotFoundResponse,
  http429TooManyRequestsResponse,
  http502BadGatewayResponse,
} from "../../lib/httpResponseHelper.js";
import { validateEnv } from "../../lib/env.js";
import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";
import { emitMetric } from "../../lib/emfMetrics.js";
import { companiesHouseHttpGet, isValidCompanyNumber } from "../../services/companiesHouseApi.js";

const logger = createLogger({ source: "app/functions/companies-house/companiesHousePublicDeadlinesGet.js" });

export const METRICS_NAMESPACE = "Submit/Business";
export const ORIGIN_REQUEST_METRIC = "PublicCompanyDeadlinesOriginRequest";
export const COMPANIES_HOUSE_429_METRIC = "PublicCompanyDeadlinesCompaniesHouse429";

const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 100;
const MAX_MATCHES = 5;
// CloudFront keeps a found answer this long. Companies House dates change only when a filing is
// accepted, so ten minutes shows a new filing quickly and cuts the calls on a popular company.
export const FOUND_CACHE_SECONDS = 600;
const RETRY_AFTER_SECONDS = 300;

/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "get", "/api/v1/public/company-deadlines", ingestHandler);
  registerLambdaRoute(app, "head", "/api/v1/public/company-deadlines", ingestHandler);
}
/* v8 ignore stop */

function countOriginRequest(kind, outcome) {
  emitMetric({ namespace: METRICS_NAMESPACE, metricName: ORIGIN_REQUEST_METRIC, dimensions: { Kind: kind, Outcome: outcome } });
}

function jsonHeaders(cacheControl) {
  return { "Content-Type": "application/json", "Cache-Control": cacheControl };
}

const NO_STORE = "no-store";

// One field at a time: nothing else from the Companies House answer reaches the caller.
export function deadlinesFromProfile(data) {
  return {
    companyNumber: data.company_number,
    companyName: data.company_name,
    companyStatus: data.company_status,
    companyType: data.type,
    accountsNextDue: data.accounts?.next_accounts?.due_on,
    accountsNextPeriodEnd: data.accounts?.next_accounts?.period_end_on,
    confirmationStatementNextDue: data.confirmation_statement?.next_due,
    lastAccountsType: data.accounts?.last_accounts?.type,
  };
}

export function matchesFromSearch(data) {
  return (data.items || []).slice(0, MAX_MATCHES).map((item) => ({
    companyNumber: item.company_number,
    companyName: item.title,
    companyStatus: item.company_status,
    companyType: item.company_type,
  }));
}

function failureResponse(request, kind, chResponse) {
  if (chResponse.status === 404) {
    countOriginRequest(kind, "not_found");
    return http404NotFoundResponse({
      request,
      headers: jsonHeaders(NO_STORE),
      message: "No company with that number",
    });
  }
  if (chResponse.status === 429) {
    countOriginRequest(kind, "rate_limited");
    emitMetric({ namespace: METRICS_NAMESPACE, metricName: COMPANIES_HOUSE_429_METRIC });
    const retryAfter = Number.parseInt(chResponse.headers?.["retry-after"], 10);
    return http429TooManyRequestsResponse({
      request,
      headers: jsonHeaders(NO_STORE),
      message: "Companies House is busy. Try again in a few minutes.",
      retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : RETRY_AFTER_SECONDS,
    });
  }
  countOriginRequest(kind, "upstream_error");
  logger.warn({ message: "Companies House request failed", kind, status: chResponse.status });
  return http502BadGatewayResponse({
    request,
    headers: jsonHeaders(NO_STORE),
    message: "Companies House did not answer. Try again in a few minutes.",
  });
}

function badRequest(request, kind, message) {
  countOriginRequest(kind, "invalid");
  return http400BadRequestResponse({ request, headers: jsonHeaders(NO_STORE), message });
}

export async function ingestHandler(event) {
  validateEnv(["COMPANIES_HOUSE_BASE_URI"]);
  const { request } = extractRequest(event);

  const params = event.queryStringParameters || {};
  const hasNumber = params.number !== undefined;
  const hasQuery = params.q !== undefined;
  if (hasNumber === hasQuery) {
    return badRequest(request, "none", "Send either number or q");
  }

  if (hasNumber) {
    const { valid, normalised } = isValidCompanyNumber(params.number);
    if (!valid) return badRequest(request, "lookup", "Invalid company number - must be 8 characters");
    const chResponse = await companiesHouseHttpGet(`/company/${normalised}`);
    if (!chResponse.ok) return failureResponse(request, "lookup", chResponse);
    countOriginRequest("lookup", "found");
    return http200OkResponse({
      request,
      headers: jsonHeaders(`public, max-age=${FOUND_CACHE_SECONDS}`),
      data: deadlinesFromProfile(chResponse.data),
    });
  }

  const query = String(params.q).trim();
  if (query.length < MIN_QUERY_LENGTH || query.length > MAX_QUERY_LENGTH) {
    return badRequest(request, "search", `Search term must be between ${MIN_QUERY_LENGTH} and ${MAX_QUERY_LENGTH} characters`);
  }
  const chResponse = await companiesHouseHttpGet("/search/companies", { q: query, items_per_page: MAX_MATCHES });
  if (!chResponse.ok) return failureResponse(request, "search", chResponse);
  countOriginRequest("search", "found");
  return http200OkResponse({
    request,
    headers: jsonHeaders(`public, max-age=${FOUND_CACHE_SECONDS}`),
    data: { items: matchesFromSearch(chResponse.data) },
  });
}
