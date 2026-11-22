// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/companiesHouseOfficerResignationPost.test.js
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

import { ingestHandler } from "@app/functions/companies-house/companiesHouseOfficerResignationPost.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

function buildResignationBody(overrides = {}) {
  return {
    companyNumber: "06846849",
    companyName: "EXAMPLE OFFICERS LIMITED",
    companyAuthCode: "SIMCS01",
    dateSigned: "2026-11-20",
    officerRole: "director",
    corporate: false,
    title: "MR",
    forename: "MARCUS",
    surname: "TENNANT",
    dateOfBirth: "1975-02-14",
    resignationDate: "2026-11-01",
    ...overrides,
  };
}

function buildEvent({ body = buildResignationBody(), headers = {}, authorizer, method = "POST" } = {}) {
  const options = {
    method,
    path: "/api/v1/companies-house/officer-resignation",
    body,
    headers: { Authorization: "Bearer test-cognito-token", ...headers },
  };
  if (authorizer !== undefined) options.authorizer = authorizer;
  return buildLambdaEvent(options);
}

describe("companiesHouseOfficerResignationPost ingestHandler", () => {
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

  test("a director who is a person is built as OfficerResignation, sent in an OfficerResignation envelope and answered with its submission number", async () => {
    const response = await ingestHandler(buildEvent());

    expect(response.statusCode).toBe(201);
    expect(parseResponseBody(response)).toMatchObject({ submissionNumber: "00001A", pollInterval: 1 });
    const [submissionArgs] = mockBuildFormSubmission.mock.calls[0];
    expect(submissionArgs).toMatchObject({
      formIdentifier: "OfficerResignation",
      companyNumber: "06846849",
      companyAuthenticationCode: "SIMCS01",
      submissionNumber: "00001A",
      dateSigned: "2026-11-20",
    });
    expect(submissionArgs.formXml).toContain(
      "<ResignationDate>2026-11-01</ResignationDate><Director><Person><Title>MR</Title><Surname>TENNANT</Surname><Forename>MARCUS</Forename>" +
        "<DOB>1975-02-14</DOB></Person></Director>",
    );
  });

  test("a secretary who is a person is sent without a date of birth", async () => {
    const response = await ingestHandler(buildEvent({ body: buildResignationBody({ officerRole: "secretary" }) }));

    expect(response.statusCode).toBe(201);
    const [submissionArgs] = mockBuildFormSubmission.mock.calls[0];
    expect(submissionArgs.formXml).toContain(
      "<Secretary><Person><Title>MR</Title><Surname>TENNANT</Surname><Forename>MARCUS</Forename></Person></Secretary>",
    );
    expect(submissionArgs.formXml).not.toContain("<DOB>");
  });

  test("a corporate secretary sends its name and none of a person's particulars", async () => {
    const response = await ingestHandler(
      buildEvent({ body: buildResignationBody({ officerRole: "secretary", corporate: true, corporateName: "SECRETARIES LIMITED" }) }),
    );

    expect(response.statusCode).toBe(201);
    const [submissionArgs] = mockBuildFormSubmission.mock.calls[0];
    expect(submissionArgs.formXml).toContain("<Secretary><CorporateName>SECRETARIES LIMITED</CorporateName></Secretary>");
    expect(submissionArgs.formXml).not.toContain("<Surname>");
  });

  test("records the filing in progress as officer-resignation", async () => {
    await ingestHandler(buildEvent());
    const lib = await import("@aws-sdk/lib-dynamodb");
    const writes = mockSend.mock.calls
      .map(([cmd]) => cmd)
      .filter((cmd) => cmd instanceof lib.UpdateCommand || cmd instanceof lib.PutCommand);
    expect(JSON.stringify(writes.map((cmd) => cmd.input))).toContain('"kind":"officer-resignation"');
  });

  test("answers 400 in JSON, sending nothing, for a bad role, a missing name, a director's missing date of birth or bad dates", async () => {
    for (const [overrides, message] of [
      [{ officerRole: "member" }, "Invalid officerRole"],
      [{ corporate: "no" }, "Invalid corporate"],
      [{ surname: "" }, "Missing surname"],
      [{ corporate: true }, "Missing corporateName"],
      [{ dateOfBirth: undefined }, "Invalid or missing dateOfBirth"],
      [{ dateOfBirth: "2026-11-02" }, "must be before resignationDate"],
      [{ resignationDate: "01/11/2026" }, "Invalid or missing resignationDate"],
      [{ companyAuthCode: "AB" }, "Invalid companyAuthCode"],
    ]) {
      const response = await ingestHandler(buildEvent({ body: buildResignationBody(overrides) }));
      expect(response.statusCode, message).toBe(400);
      expect(response.headers["Content-Type"]).toBe("application/json");
      expect(JSON.stringify(parseResponseBody(response))).toContain(message);
    }
    expect(mockPostToGateway).not.toHaveBeenCalled();
  });

  test("answers 500 in JSON and marks the filing failed when the gateway rejects the envelope", async () => {
    mockParseGatewayResponse.mockReturnValue({ errors: [{ number: "604", text: "Invalid Request" }], statuses: [] });
    const response = await ingestHandler(buildEvent());
    expect(response.statusCode).toBe(500);
    expect(parseResponseBody(response).message).toBe("Companies House rejected the officer resignation submission envelope");
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
    expect(parseResponseBody(response)).toMatchObject({ code: "ACTIVITY_ENVIRONMENT_RESTRICTED", activityId: "remove-officer" });
    expect(mockPostToGateway).not.toHaveBeenCalled();
  });
});
