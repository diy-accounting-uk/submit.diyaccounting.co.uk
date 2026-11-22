// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Companies House lookup service - search and company profile reads.
// Holds no HMRC concepts; small on purpose.

import { fetchWithIdToken } from "./api-client.js";

/**
 * Uppercase and left-pad a numeric company number to eight digits, matching the server's
 * isValidCompanyNumber. A user typing "6846849" sees a result rather than a validation error.
 * @param {string} value
 * @returns {string}
 */
export function normaliseCompanyNumber(value) {
  let normalised = String(value || "")
    .trim()
    .toUpperCase();
  if (/^\d+$/.test(normalised)) {
    normalised = normalised.padStart(8, "0");
  }
  return normalised;
}

/**
 * Build an Error carrying retryAfterSeconds from a 429 response, or a generic Error otherwise.
 * @param {Response} response
 * @param {object} body
 * @returns {Promise<Error>}
 */
async function errorFromResponse(response, body) {
  const message = body?.message || `Request failed with status ${response.status}`;
  const error = new Error(message);
  if (response.status === 429) {
    const retryAfterHeader = response.headers.get("Retry-After");
    error.retryAfterSeconds = retryAfterHeader ? parseInt(retryAfterHeader, 10) : undefined;
  }
  error.status = response.status;
  return error;
}

/**
 * Search Companies House by name or number.
 * @param {string} query
 * @param {object} [options]
 * @param {number} [options.itemsPerPage=20]
 * @param {number} [options.startIndex=0]
 * @returns {Promise<object>} { totalResults, itemsPerPage, startIndex, items }
 */
export async function searchCompanies(query, { itemsPerPage = 20, startIndex = 0 } = {}) {
  const params = new URLSearchParams({ q: query, itemsPerPage: String(itemsPerPage), startIndex: String(startIndex) });
  const response = await fetchWithIdToken(`/api/v1/companies-house/search?${params}`, { method: "GET" });
  const body = await response.json();
  if (!response.ok) {
    throw await errorFromResponse(response, body);
  }
  return body;
}

/**
 * Get a company profile by company number.
 * @param {string} companyNumber
 * @returns {Promise<object>} the company profile
 */
export async function getCompanyProfile(companyNumber) {
  const response = await fetchWithIdToken(`/api/v1/companies-house/company/${normaliseCompanyNumber(companyNumber)}`, { method: "GET" });
  const body = await response.json();
  if (!response.ok) {
    throw await errorFromResponse(response, body);
  }
  return body;
}

/**
 * Get a company's current and resigned officers, so a confirmation statement journey can show
 * every current director - and whether the register already carries their identity verification -
 * before the customer types anything secret.
 * @param {string} companyNumber
 * @returns {Promise<{companyNumber: string, activeCount: number, resignedCount: number, officers: object[]}>}
 */
export async function getOfficers(companyNumber) {
  const response = await fetchWithIdToken(`/api/v1/companies-house/company/${normaliseCompanyNumber(companyNumber)}/officers`, {
    method: "GET",
  });
  const body = await response.json();
  if (!response.ok) {
    throw await errorFromResponse(response, body);
  }
  return body;
}

/**
 * Get a company's persons with significant control.
 * @param {string} companyNumber
 * @returns {Promise<{companyNumber: string, activeCount: number, ceasedCount: number, pscs: object[]}>}
 */
export async function getPscs(companyNumber) {
  const response = await fetchWithIdToken(
    `/api/v1/companies-house/company/${normaliseCompanyNumber(companyNumber)}/persons-with-significant-control`,
    { method: "GET" },
  );
  const body = await response.json();
  if (!response.ok) {
    throw await errorFromResponse(response, body);
  }
  return body;
}

/**
 * Get a company's filing history, every category, newest first.
 * @param {string} companyNumber
 * @returns {Promise<{companyNumber: string, totalCount: number, filings: object[]}>}
 */
export async function getFilingHistory(companyNumber) {
  const response = await fetchWithIdToken(`/api/v1/companies-house/company/${normaliseCompanyNumber(companyNumber)}/filing-history`, {
    method: "GET",
  });
  const body = await response.json();
  if (!response.ok) {
    throw await errorFromResponse(response, body);
  }
  return body;
}

/**
 * Get the sets of accounts Companies House holds for a company, each with whether it holds an
 * iXBRL document.
 * @param {string} companyNumber
 * @returns {Promise<{companyNumber: string, filedAccounts: object[]}>}
 */
export async function getFiledAccounts(companyNumber) {
  const response = await fetchWithIdToken(`/api/v1/companies-house/company/${normaliseCompanyNumber(companyNumber)}/filed-accounts`, {
    method: "GET",
  });
  const body = await response.json();
  if (!response.ok) {
    throw await errorFromResponse(response, body);
  }
  return body;
}

/**
 * Get one company report. A report the route has no module for yet answers 404 with the reason
 * "unknown_report", which the error carries.
 * @param {string} companyNumber
 * @param {string} report - filings, people, capital, charges, history or accounts
 * @returns {Promise<{companyNumber: string, report: string, readAt: string, partial?: boolean, retryAfterSeconds?: number}>}
 */
export async function getCompanyReport(companyNumber, report) {
  const response = await fetchWithIdToken(
    `/api/v1/companies-house/company/${normaliseCompanyNumber(companyNumber)}/reports/${encodeURIComponent(report)}`,
    { method: "GET" },
  );
  const body = await response.json();
  if (!response.ok) {
    const error = await errorFromResponse(response, body);
    error.reason = body?.reason;
    throw error;
  }
  return body;
}

// Export on window for backward compatibility
if (typeof window !== "undefined") {
  window.searchCompanies = searchCompanies;
  window.getCompanyProfile = getCompanyProfile;
  window.getOfficers = getOfficers;
  window.getPscs = getPscs;
  window.getFilingHistory = getFilingHistory;
  window.getFiledAccounts = getFiledAccounts;
  window.getCompanyReport = getCompanyReport;
  window.normaliseCompanyNumber = normaliseCompanyNumber;
}
