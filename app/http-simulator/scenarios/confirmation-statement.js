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
// under a test number that is not on the live register (companies.js names the test numbers).
export const FIXTURE_COMPANY_NUMBER = "00000004";
// The authentication code of every company this simulator answers CompanyDataRequest and
// PaymentPeriodsRequest for.
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
    { role: "director", forename: "ELEANOR", surname: "BRAMWELL", dob: "1970-01-01", appointmentDate: "2015-01-01" },
    { role: "director", forename: "MARCUS", surname: "TENNANT", dob: "1975-02-02", appointmentDate: "2015-01-01" },
  ],
  statementOfCapital: {
    totalAmountUnpaid: "0",
    totalNumberOfIssuedShares: "100",
    shareCurrency: "GBP",
    totalAggregateNominalValue: "100",
    shares: [{ shareClass: "ORDINARY", prescribedParticulars: "ORDINARY SHARES", numShares: "100", aggregateNominalValue: "100" }],
  },
  shareholdings: [
    { shareClass: "ORDINARY", numberHeld: "50", shareholders: [{ surname: "BRAMWELL", forename: "ELEANOR" }] },
    { shareClass: "ORDINARY", numberHeld: "50", shareholders: [{ surname: "TENNANT", forename: "MARCUS" }] },
  ],
};

const ONE_VOTE_A_SHARE = "One vote a share. Each share takes part equally in dividends and in a distribution of capital. Not redeemable.";

// What a test company's company data carries beside its own particulars.
const testCompanyData = (particulars) => ({
  companyCategory: "PRI",
  jurisdiction: "EW",
  tradingOnMarket: false,
  dtr5Applies: false,
  madeUpDate: "2098-12-01",
  nextDueDate: "2098-12-15",
  sicCodes: ["62020"],
  shareholdings: [],
  ...particulars,
});

// The company data of each test company the simulator's public register (companies.js) holds, with
// its statement of capital. 00000003's shares are in two currencies. A dissolved company has none.
export const TEST_COMPANY_DATA = {
  "00000001": testCompanyData({
    companyNumber: "00000001",
    companyName: "SIMULATOR EXAMPLE COMPANY LIMITED",
    registeredOfficeAddress: { premise: "1", street: "Example Street", postTown: "London", country: "GB-ENG", postcode: "AB1 2CD" },
    registeredEmailAddress: "office@simulator-example.example",
    officers: [
      { role: "director", forename: "ELEANOR", surname: "BRAMWELL", dob: "1970-01-01", appointmentDate: "2016-01-01" },
      { role: "director", forename: "MARCUS", surname: "TENNANT", dob: "1975-02-01", appointmentDate: "2015-01-01" },
    ],
    statementOfCapital: {
      totalAmountUnpaid: "0",
      totalNumberOfIssuedShares: "100",
      shareCurrency: "GBP",
      totalAggregateNominalValue: "100",
      shares: [{ shareClass: "Ordinary", prescribedParticulars: ONE_VOTE_A_SHARE, numShares: "100", aggregateNominalValue: "100" }],
    },
    shareholdings: [
      { shareClass: "Ordinary", numberHeld: "60", shareholders: [{ surname: "BRAMWELL", forename: "ELEANOR" }] },
      { shareClass: "Ordinary", numberHeld: "40", shareholders: [{ surname: "TENNANT", forename: "MARCUS" }] },
    ],
  }),
  "SC000000": testCompanyData({
    companyNumber: "SC000000",
    companyName: "SIMULATOR TEST COMPANY (SCOTLAND) LIMITED",
    jurisdiction: "SC",
    registeredOfficeAddress: { premise: "1", street: "Example Street", postTown: "Edinburgh", country: "GB-SCT", postcode: "EH1 1AA" },
    registeredEmailAddress: "office@simulator-scotland.example",
    officers: [{ role: "director", forename: "ISLA", surname: "MACLEOD", dob: "1982-06-01", appointmentDate: "2018-03-01" }],
    statementOfCapital: {
      totalAmountUnpaid: "0",
      totalNumberOfIssuedShares: "1",
      shareCurrency: "GBP",
      totalAggregateNominalValue: "1",
      shares: [{ shareClass: "Ordinary", prescribedParticulars: ONE_VOTE_A_SHARE, numShares: "1", aggregateNominalValue: "1" }],
    },
  }),
  "00000003": testCompanyData({
    companyNumber: "00000003",
    companyName: "EXAMPLE TRADING LIMITED",
    registeredOfficeAddress: { premise: "3", street: "Example Street", postTown: "Cardiff", country: "GB-WLS", postcode: "CF10 1AA" },
    registeredEmailAddress: "office@example-trading.example",
    officers: [{ role: "director", forename: "RHYS", surname: "PRICE", dob: "1979-09-01", appointmentDate: "2019-04-01" }],
    statementOfCapital: [
      {
        totalAmountUnpaid: "0",
        totalNumberOfIssuedShares: "1000",
        shareCurrency: "GBP",
        totalAggregateNominalValue: "1000",
        shares: [{ shareClass: "Ordinary", prescribedParticulars: ONE_VOTE_A_SHARE, numShares: "1000", aggregateNominalValue: "1000" }],
      },
      {
        totalAmountUnpaid: "50",
        totalNumberOfIssuedShares: "500",
        shareCurrency: "EUR",
        totalAggregateNominalValue: "250",
        shares: [
          {
            shareClass: "A Preference",
            prescribedParticulars: "No vote. A fixed dividend of 6 cents a share each year, paid before any ordinary dividend.",
            numShares: "500",
            aggregateNominalValue: "250",
          },
        ],
      },
    ],
  }),
  "00000007": testCompanyData({
    companyNumber: "00000007",
    companyName: "PRECISION CODE LTD",
    registeredOfficeAddress: { premise: "12", street: "Example Street", postTown: "Manchester", country: "GB-ENG", postcode: "M1 1AA" },
    registeredEmailAddress: "office@precision-code.example",
    officers: [{ role: "director", forename: "SAM", surname: "PATEL", dob: "1988-04-01", appointmentDate: "2020-02-01" }],
    statementOfCapital: {
      totalAmountUnpaid: "0",
      totalNumberOfIssuedShares: "100",
      shareCurrency: "GBP",
      totalAggregateNominalValue: "100",
      shares: [{ shareClass: "Ordinary", prescribedParticulars: ONE_VOTE_A_SHARE, numShares: "100", aggregateNominalValue: "100" }],
    },
  }),
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

// The company data of the company this request names, when its authentication code is the simulator's.
function companyDataFor({ companyNumber, companyAuthenticationCode }) {
  if (companyAuthenticationCode !== FIXTURE_COMPANY_AUTHENTICATION_CODE) return null;
  if (companyNumber === FIXTURE_COMPANY_NUMBER) return FIXTURE_COMPANY;
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
