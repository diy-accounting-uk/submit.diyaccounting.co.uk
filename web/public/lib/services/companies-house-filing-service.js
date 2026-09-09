// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Companies House filing service - the OAuth-authorised transaction, registered office address
// and registered email address calls. Holds no HMRC concepts; small on purpose, matching
// companies-house-service.js, which stays the API-key client for the read-only lookup.

import { fetchWithIdToken, authorizedFetch } from "./api-client.js";

const JSON_CONTENT_TYPE_HEADERS = { "Content-Type": "application/json" };

// Scope strings always use the live domain, even when the request itself is pointed at the
// sandbox. Companies House's identity guide is explicit about this, so these two hosts are not
// read from window.envReady - they never change with the environment.
const LIVE_IDENTITY_HOST = "https://identity.company-information.service.gov.uk";
const LIVE_API_HOST = "https://api.company-information.service.gov.uk";

/**
 * Build the space-delimited scope string for one filing, naming the company so Companies House
 * asks the user for that company's authentication code during sign-in.
 * @param {string} companyNumber
 * @param {"registered-office-address"|"registered-email-address"} resource
 * @returns {string}
 */
export function companiesHouseScope(companyNumber, resource) {
  return `${LIVE_IDENTITY_HOST}/user/profile.read ${LIVE_API_HOST}/company/${companyNumber}/${resource}.update`;
}

/**
 * Build an Error carrying the response status and parsed body, so a caller can branch on a
 * specific status (422 validation, 409 conflict, 401 expired token) without re-parsing the body.
 * @param {Response} response
 * @param {object} body
 * @returns {Error}
 */
function filingErrorFromResponse(response, body) {
  const message = body?.message || `Request failed with status ${response.status}`;
  const error = new Error(message);
  error.status = response.status;
  error.body = body;
  return error;
}

function bearerHeaders() {
  const token = sessionStorage.getItem("companiesHouseAccessToken");
  return { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" };
}

/**
 * True when a usable Companies House access token is held for the given scope: present, not
 * expired, and granted for exactly this scope string. A token granted for a different company or
 * a different resource is not reusable - the check is a plain string comparison.
 * @param {string} scopeString
 * @returns {boolean}
 */
export function hasUsableToken(scopeString) {
  const token = sessionStorage.getItem("companiesHouseAccessToken");
  const expiresAt = Number(sessionStorage.getItem("companiesHouseTokenExpiresAt") || 0);
  const grantedScope = sessionStorage.getItem("companiesHouseTokenScope");
  return Boolean(token) && Date.now() < expiresAt && grantedScope === scopeString;
}

/** Clears the three token keys, so the next filing attempt starts a fresh authorise redirect. */
export function clearToken() {
  sessionStorage.removeItem("companiesHouseAccessToken");
  sessionStorage.removeItem("companiesHouseTokenExpiresAt");
  sessionStorage.removeItem("companiesHouseTokenScope");
}

/**
 * Read the current registered office address from the public register with the Cognito id
 * token, the same route the company profile lookup uses. Carries the `etag` the address change
 * filing needs as `referenceEtag`.
 * @param {string} companyNumber
 * @returns {Promise<object>}
 */
export async function getRegisteredOfficeAddress(companyNumber) {
  const response = await fetchWithIdToken(`/api/v1/companies-house/company/${companyNumber}/registered-office-address`, {
    method: "GET",
  });
  const body = await response.json();
  if (!response.ok) {
    throw filingErrorFromResponse(response, body);
  }
  return body;
}

/**
 * Check whether a company's registered email address can be changed before starting the filing.
 * @param {string} companyNumber
 * @returns {Promise<{eligibilityStatusCode: string}>}
 */
export async function getRegisteredEmailEligibility(companyNumber) {
  const response = await authorizedFetch(`/api/v1/companies-house/company/${companyNumber}/registered-email-address/eligibility`, {
    method: "GET",
    headers: bearerHeaders(),
  });
  const body = await response.json();
  if (!response.ok) {
    throw filingErrorFromResponse(response, body);
  }
  return body;
}

/**
 * Open a Companies House transaction against a company number.
 * @param {string} companyNumber
 * @param {string} description
 * @returns {Promise<object>}
 */
export async function openTransaction(companyNumber, description) {
  const response = await authorizedFetch("/api/v1/companies-house/transaction", {
    method: "POST",
    headers: bearerHeaders(),
    body: JSON.stringify({ companyNumber, description }),
  });
  const body = await response.json();
  if (!response.ok) {
    throw filingErrorFromResponse(response, body);
  }
  return body;
}

/**
 * Add the registered office address change resource (AD01) to an open transaction.
 * @param {string} transactionId
 * @param {object} address - premises, addressLine1, addressLine2, locality, region, postalCode,
 *   country, acceptAppropriateOfficeAddressStatement, referenceEtag
 * @returns {Promise<object>}
 */
export async function putRegisteredOfficeAddress(transactionId, address) {
  const response = await authorizedFetch(`/api/v1/companies-house/transaction/${transactionId}/registered-office-address`, {
    method: "POST",
    headers: bearerHeaders(),
    body: JSON.stringify(address),
  });
  const body = await response.json();
  if (!response.ok) {
    throw filingErrorFromResponse(response, body);
  }
  return body;
}

/**
 * Add the registered email address change resource to an open transaction.
 * @param {string} transactionId
 * @param {{registeredEmailAddress: string, acceptAppropriateEmailAddressStatement: boolean}} email
 * @returns {Promise<object>}
 */
export async function putRegisteredEmailAddress(transactionId, email) {
  const response = await authorizedFetch(`/api/v1/companies-house/transaction/${transactionId}/registered-email-address`, {
    method: "POST",
    headers: bearerHeaders(),
    body: JSON.stringify(email),
  });
  const body = await response.json();
  if (!response.ok) {
    throw filingErrorFromResponse(response, body);
  }
  return body;
}

/**
 * Close a transaction, submitting the filing it holds.
 * @param {string} transactionId
 * @returns {Promise<{transactionId: string, status: string}>}
 */
export async function closeTransaction(transactionId) {
  const response = await authorizedFetch(`/api/v1/companies-house/transaction/${transactionId}`, {
    method: "PUT",
    headers: bearerHeaders(),
    body: JSON.stringify({ status: "closed" }),
  });
  const body = await response.json();
  if (!response.ok) {
    throw filingErrorFromResponse(response, body);
  }
  return body;
}

/**
 * Read a transaction back, including each filing's status, description and reject reasons.
 * @param {string} transactionId
 * @returns {Promise<object>}
 */
export async function getTransaction(transactionId) {
  const response = await authorizedFetch(`/api/v1/companies-house/transaction/${transactionId}`, {
    method: "GET",
    headers: bearerHeaders(),
  });
  const body = await response.json();
  if (!response.ok) {
    throw filingErrorFromResponse(response, body);
  }
  return body;
}

/**
 * Render the FRS 105 micro-entity iXBRL from the balance sheet, without submitting anything.
 * Carries no Companies House token: the Cognito id token is enough, matching the company lookup.
 * @param {object} accounts
 * @returns {Promise<{ixbrl: string}>}
 */
export async function previewMicroEntityAccounts(accounts) {
  const response = await fetchWithIdToken("/api/v1/companies-house/accounts/preview", {
    method: "POST",
    headers: JSON_CONTENT_TYPE_HEADERS,
    body: JSON.stringify(accounts),
  });
  const body = await response.json();
  if (!response.ok) {
    throw filingErrorFromResponse(response, body);
  }
  return body;
}

/**
 * Generate the iXBRL and submit it through the Companies House XML Gateway.
 * @param {object} accounts - the same shape previewMicroEntityAccounts takes, plus companyAuthCode
 * @param {object} [extraHeaders] - e.g. a developer-mode Gov-Test-Scenario override
 * @returns {Promise<{submissionNumber: string, gatewayTimestamp: string, pollInterval: number}>}
 */
export async function submitMicroEntityAccounts(accounts, extraHeaders = {}) {
  const response = await fetchWithIdToken("/api/v1/companies-house/accounts", {
    method: "POST",
    headers: { ...JSON_CONTENT_TYPE_HEADERS, ...extraHeaders },
    body: JSON.stringify(accounts),
  });
  const body = await response.json();
  if (!response.ok) {
    throw filingErrorFromResponse(response, body);
  }
  return body;
}

/**
 * Poll the gateway for the outcome of a submitted accounts filing.
 * @param {string} submissionNumber
 * @param {object} [extraHeaders] - e.g. a developer-mode Gov-Test-Scenario override, so the
 *   simulator scenario chosen for the submission also applies to the polls that follow it
 * @returns {Promise<object>} - statusCode is PENDING, PARKED, ACCEPT or REJECT
 */
export async function pollMicroEntityAccounts(submissionNumber, extraHeaders = {}) {
  const response = await fetchWithIdToken(`/api/v1/companies-house/accounts/${submissionNumber}`, {
    method: "GET",
    headers: extraHeaders,
  });
  const body = await response.json();
  if (!response.ok) {
    throw filingErrorFromResponse(response, body);
  }
  return body;
}

// Export on window for backward compatibility
if (typeof window !== "undefined") {
  window.companiesHouseScope = companiesHouseScope;
  window.hasUsableCompaniesHouseToken = hasUsableToken;
  window.clearCompaniesHouseToken = clearToken;
  window.getRegisteredOfficeAddress = getRegisteredOfficeAddress;
  window.getRegisteredEmailEligibility = getRegisteredEmailEligibility;
  window.openCompaniesHouseTransaction = openTransaction;
  window.putRegisteredOfficeAddress = putRegisteredOfficeAddress;
  window.putRegisteredEmailAddress = putRegisteredEmailAddress;
  window.closeCompaniesHouseTransaction = closeTransaction;
  window.getCompaniesHouseTransaction = getTransaction;
  window.previewMicroEntityAccounts = previewMicroEntityAccounts;
  window.submitMicroEntityAccounts = submitMicroEntityAccounts;
  window.pollMicroEntityAccounts = pollMicroEntityAccounts;
}
