// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/http-simulator/scenarios/gateway-forms.js
// State and Gov-Test-Scenario handling for the Companies House XML Gateway simulator's answer to
// every form filed through the shared filing route (each row of web/public/lib/companies-house-forms.js
// with sharedPoll): one registry for all of them, keyed by submission number, which is unique across
// the presenter. A submission is acknowledged, answers PENDING to its first poll and ACCEPT after,
// or REJECT under the REJECT scenario.

import { isAuthenticated } from "./accounts-filing.js";

const AUTHORISATION_FAILURE_ERROR = { raisedBy: "Gateway", number: 502, type: "fatal", text: "Authorisation Failure" };

function schemaFailureError(text, location) {
  return { raisedBy: "Gateway", number: 604, type: "fatal", text, ...(location ? { location } : {}) };
}

// The rejection the REJECT scenario answers: a reason Companies House gives for a form whose
// person is not on the register as named.
const SIMULATED_REJECTION = {
  rejectCode: "9998",
  description: "The person named on this form does not match a person with significant control on the register.",
  instanceNumber: "1",
};

let submissions = new Map();

/** Clear all state, between test runs. */
export function resetGatewayFormFilings() {
  submissions = new Map();
}

/**
 * Handle a parsed form submission. Returns { errors: [...] } or { acknowledged: true, gatewayTimestamp, pollInterval }.
 */
export function submitGatewayForm({ senderIdHash, authValueHash, formIdentifier, submissionNumber, companyNumber, scenario }) {
  if (!isAuthenticated({ senderIdHash, authValueHash }) || scenario === "AUTH_FAILURE") {
    return { errors: [AUTHORISATION_FAILURE_ERROR] };
  }
  if (scenario === "SCHEMA_FAILURE") {
    return { errors: [schemaFailureError("Invalid Request - Request XML contains missing fields or invalid data")] };
  }
  if (!submissionNumber || submissionNumber.length !== 6) {
    return { errors: [schemaFailureError("Invalid Request - Request XML contains missing fields or invalid data", "SubmissionNumber")] };
  }
  if (submissions.has(submissionNumber)) {
    return { errors: [schemaFailureError("SubmissionNumber has already been used", "SubmissionNumber")] };
  }
  submissions.set(submissionNumber, { formIdentifier, pollCount: 0, scenario: scenario || null, companyNumber, senderIdHash });
  return { acknowledged: true, gatewayTimestamp: new Date().toISOString(), pollInterval: 1 };
}

function finalStatus(submissionNumber, record) {
  return record.scenario === "REJECT"
    ? { statusCode: "REJECT", submissionNumber, companyNumber: record.companyNumber, rejections: [SIMULATED_REJECTION] }
    : { statusCode: "ACCEPT", submissionNumber, companyNumber: record.companyNumber, rejections: [] };
}

/**
 * Handle a GetSubmissionStatus poll for a submission number this registry holds. Returns
 * { errors: [...] }, a status object, or undefined when it holds no such submission.
 */
export function pollGatewayForm({ senderIdHash, authValueHash, submissionNumber, scenario }) {
  if (!isAuthenticated({ senderIdHash, authValueHash }) || scenario === "AUTH_FAILURE") {
    return { errors: [AUTHORISATION_FAILURE_ERROR] };
  }
  const record = submissions.get(submissionNumber);
  if (!record) return undefined;
  record.pollCount += 1;
  if (record.scenario === "PENDING_FOREVER" || record.pollCount === 1) {
    return { statusCode: "PENDING", submissionNumber, companyNumber: record.companyNumber, rejections: [] };
  }
  return finalStatus(submissionNumber, record);
}

/** Every finished form submission of the presenter: all but those under PENDING_FOREVER. */
export function completedGatewayFormStatuses(senderIdHash) {
  return [...submissions.entries()]
    .filter(([, record]) => record.senderIdHash === senderIdHash && record.scenario !== "PENDING_FOREVER")
    .map(([submissionNumber, record]) => finalStatus(submissionNumber, record));
}
