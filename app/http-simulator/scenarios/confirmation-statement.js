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

import { isAuthenticated } from "./accounts-filing.js";
import { registerCompanies, COMPANY_AUTHENTICATION_CODE } from "../fixtures/register.js";

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

// The generic gateway error for a company authentication code it does not accept, as the
// production gateway answered a mistyped code.
const AUTH_CODE_INVALID_ERROR = {
  raisedBy: "CompanyDataRequest",
  number: 9999,
  type: "fatal",
  text: "Invalid CompanyAuthenticationCode",
  location: "",
};

// The test presenter's account was not set up correctly (B34.6c): every GetSubmissionStatus poll
// answers this instead of a Status block, whatever the submission's real outcome would have been.
const PRESENTER_ID_MISSING_ERROR = {
  raisedBy: "Gateway",
  number: 9999,
  type: "fatal",
  text: "No presenter ID supplied",
};

// The confirmation statement journey's company: two directors, each also a PSC, and one share class,
// with a statement due now (fixtures/register.js names the test numbers).
export const FIXTURE_COMPANY_NUMBER = "00000004";
// The authentication code of every company this simulator answers CompanyDataRequest and
// PaymentPeriodsRequest for.
export const FIXTURE_COMPANY_AUTHENTICATION_CODE = COMPANY_AUTHENTICATION_CODE;

const JURISDICTION_CODES = { "england-wales": "EW", "wales": "WA", "scotland": "SC", "northern-ireland": "NI" };
const twoDigits = (value) => String(value).padStart(2, "0");

// A register company's company data as CompanyDataRequest answers it.
function companyDataOf(company) {
  return {
    companyNumber: company.number,
    companyName: company.name,
    companyCategory: "PRI",
    jurisdiction: JURISDICTION_CODES[company.jurisdiction],
    tradingOnMarket: false,
    dtr5Applies: false,
    madeUpDate: company.confirmationStatementDates.madeUpTo,
    nextDueDate: company.confirmationStatementDates.due,
    registeredOfficeAddress: {
      premise: company.address.premises,
      street: company.address.street,
      postTown: company.address.locality,
      country: company.address.countryCode,
      postcode: company.address.postalCode,
    },
    registeredEmailAddress: company.email,
    sicCodes: company.sicCodes,
    officers: company.officers.map((officer) => ({
      role: officer.role,
      forename: officer.forename.toUpperCase(),
      surname: officer.surname.toUpperCase(),
      dob: `${officer.dateOfBirth.year}-${twoDigits(officer.dateOfBirth.month)}-01`,
      appointmentDate: officer.appointedOn,
    })),
    statementOfCapital: company.capital,
    shareholdings: company.shareholdings ?? [],
  };
}

// The company data of each active company of the register, keyed by number. 00000003's shares are
// in two currencies. A dissolved company has none.
export const TEST_COMPANY_DATA = Object.fromEntries(
  registerCompanies()
    .filter((company) => company.status === "active")
    .map((company) => [company.number, companyDataOf(company)]),
);

export const FIXTURE_COMPANY = TEST_COMPANY_DATA[FIXTURE_COMPANY_NUMBER];

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

// The company data of the company this request names, when its authentication code is the simulator's.
function companyDataFor({ companyNumber, companyAuthenticationCode }) {
  if (companyAuthenticationCode !== FIXTURE_COMPANY_AUTHENTICATION_CODE) return null;
  return TEST_COMPANY_DATA[companyNumber] ?? null;
}

/**
 * Handle a parsed CompanyDataRequest. Returns either { errors: [...] } or { company } with the named
 * company's data.
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
  if (scenario === "AUTH_CODE_INVALID") {
    return { errors: [AUTH_CODE_INVALID_ERROR] };
  }
  const company = companyDataFor({ companyNumber, companyAuthenticationCode });
  if (!company) {
    return {
      errors: [schemaFailureError("Company Authentication Code and Company Number combination did not match", "CompanyAuthenticationCode")],
    };
  }
  return { company };
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
  if (scenario === "AUTH_CODE_INVALID") {
    return { errors: [AUTH_CODE_INVALID_ERROR] };
  }
  if (!companyDataFor({ companyNumber, companyAuthenticationCode })) {
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
  submissions.set(submissionNumber, { pollCount: 0, scenario: scenario || null, companyNumber, senderIdHash });

  return { acknowledged: true, gatewayTimestamp: new Date().toISOString(), pollInterval: 1 };
}

const CS_REJECT_SCENARIOS = new Set(["CS_SHAREHOLDERS_REQUIRED", "CS_DIRECTOR_NOT_VERIFIED"]);

// The verdict Companies House reaches on a confirmation statement, once it is no longer pending.
function finalStatus(submissionNumber, record, scenario) {
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
  return { statusCode: "ACCEPT", submissionNumber, companyNumber: record.companyNumber, rejections: [] };
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
  if (CS_REJECT_SCENARIOS.has(scenario)) {
    return finalStatus(submissionNumber, record, scenario);
  }
  if (record.pollCount === 1) {
    return { statusCode: "PENDING", submissionNumber, companyNumber: record.companyNumber, rejections: [] };
  }
  return finalStatus(submissionNumber, record, scenario);
}

/**
 * Every confirmation statement of the presenter that Companies House has finished: all but those
 * submitted under PENDING_FOREVER, each with the verdict its submission scenario sets.
 * @param {string} senderIdHash
 * @returns {Array<object>}
 */
export function completedConfirmationStatementStatuses(senderIdHash) {
  return [...submissions.entries()]
    .filter(([, record]) => record.senderIdHash === senderIdHash && record.scenario !== "PENDING_FOREVER")
    .map(([submissionNumber, record]) => finalStatus(submissionNumber, record, record.scenario));
}
