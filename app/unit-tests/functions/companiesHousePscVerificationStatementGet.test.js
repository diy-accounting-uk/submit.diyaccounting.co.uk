// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/companiesHousePscVerificationStatementGet.test.js
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

const mockPollSubmission = vi.fn();
vi.mock("@app/services/companiesHouseSubmissionStatus.js", () => ({
  pollSubmission: (...args) => mockPollSubmission(...args),
}));

import { ingestHandler as companiesHousePscVerificationStatementGetHandler } from "@app/functions/companies-house/companiesHousePscVerificationStatementGet.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

function buildEvent({ submissionNumber = "00001A", headers = {}, authorizer, method = "GET" } = {}) {
  const options = {
    method,
    path: `/api/v1/companies-house/psc-verification-statement/${submissionNumber}`,
    pathParameters: { submissionNumber },
    headers: { Authorization: "Bearer test-cognito-token", ...headers },
  };
  if (authorizer !== undefined) options.authorizer = authorizer;
  return buildLambdaEvent(options);
}

describe("companiesHousePscVerificationStatementGet ingestHandler", () => {
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
      return {};
    });
  });

  test("returns the poll result when the gateway answers with a status", async () => {
    mockPollSubmission.mockResolvedValue({ data: { statusCode: "PENDING", submissionNumber: "00001A", rejections: [] } });
    const response = await companiesHousePscVerificationStatementGetHandler(buildEvent());
    expect(response.statusCode).toBe(200);
    const body = parseResponseBody(response);
    expect(body.statusCode).toBe("PENDING");
    expect(mockPollSubmission).toHaveBeenCalledWith({
      userSub: "test-sub",
      submissionNumber: "00001A",
      govTestScenario: null,
      kind: "psc-verification-statement",
      acceptedEvent: "companies-house-psc-verification-statement-accepted",
      acceptedSummary: "Companies House PSC verification statement accepted",
    });
  });

  test("forwards a Gov-Test-Scenario header to pollSubmission", async () => {
    mockPollSubmission.mockResolvedValue({ data: { statusCode: "PENDING", submissionNumber: "00001A", rejections: [] } });
    await companiesHousePscVerificationStatementGetHandler(buildEvent({ headers: { "Gov-Test-Scenario": "AUTH_FAILURE" } }));
    expect(mockPollSubmission).toHaveBeenCalledWith(expect.objectContaining({ govTestScenario: "AUTH_FAILURE" }));
  });

  test("returns 500 when pollSubmission reports gateway errors", async () => {
    mockPollSubmission.mockResolvedValue({ errors: [{ raisedBy: "Gateway", number: 502, type: "fatal", text: "Authorisation Failure" }] });
    const response = await companiesHousePscVerificationStatementGetHandler(buildEvent());
    expect(response.statusCode).toBe(500);
    const body = parseResponseBody(response);
    expect(body.errors[0].number).toBe(502);
  });

  test("rejects a submission number that is not 6 characters", async () => {
    const response = await companiesHousePscVerificationStatementGetHandler(buildEvent({ submissionNumber: "SHORT" }));
    expect(response.statusCode).toBe(400);
    expect(mockPollSubmission).not.toHaveBeenCalled();
  });

  test("returns 401 when the Cognito bearer token is missing", async () => {
    const response = await companiesHousePscVerificationStatementGetHandler(buildEvent({ authorizer: {} }));
    expect(response.statusCode).toBe(401);
    expect(mockPollSubmission).not.toHaveBeenCalled();
  });

  test("returns 403 when the environment does not list the matched activity", async () => {
    process.env.ENVIRONMENT_NAME = "not-a-listed-environment";
    const response = await companiesHousePscVerificationStatementGetHandler(buildEvent());
    expect(response.statusCode).toBe(403);
    expect(mockPollSubmission).not.toHaveBeenCalled();
  });

  test("returns 200 with an empty object for a HEAD request", async () => {
    const response = await companiesHousePscVerificationStatementGetHandler(buildEvent({ method: "HEAD" }));
    expect(response.statusCode).toBe(200);
    expect(parseResponseBody(response)).toEqual({});
  });
});
