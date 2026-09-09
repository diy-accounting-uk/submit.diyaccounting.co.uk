// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/http-simulator/scenarios/accounts-filing.js
// State and Gov-Test-Scenario handling for the Companies House XML Gateway simulator route.
// Holds the submission map and the used-submission-number set behind submitAccounts and
// pollStatus, so the route file only has to translate the outcome into a GovTalk envelope.

import { createHash } from "crypto";

// Fixed test presenter credentials for the simulator, standing in for the real ones Companies
// House issues by email (see PLAN_COMPANIES_HOUSE_ACCOUNTS_FILING.md, board item O16). Every
// caller against the simulator authenticates with these.
export const SIMULATOR_PRESENTER_ID = "12345678901";
export const SIMULATOR_PRESENTER_CODE = "SimTest1";

function md5Lowercase(value) {
  return createHash("md5").update(String(value), "utf8").digest("hex").toLowerCase();
}

const SIMULATOR_SENDER_ID_HASH = md5Lowercase(SIMULATOR_PRESENTER_ID);
const SIMULATOR_AUTH_VALUE_HASH = md5Lowercase(SIMULATOR_PRESENTER_CODE);

const AUTHORISATION_FAILURE_ERROR = {
  raisedBy: "Gateway",
  number: 502,
  type: "fatal",
  text: "Authorisation Failure",
};

function schemaFailureError(text, location) {
  return {
    raisedBy: "Gateway",
    number: 604,
    type: "fatal",
    text,
    ...(location ? { location } : {}),
  };
}

let submissions = new Map();
let usedSubmissionNumbers = new Set();

/**
 * Clear all simulator state. Called between test runs, the same way state/store.js's reset() is.
 */
export function resetAccountsFilings() {
  submissions = new Map();
  usedSubmissionNumbers = new Set();
}

function isAuthenticated({ senderIdHash, authValueHash }) {
  return senderIdHash === SIMULATOR_SENDER_ID_HASH && authValueHash === SIMULATOR_AUTH_VALUE_HASH;
}

/**
 * Handle a parsed Accounts submission. Returns either { errors: [...] } when the submission never
 * reached Companies House, or { acknowledged: true, gatewayTimestamp, pollInterval }.
 */
export function submitAccounts({ senderIdHash, authValueHash, submissionNumber, companyNumber, scenario }) {
  if (!isAuthenticated({ senderIdHash, authValueHash }) || scenario === "AUTH_FAILURE") {
    return { errors: [AUTHORISATION_FAILURE_ERROR] };
  }
  if (scenario === "SCHEMA_FAILURE") {
    return { errors: [schemaFailureError("Invalid Request - Request XML contains missing fields or invalid data")] };
  }
  if (!submissionNumber || submissionNumber.length !== 6) {
    return {
      errors: [schemaFailureError("Invalid Request - Request XML contains missing fields or invalid data", "SubmissionNumber")],
    };
  }
  if (usedSubmissionNumbers.has(submissionNumber)) {
    return { errors: [schemaFailureError("SubmissionNumber has already been used", "SubmissionNumber")] };
  }

  usedSubmissionNumbers.add(submissionNumber);
  submissions.set(submissionNumber, { pollCount: 0, scenario: scenario || null, companyNumber });

  return { acknowledged: true, gatewayTimestamp: new Date().toISOString(), pollInterval: 1 };
}

/**
 * Handle a parsed GetSubmissionStatus poll. Returns either { errors: [...] } or a status object:
 * { statusCode, submissionNumber, companyNumber, rejections }.
 */
export function pollStatus({ senderIdHash, authValueHash, submissionNumber, scenario }) {
  if (!isAuthenticated({ senderIdHash, authValueHash }) || scenario === "AUTH_FAILURE") {
    return { errors: [AUTHORISATION_FAILURE_ERROR] };
  }
  if (scenario === "SCHEMA_FAILURE") {
    return { errors: [schemaFailureError("Invalid Request - Request XML contains missing fields or invalid data")] };
  }

  const record = submissions.get(submissionNumber);
  if (!record) {
    return { errors: [{ raisedBy: "Gateway", type: "business", text: "No Transaction Found" }] };
  }

  record.pollCount += 1;

  if (scenario === "PENDING_FOREVER") {
    return { statusCode: "PENDING", submissionNumber, companyNumber: record.companyNumber, rejections: [] };
  }
  if (scenario === "ACCOUNTS_REJECTED") {
    return {
      statusCode: "REJECT",
      submissionNumber,
      companyNumber: record.companyNumber,
      rejections: [{ rejectCode: "1", description: "Random Test mode rejection", instanceNumber: "1" }],
    };
  }
  if (record.pollCount === 1) {
    return { statusCode: "PENDING", submissionNumber, companyNumber: record.companyNumber, rejections: [] };
  }
  return { statusCode: "ACCEPT", submissionNumber, companyNumber: record.companyNumber, rejections: [] };
}
