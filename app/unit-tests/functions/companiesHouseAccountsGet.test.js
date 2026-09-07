// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/unit-tests/functions/companiesHouseAccountsGet.test.js
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
    DeleteCommand: class {
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

const mockBuildStatusRequest = vi.fn();
const mockResolvePresenterCredentials = vi.fn();
const mockPostToGateway = vi.fn();
const mockParseGatewayResponse = vi.fn();
vi.mock("@app/services/companiesHouseXmlGateway.js", () => ({
  hashPresenterCredential: vi.fn((value) => `hashed-${value}`),
  buildAccountsSubmission: vi.fn(),
  buildStatusRequest: (...args) => mockBuildStatusRequest(...args),
  parseGatewayResponse: (...args) => mockParseGatewayResponse(...args),
  allocateSubmissionNumber: vi.fn(),
  postToGateway: (...args) => mockPostToGateway(...args),
  resolvePresenterCredentials: (...args) => mockResolvePresenterCredentials(...args),
}));

import { ingestHandler as companiesHouseAccountsGetHandler } from "@app/functions/companies-house/companiesHouseAccountsGet.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

function buildEvent({ submissionNumber = "00001A", headers = {}, authorizer, method = "GET" } = {}) {
  const options = {
    method,
    path: `/api/v1/companies-house/accounts/${submissionNumber}`,
    pathParameters: { submissionNumber },
    headers: { Authorization: "Bearer test-cognito-token", ...headers },
  };
  if (authorizer !== undefined) options.authorizer = authorizer;
  return buildLambdaEvent(options);
}

describe("companiesHouseAccountsGet ingestHandler", () => {
  beforeEach(() => {
    Object.assign(
      process.env,
      setupTestEnv({
        COMPANIES_HOUSE_XMLGW_URI: "https://xmlgw.companieshouse.gov.uk/v1-0/xmlgw/Gateway",
        RECEIPTS_DYNAMODB_TABLE_NAME: "test-receipts-table",
        COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME: "test-companies-house-accounts-async-requests-table",
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
      if (cmd instanceof lib.GetCommand) {
        return {};
      }
      return {};
    });
    mockResolvePresenterCredentials.mockResolvedValue({ presenterId: "presenter-id", presenterCode: "presenter-code" });
    mockBuildStatusRequest.mockReturnValue("<GovTalkMessage>status request</GovTalkMessage>");
    mockPostToGateway.mockResolvedValue({ ok: true, status: 200, data: "<GovTalkMessage>status response</GovTalkMessage>", headers: {}, duration: 1 });
  });

  test("polls the gateway and returns PENDING while the submission is unresolved", async () => {
    mockParseGatewayResponse.mockReturnValue({
      errors: [],
      statuses: [{ statusCode: "PENDING", submissionNumber: "00001A", companyNumber: "06846849", rejections: [] }],
    });
    const response = await companiesHouseAccountsGetHandler(buildEvent());
    expect(response.statusCode).toBe(200);
    const body = parseResponseBody(response);
    expect(body.statusCode).toBe("PENDING");
    expect(mockBuildStatusRequest).toHaveBeenCalledWith({
      presenterId: "presenter-id",
      presenterCode: "presenter-code",
      submissionNumber: "00001A",
    });
    expect(mockPostToGateway).toHaveBeenCalledWith("<GovTalkMessage>status request</GovTalkMessage>", {});
  });

  test("forwards a Gov-Test-Scenario header to the gateway call", async () => {
    mockParseGatewayResponse.mockReturnValue({
      errors: [],
      statuses: [{ statusCode: "PENDING", submissionNumber: "00001A", companyNumber: "06846849", rejections: [] }],
    });
    await companiesHouseAccountsGetHandler(buildEvent({ headers: { "Gov-Test-Scenario": "ACCOUNTS_REJECTED" } }));
    expect(mockPostToGateway).toHaveBeenCalledWith("<GovTalkMessage>status request</GovTalkMessage>", { "Gov-Test-Scenario": "ACCOUNTS_REJECTED" });
  });

  test("writes a receipt and returns ACCEPT when the gateway accepts the filing", async () => {
    mockParseGatewayResponse.mockReturnValue({
      errors: [],
      statuses: [{ statusCode: "ACCEPT", submissionNumber: "00001A", companyNumber: "06846849", rejections: [] }],
    });
    const response = await companiesHouseAccountsGetHandler(buildEvent());
    expect(response.statusCode).toBe(200);
    const body = parseResponseBody(response);
    expect(body.statusCode).toBe("ACCEPT");
    expect(body.receiptId).toBeDefined();

    const lib = await import("@aws-sdk/lib-dynamodb");
    const putCalls = mockSend.mock.calls.filter(([cmd]) => cmd instanceof lib.PutCommand);
    expect(putCalls.length).toBeGreaterThan(0);
  });

  test("returns REJECT with the reject reasons when the gateway rejects the filing", async () => {
    mockParseGatewayResponse.mockReturnValue({
      errors: [],
      statuses: [
        {
          statusCode: "REJECT",
          submissionNumber: "00001A",
          companyNumber: "06846849",
          rejections: [{ rejectCode: "9999", description: "iXBRL validation failed", instanceNumber: "1" }],
        },
      ],
    });
    const response = await companiesHouseAccountsGetHandler(buildEvent());
    expect(response.statusCode).toBe(200);
    const body = parseResponseBody(response);
    expect(body.statusCode).toBe("REJECT");
    expect(body.rejections[0].rejectCode).toBe("9999");
  });

  test("returns 500 when the gateway answers with GovTalkErrors", async () => {
    mockParseGatewayResponse.mockReturnValue({
      errors: [{ raisedBy: "Gateway", number: "502", type: "fatal", text: "Authentication Failure", location: "" }],
      statuses: [],
    });
    const response = await companiesHouseAccountsGetHandler(buildEvent());
    expect(response.statusCode).toBe(500);
  });

  test("rejects a submission number that is not 6 characters", async () => {
    const response = await companiesHouseAccountsGetHandler(buildEvent({ submissionNumber: "SHORT" }));
    expect(response.statusCode).toBe(400);
    expect(mockPostToGateway).not.toHaveBeenCalled();
  });

  test("returns 401 when the Cognito bearer token is missing", async () => {
    const response = await companiesHouseAccountsGetHandler(buildEvent({ authorizer: {} }));
    expect(response.statusCode).toBe(401);
    expect(mockPostToGateway).not.toHaveBeenCalled();
  });

  test("returns 403 when the environment does not list the matched activity", async () => {
    process.env.ENVIRONMENT_NAME = "not-a-listed-environment";
    const response = await companiesHouseAccountsGetHandler(buildEvent());
    expect(response.statusCode).toBe(403);
    expect(mockPostToGateway).not.toHaveBeenCalled();
  });

  test("returns 200 with an empty object for a HEAD request", async () => {
    const response = await companiesHouseAccountsGetHandler(buildEvent({ method: "HEAD" }));
    expect(response.statusCode).toBe(200);
    expect(parseResponseBody(response)).toEqual({});
  });
});
