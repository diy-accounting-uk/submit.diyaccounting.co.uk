// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/companiesHouseConfirmationStatementPost.test.js
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

const mockBuildConfirmationStatementSubmission = vi.fn();
const mockAllocateSubmissionNumber = vi.fn();
const mockResolvePresenterCredentials = vi.fn();
const mockPostToGateway = vi.fn();
const mockParseGatewayResponse = vi.fn();
vi.mock("@app/services/companiesHouseXmlGateway.js", () => ({
  buildConfirmationStatementSubmission: (...args) => mockBuildConfirmationStatementSubmission(...args),
  allocateSubmissionNumber: (...args) => mockAllocateSubmissionNumber(...args),
  postToGateway: (...args) => mockPostToGateway(...args),
  parseGatewayResponse: (...args) => mockParseGatewayResponse(...args),
  resolvePresenterCredentials: (...args) => mockResolvePresenterCredentials(...args),
}));

import { ingestHandler as companiesHouseConfirmationStatementPostHandler } from "@app/functions/companies-house/companiesHouseConfirmationStatementPost.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

function buildStatementBody(overrides = {}) {
  return {
    companyNumber: "06846849",
    companyName: "EXAMPLE CONFIRMATION STATEMENT LIMITED",
    companyAuthCode: "SIMCS01",
    dateSigned: "2026-09-24",
    reviewDate: "2025-09-21",
    lawfulPurposeStatementAccepted: true,
    directors: [{ personalCode: "AB1234CD56E", forename: "ALICE", surname: "EXAMPLE", dob: "1970-01-01" }],
    ...overrides,
  };
}

function buildEvent({ body = buildStatementBody(), headers = {}, authorizer, method = "POST" } = {}) {
  const options = {
    method,
    path: "/api/v1/companies-house/confirmation-statement",
    body,
    headers: { Authorization: "Bearer test-cognito-token", ...headers },
  };
  if (authorizer !== undefined) options.authorizer = authorizer;
  return buildLambdaEvent(options);
}

describe("companiesHouseConfirmationStatementPost ingestHandler", () => {
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
        return { Items: [], Count: 0 };
      }
      return {};
    });
    mockAllocateSubmissionNumber.mockResolvedValue("00001A");
    mockResolvePresenterCredentials.mockResolvedValue({ presenterId: "presenter-id", presenterCode: "presenter-code" });
    mockBuildConfirmationStatementSubmission.mockReturnValue("<GovTalkMessage>submission</GovTalkMessage>");
    mockPostToGateway.mockResolvedValue({ ok: true, status: 200, data: "<GovTalkMessage>ack</GovTalkMessage>", headers: {}, duration: 1 });
    mockParseGatewayResponse.mockReturnValue({ errors: [], statuses: [], gatewayTimestamp: "2026-09-24T10:00:00Z", pollInterval: 1 });
  });

  test("builds the statement body, submits the envelope and returns the submission number", async () => {
    const response = await companiesHouseConfirmationStatementPostHandler(buildEvent());
    expect(response.statusCode).toBe(201);
    const body = parseResponseBody(response);
    expect(body.submissionNumber).toBe("00001A");
    expect(body.gatewayTimestamp).toBe("2026-09-24T10:00:00Z");
    expect(body.pollInterval).toBe(1);

    expect(mockBuildConfirmationStatementSubmission).toHaveBeenCalledTimes(1);
    const [submissionArgs] = mockBuildConfirmationStatementSubmission.mock.calls[0];
    expect(submissionArgs).toMatchObject({
      presenterId: "presenter-id",
      presenterCode: "presenter-code",
      companyNumber: "06846849",
      companyName: "EXAMPLE CONFIRMATION STATEMENT LIMITED",
      companyAuthenticationCode: "SIMCS01",
      packageReference: "0012",
      submissionNumber: "00001A",
      dateSigned: "2026-09-24",
      gatewayTest: false,
    });
    expect(submissionArgs.statementXml).toContain("<ReviewDate>2025-09-21</ReviewDate>");

    expect(mockPostToGateway).toHaveBeenCalledWith("<GovTalkMessage>submission</GovTalkMessage>", {});
  });

  test("forwards a Gov-Test-Scenario header to the gateway call", async () => {
    await companiesHouseConfirmationStatementPostHandler(buildEvent({ headers: { "Gov-Test-Scenario": "CS_INSUFFICIENT_FUNDS" } }));
    expect(mockPostToGateway).toHaveBeenCalledWith("<GovTalkMessage>submission</GovTalkMessage>", {
      "Gov-Test-Scenario": "CS_INSUFFICIENT_FUNDS",
    });
  });

  test("sets gatewayTest true when COMPANIES_HOUSE_GATEWAY_TEST is true", async () => {
    process.env.COMPANIES_HOUSE_GATEWAY_TEST = "true";
    await companiesHouseConfirmationStatementPostHandler(buildEvent());
    const [submissionArgs] = mockBuildConfirmationStatementSubmission.mock.calls[0];
    expect(submissionArgs.gatewayTest).toBe(true);
  });

  test("rejects a company authentication code that is too short", async () => {
    const response = await companiesHouseConfirmationStatementPostHandler(
      buildEvent({ body: buildStatementBody({ companyAuthCode: "AB" }) }),
    );
    expect(response.statusCode).toBe(400);
    expect(mockPostToGateway).not.toHaveBeenCalled();
  });

  test("rejects a director's personal code that is not 11 characters", async () => {
    const response = await companiesHouseConfirmationStatementPostHandler(
      buildEvent({
        body: buildStatementBody({ directors: [{ personalCode: "TOOSHORT", forename: "ALICE", surname: "EXAMPLE", dob: "1970-01-01" }] }),
      }),
    );
    expect(response.statusCode).toBe(400);
    expect(mockPostToGateway).not.toHaveBeenCalled();
  });

  test("rejects more than four SIC codes", async () => {
    const response = await companiesHouseConfirmationStatementPostHandler(
      buildEvent({ body: buildStatementBody({ sicCodes: ["11111", "22222", "33333", "44444", "55555"] }) }),
    );
    expect(response.statusCode).toBe(400);
    expect(mockPostToGateway).not.toHaveBeenCalled();
  });

  test("marks the submission failed and returns 500 when the gateway rejects the envelope", async () => {
    mockParseGatewayResponse.mockReturnValue({
      errors: [{ raisedBy: "Gateway", number: 5006, type: "fatal", text: "Insufficient Funds" }],
    });
    const response = await companiesHouseConfirmationStatementPostHandler(buildEvent());
    expect(response.statusCode).toBe(500);
    const body = parseResponseBody(response);
    expect(body.errors[0].number).toBe(5006);
  });

  test("returns 401 when the Cognito bearer token is missing", async () => {
    const response = await companiesHouseConfirmationStatementPostHandler(buildEvent({ authorizer: {} }));
    expect(response.statusCode).toBe(401);
    expect(mockPostToGateway).not.toHaveBeenCalled();
  });

  test("returns 403 when the environment does not list the matched activity", async () => {
    process.env.ENVIRONMENT_NAME = "not-a-listed-environment";
    const response = await companiesHouseConfirmationStatementPostHandler(buildEvent());
    expect(response.statusCode).toBe(403);
    expect(mockPostToGateway).not.toHaveBeenCalled();
  });

  test("returns 200 with an empty object for a HEAD request", async () => {
    const response = await companiesHouseConfirmationStatementPostHandler(buildEvent({ method: "HEAD" }));
    expect(response.statusCode).toBe(200);
    expect(parseResponseBody(response)).toEqual({});
  });
});
