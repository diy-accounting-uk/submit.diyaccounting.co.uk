// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/companiesHouseOfficerChangePost.test.js
import { describe, test, beforeEach, expect, vi } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { buildLambdaEvent } from "@app/test-helpers/eventBuilders.js";
import { setupTestEnv, parseResponseBody } from "@app/test-helpers/mockHelpers.js";

const mockSend = vi.fn();

vi.mock("@aws-sdk/lib-dynamodb", () => {
  class QueryCommand {
    constructor(input) {
      this.input = input;
    }
  }
  return {
    DynamoDBDocumentClient: { from: () => ({ send: mockSend }) },
    QueryCommand,
    PutCommand: class {
      constructor(input) {
        this.input = input;
      }
    },
    GetCommand: class {
      constructor(input) {
        this.input = input;
      }
    },
    UpdateCommand: class {
      constructor(input) {
        this.input = input;
      }
    },
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

const mockBuildFormSubmission = vi.fn();
const mockAllocateSubmissionNumber = vi.fn();
const mockResolvePresenterCredentials = vi.fn();
const mockPostToGateway = vi.fn();
const mockParseGatewayResponse = vi.fn();
vi.mock("@app/services/companiesHouseXmlGateway.js", async (importOriginal) => ({
  gatewayRequestNotDelivered: (await importOriginal()).gatewayRequestNotDelivered,
  buildFormSubmission: (...args) => mockBuildFormSubmission(...args),
  allocateSubmissionNumber: (...args) => mockAllocateSubmissionNumber(...args),
  postToGateway: (...args) => mockPostToGateway(...args),
  parseGatewayResponse: (...args) => mockParseGatewayResponse(...args),
  resolvePresenterCredentials: (...args) => mockResolvePresenterCredentials(...args),
}));

import { ingestHandler } from "@app/functions/companies-house/companiesHouseOfficerChangePost.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const SWANSEA = { premise: "22", street: "Ffordd y Brenin", postTown: "Swansea", country: "GB-WLS", postcode: "SA1 8PP" };
const BRISTOL = { premise: "Unit 3", street: "Temple Way", postTown: "Bristol", country: "GB-ENG", postcode: "BS2 0BY" };

function buildChangeBody(overrides = {}) {
  return {
    companyNumber: "06846849",
    companyName: "EXAMPLE OFFICERS LIMITED",
    companyAuthCode: "SIMCS01",
    dateSigned: "2026-11-20",
    officerRole: "director",
    corporate: false,
    dateOfChange: "2026-11-09",
    title: "MRS",
    forename: "CARYS",
    surname: "REES",
    dateOfBirth: "1981-06-23",
    newName: { title: "MRS", forename: "CARYS", surname: "LLEWELYN" },
    ...overrides,
  };
}

function buildEvent({ body = buildChangeBody(), headers = {}, authorizer, method = "POST" } = {}) {
  const options = {
    method,
    path: "/api/v1/companies-house/officer-change",
    body,
    headers: { Authorization: "Bearer test-cognito-token", ...headers },
  };
  if (authorizer !== undefined) options.authorizer = authorizer;
  return buildLambdaEvent(options);
}

async function sentFormXml(body) {
  const response = await ingestHandler(buildEvent({ body }));
  expect(response.statusCode).toBe(201);
  const [submissionArgs] = mockBuildFormSubmission.mock.calls[0];
  return submissionArgs.formXml;
}

describe("companiesHouseOfficerChangePost ingestHandler", () => {
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
    mockSend.mockImplementation(async (cmd) => {
      const lib = await import("@aws-sdk/lib-dynamodb");
      if (cmd instanceof lib.QueryCommand) {
        return { Items: [{ bundleId: "resident-pro", subscriptionStatus: "active" }], Count: 1 };
      }
      return {};
    });
    mockAllocateSubmissionNumber.mockResolvedValue("00001A");
    mockResolvePresenterCredentials.mockResolvedValue({ presenterId: "presenter-id", presenterCode: "presenter-code" });
    mockBuildFormSubmission.mockReturnValue("<GovTalkMessage>submission</GovTalkMessage>");
    mockPostToGateway.mockResolvedValue({ ok: true, status: 200, data: "<GovTalkMessage>ack</GovTalkMessage>", headers: {}, duration: 1 });
    mockParseGatewayResponse.mockReturnValue({ errors: [], statuses: [], gatewayTimestamp: "2026-11-20T10:00:00Z", pollInterval: 1 });
  });

  test("a director's name change is built as OfficerChangeDetails, found by the registered name and date of birth, and answered with its submission number", async () => {
    const response = await ingestHandler(buildEvent());

    expect(response.statusCode).toBe(201);
    expect(parseResponseBody(response)).toMatchObject({ submissionNumber: "00001A", pollInterval: 1 });
    const [submissionArgs] = mockBuildFormSubmission.mock.calls[0];
    expect(submissionArgs).toMatchObject({
      formIdentifier: "OfficerChangeDetails",
      companyNumber: "06846849",
      companyAuthenticationCode: "SIMCS01",
      submissionNumber: "00001A",
      dateSigned: "2026-11-20",
    });
    expect(submissionArgs.formXml).toContain(
      "<DateOfChange>2026-11-09</DateOfChange><Director><Person><Title>MRS</Title><Surname>REES</Surname><Forename>CARYS</Forename>" +
        "<DOB>1981-06-23</DOB><Change><Name><Title>MRS</Title><Surname>LLEWELYN</Surname><Forename>CARYS</Forename></Name></Change></Person></Director>",
    );
  });

  test("a director's service address change with the home address unchanged sends the indicator", async () => {
    const formXml = await sentFormXml(
      buildChangeBody({ newName: undefined, serviceAddress: { address: BRISTOL }, residentialAddressUnchanged: true }),
    );
    expect(formXml).toContain(
      "<Change><ServiceAddress><Address><Premise>Unit 3</Premise><Street>Temple Way</Street><PostTown>Bristol</PostTown><Country>GB-ENG</Country>" +
        "<Postcode>BS2 0BY</Postcode></Address><ResidentialAddressUnchangedInd>true</ResidentialAddressUnchangedInd></ServiceAddress></Change>",
    );
  });

  test("a director's residential address change sends the new home address alone", async () => {
    const formXml = await sentFormXml(buildChangeBody({ newName: undefined, residentialAddress: { address: SWANSEA } }));
    expect(formXml).toContain(
      "<DOB>1981-06-23</DOB><Change><ResidentialAddress><Address><Premise>22</Premise><Street>Ffordd y Brenin</Street><PostTown>Swansea</PostTown>" +
        "<Country>GB-WLS</Country><Postcode>SA1 8PP</Postcode></Address></ResidentialAddress></Change>",
    );
  });

  test("a secretary's service address change is sent with no date of birth", async () => {
    const formXml = await sentFormXml(
      buildChangeBody({
        officerRole: "secretary",
        dateOfBirth: undefined,
        newName: undefined,
        serviceAddress: { sameAsRegisteredOffice: true },
      }),
    );
    expect(formXml).toContain(
      "<Secretary><Person><Title>MRS</Title><Surname>REES</Surname><Forename>CARYS</Forename><Change><ServiceAddress>" +
        "<SameAsRegisteredOffice>true</SameAsRegisteredOffice></ServiceAddress></Change></Person></Secretary>",
    );
    expect(formXml).not.toContain("<DOB>");
  });

  test("a corporate director's new name and principal office address are sent", async () => {
    const formXml = await sentFormXml(
      buildChangeBody({
        corporate: true,
        corporateName: "DIRECTORCO LIMITED",
        newCorporateName: "DIRECTORCO HOLDINGS LIMITED",
        address: BRISTOL,
      }),
    );
    expect(formXml).toContain(
      "<Director><Corporate><CorporateName>DIRECTORCO LIMITED</CorporateName><Change><CorporateName>DIRECTORCO HOLDINGS LIMITED</CorporateName><Address>",
    );
    expect(formXml).not.toContain("<DOB>");
  });

  test("records the filing in progress as officer-change", async () => {
    await ingestHandler(buildEvent());
    const lib = await import("@aws-sdk/lib-dynamodb");
    const writes = mockSend.mock.calls
      .map(([cmd]) => cmd)
      .filter((cmd) => cmd instanceof lib.UpdateCommand || cmd instanceof lib.PutCommand);
    expect(JSON.stringify(writes.map((cmd) => cmd.input))).toContain('"kind":"officer-change"');
  });

  test("answers 400 in JSON, sending nothing, for a bad role, a missing identity, no change, contradictory addresses or bad dates", async () => {
    for (const [overrides, message] of [
      [{ officerRole: "member" }, "Invalid officerRole"],
      [{ corporate: "no" }, "Invalid corporate"],
      [{ surname: "" }, "Missing surname"],
      [{ dateOfBirth: undefined }, "Invalid or missing dateOfBirth"],
      [{ dateOfBirth: "2026-11-10" }, "must be before dateOfChange"],
      [{ dateOfChange: "09/11/2026" }, "Invalid or missing dateOfChange"],
      [{ dateOfChange: "2026-11-21" }, "must not be after dateSigned"],
      [{ newName: undefined }, "Missing change"],
      [{ newName: { forename: "CARYS" } }, "Missing newName.surname"],
      [{ newName: undefined, serviceAddress: { address: BRISTOL } }, "Missing residentialAddress"],
      [
        { newName: undefined, serviceAddress: { address: { ...BRISTOL, postTown: "" } }, residentialAddressUnchanged: true },
        "Missing serviceAddress.address.postTown",
      ],
      [
        { newName: undefined, residentialAddress: { address: { ...SWANSEA, country: "WLS" } } },
        "Invalid residentialAddress.address.country",
      ],
      [{ residentialAddressUnchanged: true }, "it goes with a new serviceAddress"],
      [
        { serviceAddress: { address: BRISTOL }, residentialAddressUnchanged: true, residentialAddress: { address: SWANSEA } },
        "a new residentialAddress is given too",
      ],
      [
        { serviceAddress: { sameAsRegisteredOffice: true }, residentialAddress: { sameAsServiceAddress: true } },
        "cannot be the same as a service address",
      ],
      [{ officerRole: "secretary", dateOfBirth: undefined, nationality: "British" }, "a secretary's change carries only"],
      [{ corporate: true, corporateName: "", address: BRISTOL }, "Missing corporateName"],
      [{ corporate: true, corporateName: "DIRECTORCO LIMITED" }, "Missing change - give newCorporateName"],
      [
        { corporate: true, corporateName: "DIRECTORCO LIMITED", companyIdentification: { nonUk: { legalForm: "LLC" } } },
        "Missing companyIdentification.nonUk.lawGoverned",
      ],
      [{ companyAuthCode: "AB" }, "Invalid companyAuthCode"],
    ]) {
      const response = await ingestHandler(buildEvent({ body: buildChangeBody(overrides) }));
      expect(response.statusCode, message).toBe(400);
      expect(response.headers["Content-Type"]).toBe("application/json");
      expect(JSON.stringify(parseResponseBody(response))).toContain(message);
    }
    expect(mockPostToGateway).not.toHaveBeenCalled();
  });

  test("a 400 does not echo the date of birth or an address", async () => {
    const response = await ingestHandler(
      buildEvent({
        body: buildChangeBody({
          dateOfBirth: "2026-11-10",
          newName: undefined,
          residentialAddress: { address: { ...SWANSEA, country: "WLS" } },
        }),
      }),
    );
    expect(response.statusCode).toBe(400);
    const answer = JSON.stringify(parseResponseBody(response));
    expect(answer).not.toContain("2026-11-10");
    expect(answer).not.toContain("Ffordd y Brenin");
  });

  test("answers 500 in JSON and marks the filing failed when the gateway rejects the envelope", async () => {
    mockParseGatewayResponse.mockReturnValue({ errors: [{ number: "604", text: "Invalid Request" }], statuses: [] });
    const response = await ingestHandler(buildEvent());
    expect(response.statusCode).toBe(500);
    expect(parseResponseBody(response).message).toBe("Companies House rejected the officer change of details submission envelope");
  });

  test("returns 401 when the Cognito bearer token is missing", async () => {
    const response = await ingestHandler(buildEvent({ authorizer: {} }));
    expect(response.statusCode).toBe(401);
    expect(mockPostToGateway).not.toHaveBeenCalled();
  });

  test("refuses the form on prod, where it is not listed, and sends nothing", async () => {
    process.env.ENVIRONMENT_NAME = "prod";
    delete process.env.COMPANIES_HOUSE_GATEWAY_TEST;
    const response = await ingestHandler(buildEvent());
    expect(response.statusCode).toBe(403);
    expect(parseResponseBody(response)).toMatchObject({ code: "ACTIVITY_ENVIRONMENT_RESTRICTED", activityId: "change-officer" });
    expect(mockPostToGateway).not.toHaveBeenCalled();
  });
});
