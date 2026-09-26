// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/http-simulator/scenarios/psc-verification-statement.js
// State and Gov-Test-Scenario handling for the Companies House XML Gateway simulator's
// PSCVerificationStatement submission. Holds its own submission registry: the route's
// GetSubmissionStatus dispatch tries accounts-filing.js's registry, then confirmation-statement.js's,
// and falls back to this one last, since submission numbers are unique across the whole presenter
// (companiesHouseXmlGateway.js's one shared counter), so at most one registry ever carries a given
// number.

import { SIMULATOR_PRESENTER_ID, SIMULATOR_PRESENTER_CODE } from "./accounts-filing.js";
import { createHash } from "crypto";

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

// Observed against the real test service (CS-A3, 2026-09-26): a FormSubmission whose root element
// carries no xsi:schemaLocation is answered with this error, and a CompanyAuthenticationCode over
// 8 characters (baseTypes-v3-6.xsd's own maxLength facet) with this one.
const INVALID_SCHEMA_URI_ERROR = {
  raisedBy: "PSCVerificationStatement",
  number: 505,
  type: "fatal",
  text: "Invalid schema URI supplied",
};

const AUTH_CODE_TOO_LONG_ERROR = {
  raisedBy: "CH_XML_Gateway",
  number: 100,
  type: "fatal",
  text: "XML failed schema validation: Invalid XML: Datatype error: Type:InvalidDatatypeValueException, Message:Value exceeds maximum length facet of '8'.",
};

// The test presenter's account was not set up correctly (B34.6c): every GetSubmissionStatus poll
// answers this instead of a Status block, whatever the submission's real outcome would have been.
const PRESENTER_ID_MISSING_ERROR = {
  raisedBy: "Gateway",
  number: 9999,
  type: "fatal",
  text: "No presenter ID supplied",
};

let submissions = new Map();
let usedSubmissionNumbers = new Set();

/**
 * Clear all simulator state. Called between test runs, the same way accounts-filing.js's
 * resetAccountsFilings() is.
 */
export function resetPscVerificationStatementFilings() {
  submissions = new Map();
  usedSubmissionNumbers = new Set();
}

function isAuthenticated({ senderIdHash, authValueHash }) {
  return senderIdHash === SIMULATOR_SENDER_ID_HASH && authValueHash === SIMULATOR_AUTH_VALUE_HASH;
}

/**
 * Handle a parsed PSCVerificationStatement submission. Returns either { errors: [...] } or
 * { acknowledged: true, gatewayTimestamp, pollInterval }.
 */
export function submitPscVerificationStatement({ senderIdHash, authValueHash, submissionNumber, companyNumber, scenario }) {
  if (!isAuthenticated({ senderIdHash, authValueHash }) || scenario === "AUTH_FAILURE") {
    return { errors: [AUTHORISATION_FAILURE_ERROR] };
  }
  if (scenario === "SCHEMA_FAILURE") {
    return { errors: [schemaFailureError("Invalid Request - Request XML contains missing fields or invalid data")] };
  }
  if (scenario === "INVALID_SCHEMA_URI") {
    return { errors: [INVALID_SCHEMA_URI_ERROR] };
  }
  if (scenario === "AUTH_CODE_TOO_LONG") {
    return { errors: [AUTH_CODE_TOO_LONG_ERROR] };
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
 * Handle a parsed GetSubmissionStatus poll for a submission number this module registered.
 * Returns { errors: [...] }, a status object ({ statusCode, submissionNumber, companyNumber,
 * rejections }), or undefined when this module holds no record for the submission number.
 */
export function pollPscVerificationStatement({ senderIdHash, authValueHash, submissionNumber, scenario }) {
  if (!isAuthenticated({ senderIdHash, authValueHash }) || scenario === "AUTH_FAILURE") {
    return { errors: [AUTHORISATION_FAILURE_ERROR] };
  }
  if (scenario === "PRESENTER_ID_MISSING") {
    return { errors: [PRESENTER_ID_MISSING_ERROR] };
  }

  const record = submissions.get(submissionNumber);
  if (!record) {
    return undefined;
  }

  record.pollCount += 1;

  if (scenario === "PENDING_FOREVER") {
    return { statusCode: "PENDING", submissionNumber, companyNumber: record.companyNumber, rejections: [] };
  }
  if (record.pollCount === 1) {
    return { statusCode: "PENDING", submissionNumber, companyNumber: record.companyNumber, rejections: [] };
  }
  return { statusCode: "ACCEPT", submissionNumber, companyNumber: record.companyNumber, rejections: [] };
}
