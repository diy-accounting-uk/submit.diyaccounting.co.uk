#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability CH-26 Build, validate and file the Companies House forms' test submissions
// - **Use when:** a Companies House form filed through the shared filing route needs its test submissions validated, or filed on the Companies House test service for the XML team.
// - **Does:** companies-house-test-submissions.mjs holds the test cases of each form kind. For each case it builds the body with the form's own request check and builder, wraps it in the GovTalk envelope with the test flag and a unique submission number, and validates the body against the form's schema and the whole envelope against the envelope, FormSubmission and form schemas. With --file it files each case through Submit's own filing route and polls the answer through Submit's own poll; with --measure-lag it then reads the company's filing history through Submit's lookup every 30 seconds and writes the minutes until the filing shows. It writes one JSON line a case to the path given, which must be outside the repository.
// - **Run:** `node scripts/companies-house-test-submissions.mjs --out /tmp/test-submissions.jsonl`; `npx dotenv -e .env.ci -- node scripts/companies-house-test-submissions.mjs --file --user-sub <sub> --auth-code <code> --out <path> [--measure-lag]`
// - **Entry:** `scripts/companies-house-test-submissions.mjs:testSubmissionCases`; `scripts/companies-house-test-submissions.mjs:buildTestSubmission`; `scripts/companies-house-test-submissions.mjs:validateTestSubmission`
// - **Files:** scripts/companies-house-test-submissions.mjs, app/unit-tests/scripts/companiesHouseTestSubmissions.test.js
// - **Keywords:** companies house, xml gateway, test submission, test flag, GatewayTest, schema validation, form filing, register lag
// - **Related:** CH-12, CH-13
// @end-capability

/**
 * The Companies House forms' test submissions.
 *
 * Usage:
 *   node scripts/companies-house-test-submissions.mjs --out <path> [--form <kind>]
 *     validates every case and sends nothing
 *   node scripts/companies-house-test-submissions.mjs --file --user-sub <sub> --auth-code <code> --out <path>
 *       [--form <kind>] [--include-fee-forms] [--company-number <n>] [--company-name <name>]
 *       [--current-period-end <YYYY-MM-DD>] [--measure-lag]
 *     validates every case, then files each through the shared filing route
 *     (app/services/companiesHouseFormFiling.js) and polls it through the shared poll
 *     (app/services/companiesHouseSubmissionStatus.js) to an answer
 *
 * --file runs with the environment of the Submit deployment it files through (for example
 * `npx dotenv -e .env.ci --`), with AWS credentials that reach that deployment's tables and
 * secrets, and with COMPANIES_HOUSE_GATEWAY_TEST=true, which the script requires. --user-sub names
 * the Submit account the filings are made under; it needs the bundle the forms' activities ask for.
 * A form with a fee (the change of name) is skipped unless --include-fee-forms is given, because
 * Companies House charges a form's fee to the presenter's credit account and no published document
 * says whether a test submission is charged.
 *
 * --measure-lag, with --file, reads the company's filing history through Submit's company lookup
 * (the filing history route) before each case is filed, and after an ACCEPT reads it again every 30
 * seconds for at most 30 minutes, until a filing that was not there before shows. The case's line
 * then carries the minutes from the acceptance to that read, so a test filing measures how long
 * Companies House's public register takes to show an accepted filing.
 *
 * --out names the JSON lines file: one line a case with its submission number, form kind, case name,
 * validation result and, with --file, the gateway's answer. It must resolve outside the repository.
 */

import { appendFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateXML } from "xmllint-wasm";

import { GATEWAY_FORM_BUILDERS } from "../app/services/companiesHouseForms.js";
import { buildFormSubmission } from "../app/services/companiesHouseXmlGateway.js";
import { COMPANIES_HOUSE_FORMS } from "../web/public/lib/companies-house-forms.js";
import { assertOutsideRepository, resolveRepoRoot } from "./companies-house-xmlgw-poll.js";

const SCHEMA_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "companies-house-xmlgw");

// The Companies House test service's test company that the existing test-service cases file PSC
// forms for (scripts/fixtures/companies-house-test-service-cases.json).
export const DEFAULT_TEST_COMPANY = { companyNumber: "04549236", companyName: "MORGAN TECHNICAL LIMITED" };
// An authentication code of the shape the test-service cases use, for validation only.
const VALIDATION_AUTH_CODE = "AUTH11";
// Values that build an envelope for validation only; a filing uses the deployment's own.
const VALIDATION_PRESENTER = { presenterId: "00000000000", presenterCode: "VALIDATE" };
const VALIDATION_PACKAGE_REFERENCE = "0012";

const POLL_INTERVAL_MS = 10_000;
const POLL_LIMIT_MS = 10 * 60 * 1000;
// The filing history reads of --measure-lag.
export const LAG_READ_INTERVAL_MS = 30_000;
export const LAG_READ_LIMIT_MS = 30 * 60 * 1000;
const FINAL_STATUS_CODES = ["ACCEPT", "REJECT"];

const ukDate = (date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(date);

function daysBefore(isoDate, days) {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

// The last day of the month that is `months` after the month of an ISO date.
function monthEndAfter(isoDate, months) {
  const [year, month] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1 + months + 1, 0)).toISOString().slice(0, 10);
}

// The next 30 April after a date: a current accounting period end for a company with an April year end.
function nextAprilEnd(isoDate) {
  const year = Number(isoDate.slice(0, 4));
  const thisYear = `${year}-04-30`;
  return isoDate < thisYear ? thisYear : `${year + 1}-04-30`;
}

// A one-page PDF that stands for the letter of permission a sensitive word in a name needs.
const PERMISSION_LETTER_PDF = Buffer.from(
  [
    "%PDF-1.4",
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] >> endobj",
    "trailer << /Root 1 0 R >>",
    "%%EOF",
  ].join("\n"),
).toString("base64");

// A company number that matches no company on the public register (checked on
// find-and-update.company-information.service.gov.uk), for the fictional companies the cases name.
export const FICTIONAL_COMPANY_NUMBER = "01234567";

const ELEANOR = {
  pscKind: "individual-person-with-significant-control",
  title: "MRS",
  forename: "ELEANOR",
  surname: "BRAMWELL",
  dobMonth: 1,
  dobYear: 1970,
};
const HARBOUR_HOLDINGS = { pscKind: "corporate-entity-person-with-significant-control", name: "QUAYSIDE HOLDINGS (ABERTEIFI) LIMITED" };
const CARDIFF = { premise: "16", street: "Heol y Bont", postTown: "Cardiff", country: "GB-WLS", postcode: "CF10 1AA" };
const LEEDS = { premise: "1", street: "Station Road", postTown: "Leeds", country: "GB-ENG", postcode: "LS1 4AP" };
const ABERYSTWYTH = { premise: "14", street: "Heol y Bont", postTown: "Aberystwyth", country: "GB-WLS", postcode: "SY23 1PZ" };
const CARDIGAN = { premise: "Ty Teifi", street: "Stryd Fawr", postTown: "Cardigan", country: "GB-WLS", postcode: "SA43 1HJ" };
const GWENLLIAN = {
  pscKind: "individual-person-with-significant-control",
  title: "DR",
  forename: "GWENLLIAN",
  surname: "PRYCE",
  dateOfBirth: "1978-03-14",
  nationality: "British",
  countryOfResidence: "Wales",
  serviceAddress: { sameAsRegisteredOffice: true },
  residentialAddress: { address: ABERYSTWYTH },
};
const TEIFI_VALLEY = {
  pscKind: "corporate-entity-person-with-significant-control",
  name: "TEIFI VALLEY HOLDINGS LIMITED",
  address: CARDIGAN,
  legalForm: "Private company limited by shares",
  lawGoverned: "Companies Act 2006",
  placeRegistered: "Companies House",
  countryOrState: "UNITED KINGDOM",
  // A number the register gives no company, so the case names no real company.
  registrationNumber: FICTIONAL_COMPANY_NUMBER,
};
const CARYS = { title: "MRS", forename: "CARYS", surname: "LLEWELYN" };
const DIRECTORCO = {
  corporate: true,
  corporateName: "DIRECTORCO LIMITED",
  address: LEEDS,
  companyIdentification: { uk: { registrationNumber: FICTIONAL_COMPANY_NUMBER } },
};
const ORDINARY_RIGHTS =
  "Each share has one vote, and ranks equally for dividends and on a return of capital. The shares are not redeemable.";

/**
 * The test cases of every form kind built on this branch, in the order they are run.
 * @param {object} [input]
 * @param {{companyNumber: string, companyName: string}} [input.company]
 * @param {string} [input.companyAuthCode]
 * @param {string} [input.today] - YYYY-MM-DD in the United Kingdom
 * @param {string} [input.currentPeriodEnd] - the company's current accounting period end
 * @returns {Array<{kind: string, caseName: string, expectedOutcome: "ACCEPT"|"REJECT", note?: string, body: object}>}
 */
export function testSubmissionCases({
  company = DEFAULT_TEST_COMPANY,
  companyAuthCode = VALIDATION_AUTH_CODE,
  today = ukDate(new Date()),
  currentPeriodEnd = nextAprilEnd(today),
} = {}) {
  const header = { ...company, companyAuthCode, dateSigned: today };
  const eventDate = daysBefore(today, 21);
  const confirmationDate = daysBefore(today, 19);
  const sail = {
    address: { premise: "Unit 4, Harbour House", street: "12 Quay Street", postTown: "Bristol", country: "GB-ENG", postcode: "BS1 4DJ" },
  };
  // A return of allotment in more than one currency: an allotment for cash, fully paid, and a
  // currency's capital after it.
  const allottedShares = (shareClass, currency, numShares, nominalValue, amountPaidPerShare) => ({
    shareClass,
    currency,
    numShares,
    nominalValue,
    amountPaidPerShare,
    amountUnpaidPerShare: "0",
  });
  const currencyCapital = (currency, classes) => ({
    currency,
    totalAmountUnpaid: "0",
    shares: classes.map(([shareClass, numShares, aggregateNominalValue]) => ({
      shareClass,
      prescribedParticulars: ORDINARY_RIGHTS,
      numShares,
      aggregateNominalValue,
    })),
  });
  const pscNotification = (caseName, particulars, naturesOfControl) => ({
    kind: "psc-notification",
    caseName,
    body: { ...header, ...particulars, naturesOfControl, notificationDate: eventDate, confirmationDate },
  });
  const allotment = (caseName, startDate, { capitalDifferenceConfirmed } = {}) => ({
    kind: "allotment-of-shares",
    caseName,
    body: {
      ...header,
      startDate,
      allotments: [
        {
          shareClass: "Ordinary",
          numShares: "50",
          amountPaidPerShare: "2.5",
          amountUnpaidPerShare: "0",
          currency: "GBP",
          nominalValue: "1",
        },
      ],
      statementOfCapital: [
        {
          currency: "GBP",
          totalAmountUnpaid: "0",
          shares: [{ shareClass: "Ordinary", prescribedParticulars: ORDINARY_RIGHTS, numShares: "150", aggregateNominalValue: "150" }],
        },
      ],
      ...(capitalDifferenceConfirmed ? { capitalDifferenceConfirmed } : {}),
    },
  });
  const statementCase = (statement, particulars) => ({
    kind: "psc-statement-notification",
    caseName: `statement ${statement.toLowerCase().replaceAll("_", " ")}`,
    expectedOutcome: "ACCEPT",
    body: { ...header, statement, ...particulars, relevantDate: eventDate },
  });
  const cases = [
    {
      kind: "psc-cessation",
      caseName: "an individual ceasing",
      body: { ...header, ...ELEANOR, cessationDate: eventDate, confirmationDate },
    },
    {
      kind: "psc-cessation",
      caseName: "an entity ceasing",
      body: { ...header, ...HARBOUR_HOLDINGS, cessationDate: eventDate, confirmationDate },
    },
    {
      kind: "psc-change-details",
      caseName: "a nature of control change",
      body: {
        ...header,
        ...ELEANOR,
        naturesOfControl: ["OWNERSHIPOFSHARES_75TO100PERCENT", "VOTINGRIGHTS_75TO100PERCENT"],
        dateOfChange: eventDate,
        confirmationDate,
      },
    },
    {
      kind: "psc-change-details",
      caseName: "an address change",
      body: {
        ...header,
        ...ELEANOR,
        address: { premise: "7", street: "Mill Lane", postTown: "Leeds", country: "GB-ENG", postcode: "LS12 3AB" },
        dateOfChange: eventDate,
        confirmationDate,
      },
    },
    {
      kind: "accounting-reference-date",
      caseName: "shortening",
      body: { ...header, currentPeriodEnd, newPeriodEnd: monthEndAfter(currentPeriodEnd, -1) },
    },
    {
      kind: "accounting-reference-date",
      caseName: "extending",
      body: { ...header, currentPeriodEnd, newPeriodEnd: monthEndAfter(currentPeriodEnd, 2) },
    },
    {
      kind: "accounting-reference-date",
      caseName: "an extension past 18 months",
      expectedOutcome: "REJECT",
      body: { ...header, currentPeriodEnd, newPeriodEnd: monthEndAfter(currentPeriodEnd, 8) },
    },
    {
      kind: "officer-resignation",
      caseName: "a director",
      body: {
        ...header,
        officerRole: "director",
        corporate: false,
        title: "MR",
        forename: "MARCUS",
        surname: "TENNANT",
        dateOfBirth: "1975-02-14",
        resignationDate: eventDate,
      },
    },
    {
      kind: "officer-resignation",
      caseName: "a secretary",
      body: {
        ...header,
        officerRole: "secretary",
        corporate: false,
        title: "MS",
        forename: "PRIYA",
        surname: "HALDANE",
        resignationDate: eventDate,
      },
    },
    { kind: "sail-address", caseName: "a SAIL address", body: { ...header, ...sail } },
    {
      kind: "record-location",
      caseName: "registers moved to the SAIL address",
      body: { ...header, destination: "sail", records: ["MEMBER", "DIRCONTRACT"] },
    },
    {
      kind: "record-location",
      caseName: "every register back at the registered office",
      body: { ...header, destination: "registered-office", removeSailAddress: true },
    },
    {
      kind: "change-of-name",
      caseName: "a change by resolution",
      body: {
        ...header,
        method: "resolution",
        proposedName: `${company.companyName.replace(/ LIMITED$/, "")} EXAMPLE SERVICES LIMITED`,
        meetingDate: daysBefore(today, 2),
        noticeGiven: true,
      },
    },
    {
      kind: "change-of-name",
      caseName: "a sensitive word with its letter of permission",
      body: {
        ...header,
        method: "resolution",
        proposedName: `${company.companyName.replace(/ LIMITED$/, "")} CHARTERED SURVEYORS LIMITED`,
        meetingDate: daysBefore(today, 2),
        noticeGiven: true,
        supportingDocument: { kind: "sensitive-word-permission", contentBase64: PERMISSION_LETTER_PDF },
      },
    },
    statementCase("NO_INDIVIDUAL_OR_ENTITY_WITH_SIGNFICANT_CONTROL"),
    statementCase("PSC_CONTACTED_BUT_NO_RESPONSE"),
    statementCase("RESTRICTIONS_NOTICE_ISSUED_TO_PSC"),
    statementCase("AWAITING_CONFIRMATION_FROM_PSC"),
    statementCase("PSC_HAS_FAILED_TO_CONFIRM_CHANGED_DETAILS", ELEANOR),
    {
      kind: "psc-statement-withdrawal",
      caseName: "a withdrawal",
      body: { ...header, statement: "PSC_CONTACTED_BUT_NO_RESPONSE", withdrawalDate: eventDate },
    },
    pscNotification("an individual (PSC01)", GWENLLIAN, ["OWNERSHIPOFSHARES_50TO75PERCENT", "VOTINGRIGHTS_50TO75PERCENT"]),
    pscNotification("an individual whose personal code is typed in its printed groups", { ...GWENLLIAN, personalCode: "CWMP S832 223" }, [
      "OWNERSHIPOFSHARES_25TO50PERCENT",
    ]),
    pscNotification("significant influence through a firm, beside shares held through it", GWENLLIAN, [
      "SIGINFLUENCECONTROL_AS_FIRM",
      "OWNERSHIPOFSHARES_25TO50PERCENT_AS_FIRM",
    ]),
    pscNotification("significant influence through a trust, beside voting rights held through it", GWENLLIAN, [
      "SIGINFLUENCECONTROL_AS_TRUST",
      "VOTINGRIGHTS_50TO75PERCENT_AS_TRUST",
    ]),
    pscNotification("a relevant legal entity (PSC02)", TEIFI_VALLEY, ["OWNERSHIPOFSHARES_75TO100PERCENT", "VOTINGRIGHTS_75TO100PERCENT"]),
    pscNotification(
      "an other registrable person (PSC03)",
      {
        ...TEIFI_VALLEY,
        pscKind: "legal-person-person-with-significant-control",
        name: "EXAMPLE COUNTY COUNCIL",
        legalForm: "Local authority",
        lawGoverned: "Local Government (Wales) Act 1994",
        placeRegistered: undefined,
        registrationNumber: undefined,
      },
      ["SIGINFLUENCECONTROL"],
    ),
    {
      kind: "officer-appointment",
      caseName: "a director who is a person (AP01)",
      body: {
        ...header,
        ...CARYS,
        officerRole: "director",
        corporate: false,
        appointmentDate: eventDate,
        consentToAct: true,
        serviceAddress: { sameAsRegisteredOffice: true },
        dateOfBirth: "1981-06-23",
        nationality: "Welsh",
        countryOfResidence: "Wales",
        residentialAddress: { address: CARDIFF },
        personalCode: "CWMPS832223",
        identityVerified: true,
      },
    },
    {
      kind: "officer-appointment",
      caseName: "a corporate director (AP02)",
      body: { ...header, ...DIRECTORCO, officerRole: "director", appointmentDate: eventDate, consentToAct: true },
    },
    {
      kind: "officer-appointment",
      caseName: "a secretary who is a person (AP03)",
      body: {
        ...header,
        ...CARYS,
        officerRole: "secretary",
        corporate: false,
        appointmentDate: eventDate,
        consentToAct: true,
        serviceAddress: { address: CARDIFF },
      },
    },
    {
      kind: "officer-appointment",
      caseName: "a corporate secretary registered outside the UK (AP04)",
      body: {
        ...header,
        ...DIRECTORCO,
        corporateName: "SECRETARIAT B.V.",
        companyIdentification: { nonUk: { lawGoverned: "Netherlands", legalForm: "Besloten vennootschap" } },
        officerRole: "secretary",
        appointmentDate: eventDate,
        consentToAct: true,
      },
    },
    {
      kind: "officer-change",
      caseName: "a director's change of name (CH01)",
      body: {
        ...header,
        officerRole: "director",
        corporate: false,
        dateOfChange: eventDate,
        title: "MRS",
        forename: "CARYS",
        surname: "REES",
        dateOfBirth: "1981-06-23",
        newName: CARYS,
      },
    },
    {
      kind: "officer-change",
      caseName: "a corporate director's new name and address (CH02)",
      body: {
        ...header,
        ...DIRECTORCO,
        officerRole: "director",
        dateOfChange: eventDate,
        newCorporateName: "DIRECTORCO HOLDINGS LIMITED",
        companyIdentification: undefined,
      },
    },
    {
      kind: "officer-change",
      caseName: "a secretary's service address (CH03)",
      body: {
        ...header,
        officerRole: "secretary",
        corporate: false,
        dateOfChange: eventDate,
        title: "MRS",
        forename: "CARYS",
        surname: "REES",
        serviceAddress: { sameAsRegisteredOffice: true },
      },
    },
    {
      kind: "officer-change",
      caseName: "a corporate secretary's new address (CH04)",
      body: {
        ...header,
        ...DIRECTORCO,
        corporateName: "TEIFI SECRETARIAL SERVICES (EXAMPLE) LIMITED",
        officerRole: "secretary",
        dateOfChange: eventDate,
        companyIdentification: undefined,
      },
    },
    allotment("an allotment of ordinary shares (SH01)", eventDate),
    allotment("a late return, filed three months after the allotment, with the capital confirmed", daysBefore(today, 95), {
      capitalDifferenceConfirmed: true,
    }),
    {
      kind: "change-of-name",
      caseName: "a Welsh company's name ending CYFYNGEDIG",
      expectedOutcome: "REJECT",
      note: "GOV.UK allows the Welsh endings Cyfyngedig and Cyf only for a company registered in Wales, and the test company is registered in England; the first test-service run checks that the gateway refuses it.",
      body: {
        ...header,
        method: "resolution",
        proposedName: `${company.companyName.replace(/ LIMITED$/, "")} CYMRU CYFYNGEDIG`,
        meetingDate: daysBefore(today, 2),
        noticeGiven: true,
      },
    },
    {
      kind: "allotment-of-shares",
      caseName: "a company with pounds capital allots dollar shares",
      body: {
        ...header,
        startDate: eventDate,
        allotments: [allottedShares("Ordinary", "USD", "50", "1", "1")],
        statementOfCapital: [currencyCapital("GBP", [["Ordinary", "100", "100"]]), currencyCapital("USD", [["Ordinary", "50", "50"]])],
      },
    },
    {
      kind: "allotment-of-shares",
      caseName: "a company with pounds and euro capital allots in both",
      body: {
        ...header,
        startDate: eventDate,
        allotments: [allottedShares("Ordinary", "GBP", "20", "1", "1.5"), allottedShares("Euro Ordinary", "EUR", "5", "1", "1")],
        statementOfCapital: [currencyCapital("GBP", [["Ordinary", "120", "120"]]), currencyCapital("EUR", [["Euro Ordinary", "15", "15"]])],
      },
    },
  ];
  return cases.map((testCase) => ({ expectedOutcome: "ACCEPT", ...testCase }));
}

/**
 * Six-character submission numbers, unique within the run, for envelopes that are validated and
 * not sent. A filed case takes its number from the filing route's own allocator.
 * @param {number} count
 * @param {number} [seed]
 * @returns {string[]}
 */
export function validationSubmissionNumbers(count, seed = Math.floor(Date.now() / 1000)) {
  const space = 36 ** 6;
  return Array.from({ length: count }, (_, index) => ((seed + index) % space).toString(36).toUpperCase().padStart(6, "0"));
}

/**
 * The form body and the GovTalk envelope of one case, built as the filing route builds them, with
 * the test flag set.
 * @param {{kind: string, body: object}} testCase
 * @param {{submissionNumber: string, presenterId?: string, presenterCode?: string, packageReference?: string}} input
 * @returns {{formXml: string, envelopeXml: string, requestErrors: string[]}}
 */
export function buildTestSubmission(testCase, { submissionNumber, ...overrides }) {
  const { presenterId, presenterCode, packageReference } = {
    ...VALIDATION_PRESENTER,
    packageReference: VALIDATION_PACKAGE_REFERENCE,
    ...overrides,
  };
  const { gatewayClass, formIdentifier } = COMPANIES_HOUSE_FORMS[testCase.kind];
  const { extractAndValidate, buildFormXml, buildDocument } = GATEWAY_FORM_BUILDERS[testCase.kind];
  const requestErrors = [];
  const form = { ...testCase.body, ...extractAndValidate(testCase.body, requestErrors) };
  if (requestErrors.length) return { formXml: "", envelopeXml: "", requestErrors };
  const formXml = buildFormXml(form);
  const envelopeXml = buildFormSubmission({
    presenterId,
    presenterCode,
    companyNumber: form.companyNumber,
    companyName: form.companyName,
    companyAuthenticationCode: form.companyAuthCode,
    packageReference,
    gatewayClass,
    formIdentifier,
    submissionNumber,
    dateSigned: form.dateSigned,
    formXml,
    document: buildDocument ? buildDocument(form) : undefined,
    gatewayTest: true,
  });
  return { formXml, envelopeXml, requestErrors };
}

function schemaFiles() {
  const read = (folder, name) => readFileSync(join(SCHEMA_DIR, folder, name), "utf8");
  const top = readdirSync(SCHEMA_DIR).filter((name) => name.endsWith(".xsd"));
  const vocabularies = readdirSync(join(SCHEMA_DIR, "vocabularies")).filter((name) => name.endsWith(".xsd"));
  return [
    ...top.map((name) => ({ fileName: name, contents: read("", name) })),
    // A form schema includes its base types from the folder above, as on the gateway.
    ...top.map((name) => ({ fileName: `forms/${name}`, contents: read("", name) })),
    ...vocabularies.map((name) => ({ fileName: `vocabularies/${name}`, contents: read("vocabularies", name) })),
  ];
}

const messagesOf = (result) => (result.valid ? [] : result.errors.map((error) => error.message));

/**
 * The schema errors of a case's form body (against the form's schema) and of its whole envelope
 * (the GovTalk envelope, FormSubmission and the form schema together), [] where valid.
 * @param {{formXml: string, envelopeXml: string}} built
 * @param {string} schema - the form's schema file in fixtures/companies-house-xmlgw
 * @returns {Promise<{bodyErrors: string[], envelopeErrors: string[]}>}
 */
export async function validateTestSubmission({ formXml, envelopeXml }, schema) {
  const preload = schemaFiles();
  const body = await validateXML({
    xml: [{ fileName: "form.xml", contents: formXml }],
    schema: [{ fileName: `forms/${schema}`, contents: readFileSync(join(SCHEMA_DIR, schema), "utf8") }],
    preload,
  });
  const driver = `<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:test-submission-envelope">
  <xs:import namespace="http://www.govtalk.gov.uk/CM/envelope" schemaLocation="Egov_ch-v2-0.xsd"/>
  <xs:import namespace="http://xmlgw.companieshouse.gov.uk/Header" schemaLocation="forms/FormSubmission-v2-11.xsd"/>
  <xs:import namespace="http://xmlgw.companieshouse.gov.uk" schemaLocation="forms/${schema}"/>
</xs:schema>`;
  const envelope = await validateXML({
    xml: [{ fileName: "envelope.xml", contents: envelopeXml }],
    schema: [{ fileName: "envelope-driver.xsd", contents: driver }],
    preload,
  });
  return { bodyErrors: messagesOf(body), envelopeErrors: messagesOf(envelope) };
}

/**
 * Whether --file sends a case: a form with a fee only when fee forms are included.
 * @param {{kind: string}} testCase
 * @param {boolean} includeFeeForms
 * @returns {{send: boolean, reason?: string}}
 */
export function fileDecision(testCase, includeFeeForms) {
  const { fee, label } = COMPANIES_HOUSE_FORMS[testCase.kind];
  if (fee && !includeFeeForms) {
    return {
      send: false,
      reason: `skipped: Companies House charges a fee for a ${label}, and no published document says whether a test submission is charged to the presenter's account; give --include-fee-forms to file it`,
    };
  }
  return { send: true };
}

function parseArgs(argv) {
  const args = { file: false, includeFeeForms: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = () => {
      index += 1;
      if (argv[index] === undefined) throw new Error(`${flag} needs a value`);
      return argv[index];
    };
    if (flag === "--out") args.out = value();
    else if (flag === "--form") args.form = value();
    else if (flag === "--file") args.file = true;
    else if (flag === "--include-fee-forms") args.includeFeeForms = true;
    else if (flag === "--measure-lag") args.measureLag = true;
    else if (flag === "--user-sub") args.userSub = value();
    else if (flag === "--auth-code") args.authCode = value();
    else if (flag === "--company-number") args.companyNumber = value();
    else if (flag === "--company-name") args.companyName = value();
    else if (flag === "--current-period-end") args.currentPeriodEnd = value();
    else throw new Error(`unknown argument ${flag}`);
  }
  if (!args.out) throw new Error("--out <path> is required");
  if (args.measureLag && !args.file) throw new Error("--measure-lag needs --file: it measures the lag after a filing it makes");
  if (args.file && !args.userSub) throw new Error("--file needs --user-sub, the Submit account the filings are made under");
  if (args.file && !args.authCode) throw new Error("--file needs --auth-code, the test company's authentication code");
  if (args.file && process.env.COMPANIES_HOUSE_GATEWAY_TEST !== "true") {
    throw new Error("--file needs COMPANIES_HOUSE_GATEWAY_TEST=true, so every filing carries the test flag");
  }
  if (args.form && !GATEWAY_FORM_BUILDERS[args.form]) {
    throw new Error(`unknown --form ${args.form}; one of ${Object.keys(GATEWAY_FORM_BUILDERS).join(", ")}`);
  }
  return args;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The filing route's own Lambda handler code, called with the event API Gateway would give it.
/**
 * The first filing in a filing history answer whose transaction id is not among the earlier ones.
 * @param {Set<string>} earlierIds
 * @param {Array<{transactionId: string}>} filings
 * @returns {object|undefined}
 */
export function firstNewFiling(earlierIds, filings) {
  return filings.find((filing) => filing.transactionId && !earlierIds.has(filing.transactionId));
}

/**
 * Reads the filing history until a filing not among the earlier ones shows, or the limit passes.
 * A read that fails (a lookup limit, a Companies House error) is counted and the reads go on.
 * @param {object} input
 * @param {() => Promise<{filings?: object[]}|null>} input.readHistory - one read; null when it failed
 * @param {Set<string>} input.earlierIds - the transaction ids read before the filing was sent
 * @param {number} input.acceptedAtMs
 * @param {(ms: number) => Promise<void>} [input.wait]
 * @param {() => number} [input.now]
 * @returns {Promise<{shown: boolean, minutes: number, reads: number, failedReads: number, transactionId?: string, type?: string}>}
 */
export async function measureLag({ readHistory, earlierIds, acceptedAtMs, wait = sleep, now = Date.now }) {
  let reads = 0;
  let failedReads = 0;
  const minutesSinceAcceptance = () => Math.round((now() - acceptedAtMs) / 6000) / 10;
  while (now() - acceptedAtMs <= LAG_READ_LIMIT_MS) {
    const history = await readHistory();
    reads += 1;
    if (!history) failedReads += 1;
    const shown = history ? firstNewFiling(earlierIds, history.filings ?? []) : undefined;
    if (shown)
      return { shown: true, minutes: minutesSinceAcceptance(), reads, failedReads, transactionId: shown.transactionId, type: shown.type };
    await wait(LAG_READ_INTERVAL_MS);
  }
  return { shown: false, minutes: minutesSinceAcceptance(), reads, failedReads };
}

// One read of the company's filing history through Submit's company lookup route; null when it failed.
async function readFilingHistory(companyNumber, userSub) {
  const { ingestHandler } = await import("../app/functions/companies-house/companiesHouseFilingHistoryGet.js");
  const path = `/api/v1/companies-house/company/${companyNumber}/filing-history`;
  const response = await ingestHandler({
    requestContext: {
      requestId: `test-submission-lag-${Date.now()}`,
      http: { method: "GET", path },
      authorizer: { lambda: { sub: userSub } },
    },
    headers: {},
    pathParameters: { companyNumber },
  });
  return response.statusCode === 200 ? JSON.parse(response.body || "{}") : null;
}

async function fileThroughSubmit(testCase, userSub) {
  const { fileCompaniesHouseForm } = await import("../app/services/companiesHouseFormFiling.js");
  const { pollSubmission } = await import("../app/services/companiesHouseSubmissionStatus.js");
  const path = `/api/v1/companies-house/${COMPANIES_HOUSE_FORMS[testCase.kind].routeSegment}`;
  const event = {
    requestContext: {
      requestId: `test-submission-${Date.now()}`,
      http: { method: "POST", path },
      authorizer: { lambda: { sub: userSub } },
    },
    headers: { "content-type": "application/json" },
    body: JSON.stringify(testCase.body),
  };
  const response = await fileCompaniesHouseForm(event, testCase.kind);
  const answer = JSON.parse(response.body || "{}");
  if (response.statusCode !== 201) return { submissionNumber: answer.error?.submissionNumber, httpStatus: response.statusCode, answer };
  const { submissionNumber } = answer;
  const started = Date.now();
  let polled;
  do {
    await sleep(POLL_INTERVAL_MS);
    polled = await pollSubmission({ userSub, submissionNumber, kind: testCase.kind });
  } while (
    !polled.errors &&
    !polled.notFound &&
    !FINAL_STATUS_CODES.includes(polled.data?.statusCode) &&
    Date.now() - started < POLL_LIMIT_MS
  );
  return { submissionNumber, httpStatus: response.statusCode, answer: polled };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  assertOutsideRepository(dirname(args.out), resolveRepoRoot());
  const company = {
    companyNumber: args.companyNumber ?? DEFAULT_TEST_COMPANY.companyNumber,
    companyName: args.companyName ?? DEFAULT_TEST_COMPANY.companyName,
  };
  const cases = testSubmissionCases({
    company,
    companyAuthCode: args.authCode ?? VALIDATION_AUTH_CODE,
    ...(args.currentPeriodEnd ? { currentPeriodEnd: args.currentPeriodEnd } : {}),
  }).filter((testCase) => !args.form || testCase.kind === args.form);
  const numbers = validationSubmissionNumbers(cases.length);
  mkdirSync(dirname(args.out), { recursive: true });
  writeFileSync(args.out, "");

  const rows = [];
  for (const [index, testCase] of cases.entries()) {
    const { formIdentifier, schema } = COMPANIES_HOUSE_FORMS[testCase.kind];
    const built = buildTestSubmission(testCase, { submissionNumber: numbers[index] });
    const { bodyErrors, envelopeErrors } = built.requestErrors.length
      ? { bodyErrors: [], envelopeErrors: [] }
      : await validateTestSubmission(built, schema);
    const valid = built.requestErrors.length === 0 && bodyErrors.length === 0 && envelopeErrors.length === 0;
    const line = {
      // The number of the envelope that was validated; a filed case carries the number the filing
      // route allocated in its place, and null when the route refused the request before allocating one.
      submissionNumber: numbers[index],
      kind: testCase.kind,
      formIdentifier,
      caseName: testCase.caseName,
      expectedOutcome: testCase.expectedOutcome,
      ...(testCase.note ? { note: testCase.note } : {}),
      valid,
      requestErrors: built.requestErrors,
      bodyErrors,
      envelopeErrors,
    };
    if (args.file && valid) {
      const decision = fileDecision(testCase, args.includeFeeForms);
      if (decision.send) {
        const { companyNumber } = testCase.body;
        const earlier = args.measureLag ? await readFilingHistory(companyNumber, args.userSub) : null;
        const filed = await fileThroughSubmit(testCase, args.userSub);
        Object.assign(line, filed, { submissionNumber: filed.submissionNumber ?? null, validatedSubmissionNumber: numbers[index] });
        if (args.measureLag && filed.answer?.data?.statusCode === "ACCEPT") {
          line.lag = earlier
            ? await measureLag({
                readHistory: () => readFilingHistory(companyNumber, args.userSub),
                earlierIds: new Set((earlier.filings ?? []).map((filing) => filing.transactionId)),
                acceptedAtMs: Date.now(),
              })
            : { shown: false, reason: "the filing history could not be read before the filing was sent" };
        }
      } else {
        line.skipped = decision.reason;
      }
    }
    appendFileSync(args.out, `${JSON.stringify(line)}\n`);
    rows.push(line);
  }

  console.log("| Form | Case | Expected | Valid |");
  console.log("| --- | --- | --- | --- |");
  for (const row of rows) {
    console.log(`| ${row.formIdentifier} | ${row.caseName} | ${row.expectedOutcome} | ${row.valid ? "yes" : "no"} |`);
  }
  for (const row of rows.filter((candidate) => candidate.lag)) {
    const where = row.lag.shown ? "on the register" : "not on the register";
    console.log(`${row.formIdentifier} ${row.caseName}: ${where} ${row.lag.minutes ?? "-"} minutes after the acceptance`);
  }
  for (const row of rows.filter((candidate) => !candidate.valid)) {
    console.log(`${row.formIdentifier} ${row.caseName}: ${[...row.requestErrors, ...row.bodyErrors, ...row.envelopeErrors].join("; ")}`);
  }
  if (rows.some((row) => !row.valid)) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
