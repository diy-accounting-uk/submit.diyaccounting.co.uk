// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Companies House PSC verification statement service - the submit and poll calls
// fileConfirmationStatement.html's PSC follow-up prompt makes through the XML Gateway, one
// director who is also a person with significant control at a time. Matches
// companies-house-confirmation-service.js in shape.

import { fetchWithIdToken } from "./api-client.js";

const PSC_VERIFICATION_STATEMENT_JSON_HEADERS = { "Content-Type": "application/json" };

function pscVerificationStatementErrorFromResponse(response, body) {
  const message = body?.message || `Request failed with status ${response.status}`;
  const error = new Error(message);
  error.status = response.status;
  error.body = body;
  return error;
}

/**
 * Build the PSCVerificationStatement, wrap it in a GovTalk envelope and submit it through the
 * Companies House XML Gateway.
 * @param {object} statement - companyNumber, companyName, companyAuthCode, dateSigned, title,
 *   forename, otherForenames, surname, dobMonth, dobYear, personalCode
 * @param {object} [extraHeaders] - e.g. a developer-mode Gov-Test-Scenario override
 * @returns {Promise<{submissionNumber: string, gatewayTimestamp: string, pollInterval: number}>}
 */
export async function submitPscVerificationStatement(statement, extraHeaders = {}) {
  const response = await fetchWithIdToken("/api/v1/companies-house/psc-verification-statement", {
    method: "POST",
    headers: { ...PSC_VERIFICATION_STATEMENT_JSON_HEADERS, ...extraHeaders },
    body: JSON.stringify(statement),
  });
  const body = await response.json();
  if (!response.ok) {
    throw pscVerificationStatementErrorFromResponse(response, body);
  }
  return body;
}

/**
 * Poll the gateway for the outcome of a submitted PSC verification statement.
 * @param {string} submissionNumber
 * @param {object} [extraHeaders] - e.g. a developer-mode Gov-Test-Scenario override, so the
 *   simulator scenario chosen for the submission also applies to the polls that follow it
 * @returns {Promise<object>} - statusCode is PENDING, PARKED, ACCEPT or REJECT
 */
export async function pollPscVerificationStatement(submissionNumber, extraHeaders = {}) {
  const response = await fetchWithIdToken(`/api/v1/companies-house/psc-verification-statement/${submissionNumber}`, {
    method: "GET",
    headers: extraHeaders,
  });
  const body = await response.json();
  if (!response.ok) {
    throw pscVerificationStatementErrorFromResponse(response, body);
  }
  return body;
}

if (typeof window !== "undefined") {
  window.submitPscVerificationStatement = submitPscVerificationStatement;
  window.pollPscVerificationStatement = pollPscVerificationStatement;
}
