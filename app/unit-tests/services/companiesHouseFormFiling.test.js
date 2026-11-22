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

describe("the filing route every Companies House form shares", () => {
  beforeEach(() => {
    Object.assign(
      process.env,
      setupTestEnv({
        COMPANIES_HOUSE_XMLGW_URI: "https://xmlgw.companieshouse.gov.uk/v1-0/xmlgw/Gateway",
        COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME: "test-companies-house-accounts-async-requests-table",
        COMPANIES_HOUSE_PACKAGE_REFERENCE: "0012",
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
