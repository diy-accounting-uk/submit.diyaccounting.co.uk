// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Companies House confirmation statement service - the filing-data read, preview, submit and poll
// calls the fileConfirmationStatement.html journey makes through the XML Gateway. Holds no HMRC
// concepts; matches companies-house-service.js and companies-house-filing-service.js in shape.

import { fetchWithIdToken } from "./api-client.js";

const CONFIRMATION_STATEMENT_JSON_HEADERS = { "Content-Type": "application/json" };

/**
 * Build an Error carrying the response status and parsed body, so a caller can branch on a
 * specific status without re-parsing the body.
 * @param {Response} response
 * @param {object} body
 * @returns {Error}
 */
function confirmationStatementErrorFromResponse(response, body) {
  const message = body?.message || `Request failed with status ${response.status}`;
  const error = new Error(message);
  error.status = response.status;
  error.body = body;
  return error;
}

/**
 * Read the register data a confirmation statement form is built from: MadeUpDate, NextDueDate,
 * SIC codes, registered email, officers with full DOB, PSCs, statement of capital, shareholdings,
 * trading-on-market and DTR5 flags, and whether the current payment period is already paid. The
 * company authentication code is sent for this one call and held only in the page's memory
 * afterwards - never stored.
 * @param {string} companyNumber
 * @param {{companyAuthCode: string, madeUpDate: string, companyType?: string}} input
 * @returns {Promise<object>}
 */
export async function getConfirmationStatementFilingData(companyNumber, { companyAuthCode, madeUpDate, companyType }) {
  const response = await fetchWithIdToken(`/api/v1/companies-house/company/${companyNumber}/filing-data`, {
    method: "POST",
    headers: CONFIRMATION_STATEMENT_JSON_HEADERS,
    body: JSON.stringify({ companyAuthCode, madeUpDate, companyType }),
  });
  const body = await response.json();
  if (!response.ok) {
    throw confirmationStatementErrorFromResponse(response, body);
  }
  return body;
}

/**
 * Render the ConfirmationAndVerificationStatement body from the form's answers, with every
 * director's personal code masked, without submitting anything to Companies House.
 * @param {object} statement - reviewDate, sicCodes, statementOfCapital, shareholdings,
 *   registeredEmailAddress, lawfulPurposeStatementAccepted, directors (see submitConfirmationStatement)
 * @returns {Promise<{confirmationStatementXml: string}>}
 */
export async function previewConfirmationStatement(statement) {
  const response = await fetchWithIdToken("/api/v1/companies-house/confirmation-statement/preview", {
    method: "POST",
    headers: CONFIRMATION_STATEMENT_JSON_HEADERS,
    body: JSON.stringify(statement),
  });
  const body = await response.json();
  if (!response.ok) {
    throw confirmationStatementErrorFromResponse(response, body);
  }
  return body;
}

/**
 * Build the ConfirmationAndVerificationStatement, wrap it in a GovTalk envelope and submit it
 * through the Companies House XML Gateway.
 * @param {object} statement - the same shape previewConfirmationStatement takes, plus
 *   companyNumber, companyName, companyAuthCode and dateSigned
 * @param {object} [extraHeaders] - e.g. a developer-mode Gov-Test-Scenario override
 * @returns {Promise<{submissionNumber: string, gatewayTimestamp: string, pollInterval: number}>}
 */
export async function submitConfirmationStatement(statement, extraHeaders = {}) {
  const response = await fetchWithIdToken("/api/v1/companies-house/confirmation-statement", {
    method: "POST",
    headers: { ...CONFIRMATION_STATEMENT_JSON_HEADERS, ...extraHeaders },
    body: JSON.stringify(statement),
  });
  const body = await response.json();
  if (!response.ok) {
    throw confirmationStatementErrorFromResponse(response, body);
  }
  return body;
}

/**
 * Poll the gateway for the outcome of a submitted confirmation statement.
 * @param {string} submissionNumber
 * @param {object} [extraHeaders] - e.g. a developer-mode Gov-Test-Scenario override, so the
 *   simulator scenario chosen for the submission also applies to the polls that follow it
 * @returns {Promise<object>} - statusCode is PENDING, PARKED, ACCEPT or REJECT
 */
export async function pollConfirmationStatement(submissionNumber, extraHeaders = {}) {
  const response = await fetchWithIdToken(`/api/v1/companies-house/confirmation-statement/${submissionNumber}`, {
    method: "GET",
    headers: extraHeaders,
  });
  const body = await response.json();
  if (!response.ok) {
    throw confirmationStatementErrorFromResponse(response, body);
  }
  return body;
}

// Export on window for backward compatibility
if (typeof window !== "undefined") {
  window.getConfirmationStatementFilingData = getConfirmationStatementFilingData;
  window.previewConfirmationStatement = previewConfirmationStatement;
  window.submitConfirmationStatement = submitConfirmationStatement;
  window.pollConfirmationStatement = pollConfirmationStatement;
}
