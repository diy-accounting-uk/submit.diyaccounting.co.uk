// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/services/companiesHouseFormFiling.test.js
import { describe, test, beforeEach, expect, vi } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { buildLambdaEvent } from "@app/test-helpers/eventBuilders.js";
import { setupTestEnv } from "@app/test-helpers/mockHelpers.js";

const mockSend = vi.fn();

vi.mock("@aws-sdk/lib-dynamodb", () => {
  class Command {
    constructor(input) {
      this.input = input;
    }
  }
  return {
    DynamoDBDocumentClient: { from: () => ({ send: mockSend }) },
    QueryCommand: class extends Command {},
    PutCommand: class extends Command {},
    GetCommand: class extends Command {},
    UpdateCommand: class extends Command {},
  };
});

vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: class {
    constructor() {}
  },
}));

const mockEventBridgeSend = vi.fn().mockResolvedValue({});
vi.mock("@aws-sdk/client-eventbridge", () => ({
  EventBridgeClient: class {
    send(...args) {
      return mockEventBridgeSend(...args);
    }
  },
  PutEventsCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
}));

const mockLogger = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }));
vi.mock("@app/lib/logger.js", async (importOriginal) => ({ ...(await importOriginal()), createLogger: () => mockLogger }));

const mockBuildFormSubmission = vi.fn();
const mockPostToGateway = vi.fn();
const mockParseGatewayResponse = vi.fn();
vi.mock("@app/services/companiesHouseXmlGateway.js", async (importOriginal) => ({
  gatewayRequestNotDelivered: (await importOriginal()).gatewayRequestNotDelivered,
  buildFormSubmission: (...args) => mockBuildFormSubmission(...args),
  allocateSubmissionNumber: async () => "00001A",
  postToGateway: (...args) => mockPostToGateway(...args),
  parseGatewayResponse: (...args) => mockParseGatewayResponse(...args),
  resolvePresenterCredentials: async () => ({ presenterId: "presenter-id", presenterCode: "presenter-code" }),
}));

vi.mock("@app/services/companiesHouseCache.js", () => ({
  cachedCompaniesHouseGet: vi.fn(async () => ({ ok: true, data: { jurisdiction: "england-wales" } })),
}));

// The allotment's capital check against the register has its own tests with the handler; here the
// register agrees, so the shared route is what each case exercises.
vi.mock("@app/services/companiesHouseAllotmentRegister.js", async (importOriginal) => ({
  ...(await importOriginal()),
  refuseCapitalUnlikeRegister: async () => undefined,
}));

import { fileCompaniesHouseForm } from "@app/services/companiesHouseFormFiling.js";
import { GATEWAY_FORM_BUILDERS } from "@app/services/companiesHouseForms.js";
import { findMatchingActivitiesForUrlPath } from "@app/services/bundleManagement.js";
import { loadCatalogFromRoot } from "@app/services/productCatalog.js";
import {
  COMPANIES_HOUSE_FORMS,
  companiesHouseFormPath,
  companiesHouseFormPollPath,
} from "../../../web/public/lib/companies-house-forms.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const COMPANY_AUTH_CODE = "ZQ7XK4W9";

// A request each form's own check accepts. A form added to GATEWAY_FORM_BUILDERS adds its fields here.
const FORM_FIELDS = {
  "psc-verification-statement": { surname: "BRAMWELL", personalCode: "CWMPS832223" },
  "psc-cessation": {
    pscKind: "individual-person-with-significant-control",
    surname: "BRAMWELL",
    cessationDate: "2026-11-01",
    confirmationDate: "2026-11-03",
  },
  "psc-change-details": {
    pscKind: "individual-person-with-significant-control",
    surname: "BRAMWELL",
    naturesOfControl: ["OWNERSHIPOFSHARES_75TO100PERCENT", "VOTINGRIGHTS_75TO100PERCENT"],
    dateOfChange: "2026-11-01",
    confirmationDate: "2026-11-03",
  },
  "accounting-reference-date": { currentPeriodEnd: "2026-03-31", newPeriodEnd: "2026-01-31" },
  "officer-resignation": {
    officerRole: "director",
    corporate: false,
    surname: "BRAMWELL",
    dateOfBirth: "1975-02-14",
    resignationDate: "2026-11-01",
  },
  "sail-address": {
    address: { premise: "Unit 4, Harbour House", street: "12 Quay Street", postTown: "Bristol", country: "GB-ENG", postcode: "BS1 4DJ" },
  },
  "record-location": { destination: "sail", records: ["MEMBER", "DIRCONTRACT"] },
  // A form with a fee is filed here only under the filer's own presenter, whose account Companies House charges.
  "change-of-name": {
    method: "resolution",
    proposedName: "Bramwell Tennant Trading Limited",
    meetingDate: "2026-11-20",
    sameDay: false,
    noticeGiven: true,
    ownPresenter: { id: "66666666000", code: "OWNCODE1" },
  },
  "psc-statement-notification": { statement: "NO_INDIVIDUAL_OR_ENTITY_WITH_SIGNFICANT_CONTROL", relevantDate: "2026-11-01" },
  "psc-statement-withdrawal": { statement: "PSC_CONTACTED_BUT_NO_RESPONSE", withdrawalDate: "2026-11-05" },
  "psc-notification": {
    pscKind: "individual-person-with-significant-control",
    surname: "PRYCE",
    dateOfBirth: "1978-03-14",
    nationality: "British",
    countryOfResidence: "Wales",
    serviceAddress: { sameAsRegisteredOffice: true },
    residentialAddress: { address: { premise: "4", street: "Heol y Bont", postTown: "Cardiff", country: "GB-WLS", postcode: "CF10 1AA" } },
    naturesOfControl: ["OWNERSHIPOFSHARES_50TO75PERCENT", "VOTINGRIGHTS_50TO75PERCENT"],
    notificationDate: "2026-10-28",
    confirmationDate: "2026-11-04",
  },
  "officer-appointment": {
    officerRole: "director",
    corporate: false,
    appointmentDate: "2026-11-02",
    consentToAct: true,
    surname: "LLEWELYN",
    serviceAddress: { sameAsRegisteredOffice: true },
    dateOfBirth: "1981-06-23",
    nationality: "Welsh",
    countryOfResidence: "Wales",
    residentialAddress: { address: { premise: "16", street: "Heol y Bont", postTown: "Cardiff", country: "GB-WLS", postcode: "CF10 1AA" } },
    personalCode: "CWMPS832223",
    identityVerified: true,
  },
  "officer-change": {
    officerRole: "director",
    corporate: false,
    dateOfChange: "2026-11-09",
    surname: "REES",
    dateOfBirth: "1981-06-23",
    newName: { title: "MRS", forename: "CARYS", surname: "LLEWELYN" },
  },
  "allotment-of-shares": {
    startDate: "2026-11-02",
    allotments: [
      { shareClass: "Ordinary", numShares: "50", amountPaidPerShare: "2.5", amountUnpaidPerShare: "0", currency: "GBP", nominalValue: "1" },
    ],
    statementOfCapital: [
      {
        currency: "GBP",
        totalAmountUnpaid: "0",
        shares: [
          { shareClass: "Ordinary", prescribedParticulars: "Each share has one vote.", numShares: "150", aggregateNominalValue: "150" },
        ],
      },
    ],
  },
};

const SHARED_ROUTE_KINDS = Object.keys(GATEWAY_FORM_BUILDERS);

function buildEvent(kind, overrides = {}) {
  return buildLambdaEvent({
    method: "POST",
    path: companiesHouseFormPath(kind),
    body: {
      companyNumber: "06846849",
      companyName: "EXAMPLE PSC LIMITED",
      companyAuthCode: COMPANY_AUTH_CODE,
      dateSigned: "2026-11-20",
      ...FORM_FIELDS[kind],
      ...overrides,
    },
    headers: { Authorization: "Bearer test-cognito-token" },
  });
}

// Everything the route wrote anywhere but the gateway envelope: stored items, events, log lines and its answer.
function everythingKept(response) {
  return JSON.stringify({
    stored: mockSend.mock.calls.map(([command]) => command.input),
    events: mockEventBridgeSend.mock.calls.map(([command]) => command.input),
    logged: Object.values(mockLogger).flatMap((log) => log.mock.calls),
    response,
  });
}

// The data of each request item the route stored as failed.
function failedItems() {
  return mockSend.mock.calls
    .map(([command]) => command.input.ExpressionAttributeValues)
    .filter((values) => values?.[":status"] === "failed")
    .map((values) => values[":data"]);
}

describe("the filing route every Companies House form shares", () => {
  beforeEach(() => {
    Object.assign(
      process.env,
      setupTestEnv({
        COMPANIES_HOUSE_XMLGW_URI: "https://xmlgw.companieshouse.gov.uk/v1-0/xmlgw/Gateway",
        COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME: "test-companies-house-accounts-async-requests-table",
        COMPANIES_HOUSE_PACKAGE_REFERENCE: "0012",
        // The test gateway, where a form with a fee is sent: the code's path is the same for every form.
        COMPANIES_HOUSE_GATEWAY_TEST: "true",
        ENVIRONMENT_NAME: "test",
      }),
    );
    vi.clearAllMocks();
    mockEventBridgeSend.mockResolvedValue({});
    mockSend.mockImplementation(async (command) => {
      const lib = await import("@aws-sdk/lib-dynamodb");
      if (command instanceof lib.QueryCommand) {
        return { Items: [{ bundleId: "resident-pro", subscriptionStatus: "active" }], Count: 1 };
      }
      return {};
    });
    mockBuildFormSubmission.mockReturnValue("<GovTalkMessage>submission</GovTalkMessage>");
    mockPostToGateway.mockResolvedValue({ ok: true, status: 200, data: "<GovTalkMessage>ack</GovTalkMessage>", headers: {}, duration: 1 });
    mockParseGatewayResponse.mockReturnValue({ errors: [], statuses: [], gatewayTimestamp: "2026-11-20T10:00:00Z", pollInterval: 1 });
  });

  // Each form's request with a Welsh place name, or a person named after one, in a text field the
  // gateway takes under its name and address pattern, and the field the refusal names.
  const WELSH_TEXT = {
    "psc-verification-statement": [{ surname: "Glyndŵr" }, "surname"],
    "psc-cessation": [{ surname: "Glyndŵr" }, "surname"],
    "psc-change-details": [
      { address: { premise: "1", street: "Ffordd Glyndŵr", postTown: "Machynlleth", country: "GB-WLS" } },
      "address.street",
    ],
    "officer-resignation": [{ forename: "Llŷr" }, "forename"],
    "sail-address": [{ address: { premise: "Uned 4", street: "Stryd y Bŵl", postTown: "Caerdydd", country: "GB-WLS" } }, "address.street"],
    "psc-statement-notification": [
      { statement: "PSC_HAS_FAILED_TO_CONFIRM_CHANGED_DETAILS", pscKind: "individual-person-with-significant-control", surname: "Glyndŵr" },
      "surname",
    ],
    "psc-statement-withdrawal": [
      { statement: "PSC_HAS_FAILED_TO_CONFIRM_CHANGED_DETAILS", pscKind: "individual-person-with-significant-control", surname: "Glyndŵr" },
      "surname",
    ],
    "psc-notification": [
      {
        residentialAddress: {
          address: { premise: "1", street: "Lôn Glyndŵr", postTown: "Bangor", country: "GB-WLS", postcode: "LL57 1AA" },
        },
      },
      "residentialAddress.address.street",
    ],
    "officer-appointment": [
      { residentialAddress: { address: { premise: "16", street: "Ffordd Glyndŵr", postTown: "Caerdydd", country: "GB-WLS" } } },
      "residentialAddress.address.street",
    ],
    "officer-change": [{ newName: { forename: "CARYS", surname: "Glyndŵr" } }, "newName.surname"],
    "allotment-of-shares": [
      {
        allotments: [
          {
            shareClass: "Ordinary",
            numShares: "50",
            amountPaidPerShare: "2.5",
            amountUnpaidPerShare: "0",
            currency: "GBP",
            nominalValue: "1",
            consideration: "Fan o Glyndŵr",
          },
        ],
      },
      "allotments[0].consideration",
    ],
  };
  // The forms with no free text under that pattern: a change of accounting reference date and a move
  // of records carry dates, codes and choices; a change of name's proposed name is upper case under
  // its own companyNameString, which the route checks after it upper-cases the name.
  const NO_GATEWAY_TEXT = ["accounting-reference-date", "record-location", "change-of-name"];

  test("every form's text fields are named, or the form has none", () => {
    for (const kind of SHARED_ROUTE_KINDS) {
      expect(COMPANIES_HOUSE_FORMS[kind].textFields, kind).toEqual(expect.any(Object));
      expect(Object.keys(COMPANIES_HOUSE_FORMS[kind].textFields).length > 0, kind).toBe(!NO_GATEWAY_TEXT.includes(kind));
    }
    expect(Object.keys(WELSH_TEXT).sort()).toEqual(SHARED_ROUTE_KINDS.filter((kind) => !NO_GATEWAY_TEXT.includes(kind)).sort());
  });

  test.each(Object.entries(WELSH_TEXT))(
    "%s refuses a Welsh lower-case ŵ or ŷ before sending, naming the field and the letter, never the value",
    async (kind, [overrides, field]) => {
      const response = await fileCompaniesHouseForm(buildEvent(kind, overrides), kind);
      expect(response.statusCode).toBe(400);
      const message = JSON.parse(response.body).message;
      expect(message).toMatch(new RegExp(`${field.replace(/[.[\]]/g, "\\$&")} has characters Companies House does not accept: [ŵŷô ]+`));
      expect(everythingKept(response)).not.toMatch(/Glyndŵr|Llŷr|Bŵl/);
      expect(mockPostToGateway).not.toHaveBeenCalled();
    },
  );

  // The text fields a form takes beside those of WELSH_TEXT: each change a request may make.
  const MORE_WELSH_TEXT = [
    ["psc-change-details", { newName: { forename: "Llŷr", surname: "BRAMWELL" } }, "newName.forename"],
    ["psc-change-details", { nationality: "Cymro Glyndŵr" }, "nationality"],
    ["psc-change-details", { countryOfResidence: "Gwlad y Bŵl" }, "countryOfResidence"],
    [
      "psc-change-details",
      { residentialAddress: { premise: "1", street: "Lôn Glyndŵr", postTown: "Bangor", country: "GB-WLS", postcode: "LL57 1AA" } },
      "residentialAddress.street",
    ],
    [
      "psc-change-details",
      {
        pscKind: "corporate-entity-person-with-significant-control",
        surname: undefined,
        name: "TEIFI VALLEY HOLDINGS LIMITED",
        newName: "Daliadau Glyndŵr",
      },
      "newName",
    ],
    [
      "psc-change-details",
      {
        pscKind: "corporate-entity-person-with-significant-control",
        surname: undefined,
        name: "TEIFI VALLEY HOLDINGS LIMITED",
        identification: { legalForm: "Cwmni Glyndŵr" },
      },
      "identification.legalForm",
    ],
    [
      "officer-change",
      {
        corporate: true,
        corporateName: "DIRECTORCO LIMITED",
        newCorporateName: "Cwmni Glyndŵr",
        newName: undefined,
        dateOfBirth: undefined,
      },
      "newCorporateName",
    ],
    [
      "officer-change",
      {
        corporate: true,
        corporateName: "DIRECTORCO LIMITED",
        address: { premise: "1", street: "Ffordd Glyndŵr", postTown: "Caerdydd", country: "GB-WLS", postcode: "CF10 1AA" },
        newName: undefined,
        dateOfBirth: undefined,
      },
      "address.street",
    ],
  ];

  test.each(MORE_WELSH_TEXT)("%s refuses a Welsh lower-case letter in each change it can make: %j", async (kind, overrides, field) => {
    const response = await fileCompaniesHouseForm(buildEvent(kind, overrides), kind);
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toMatch(
      new RegExp(`${field.replace(/[.[\]]/g, "\\$&")} has characters Companies House does not accept: [ŵŷô ]+`),
    );
  });

  // A corporate officer's change: the name the register holds and each of its new particulars.
  const CORPORATE_OFFICER_CHANGE = {
    officerRole: "director",
    corporate: true,
    dateOfChange: "2026-11-09",
    corporateName: "ACME HOLDINGS LIMITED",
  };
  test.each([
    [{ corporateName: "Cwmni Glyndŵr" }, "corporateName"],
    [{ newCorporateName: "Cwmni Glyndŵr" }, "newCorporateName"],
    [{ address: { premise: "1", street: "Ffordd Glyndŵr", postTown: "Machynlleth", country: "GB-WLS" } }, "address.street"],
    [{ companyIdentification: { uk: { registrationNumber: "Rhif Glyndŵr" } } }, "companyIdentification.uk.registrationNumber"],
  ])("a corporate officer's change refuses a Welsh lower-case ŵ in %j, naming the field", async (change, field) => {
    const response = await fileCompaniesHouseForm(
      buildEvent("officer-change", {
        ...CORPORATE_OFFICER_CHANGE,
        newName: undefined,
        forename: undefined,
        surname: undefined,
        dateOfBirth: undefined,
        ...(change.corporateName ? {} : { newCorporateName: "ACME GROUP LIMITED" }),
        ...change,
      }),
      "officer-change",
    );
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toContain(`${field} has characters Companies House does not accept: ŵ`);
    expect(everythingKept(response)).not.toMatch(/Glyndŵr/);
    expect(mockPostToGateway).not.toHaveBeenCalled();
  });

  // The same field set one character over the limit its schema gives it.
  function overLimit(overrides, field, length) {
    const copy = structuredClone(overrides);
    // "allotments[0].consideration" walks into allotments, then its entry 0.
    const keys = field.split(".").flatMap((key) => key.split(/\[(\d+)\]/).filter(Boolean));
    const parent = keys.slice(0, -1).reduce((node, key) => node[key], copy);
    parent[keys.at(-1)] = "A".repeat(length);
    return copy;
  }

  test.each(Object.entries(WELSH_TEXT))(
    "%s answers a JSON 400 naming the field and its limit for a value over the schema's maximum, sending nothing",
    async (kind, [overrides, field]) => {
      // A field in an array is named with its index; the table names it with "[]".
      const limit = COMPANIES_HOUSE_FORMS[kind].textFields[field.replace(/\[\d+\]/g, "[]")];
      const response = await fileCompaniesHouseForm(buildEvent(kind, overLimit(overrides, field, limit + 1)), kind);
      expect(response.statusCode).toBe(400);
      expect(response.headers["Content-Type"]).toBe("application/json");
      expect(JSON.parse(response.body).message).toContain(`${field} must be at most ${limit} characters`);
      expect(mockPostToGateway).not.toHaveBeenCalled();
    },
  );

  test("a PSC's surname of 161 characters, which the gateway would answer with a schema error, is refused with a 400", async () => {
    const response = await fileCompaniesHouseForm(buildEvent("psc-cessation", { surname: "A".repeat(161) }), "psc-cessation");
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toContain("surname must be at most 160 characters");
    expect(mockPostToGateway).not.toHaveBeenCalled();
  });

  test("a rejection whose texts echo a name keeps the error codes and takes the echoed values out", async () => {
    mockParseGatewayResponse.mockReturnValue({
      errors: [
        {
          raisedBy: "Gateway",
          number: "604",
          type: "fatal",
          text: "Surname BRAMWELL is not an officer of EXAMPLE PSC LIMITED",
          location: "Surname",
        },
        { raisedBy: "Gateway", number: "9999", type: "fatal", text: "the person bramwell is not known" },
      ],
      statuses: [],
    });
    const response = await fileCompaniesHouseForm(buildEvent("psc-cessation"), "psc-cessation");
    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body).errors).toEqual([
      {
        raisedBy: "Gateway",
        number: "604",
        type: "fatal",
        text: "Surname [a value of the request] is not an officer of [a value of the request]",
        location: "Surname",
      },
      { raisedBy: "Gateway", number: "9999", type: "fatal", text: "the person [a value of the request] is not known" },
    ]);
    const kept = everythingKept(response);
    expect(kept).toContain("604");
    expect(kept).not.toMatch(/BRAMWELL|EXAMPLE PSC LIMITED/i);
  });

  test("a rejection whose text echoes an address takes each part of it out", async () => {
    mockParseGatewayResponse.mockReturnValue({
      errors: [{ number: "100", text: "Address Unit 4, Harbour House, 12 Quay Street, Bristol BS1 4DJ is not a physical location" }],
      statuses: [],
    });
    const sail = await fileCompaniesHouseForm(buildEvent("sail-address"), "sail-address");
    expect(JSON.parse(sail.body).errors[0].text).toBe(
      "Address [a value of the request], [a value of the request], [a value of the request] [a value of the request] is not a physical location",
    );
    expect(everythingKept(sail)).not.toMatch(/Quay Street|Harbour House|Bristol|BS1 4DJ/);
  });

  test("a change of name to a Welsh name is upper-cased and taken", async () => {
    const response = await fileCompaniesHouseForm(
      buildEvent("change-of-name", { proposedName: "Cwmni Glyndŵr Cyfyngedig" }),
      "change-of-name",
    );
    expect(response.statusCode).toBe(201);
  });

  test("every form on the route has a request this test files", () => {
    expect(Object.keys(FORM_FIELDS).sort()).toEqual([...SHARED_ROUTE_KINDS].sort());
  });

  describe.each(SHARED_ROUTE_KINDS)("%s", (kind) => {
    test("gives the company authentication code to the envelope and keeps it nowhere else when the gateway takes the filing", async () => {
      const response = await fileCompaniesHouseForm(buildEvent(kind), kind);

      expect(response.statusCode).toBe(201);
      expect(mockBuildFormSubmission.mock.calls[0][0].companyAuthenticationCode).toBe(COMPANY_AUTH_CODE);
      expect(mockSend.mock.calls.length).toBeGreaterThan(1);
      expect(everythingKept(response)).not.toContain(COMPANY_AUTH_CODE);
    });

    test("keeps the code nowhere when the gateway rejects the envelope", async () => {
      mockParseGatewayResponse.mockReturnValue({ errors: [{ number: "604", text: "Invalid Request" }], statuses: [] });

      const response = await fileCompaniesHouseForm(buildEvent(kind), kind);

      expect(response.statusCode).toBe(500);
      expect(everythingKept(response)).not.toContain(COMPANY_AUTH_CODE);
    });

    test("keeps the code nowhere when the gateway gives no answer", async () => {
      mockPostToGateway.mockRejectedValue(new Error("socket hang up"));

      const response = await fileCompaniesHouseForm(buildEvent(kind), kind);

      expect(response.statusCode).toBe(201);
      expect(everythingKept(response)).not.toContain(COMPANY_AUTH_CODE);
    });

    test("keeps the company number in the pending record, whether the gateway answers or not, so an acceptance drops that company's cache", async () => {
      const lib = await import("@aws-sdk/lib-dynamodb");
      const pendingData = () =>
        mockSend.mock.calls
          .map(([command]) => command)
          .filter((command) => command instanceof lib.UpdateCommand || command instanceof lib.PutCommand)
          .map((command) => command.input?.ExpressionAttributeValues?.[":data"] ?? command.input?.Item?.data)
          .filter((data) => data?.kind === kind);

      await fileCompaniesHouseForm(buildEvent(kind), kind);
      expect(pendingData().length).toBeGreaterThan(0);
      for (const data of pendingData()) expect(data.companyNumber).toBe("06846849");

      vi.clearAllMocks();
      mockPostToGateway.mockRejectedValue(new Error("socket hang up"));
      await fileCompaniesHouseForm(buildEvent(kind), kind);
      expect(pendingData().some((data) => data.outcomeUnknown === true && data.companyNumber === "06846849")).toBe(true);
    });

    test("stores the filing as failed under its own kind when the gateway rejects the envelope", async () => {
      mockParseGatewayResponse.mockReturnValue({ errors: [{ number: "604", text: "Invalid Request" }], statuses: [] });

      await fileCompaniesHouseForm(buildEvent(kind), kind);

      expect(failedItems()).toEqual([expect.objectContaining({ kind, errors: [{ number: "604", text: "Invalid Request" }] })]);
    });

    test("stores the filing as failed under its own kind when the envelope cannot be sent", async () => {
      mockBuildFormSubmission.mockImplementation(() => {
        throw new Error("no package reference");
      });

      const response = await fileCompaniesHouseForm(buildEvent(kind), kind);

      expect(response.statusCode).toBe(500);
      expect(failedItems()).toEqual([{ message: "no package reference", kind }]);
    });

    test("keeps the code nowhere when the request is refused", async () => {
      const response = await fileCompaniesHouseForm(buildEvent(kind, { companyName: "" }), kind);

      expect(response.statusCode).toBe(400);
      expect(mockBuildFormSubmission).not.toHaveBeenCalled();
      expect(everythingKept(response)).not.toContain(COMPANY_AUTH_CODE);
    });
  });
});

describe("the Companies House forms table", () => {
  const catalog = loadCatalogFromRoot();
  const sharedRouteRows = Object.entries(COMPANIES_HOUSE_FORMS).filter(([, form]) => form.formIdentifier);

  test("each form with a form identifier has a builder, and each builder a row", () => {
    expect(sharedRouteRows.map(([kind]) => kind).sort()).toEqual([...SHARED_ROUTE_KINDS].sort());
  });

  test.each(sharedRouteRows)("%s names a schema file that exists", (kind, form) => {
    expect(existsSync(join(process.cwd(), "fixtures", "companies-house-xmlgw", form.schema))).toBe(true);
  });

  test.each(sharedRouteRows)("%s names a catalogue activity whose paths cover its filing path and its poll path", (kind, form) => {
    const activitiesOf = (path) => findMatchingActivitiesForUrlPath(catalog, path).map((activity) => activity.id);

    expect(activitiesOf(companiesHouseFormPath(kind))).toEqual([form.activityId]);
    if (form.sharedPoll) expect(activitiesOf(companiesHouseFormPollPath(kind, "00001A"))).toEqual([form.activityId]);
  });
});
