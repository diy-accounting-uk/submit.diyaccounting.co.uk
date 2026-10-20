// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// HMRC Company Tax Return service - the preview, submit and poll calls the
// fileCompanyTaxReturn.html journey makes through the HMRC Transaction Engine.

import { fetchWithIdToken } from "./api-client.js";

const CT_RETURN_JSON_HEADERS = { "Content-Type": "application/json" };

function ctReturnErrorFromResponse(response, body) {
  const message = body?.message || `Request failed with status ${response.status}`;
  const error = new Error(message);
  error.status = response.status;
  error.body = body;
  return error;
}

async function readJsonOrThrow(response) {
  const body = await response.json();
  if (!response.ok) {
    throw ctReturnErrorFromResponse(response, body);
  }
  return body;
}

/**
 * Build the CT600, the computations and the accounts documents without sending anything to HMRC.
 * @param {object} returnRequest - the book export plus the typed facts, without Gateway credentials
 * @returns {Promise<{ct600Xml: string, computationsIxbrl: string, accountsIxbrl: string, boxes: object}>}
 */
export async function previewCtReturn(returnRequest) {
  const response = await fetchWithIdToken("/api/v1/hmrc/ct/return/preview", {
    method: "POST",
    headers: CT_RETURN_JSON_HEADERS,
    body: JSON.stringify(returnRequest),
  });
  return readJsonOrThrow(response);
}

/**
 * Sign the CT600 and send it to the Transaction Engine.
 * @param {object} returnRequest - the preview request plus gatewayUserId and gatewayPassword
 * @param {object} [extraHeaders] - e.g. a developer-mode Gov-Test-Scenario override
 * @returns {Promise<{correlationId: string, transactionId: string, irmark: string, pollIntervalSeconds: number}>}
 */
export async function submitCtReturn(returnRequest, extraHeaders = {}) {
  const response = await fetchWithIdToken("/api/v1/hmrc/ct/return", {
    method: "POST",
    headers: { ...CT_RETURN_JSON_HEADERS, ...extraHeaders },
    body: JSON.stringify(returnRequest),
  });
  return readJsonOrThrow(response);
}

/**
 * Poll the outcome of a submitted Company Tax Return.
 * @param {string} correlationId
 * @param {object} [extraHeaders] - e.g. the Gov-Test-Scenario sent with the submission
 * @returns {Promise<object>} statusCode is PENDING, ACCEPT or REJECT
 */
export async function pollCtReturn(correlationId, extraHeaders = {}) {
  const response = await fetchWithIdToken(`/api/v1/hmrc/ct/return/${correlationId}`, {
    method: "GET",
    headers: extraHeaders,
  });
  return readJsonOrThrow(response);
}
