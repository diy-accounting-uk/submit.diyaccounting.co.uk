// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/hmrcItsaForeignPropertyPeriodGet.test.js
import { describe, test, beforeEach, expect, vi } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { buildHmrcEvent } from "@app/test-helpers/eventBuilders.js";
import { setupTestEnv, parseResponseBody, setupFetchMock, mockHmrcSuccess, mockHmrcError } from "@app/test-helpers/mockHelpers.js";

const mockSend = vi.fn();
const mockSqsSend = vi.fn();

vi.mock("@aws-sdk/client-sqs", () => {
  class SQSClient {
    constructor(_config) {}
    send(cmd) {
      return mockSqsSend(cmd);
    }
  }
  class SendMessageCommand {
    constructor(input) {
      this.input = input;
    }
  }
  return { SQSClient, SendMessageCommand };
});

vi.mock("@aws-sdk/lib-dynamodb", () => {
  class PutCommand {
    constructor(input) {
      this.input = input;
    }
  }
  class QueryCommand {
    constructor(input) {
      this.input = input;
    }
  }
  class DeleteCommand {
    constructor(input) {
      this.input = input;
    }
  }
  class GetCommand {
    constructor(input) {
      this.input = input;
    }
  }
  class UpdateCommand {
    constructor(input) {
      this.input = input;
    }
  }
  return {
    DynamoDBDocumentClient: { from: () => ({ send: mockSend }) },
    PutCommand,
    QueryCommand,
    DeleteCommand,
    GetCommand,
    UpdateCommand,
  };
});

vi.mock("@aws-sdk/client-dynamodb", () => {
  class DynamoDBClient {
    constructor(_config) {}
  }
  return { DynamoDBClient };
});

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

import { ingestHandler as handler, workerHandler as worker } from "@app/functions/hmrc/hmrcItsaForeignPropertyPeriodGet.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

let mockFetch;

const VALID_NINO = "AB123456C";
const VALID_BUSINESS_ID = "XAIS12345678910";
const SUBMISSION_ID = "4557ecb5-fd32-48cc-81f5-e6acd1099f3c";

function getEvent(overrides = {}) {
  return buildHmrcEvent({
    queryStringParameters: {
      nino: VALID_NINO,
      businessId: VALID_BUSINESS_ID,
      taxYear: "2024-25",
      submissionId: SUBMISSION_ID,
      ...overrides,
    },
    headers: { authorization: "Bearer test-token" },
  });
}

describe("hmrcItsaForeignPropertyPeriodGet ingestHandler", () => {
  beforeEach(() => {
    Object.assign(process.env, setupTestEnv());
    mockFetch = setupFetchMock();
    vi.resetAllMocks();
    mockEventBridgeSend.mockResolvedValue({});
    mockSend.mockImplementation(async (cmd) => {
      const lib = await import("@aws-sdk/lib-dynamodb");
      if (cmd instanceof lib.QueryCommand) return { Items: [], Count: 0 };
      if (cmd instanceof lib.GetCommand) return { Item: null };
      return {};
    });
  });

  test("returns 400 when the submissionId is missing for a dated year", async () => {
    const response = await handler(getEvent({ submissionId: undefined }));
    expect(response.statusCode).toBe(400);
    expect(parseResponseBody(response).message).toContain("submissionId");
  });

  test("returns 403 JSON when the authenticated user holds no bundle entitled to ITSA", async () => {
    const event = getEvent();
    event.requestContext.http.path = "/api/v1/hmrc/itsa/foreign-property/period";
    const response = await handler(event);
    expect(response.statusCode).toBe(403);
    expect(parseResponseBody(response).code).toBe("BUNDLE_FORBIDDEN");
    expect(mockFetch.mock.calls.filter(([url]) => String(url).includes("/individuals/"))).toHaveLength(0);
  });

  test("GETs the dated period from the foreign path with the submissionId", async () => {
    const summary = { fromDate: "2024-04-06", toDate: "2024-07-05", foreignNonFhlProperty: [{ countryCode: "FRA" }] };
    mockHmrcSuccess(mockFetch, summary);
    const response = await handler(getEvent());
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject(summary);
    const [calledUrl, calledInit] = mockFetch.mock.calls[0];
    expect(calledUrl).toContain(
      `/individuals/business/property/foreign/${VALID_NINO}/${VALID_BUSINESS_ID}/period/2024-25/${SUBMISSION_ID}`,
    );
    expect(calledInit.method).toBe("GET");
    expect(calledInit.headers.Accept).toBe("application/vnd.hmrc.6.0+json");
  });

  test("GETs the running total from the cumulative path from 2025-26, with no submissionId", async () => {
    mockHmrcSuccess(mockFetch, { foreignProperty: [{ countryCode: "FRA" }] });
    const response = await handler(getEvent({ taxYear: "2025-26", submissionId: undefined }));
    expect(response.statusCode).toBe(200);
    expect(mockFetch.mock.calls[0][0]).toContain(
      `/individuals/business/property/foreign/${VALID_NINO}/${VALID_BUSINESS_ID}/cumulative/2025-26`,
    );
  });

  test("answers 404 when HMRC has no total", async () => {
    mockHmrcError(mockFetch, 404, { code: "MATCHING_RESOURCE_NOT_FOUND", message: "Not found" });
    const response = await handler(getEvent({ taxYear: "2026-27", submissionId: undefined }));
    expect(response.statusCode).toBe(404);
  });
});

describe("hmrcItsaForeignPropertyPeriodGet worker", () => {
  beforeEach(() => {
    Object.assign(process.env, setupTestEnv());
    vi.clearAllMocks();
  });

  test("processes an SQS message and marks the request completed", async () => {
    mockHmrcSuccess(mockFetch, { foreignProperty: [] });
    await worker({
      Records: [
        {
          body: JSON.stringify({
            userId: "user-123",
            requestId: "req-456",
            payload: {
              nino: VALID_NINO,
              businessId: VALID_BUSINESS_ID,
              taxYear: "2025-26",
              hmrcAccessToken: "token",
              govClientHeaders: {},
              hmrcAccount: "live",
              userSub: "user-123",
            },
          }),
          messageId: "msg-789",
        },
      ],
    });
    const lib = await import("@aws-sdk/lib-dynamodb");
    const completed = mockSend.mock.calls.find(
      (call) => call[0] instanceof lib.UpdateCommand && call[0].input.ExpressionAttributeValues?.[":status"] === "completed",
    );
    expect(completed).toBeDefined();
  });
});
