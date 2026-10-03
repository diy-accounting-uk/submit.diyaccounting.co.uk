// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/hmrcItsaUkPropertyPeriodsGet.test.js
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

import { ingestHandler as hmrcItsaUkPropertyPeriodsGetHandler } from "@app/functions/hmrc/hmrcItsaUkPropertyPeriodsGet.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const VALID_NINO = "AB123456C";
const VALID_BUSINESS_ID = "XAIS12345678901";
const VALID_TAX_YEAR = "2023-24";

let mockFetch;

describe("hmrcItsaUkPropertyPeriodsGet ingestHandler", () => {
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

  test("returns 400 when businessId is missing", async () => {
    const event = buildHmrcEvent({
      queryStringParameters: { nino: VALID_NINO, taxYear: VALID_TAX_YEAR },
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcItsaUkPropertyPeriodsGetHandler(event);
    expect(response.statusCode).toBe(400);
    const body = parseResponseBody(response);
    expect(body.message).toContain("businessId");
  });

  test("returns 200 with the listed period summaries on success", async () => {
    const periods = { periods: [{ submissionId: "s-1", fromDate: "2023-04-06", toDate: "2023-07-05" }] };
    mockHmrcSuccess(mockFetch, periods);

    const event = buildHmrcEvent({
      queryStringParameters: { nino: VALID_NINO, businessId: VALID_BUSINESS_ID, taxYear: VALID_TAX_YEAR },
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcItsaUkPropertyPeriodsGetHandler(event);
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual(periods);
  });

  test("calls the untyped property list path, without a uk segment", async () => {
    mockHmrcSuccess(mockFetch, { periods: [] });

    const event = buildHmrcEvent({
      queryStringParameters: { nino: VALID_NINO, businessId: VALID_BUSINESS_ID, taxYear: VALID_TAX_YEAR },
      headers: { authorization: "Bearer test-token" },
    });
    await hmrcItsaUkPropertyPeriodsGetHandler(event);

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain(`/individuals/business/property/${VALID_NINO}/${VALID_BUSINESS_ID}/period/${VALID_TAX_YEAR}`);
    expect(calledUrl).not.toContain("/property/uk/");
  });

  test("HEAD request returns 200 OK", async () => {
    const event = buildHmrcEvent({ body: null });
    event.requestContext.http = { method: "HEAD", path: "/" };
    const response = await hmrcItsaUkPropertyPeriodsGetHandler(event);
    expect([200, 400, 401]).toContain(response.statusCode);
  });

  test("returns 400 for a cumulative tax year - there is no list of period summaries to retrieve", async () => {
    const event = buildHmrcEvent({
      queryStringParameters: { nino: VALID_NINO, businessId: VALID_BUSINESS_ID, taxYear: "2025-26" },
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcItsaUkPropertyPeriodsGetHandler(event);
    expect(response.statusCode).toBe(400);
    const body = parseResponseBody(response);
    expect(body.message).toContain("running total");
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

import { workerHandler as hmrcItsaUkPropertyPeriodsGetWorker } from "@app/functions/hmrc/hmrcItsaUkPropertyPeriodsGet.js";

describe("hmrcItsaUkPropertyPeriodsGet worker", () => {
  beforeEach(() => {
    Object.assign(process.env, setupTestEnv());
    vi.clearAllMocks();
  });

  function buildWorkerEvent() {
    return {
      Records: [
        {
          body: JSON.stringify({
            userId: "user-123",
            requestId: "req-456",
            payload: {
              nino: "AB123456C",
              hmrcAccessToken: "token",
              govClientHeaders: {},
              hmrcAccount: "live",
              userSub: "user-123",
              businessId: "XAIS12345678901",
              taxYear: "2023-24",
            },
          }),
          messageId: "msg-789",
        },
      ],
    };
  }

  async function asyncRequestWrites(status) {
    const lib = await import("@aws-sdk/lib-dynamodb");
    return mockSend.mock.calls.filter(
      (call) => call[0] instanceof lib.UpdateCommand && call[0].input.ExpressionAttributeValues[":status"] === status,
    );
  }

  test("successfully processes SQS message and marks as completed", async () => {
    mockHmrcSuccess(mockFetch, { periods: [] });

    await hmrcItsaUkPropertyPeriodsGetWorker(buildWorkerEvent());

    const completed = await asyncRequestWrites("completed");
    expect(completed).toHaveLength(1);
    expect(completed[0][0].input.ExpressionAttributeValues[":data"].hmrcResponse.status).toBe(200);
  });

  test("records a terminal error in the async request and does not re-throw it", async () => {
    mockFetch.mockRejectedValueOnce(new Error("HMRC rejected the request"));

    await expect(hmrcItsaUkPropertyPeriodsGetWorker(buildWorkerEvent())).resolves.toBeUndefined();

    const failed = await asyncRequestWrites("failed");
    expect(failed).toHaveLength(1);
    expect(failed[0][0].input.ExpressionAttributeValues[":data"].message).toContain("HMRC rejected the request");
    expect(await asyncRequestWrites("completed")).toHaveLength(0);
  });

  test("re-throws a retryable error for SQS redelivery and writes no outcome", async () => {
    mockFetch.mockRejectedValueOnce(Object.assign(new Error("connection reset"), { code: "ECONNRESET" }));

    await expect(hmrcItsaUkPropertyPeriodsGetWorker(buildWorkerEvent())).rejects.toThrow("connection reset");

    expect(await asyncRequestWrites("failed")).toHaveLength(0);
    expect(await asyncRequestWrites("completed")).toHaveLength(0);
  });
});
