// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability CH-22 Read a company's register for a prefilled package with no sign-in
// - **Use when:** a page with no sign-in builds a company's book from what Companies House holds: its profile, its current officers and its last filed accounts.
// - **Does:** companiesHousePublicRegisterGet.js answers GET /api/v1/public/company-register?number= with no authorizer. It answers profile (company name and number, date of creation, registered office, next and last accounts periods, last accounts type), officers (each current officer's name, role and appointment date) and filedAccounts (the last filed set's iXBRL text, a pdf mark, or a none mark). The profile and officers fields carry the names buildBookFromRegister takes. It reads the profile, the officers and, through fetchLastFiledAccounts, the accounts filing history and the newest set's document. It answers JSON errors for an unknown company, a document over the response limit and a 429 from Companies House. It sets Cache-Control on a found answer so CloudFront keeps it for an hour.
// - **Run:** `curl 'https://submit.diyaccounting.co.uk/api/v1/public/company-register?number=00000001'`
// - **Entry:** `app/functions/companies-house/companiesHousePublicRegisterGet.js:ingestHandler`
// - **Files:** app/functions/companies-house/companiesHousePublicRegisterGet.js, app/unit-tests/functions/companiesHousePublicRegisterGet.test.js, app/services/companiesHouseFiledAccounts.js, app/system-tests/companiesHouseSimulator.system.test.js, infra/main/java/co/uk/diyaccounting/submit/stacks/EdgeStack.java, infra/main/java/co/uk/diyaccounting/submit/stacks/CompaniesHouseStack.java
// - **Keywords:** company register, filed accounts, ixbrl, officers, public lookup, no sign-in, prefilled package, companies house, cache, rate limit
// - **Related:** CH-20
// @end-capability

// app/functions/companies-house/companiesHousePublicRegisterGet.js

import { createLogger } from "../../lib/logger.js";
import {
  extractRequest,
  http200OkResponse,
  http400BadRequestResponse,
  http404NotFoundResponse,
  http413PayloadTooLargeResponse,
  http429TooManyRequestsResponse,
  http502BadGatewayResponse,
} from "../../lib/httpResponseHelper.js";
import { validateEnv } from "../../lib/env.js";
import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";
import { emitMetric } from "../../lib/emfMetrics.js";
import { companiesHouseHttpGet, isValidCompanyNumber } from "../../services/companiesHouseApi.js";
import { fetchLastFiledAccounts } from "../../services/companiesHouseFiledAccounts.js";
import { PUBLIC_LOOKUP_CALLS, lookupLimitResponse, publicLookupBudgetSpent } from "../../services/companiesHouseLookupLimit.js";
import { registeredOfficeFromAddress } from "./companiesHouseCompanyGet.js";

const logger = createLogger({ source: "app/functions/companies-house/companiesHousePublicRegisterGet.js" });

export const METRICS_NAMESPACE = "Submit/Business";
export const ORIGIN_REQUEST_METRIC = "PublicCompanyRegisterOriginRequest";
export const COMPANIES_HOUSE_429_METRIC = "PublicCompanyRegisterCompaniesHouse429";
// Counted each time the budget of all public lookups refuses a read; its alarm shows the budget spent.
export const PUBLIC_BUDGET_SPENT_METRIC = "PublicCompaniesHouseBudgetSpent";

// CloudFront keeps a found answer this long. The register changes when a filing is accepted, and
// one answer costs up to five Companies House requests on the key the signed-in lookups share.
export const FOUND_CACHE_SECONDS = 3600;
const RETRY_AFTER_SECONDS = 300;
const NO_STORE = "no-store";

/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "get", "/api/v1/public/company-register", ingestHandler);
  registerLambdaRoute(app, "head", "/api/v1/public/company-register", ingestHandler);
}
/* v8 ignore stop */

function countOriginRequest(outcome) {
  emitMetric({ namespace: METRICS_NAMESPACE, metricName: ORIGIN_REQUEST_METRIC, dimensions: { Outcome: outcome } });
}

function jsonHeaders(cacheControl) {
  return { "Content-Type": "application/json", "Cache-Control": cacheControl };
}

// The profile fields the book builder reads, one field at a time: nothing else from the Companies
// House answer reaches the caller.
export function registerProfile(data) {
  return {
    companyNumber: data.company_number,
    companyName: data.company_name,
    dateOfCreation: data.date_of_creation,
    registeredOffice: registeredOfficeFromAddress(data.registered_office_address),
    accountsNextPeriodStart: data.accounts?.next_accounts?.period_start_on,
    accountsNextPeriodEnd: data.accounts?.next_accounts?.period_end_on,
    accountsLastPeriodStart: data.accounts?.last_accounts?.period_start_on,
    accountsLastPeriodEnd: data.accounts?.last_accounts?.period_end_on,
    accountsLastType: data.accounts?.last_accounts?.type,
  };
}

// Each current officer's name, role and appointment date. The register's answer also holds each
// person's date of birth, nationality, country of residence, occupation and addresses: none of
// those is copied.
export function currentOfficers(data) {
  return (data.items || [])
    .filter((item) => !item.resigned_on)
    .map((item) => ({ name: item.name, officerRole: item.officer_role, appointedOn: item.appointed_on }));
}

function filedAccountsAnswer({ problem, set, document }) {
  if (problem === "no-accounts") return { status: "none" };
  const filed = { madeUpDate: set.madeUpDate, accountsType: set.accountsType, filedOn: set.filedOn };
  if (problem === "no-ixbrl") return { status: "pdf", ...filed };
  return { status: "ixbrl", ...filed, ixbrl: document };
}

function failureResponse(request, chResponse) {
  if (chResponse.status === 404) {
    countOriginRequest("not_found");
    return http404NotFoundResponse({ request, headers: jsonHeaders(NO_STORE), message: "No company with that number" });
  }
  if (chResponse.status === 429) {
    countOriginRequest("rate_limited");
    emitMetric({ namespace: METRICS_NAMESPACE, metricName: COMPANIES_HOUSE_429_METRIC });
    const retryAfter = Number.parseInt(chResponse.headers?.["retry-after"], 10);
    return http429TooManyRequestsResponse({
      request,
      headers: jsonHeaders(NO_STORE),
      message: "Companies House is busy. Try again in a few minutes.",
      retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : RETRY_AFTER_SECONDS,
    });
  }
  countOriginRequest("upstream_error");
  logger.warn({ message: "Companies House request failed", status: chResponse.status });
  return http502BadGatewayResponse({
    request,
    headers: jsonHeaders(NO_STORE),
    message: "Companies House did not answer. Try again in a few minutes.",
  });
}

export async function ingestHandler(event) {
  validateEnv(["COMPANIES_HOUSE_BASE_URI", "COMPANIES_HOUSE_DOCUMENT_BASE_URI"]);
  const { request } = extractRequest(event);

  const { valid, normalised } = isValidCompanyNumber((event.queryStringParameters || {}).number);
  if (!valid) {
    countOriginRequest("invalid");
    return http400BadRequestResponse({ request, headers: jsonHeaders(NO_STORE), message: "Invalid company number - must be 8 characters" });
  }

  if (await publicLookupBudgetSpent(PUBLIC_LOOKUP_CALLS.register)) {
    countOriginRequest("budget_spent");
    emitMetric({ namespace: METRICS_NAMESPACE, metricName: PUBLIC_BUDGET_SPENT_METRIC });
    return lookupLimitResponse(request, jsonHeaders(NO_STORE));
  }

  const profileResponse = await companiesHouseHttpGet(`/company/${normalised}`);
  if (!profileResponse.ok) return failureResponse(request, profileResponse);

  const [officersResponse, filed] = await Promise.all([
    companiesHouseHttpGet(`/company/${normalised}/officers`),
    fetchLastFiledAccounts(normalised),
  ]);
  // The profile exists, so a 404 for its officers means the register lists none.
  if (!officersResponse.ok && officersResponse.status !== 404) return failureResponse(request, officersResponse);
  if (filed.chResponse) return failureResponse(request, filed.chResponse);
  if (filed.problem === "too-large") {
    countOriginRequest("too_large");
    return http413PayloadTooLargeResponse({
      request,
      headers: jsonHeaders(NO_STORE),
      message: "The last filed accounts are larger than this service can send.",
      error: { code: "DOCUMENT_TOO_LARGE", madeUpDate: filed.set.madeUpDate },
    });
  }

  countOriginRequest("found");
  return http200OkResponse({
    request,
    headers: jsonHeaders(`public, max-age=${FOUND_CACHE_SECONDS}`),
    data: {
      profile: registerProfile(profileResponse.data),
      officers: officersResponse.ok ? currentOfficers(officersResponse.data) : [],
      filedAccounts: filedAccountsAnswer(filed),
    },
  });
}
