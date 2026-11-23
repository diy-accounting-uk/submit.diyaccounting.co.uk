// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Companies House form service: the submit and poll calls of every form filed through the shared
// filing route, by the form's kind in web/public/lib/companies-house-forms.js. A page polls the
// outcome with companies-house-gateway-poll.js.

import { fetchWithIdToken } from "./api-client.js";
import { readJsonAnswer } from "./json-answer.js";
import { companiesHouseFormPath, companiesHouseFormPollPath } from "../companies-house-forms.js";

function formErrorFromResponse(response, body) {
  const error = new Error(body?.message || `Request failed with status ${response.status}`);
  error.status = response.status;
  error.body = body;
  return error;
}

async function answered(response) {
  const body = await readJsonAnswer(response);
  if (!response.ok) throw formErrorFromResponse(response, body);
  return body;
}

/**
 * Submit one form through the Companies House XML Gateway.
 * @param {string} kind - a kind of COMPANIES_HOUSE_FORMS, such as "psc-cessation"
 * @param {object} form - the company fields and the form's own fields
 * @param {object} [extraHeaders] - such as a developer-mode Gov-Test-Scenario
 * @returns {Promise<{submissionNumber: string, gatewayTimestamp?: string, pollInterval?: number}>}
 */
export async function submitCompaniesHouseForm(kind, form, extraHeaders = {}) {
  return answered(
    await fetchWithIdToken(companiesHouseFormPath(kind), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...extraHeaders },
      body: JSON.stringify(form),
    }),
  );
}

/**
 * Poll the outcome of a submitted form.
 * @param {string} kind
 * @param {string} submissionNumber
 * @param {object} [extraHeaders]
 * @returns {Promise<object>} - statusCode is PENDING, PARKED, ACCEPT or REJECT
 */
export async function pollCompaniesHouseForm(kind, submissionNumber, extraHeaders = {}) {
  return answered(await fetchWithIdToken(companiesHouseFormPollPath(kind, submissionNumber), { method: "GET", headers: extraHeaders }));
}

if (typeof window !== "undefined") {
  window.submitCompaniesHouseForm = submitCompaniesHouseForm;
  window.pollCompaniesHouseForm = pollCompaniesHouseForm;
}
