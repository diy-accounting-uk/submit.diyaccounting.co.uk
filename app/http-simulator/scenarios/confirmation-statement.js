// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/http-simulator/scenarios/confirmation-statement.js
// State and Gov-Test-Scenario handling for the Companies House XML Gateway simulator's
// confirmation statement classes: CompanyDataRequest, PaymentPeriodsRequest and the
// ConfirmationAndVerificationStatement (or, once every officer is verified,
// ConfirmationStatement) submission. Holds its own submission registry: the route's
// GetSubmissionStatus dispatch tries accounts-filing.js's registry first and falls back to this
// one, since submission numbers are unique across the whole presenter (companiesHouseXmlGateway.js's
// one shared counter), so at most one registry ever carries a given number.

import { createHash } from "crypto";
import { SIMULATOR_PRESENTER_ID, SIMULATOR_PRESENTER_CODE } from "./accounts-filing.js";

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
  raisedBy: "ConfirmationAndVerificationStatement",
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

// The one company this simulator answers CompanyDataRequest and PaymentPeriodsRequest for: two
// directors (each also a PSC, as DIY Accounting Limited's own three directors are), one share
// class, matching the shape CS-9's sandbox proof carries without any real company's authentication
// code or personal codes.
export const FIXTURE_COMPANY_NUMBER = "06846849";
export const FIXTURE_COMPANY_AUTHENTICATION_CODE = "SIMCS01";

export const FIXTURE_COMPANY = {
  companyNumber: FIXTURE_COMPANY_NUMBER,
  companyName: "EXAMPLE CONFIRMATION STATEMENT LIMITED",
  companyCategory: "PRI",
  jurisdiction: "EW",
  tradingOnMarket: false,
  dtr5Applies: false,
  madeUpDate: "2025-09-21",
  nextDueDate: "2026-10-05",
  registeredOfficeAddress: {
    premise: "1",
    street: "Example Street",
    postTown: "London",
    country: "GB-ENG",
    postcode: "AB1 2CD",
  },
  registeredEmailAddress: "confirmation-statement@example.com",
  sicCodes: ["69201", "69202"],
  officers: [
    { role: "director", forename: "ALICE", surname: "EXAMPLE", dob: "1970-01-01", appointmentDate: "2015-01-01" },
    { role: "director", forename: "BOB", surname: "SAMPLE", dob: "1975-02-02", appointmentDate: "2015-01-01" },
  ],
  statementOfCapital: {
    totalAmountUnpaid: "0",
    totalNumberOfIssuedShares: "100",
    shareCurrency: "GBP",
    totalAggregateNominalValue: "100",
    shares: [{ shareClass: "ORDINARY", prescribedParticulars: "ORDINARY SHARES", numShares: "100", aggregateNominalValue: "100" }],
  },
  shareholdings: [
    { shareClass: "ORDINARY", numberHeld: "50", shareholders: [{ surname: "EXAMPLE", forename: "ALICE" }] },
    { shareClass: "ORDINARY", numberHeld: "50", shareholders: [{ surname: "SAMPLE", forename: "BOB" }] },
  ],
};

let submissions = new Map();
let usedSubmissionNumbers = new Set();

/**
 * Clear all simulator state. Called between test runs, the same way accounts-filing.js's
 * resetAccountsFilings() is.
 */
export function resetConfirmationStatementFilings() {
  submissions = new Map();
  usedSubmissionNumbers = new Set();
}

function isAuthenticated({ senderIdHash, authValueHash }) {
  return senderIdHash === SIMULATOR_SENDER_ID_HASH && authValueHash === SIMULATOR_AUTH_VALUE_HASH;
}

function isFixtureCompany({ companyNumber, companyAuthenticationCode }) {
  return companyNumber === FIXTURE_COMPANY_NUMBER && companyAuthenticationCode === FIXTURE_COMPANY_AUTHENTICATION_CODE;
}

/**
 * Handle a parsed CompanyDataRequest. Returns either { errors: [...] } or { company: FIXTURE_COMPANY }.
 */
export function requestCompanyData({ senderIdHash, authValueHash, companyNumber, companyAuthenticationCode, scenario }) {
  if (!isAuthenticated({ senderIdHash, authValueHash }) || scenario === "AUTH_FAILURE") {
    return { errors: [AUTHORISATION_FAILURE_ERROR] };
  }
  if (scenario === "SCHEMA_FAILURE") {
    return { errors: [schemaFailureError("Invalid Request - Request XML contains missing fields or invalid data")] };
  }
  if (scenario === "AUTH_CODE_TOO_LONG") {
    return { errors: [AUTH_CODE_TOO_LONG_ERROR] };
  }
  if (!isFixtureCompany({ companyNumber, companyAuthenticationCode })) {
    return {
      errors: [schemaFailureError("Company Authentication Code and Company Number combination did not match", "CompanyAuthenticationCode")],
    };
  }
  return { company: FIXTURE_COMPANY };
}

/**
 * Handle a parsed PaymentPeriodsRequest. Returns either { errors: [...] } or { periodPaid }.
 * Answers false (a fee is due) unless the caller sends Gov-Test-Scenario: CS_PERIOD_PAID.
 */
export function requestPaymentPeriods({ senderIdHash, authValueHash, companyNumber, companyAuthenticationCode, scenario }) {
  if (!isAuthenticated({ senderIdHash, authValueHash }) || scenario === "AUTH_FAILURE") {
    return { errors: [AUTHORISATION_FAILURE_ERROR] };
  }
  if (scenario === "SCHEMA_FAILURE") {
    return { errors: [schemaFailureError("Invalid Request - Request XML contains missing fields or invalid data")] };
  }
  if (scenario === "AUTH_CODE_TOO_LONG") {
    return { errors: [AUTH_CODE_TOO_LONG_ERROR] };
  }
  if (!isFixtureCompany({ companyNumber, companyAuthenticationCode })) {
    return {
      errors: [schemaFailureError("Company Authentication Code and Company Number combination did not match", "CompanyAuthenticationCode")],
    };
  }
  return { periodPaid: scenario === "CS_PERIOD_PAID" };
}

const DUPLICATE_SHAREHOLDING_ERROR = {
  raisedBy: "ConfirmationAndVerificationStatement",
  number: 9999,
  type: "fatal",
  text: "Duplicate ShareholdingId",
};

const INSUFFICIENT_FUNDS_ERROR = {
  raisedBy: "Gateway",
  number: 5006,
  type: "fatal",
  text: "Insufficient Funds",
};

/**
 * Handle a parsed confirmation statement submission (Class ConfirmationAndVerificationStatement,
 * or ConfirmationStatement once every officer is verified). Returns either { errors: [...] } or
 * { acknowledged: true, gatewayTimestamp, pollInterval }.
 */
export function submitConfirmationStatement({ senderIdHash, authValueHash, submissionNumber, companyNumber, scenario }) {
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
  if (scenario === "CS_DUPLICATE_SHAREHOLDING") {
    return { errors: [DUPLICATE_SHAREHOLDING_ERROR] };
  }
  if (scenario === "CS_INSUFFICIENT_FUNDS") {
    return { errors: [INSUFFICIENT_FUNDS_ERROR] };
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
 * rejections }), or undefined when this module holds no record for the submission number - the
 * route then falls back to accounts-filing.js's registry, or vice versa.
 */
export function pollConfirmationStatement({ senderIdHash, authValueHash, submissionNumber, scenario }) {
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
  if (scenario === "CS_SHAREHOLDERS_REQUIRED") {
    return {
      statusCode: "REJECT",
      submissionNumber,
      companyNumber: record.companyNumber,
      rejections: [
        {
          rejectCode: "11686",
          description: "You must provide the name of each shareholder who held shares at the confirmation date",
          instanceNumber: "1",
        },
      ],
    };
  }
  if (scenario === "CS_DIRECTOR_NOT_VERIFIED") {
    const [firstDirector] = FIXTURE_COMPANY.officers;
    return {
      statusCode: "REJECT",
      submissionNumber,
      companyNumber: record.companyNumber,
      rejections: [
        {
          rejectCode: "12604",
          description: `${firstDirector.forename} ${firstDirector.surname} does not match any active director`,
          instanceNumber: "1",
        },
      ],
    };
  }
  if (record.pollCount === 1) {
    return { statusCode: "PENDING", submissionNumber, companyNumber: record.companyNumber, rejections: [] };
  }
  return { statusCode: "ACCEPT", submissionNumber, companyNumber: record.companyNumber, rejections: [] };
}
