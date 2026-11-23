// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Each length limit in a form's textFields is the schema's own: a value of exactly that many
// characters, read by the form's request reader and built by its builder, is valid against the
// form's schema, and one character more is refused by the reader, the builder or the schema.

import { describe, test, expect } from "vitest";
import { GATEWAY_FORM_BUILDERS } from "@app/services/companiesHouseForms.js";
import { buildConfirmationStatementBody, selectConfirmationStatementSchema } from "@app/services/companiesHouseConfirmationStatementXml.js";
import { COMPANIES_HOUSE_FORMS } from "../../../web/public/lib/companies-house-forms.js";
import { gatewayFormSchemaErrors } from "../helpers/gatewayFormSchema.js";

const COMPANY = { companyNumber: "06846849", companyName: "EXAMPLE LIMITED", companyAuthCode: "SIMCS01", dateSigned: "2026-11-20" };
const ADDRESS = {
  premise: "1",
  street: "Mill Lane",
  thoroughfare: "Old Town",
  postTown: "Cardiff",
  county: "Glamorgan",
  postcode: "CF10 1AA",
};
const FOREIGN = { ...ADDRESS, country: undefined, otherForeignCountry: "France" };
const PERSON = { title: "MRS", forename: "ELEANOR", otherForenames: "MAY", surname: "BRAMWELL" };
const DATES = { cessationDate: "2026-11-01", confirmationDate: "2026-11-03" };
const INDIVIDUAL = "individual-person-with-significant-control";
const CORPORATE = "corporate-entity-person-with-significant-control";
const LEGAL_PERSON = "legal-person-person-with-significant-control";

// Requests that between them fill every text field each form names; a field is checked on the
// first of its form's requests whose built body carries it.
const REQUESTS = {
  "psc-verification-statement": [{ ...PERSON, personalCode: "CWMPS832223" }],
  "psc-cessation": [
    { pscKind: INDIVIDUAL, ...PERSON, ...DATES },
    { pscKind: CORPORATE, name: "HOLDCO LIMITED", ...DATES },
  ],
  "psc-change-details": [
    {
      pscKind: INDIVIDUAL,
      ...PERSON,
      address: { ...ADDRESS, country: "GB-WLS" },
      dateOfChange: "2026-11-01",
      confirmationDate: "2026-11-03",
    },
    { pscKind: INDIVIDUAL, ...PERSON, address: FOREIGN, dateOfChange: "2026-11-01", confirmationDate: "2026-11-03" },
    {
      pscKind: CORPORATE,
      name: "HOLDCO LIMITED",
      naturesOfControl: ["SIGINFLUENCECONTROL"],
      dateOfChange: "2026-11-01",
      confirmationDate: "2026-11-03",
    },
    {
      pscKind: INDIVIDUAL,
      ...PERSON,
      newName: { ...PERSON, surname: "LLEWELYN" },
      residentialAddress: { ...ADDRESS, country: "GB-WLS" },
      nationality: "WELSH",
      countryOfResidence: "WALES",
      dateOfChange: "2026-11-01",
      confirmationDate: "2026-11-03",
    },
    { pscKind: INDIVIDUAL, ...PERSON, residentialAddress: FOREIGN, dateOfChange: "2026-11-01", confirmationDate: "2026-11-03" },
    {
      pscKind: CORPORATE,
      name: "HOLDCO LIMITED",
      newName: "HOLDCO GROUP LIMITED",
      identification: {
        legalForm: "PRIVATE LIMITED COMPANY",
        lawGoverned: "COMPANIES ACT 2006",
        placeRegistered: "COMPANIES HOUSE",
        registrationNumber: "12345678",
        countryOrState: "WALES",
      },
      dateOfChange: "2026-11-01",
      confirmationDate: "2026-11-03",
    },
  ],
  "officer-resignation": [
    { officerRole: "director", corporate: false, ...PERSON, dateOfBirth: "1975-02-14", resignationDate: "2026-11-01" },
    { officerRole: "director", corporate: true, corporateName: "DIRECTORCO LIMITED", resignationDate: "2026-11-01" },
  ],
  "sail-address": [{ address: { ...ADDRESS, careOfName: "THE SECRETARY", poBox: "PO 12", country: "GB-WLS" } }],
  "psc-statement-notification": [
    { statement: "PSC_HAS_FAILED_TO_CONFIRM_CHANGED_DETAILS", pscKind: INDIVIDUAL, ...PERSON, relevantDate: "2026-11-01" },
    { statement: "PSC_HAS_FAILED_TO_CONFIRM_CHANGED_DETAILS", pscKind: CORPORATE, name: "HOLDCO LIMITED", relevantDate: "2026-11-01" },
  ],
  "psc-statement-withdrawal": [
    { statement: "PSC_HAS_FAILED_TO_CONFIRM_CHANGED_DETAILS", pscKind: INDIVIDUAL, ...PERSON, withdrawalDate: "2026-11-05" },
    { statement: "PSC_HAS_FAILED_TO_CONFIRM_CHANGED_DETAILS", pscKind: CORPORATE, name: "HOLDCO LIMITED", withdrawalDate: "2026-11-05" },
  ],
  "psc-notification": [
    {
      pscKind: INDIVIDUAL,
      ...PERSON,
      dateOfBirth: "1970-01-14",
      nationality: "WELSH",
      countryOfResidence: "WALES",
      serviceAddress: { address: { ...ADDRESS, country: "GB-WLS" } },
      residentialAddress: { address: { ...ADDRESS, country: "GB-WLS" } },
      naturesOfControl: ["SIGINFLUENCECONTROL"],
      notificationDate: "2026-10-28",
      confirmationDate: "2026-11-04",
    },
    {
      pscKind: INDIVIDUAL,
      ...PERSON,
      dateOfBirth: "1970-01-14",
      nationality: "WELSH",
      countryOfResidence: "WALES",
      serviceAddress: { address: FOREIGN },
      residentialAddress: { address: FOREIGN },
      naturesOfControl: ["SIGINFLUENCECONTROL"],
      notificationDate: "2026-10-28",
      confirmationDate: "2026-11-04",
    },
    {
      pscKind: CORPORATE,
      name: "HOLDCO LIMITED",
      address: { ...ADDRESS, country: "GB-WLS" },
      legalForm: "PRIVATE LIMITED COMPANY",
      lawGoverned: "COMPANIES ACT 2006",
      placeRegistered: "COMPANIES HOUSE",
      registrationNumber: "12345678",
      countryOrState: "WALES",
      naturesOfControl: ["SIGINFLUENCECONTROL"],
      notificationDate: "2026-10-28",
      confirmationDate: "2026-11-04",
    },
    {
      pscKind: LEGAL_PERSON,
      name: "THE FOUNDATION",
      address: FOREIGN,
      legalForm: "FOUNDATION",
      lawGoverned: "SWISS LAW",
      naturesOfControl: ["SIGINFLUENCECONTROL"],
      notificationDate: "2026-10-28",
      confirmationDate: "2026-11-04",
    },
  ],
  "officer-appointment": [
    {
      officerRole: "director",
      corporate: false,
      appointmentDate: "2026-11-02",
      consentToAct: true,
      ...PERSON,
      serviceAddress: { address: { ...ADDRESS, country: "GB-WLS" } },
      previousNames: [{ forename: "ELLA", surname: "REES" }],
      dateOfBirth: "1981-06-23",
      nationality: "WELSH",
      countryOfResidence: "WALES",
      residentialAddress: { address: { ...ADDRESS, country: "GB-WLS" } },
      personalCode: "CWMPS832223",
      identityVerified: true,
    },
    {
      officerRole: "director",
      corporate: false,
      appointmentDate: "2026-11-02",
      consentToAct: true,
      ...PERSON,
      serviceAddress: { address: FOREIGN },
      dateOfBirth: "1981-06-23",
      nationality: "WELSH",
      countryOfResidence: "WALES",
      residentialAddress: { address: FOREIGN },
      personalCode: "CWMPS832223",
      identityVerified: true,
    },
    {
      officerRole: "director",
      corporate: true,
      appointmentDate: "2026-11-02",
      consentToAct: true,
      corporateName: "DIRECTORCO LIMITED",
      address: { ...ADDRESS, country: "GB-WLS" },
      companyIdentification: { uk: { registrationNumber: "01234567" } },
    },
    {
      officerRole: "director",
      corporate: true,
      appointmentDate: "2026-11-02",
      consentToAct: true,
      corporateName: "DIRECTORCO LIMITED",
      address: FOREIGN,
      companyIdentification: {
        nonUk: { placeRegistered: "REGISTRE", registrationNumber: "B123", lawGoverned: "FRENCH LAW", legalForm: "SA" },
      },
    },
  ],
  "officer-change": [
    {
      officerRole: "director",
      corporate: false,
      dateOfChange: "2026-11-09",
      ...PERSON,
      dateOfBirth: "1981-06-23",
      newName: { ...PERSON, surname: "LLEWELYN" },
      serviceAddress: { address: { ...ADDRESS, country: "GB-WLS" } },
      residentialAddress: { address: { ...ADDRESS, country: "GB-WLS" } },
      nationality: "WELSH",
      countryOfResidence: "WALES",
    },
    {
      officerRole: "director",
      corporate: false,
      dateOfChange: "2026-11-09",
      ...PERSON,
      dateOfBirth: "1981-06-23",
      serviceAddress: { address: FOREIGN },
      residentialAddress: { address: FOREIGN },
    },
    {
      officerRole: "director",
      corporate: true,
      dateOfChange: "2026-11-09",
      corporateName: "DIRECTORCO LIMITED",
      newCorporateName: "DIRECTORCO HOLDINGS LIMITED",
      address: { ...ADDRESS, country: "GB-WLS" },
      companyIdentification: { uk: { registrationNumber: "01234567" } },
    },
    {
      officerRole: "director",
      corporate: true,
      dateOfChange: "2026-11-09",
      corporateName: "DIRECTORCO LIMITED",
      address: FOREIGN,
      companyIdentification: {
        nonUk: { placeRegistered: "REGISTRE", registrationNumber: "B123", lawGoverned: "FRENCH LAW", legalForm: "SA" },
      },
    },
  ],
};

// A request with the field at a path set to a value; "[]" sets the first entry.
function withValue(request, path, value) {
  const copy = structuredClone(request);
  let node = copy;
  const segments = path.split(".");
  for (const [index, segment] of segments.entries()) {
    const key = segment.endsWith("[]") ? segment.slice(0, -2) : segment;
    if (segment.endsWith("[]")) {
      if (!Array.isArray(node[key]) || node[key].length === 0) return null;
      node = node[key][0];
    } else if (index === segments.length - 1) {
      node[key] = value;
    } else {
      if (node[key] === undefined || node[key] === null || typeof node[key] !== "object") return null;
      node = node[key];
    }
  }
  return copy;
}

// What the form's reader and builder make of a request: the body, or the reason they refused it.
function built(kind, request) {
  const errors = [];
  const form = { ...COMPANY, ...GATEWAY_FORM_BUILDERS[kind].extractAndValidate({ ...COMPANY, ...request }, errors) };
  if (errors.length) return { refused: errors.join("; ") };
  try {
    return { xml: GATEWAY_FORM_BUILDERS[kind].buildFormXml(form) };
  } catch (error) {
    return { refused: error.message };
  }
}

// A value of a length made of letters every name and address pattern takes.
const filler = (length) => "AB".repeat(length).slice(0, length);

describe("each form's text field limits are its schema's", () => {
  for (const [kind, requests] of Object.entries(REQUESTS)) {
    const { textFields, schema } = COMPANIES_HOUSE_FORMS[kind];
    for (const [path, maxLength] of Object.entries(textFields)) {
      test(`${kind} ${path}: ${maxLength} characters are valid against ${schema} and ${maxLength + 1} are refused`, async () => {
        let filled = null;
        for (const request of requests) {
          const atLimit = withValue(request, path, filler(maxLength));
          if (!atLimit) continue;
          const result = built(kind, atLimit);
          if (result.xml && result.xml.includes(`>${filler(maxLength)}<`)) {
            filled = request;
            expect(await gatewayFormSchemaErrors(result.xml, schema)).toEqual([]);
            break;
          }
        }
        expect(filled, `no request of ${kind} carries ${path} into its body`).not.toBeNull();
        const over = built(kind, withValue(filled, path, filler(maxLength + 1)));
        if (over.xml) expect((await gatewayFormSchemaErrors(over.xml, schema)).length).toBeGreaterThan(0);
      });
    }
  }
});

// The confirmation statement's own builder: its schema is ConfirmationStatement-v1-3 once every
// officer is verified, and ConfirmationAndVerificationStatement-v1-0, which carries the directors,
// before.
const VERIFIED = { identityVerificationDetails: { appointment_verification_end_on: "9999-12-31" } };
const UNVERIFIED = { identityVerificationDetails: { appointment_verification_end_on: null } };
const STATEMENT = {
  reviewDate: "2025-09-21",
  stateConfirmationAccepted: true,
  statementOfCapital: {
    totalAmountUnpaid: "0",
    totalNumberOfIssuedShares: "100",
    shareCurrency: "GBP",
    totalAggregateNominalValue: "100",
    shares: [{ shareClass: "ORDINARY", prescribedParticulars: "ORDINARY SHARES", numShares: "100", aggregateNominalValue: "100" }],
  },
};
const STATEMENT_REQUESTS = [
  {
    ...STATEMENT,
    officers: [VERIFIED],
    shareholdings: [
      {
        shareClass: "ORDINARY",
        numberHeld: "10",
        shareholders: [{ surname: "JONES", forename: "ANN", address: { ...ADDRESS, country: "GB-WLS" } }],
      },
    ],
  },
  {
    ...STATEMENT,
    officers: [VERIFIED],
    shareholdings: [{ shareClass: "ORDINARY", numberHeld: "10", shareholders: [{ surname: "JONES", address: FOREIGN }] }],
  },
  {
    ...STATEMENT,
    officers: [VERIFIED],
    shareholdings: [{ shareClass: "ORDINARY", numberHeld: "10", shareholders: [{ amalgamatedName: "JONES FAMILY" }] }],
  },
  {
    ...STATEMENT,
    officers: [UNVERIFIED],
    directors: [
      { personalCode: "CWMPS832223", title: "MRS", forename: "ALICE", otherForenames: "MAY", surname: "EXAMPLE", dob: "1970-01-01" },
    ],
  },
];

function builtStatement(request) {
  try {
    return { xml: buildConfirmationStatementBody(request), schema: selectConfirmationStatementSchema(request.officers).xsdFile };
  } catch (error) {
    return { refused: error.message };
  }
}

describe("the confirmation statement's text field limits are its schemas'", () => {
  for (const [path, maxLength] of Object.entries(COMPANIES_HOUSE_FORMS["confirmation-statement"].textFields)) {
    test(`${path}: ${maxLength} characters are valid against its schema and ${maxLength + 1} are refused`, async () => {
      let filled = null;
      for (const request of STATEMENT_REQUESTS) {
        const atLimit = withValue(request, path, filler(maxLength));
        if (!atLimit) continue;
        const result = builtStatement(atLimit);
        if (result.xml && result.xml.includes(`>${filler(maxLength)}<`)) {
          filled = request;
          expect(await gatewayFormSchemaErrors(result.xml, result.schema)).toEqual([]);
          break;
        }
      }
      expect(filled, `no confirmation statement request carries ${path} into its body`).not.toBeNull();
      const over = builtStatement(withValue(filled, path, filler(maxLength + 1)));
      if (over.xml) expect((await gatewayFormSchemaErrors(over.xml, over.schema)).length).toBeGreaterThan(0);
    });
  }
});
