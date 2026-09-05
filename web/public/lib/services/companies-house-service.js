// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// Companies House lookup service - search and company profile reads.
// Holds no HMRC concepts; small on purpose.

import { authorizedFetch } from "./api-client.js";

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
  const response = await authorizedFetch(`/api/v1/companies-house/search?${params}`, { method: "GET" });
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
  const response = await authorizedFetch(`/api/v1/companies-house/company/${normaliseCompanyNumber(companyNumber)}`, { method: "GET" });
  const body = await response.json();
  if (!response.ok) {
    throw await errorFromResponse(response, body);
  }
  return body;
}

// Export on window for backward compatibility
if (typeof window !== "undefined") {
  window.searchCompanies = searchCompanies;
  window.getCompanyProfile = getCompanyProfile;
  window.normaliseCompanyNumber = normaliseCompanyNumber;
}
