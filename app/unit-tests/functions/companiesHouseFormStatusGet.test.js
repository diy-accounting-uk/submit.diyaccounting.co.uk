// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/companiesHouseFormStatusGet.test.js
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

import { ingestHandler } from "@app/functions/companies-house/companiesHouseFormStatusGet.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

function buildEvent({ kind = "psc-cessation", submissionNumber = "00001A", headers = {}, authorizer, method = "GET" } = {}) {
  const options = {
    method,
    path: `/api/v1/companies-house/forms/${kind}/${submissionNumber}`,
    pathParameters: { kind, submissionNumber },
    headers: { Authorization: "Bearer test-cognito-token", ...headers },
  };
  if (authorizer !== undefined) options.authorizer = authorizer;
  return buildLambdaEvent(options);
}

describe("companiesHouseFormStatusGet ingestHandler", () => {
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
        return { Items: [{ bundleId: "resident-pro", subscriptionStatus: "active" }], Count: 1 };
      }
      return {};
    });
  });

  test("polls the named form's submission and answers its status", async () => {
    mockPollSubmission.mockResolvedValue({ data: { statusCode: "ACCEPT", submissionNumber: "00001A" } });

    const response = await ingestHandler(buildEvent());

    expect(response.statusCode).toBe(200);
    expect(parseResponseBody(response)).toMatchObject({ statusCode: "ACCEPT" });
    expect(mockPollSubmission).toHaveBeenCalledWith(expect.objectContaining({ submissionNumber: "00001A", kind: "psc-cessation" }));
  });

  test("answers 400 in JSON, polling nothing, for a kind that is not a form on the shared poll", async () => {
    for (const kind of ["confirmation-statement", "not-a-form", "__proto__"]) {
      const response = await ingestHandler(buildEvent({ kind }));
      expect(response.statusCode, kind).toBe(400);
      expect(response.headers["Content-Type"]).toBe("application/json");
    }
    expect(mockPollSubmission).not.toHaveBeenCalled();
  });

  test("rejects a submission number that is not 6 characters", async () => {
    const response = await ingestHandler(buildEvent({ submissionNumber: "123" }));
    expect(response.statusCode).toBe(400);
    expect(mockPollSubmission).not.toHaveBeenCalled();
  });

  test("answers 404 when the caller has no filing of that kind with that number", async () => {
    mockPollSubmission.mockResolvedValue({ notFound: true, submissionNumber: "00001A" });
    const response = await ingestHandler(buildEvent());
    expect(response.statusCode).toBe(404);
  });

  test("answers 500 when the gateway errors while polling", async () => {
    mockPollSubmission.mockResolvedValue({ errors: [{ number: "502" }], submissionNumber: "00001A" });
    const response = await ingestHandler(buildEvent());
    expect(response.statusCode).toBe(500);
  });

  test("returns 401 when the Cognito bearer token is missing", async () => {
    const response = await ingestHandler(buildEvent({ authorizer: {} }));
    expect(response.statusCode).toBe(401);
    expect(mockPollSubmission).not.toHaveBeenCalled();
  });

  test("refuses the poll on prod, where the form's activity is not listed", async () => {
    process.env.ENVIRONMENT_NAME = "prod";
    const response = await ingestHandler(buildEvent());
    expect(response.statusCode).toBe(403);
    expect(mockPollSubmission).not.toHaveBeenCalled();
  });

  test("answers 500 in JSON when the poll cannot be made", async () => {
    mockPollSubmission.mockRejectedValue(new Error("socket hang up"));

    const response = await ingestHandler(buildEvent());

    expect(response.statusCode).toBe(500);
    expect(response.headers["Content-Type"]).toBe("application/json");
    expect(parseResponseBody(response).message).toBe("The status of this submission could not be read from Companies House");
  });
});
