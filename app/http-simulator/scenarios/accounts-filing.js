// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/http-simulator/scenarios/accounts-filing.js
// State and Gov-Test-Scenario handling for the Companies House XML Gateway simulator route.
// Holds the submission map and the used-submission-number set behind submitAccounts and
// pollStatus, so the route file only has to translate the outcome into a GovTalk envelope.

import { createHash } from "crypto";

// Fixed test presenter credentials for the simulator, standing in for the real ones Companies
// House issues by email. Every caller against the simulator authenticates with these.
export const SIMULATOR_PRESENTER_ID = "12345678901";
export const SIMULATOR_PRESENTER_CODE = "SimTest1";
// A second presenter, standing in for a customer's own presenter with its own credit account.
export const SIMULATOR_CUSTOMER_PRESENTER_ID = "98765432109";
export const SIMULATOR_CUSTOMER_PRESENTER_CODE = "CustSim1";

function md5Lowercase(value) {
  return createHash("md5").update(String(value), "utf8").digest("hex").toLowerCase();
}

const SIMULATOR_SENDER_ID_HASH = md5Lowercase(SIMULATOR_PRESENTER_ID);
const SIMULATOR_AUTH_VALUE_HASH = md5Lowercase(SIMULATOR_PRESENTER_CODE);
const SIMULATOR_CUSTOMER_SENDER_ID_HASH = md5Lowercase(SIMULATOR_CUSTOMER_PRESENTER_ID);
const SIMULATOR_CUSTOMER_AUTH_VALUE_HASH = md5Lowercase(SIMULATOR_CUSTOMER_PRESENTER_CODE);

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
  raisedBy: "Accounts",
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

// A presenter poll answers at most this many completed submissions (TIS v5.3, section 2.5).
const PRESENTER_POLL_MAXIMUM = 20;

let submissions = new Map();
let usedSubmissionNumbers = new Set();
// The presenter poll's acknowledgement state, shared by every form's registry: the submission
// numbers each presenter's last poll answered, and the numbers a StatusAck has acknowledged.
let awaitingAcknowledgement = new Map();
let acknowledgedSubmissionNumbers = new Set();

/**
 * Clear all simulator state. Called between test runs, the same way state/store.js's reset() is.
 */
export function resetAccountsFilings() {
  submissions = new Map();
  usedSubmissionNumbers = new Set();
  awaitingAcknowledgement = new Map();
  acknowledgedSubmissionNumbers = new Set();
}

/**
 * The completed statuses a presenter poll may answer: those not acknowledged yet, at most the
 * gateway's 20. Records them as the poll a StatusAck will acknowledge.
 * @param {string} senderIdHash
 * @param {Array<{submissionNumber: string}>} completedStatuses - every form registry's completed statuses for the presenter
 * @returns {Array<object>}
 */
export function answerPresenterPoll(senderIdHash, completedStatuses) {
  const unacknowledged = completedStatuses
    .filter((status) => !acknowledgedSubmissionNumbers.has(status.submissionNumber))
    .slice(0, PRESENTER_POLL_MAXIMUM);
  awaitingAcknowledgement.set(
    senderIdHash,
    unacknowledged.map((status) => status.submissionNumber),
  );
  return unacknowledged;
}

/**
 * Acknowledge the presenter's last poll, so the next poll leaves its submissions out.
 * @param {string} senderIdHash
 */
export function acknowledgePresenterPoll(senderIdHash) {
  for (const submissionNumber of awaitingAcknowledgement.get(senderIdHash) ?? []) acknowledgedSubmissionNumbers.add(submissionNumber);
  awaitingAcknowledgement.delete(senderIdHash);
}

/**
 * True when the hashed pair is either simulator presenter: ours or the customer's own.
 * @param {{senderIdHash: string, authValueHash: string}} hashes
 * @returns {boolean}
 */
export function isAuthenticated({ senderIdHash, authValueHash }) {
  return (
    (senderIdHash === SIMULATOR_SENDER_ID_HASH && authValueHash === SIMULATOR_AUTH_VALUE_HASH) ||
    (senderIdHash === SIMULATOR_CUSTOMER_SENDER_ID_HASH && authValueHash === SIMULATOR_CUSTOMER_AUTH_VALUE_HASH)
  );
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
  submissions.set(submissionNumber, { pollCount: 0, scenario: scenario || null, companyNumber, senderIdHash });

  return { acknowledged: true, gatewayTimestamp: new Date().toISOString(), pollInterval: 1 };
}

// The verdict Companies House reaches on an accounts submission, once it is no longer pending.
function finalStatus(submissionNumber, record, scenario) {
  if (scenario === "ACCOUNTS_REJECTED") {
    return {
      statusCode: "REJECT",
      submissionNumber,
      companyNumber: record.companyNumber,
      rejections: [{ rejectCode: "1", description: "Random Test mode rejection", instanceNumber: "1" }],
    };
  }
  return { statusCode: "ACCEPT", submissionNumber, companyNumber: record.companyNumber, rejections: [] };
}

/**
 * Every accounts submission of the presenter that Companies House has finished: all but those
 * submitted under PENDING_FOREVER, each with the verdict its submission scenario sets.
 * @param {string} senderIdHash
 * @returns {Array<object>}
 */
export function completedAccountsStatuses(senderIdHash) {
  return [...submissions.entries()]
    .filter(([, record]) => record.senderIdHash === senderIdHash && record.scenario !== "PENDING_FOREVER")
    .map(([submissionNumber, record]) => finalStatus(submissionNumber, record, record.scenario));
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
  if (scenario === "PRESENTER_ID_MISSING") {
    return { errors: [PRESENTER_ID_MISSING_ERROR] };
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
    return finalStatus(submissionNumber, record, scenario);
  }
  if (record.pollCount === 1) {
    return { statusCode: "PENDING", submissionNumber, companyNumber: record.companyNumber, rejections: [] };
  }
  return finalStatus(submissionNumber, record, scenario);
}
