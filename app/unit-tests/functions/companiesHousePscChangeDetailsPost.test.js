// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/companiesHousePscChangeDetailsPost.test.js
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

import { ingestHandler } from "@app/functions/companies-house/companiesHousePscChangeDetailsPost.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const NEW_ADDRESS = { premise: "2", street: "Mill Lane", postTown: "Cardiff", country: "GB-WLS", postcode: "CF10 1AA" };

function buildChangeBody(overrides = {}) {
  return {
    companyNumber: "06846849",
    companyName: "EXAMPLE PSC LIMITED",
    companyAuthCode: "SIMCS01",
    dateSigned: "2026-11-20",
    pscKind: "individual-person-with-significant-control",
    title: "MRS",
    forename: "ELEANOR",
    surname: "BRAMWELL",
    dobMonth: 1,
    dobYear: 1970,
    naturesOfControl: ["OWNERSHIPOFSHARES_75TO100PERCENT", "VOTINGRIGHTS_75TO100PERCENT"],
    dateOfChange: "2026-11-01",
    confirmationDate: "2026-11-03",
    ...overrides,
  };
}

function buildEvent({ body = buildChangeBody(), headers = {}, authorizer, method = "POST" } = {}) {
  const options = {
    method,
    path: "/api/v1/companies-house/psc-change-details",
    body,
    headers: { Authorization: "Bearer test-cognito-token", ...headers },
  };
  if (authorizer !== undefined) options.authorizer = authorizer;
  return buildLambdaEvent(options);
}

describe("companiesHousePscChangeDetailsPost ingestHandler", () => {
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

  test("an individual's nature of control change is built as PSCChangeDetails and sent in a PSCChangeDetails envelope", async () => {
    const response = await ingestHandler(buildEvent());

    expect(response.statusCode).toBe(201);
    expect(parseResponseBody(response)).toMatchObject({ submissionNumber: "00001A", pollInterval: 1 });
    const [submissionArgs] = mockBuildFormSubmission.mock.calls[0];
    expect(submissionArgs).toMatchObject({
      formIdentifier: "PSCChangeDetails",
      companyNumber: "06846849",
      companyAuthenticationCode: "SIMCS01",
      submissionNumber: "00001A",
      dateSigned: "2026-11-20",
    });
    expect(submissionArgs.formXml).toContain("<Individual><Title>MRS</Title><Surname>BRAMWELL</Surname><Forename>ELEANOR</Forename>");
    expect(submissionArgs.formXml).toContain(
      "<Change><NatureOfControls><NatureOfControl>OWNERSHIPOFSHARES_75TO100PERCENT</NatureOfControl>" +
        "<NatureOfControl>VOTINGRIGHTS_75TO100PERCENT</NatureOfControl></NatureOfControls></Change>",
    );
    expect(submissionArgs.formXml).toContain("<DateOfChange>2026-11-01</DateOfChange><ConfirmationDate>2026-11-03</ConfirmationDate>");
  });

  test("a corporate entity's address change sends its address, trimmed, and none of an individual's particulars", async () => {
    const response = await ingestHandler(
      buildEvent({
        body: buildChangeBody({
          pscKind: "corporate-entity-person-with-significant-control",
          name: "HOLDCO LIMITED",
          naturesOfControl: undefined,
          address: { ...NEW_ADDRESS, street: "  Mill Lane  ", county: "" },
        }),
      }),
    );

    expect(response.statusCode).toBe(201);
    const [submissionArgs] = mockBuildFormSubmission.mock.calls[0];
    expect(submissionArgs.formXml).toContain(
      "<Corporate><CorporateName>HOLDCO LIMITED</CorporateName><Change><Address><Premise>2</Premise><Street>Mill Lane</Street>" +
        "<PostTown>Cardiff</PostTown><Country>GB-WLS</Country><Postcode>CF10 1AA</Postcode></Address></Change></Corporate>",
    );
    expect(submissionArgs.formXml).not.toContain("<Surname>");
  });

  test("records the filing in progress as psc-change-details", async () => {
    await ingestHandler(buildEvent());
    const lib = await import("@aws-sdk/lib-dynamodb");
    const writes = mockSend.mock.calls
      .map(([cmd]) => cmd)
      .filter((cmd) => cmd instanceof lib.UpdateCommand || cmd instanceof lib.PutCommand);
    expect(JSON.stringify(writes.map((cmd) => cmd.input))).toContain('"kind":"psc-change-details"');
  });

  test("answers 400 in JSON, sending nothing, for no change, a bad control, a bad address or a confirmation before the change", async () => {
    for (const [overrides, message] of [
      [{ naturesOfControl: undefined }, "Missing change"],
      [{ naturesOfControl: ["SIGINFLUENCECONTROL", "VOTINGRIGHTS_25TO50PERCENT"] }, "Invalid naturesOfControl - SIGINFLUENCECONTROL only"],
      [{ naturesOfControl: ["OWNERSHIP"] }, "Invalid naturesOfControl - unknown nature of control OWNERSHIP"],
      [{ address: { ...NEW_ADDRESS, postTown: " " } }, "Invalid address - an address needs its post town"],
      [{ address: { ...NEW_ADDRESS, country: "Wales" } }, "Invalid address - unknown country Wales"],
      [{ dateOfChange: "01/11/2026" }, "Invalid or missing dateOfChange"],
      [{ confirmationDate: "2026-10-31" }, "must not be before dateOfChange"],
      [{ dateOfChange: "2999-01-01", confirmationDate: "2999-01-02" }, "Invalid dateOfChange - must not be in the future"],
      [{ surname: "" }, "Missing surname"],
      [{ companyAuthCode: "AB" }, "Invalid companyAuthCode"],
    ]) {
      const response = await ingestHandler(buildEvent({ body: buildChangeBody(overrides) }));
      expect(response.statusCode, message).toBe(400);
      expect(response.headers["Content-Type"]).toBe("application/json");
      expect(JSON.stringify(parseResponseBody(response))).toContain(message);
    }
    expect(mockPostToGateway).not.toHaveBeenCalled();
  });

  test("answers 500 in JSON when the gateway rejects the envelope", async () => {
    mockParseGatewayResponse.mockReturnValue({ errors: [{ number: "604", text: "Invalid Request" }], statuses: [] });
    const response = await ingestHandler(buildEvent());
    expect(response.statusCode).toBe(500);
    expect(parseResponseBody(response).message).toBe("Companies House rejected the PSC change of details submission envelope");
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
    expect(parseResponseBody(response)).toMatchObject({ code: "ACTIVITY_ENVIRONMENT_RESTRICTED", activityId: "change-psc-details" });
    expect(mockPostToGateway).not.toHaveBeenCalled();
  });
});
