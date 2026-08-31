// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/unit-tests/functions/hmrcVatReturnGet.test.js
// NOTE: Test data in this file (test-token, test-client-id, etc.) are not real credentials

import { describe, test, beforeEach, expect, vi } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { buildHmrcEvent } from "@app/test-helpers/eventBuilders.js";
import { setupTestEnv, parseResponseBody, setupFetchMock, mockHmrcSuccess, mockHmrcError } from "@app/test-helpers/mockHelpers.js";

// ---------------------------------------------------------------------------
// Mock AWS DynamoDB used by bundle management to avoid real AWS calls
// We keep behaviour simple: Query returns empty items; Put/Delete succeed.
// This preserves the current ingestHandler behaviour expected by tests without
// persisting between calls (so duplicate requests still appear as new).
// ---------------------------------------------------------------------------
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
    constructor(_config) {
      // no-op in unit tests
    }
  }
  return { DynamoDBClient };
});

// Mock getVatObligations to return obligations for period key resolution
const mockGetVatObligations = vi.fn();
vi.mock("@app/functions/hmrc/hmrcVatObligationGet.js", () => ({
  getVatObligations: (...args) => mockGetVatObligations(...args),
}));

// Capture EventBridge sends so activity-event tests can inspect the Detail JSON directly.
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

// Defer importing the ingestHandlers until after mocks are defined
import { ingestHandler as hmrcVatReturnGetHandler } from "@app/functions/hmrc/hmrcVatReturnGet.js";
import { hashSub } from "@app/services/subHasher.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

// Standard test period dates (matches simulator default fulfilled obligation)
const TEST_PERIOD_START = "2017-01-01";
const TEST_PERIOD_END = "2017-03-31";
const TEST_PERIOD_KEY = "18A1";

// Helper to set up mock obligations response for fulfilled returns
function mockObligationsSuccess(periodKey = TEST_PERIOD_KEY, periodStart = TEST_PERIOD_START, periodEnd = TEST_PERIOD_END) {
  mockGetVatObligations.mockResolvedValue({
    obligations: { obligations: [{ periodKey, start: periodStart, end: periodEnd, status: "F" }] },
    hmrcResponse: { ok: true, status: 200 },
  });
}

function mockObligationsNotFound() {
  mockGetVatObligations.mockResolvedValue({
    obligations: { obligations: [] },
    hmrcResponse: { ok: true, status: 200 },
  });
}

function mockObligationsError(status = 500) {
  mockGetVatObligations.mockResolvedValue({
    obligations: { obligations: [] },
    hmrcResponse: { ok: false, status },
  });
}

let mockFetch;

describe("hmrcVatReturnGet ingestHandler", () => {
  beforeEach(() => {
    Object.assign(process.env, setupTestEnv());
    mockFetch = setupFetchMock();
    // Reset and provide default mock DynamoDB behaviour
    vi.resetAllMocks();
    mockEventBridgeSend.mockResolvedValue({});
    mockSend.mockImplementation(async (cmd) => {
      const lib = await import("@aws-sdk/lib-dynamodb");
      if (cmd instanceof lib.QueryCommand) {
        return { Items: [], Count: 0 };
      }
      if (cmd instanceof lib.PutCommand) {
        return {};
      }
      if (cmd instanceof lib.DeleteCommand) {
        return {};
      }
      if (cmd instanceof lib.GetCommand) {
        return { Item: null };
      }
      return {};
    });
    // Default: obligations resolve successfully
    mockObligationsSuccess();
  });

  test("HEAD request returns 200 OK", async () => {
    const event = buildHmrcEvent({ queryStringParameters: null });
    event.requestContext.http = { method: "HEAD", path: "/" };
    const response = await hmrcVatReturnGetHandler(event);
    expect([200, 400, 401, 500]).toContain(response.statusCode);
  });

  test("returns 400 when vrn is missing", async () => {
    const event = buildHmrcEvent({
      queryStringParameters: { periodStart: TEST_PERIOD_START, periodEnd: TEST_PERIOD_END },
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcVatReturnGetHandler(event);
    expect(response.statusCode).toBe(400);
    const body = parseResponseBody(response);
    expect(body.message).toContain("vrn");
  });

  test("returns 400 when periodStart is missing", async () => {
    const event = buildHmrcEvent({
      queryStringParameters: { vrn: "111222333", periodEnd: TEST_PERIOD_END },
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcVatReturnGetHandler(event);
    expect(response.statusCode).toBe(400);
    const body = parseResponseBody(response);
    expect(body.message).toContain("periodStart");
  });

  test("returns 400 when periodEnd is missing", async () => {
    const event = buildHmrcEvent({
      queryStringParameters: { vrn: "111222333", periodStart: TEST_PERIOD_START },
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcVatReturnGetHandler(event);
    expect(response.statusCode).toBe(400);
    const body = parseResponseBody(response);
    expect(body.message).toContain("periodEnd");
  });

  test("returns 400 when periodStart has invalid format", async () => {
    const event = buildHmrcEvent({
      queryStringParameters: { vrn: "111222333", periodStart: "invalid-date", periodEnd: TEST_PERIOD_END },
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcVatReturnGetHandler(event);
    expect(response.statusCode).toBe(400);
    const body = parseResponseBody(response);
    expect(body.message).toContain("periodStart");
    expect(body.message).toContain("YYYY-MM-DD");
  });

  test("returns 400 when periodEnd has invalid format", async () => {
    const event = buildHmrcEvent({
      queryStringParameters: { vrn: "111222333", periodStart: TEST_PERIOD_START, periodEnd: "invalid-date" },
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcVatReturnGetHandler(event);
    expect(response.statusCode).toBe(400);
    const body = parseResponseBody(response);
    expect(body.message).toContain("periodEnd");
    expect(body.message).toContain("YYYY-MM-DD");
  });

  test("returns 403 JSON when the authenticated user holds no bundle entitled to viewing VAT returns", async () => {
    // QueryCommand (bundle lookup) resolves to no items via the default beforeEach mock,
    // so the user has only the automatic "default" bundle, which view-vat-return does not accept.
    const event = buildHmrcEvent({
      queryStringParameters: { vrn: "111222333", periodStart: TEST_PERIOD_START, periodEnd: TEST_PERIOD_END },
      headers: { authorization: "Bearer test-token" },
    });
    event.requestContext.http.path = "/api/v1/hmrc/vat/return";
    const response = await hmrcVatReturnGetHandler(event);
    expect(response.statusCode).toBe(403);
    const body = parseResponseBody(response);
    expect(body.code).toBe("BUNDLE_FORBIDDEN");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("allows the request through once the user holds a bundle entitled to viewing VAT returns", async () => {
    mockSend.mockImplementation(async (cmd) => {
      const lib = await import("@aws-sdk/lib-dynamodb");
      if (cmd instanceof lib.QueryCommand) {
        return { Items: [{ bundleId: "day-guest" }], Count: 1 };
      }
      return {};
    });
    mockObligationsSuccess(TEST_PERIOD_KEY, TEST_PERIOD_START, TEST_PERIOD_END);
    mockHmrcSuccess(mockFetch, { periodKey: TEST_PERIOD_KEY, totalVatDue: 100 });

    const event = buildHmrcEvent({
      queryStringParameters: { vrn: "111222333", periodStart: TEST_PERIOD_START, periodEnd: TEST_PERIOD_END },
      headers: { authorization: "Bearer test-token" },
    });
    event.requestContext.http.path = "/api/v1/hmrc/vat/return";
    const response = await hmrcVatReturnGetHandler(event);
    expect(response.statusCode).toBe(200);
  });

  test("returns 400 when no matching obligation found for period dates", async () => {
    mockObligationsNotFound();

    const event = buildHmrcEvent({
      queryStringParameters: { vrn: "111222333", periodStart: TEST_PERIOD_START, periodEnd: TEST_PERIOD_END },
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcVatReturnGetHandler(event);
    expect(response.statusCode).toBe(400);
    const body = parseResponseBody(response);
    expect(body.message).toContain("No submitted VAT return found");
  });

  test("returns error when obligations API fails", async () => {
    mockObligationsError(500);

    const event = buildHmrcEvent({
      queryStringParameters: { vrn: "111222333", periodStart: TEST_PERIOD_START, periodEnd: TEST_PERIOD_END },
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcVatReturnGetHandler(event);
    expect(response.statusCode).toBe(400);
    const body = parseResponseBody(response);
    expect(body.message).toContain("Failed to resolve period key");
  });

  test("returns 200 with VAT return data on success", async () => {
    mockObligationsSuccess(TEST_PERIOD_KEY, TEST_PERIOD_START, TEST_PERIOD_END);

    const vatReturn = {
      periodKey: TEST_PERIOD_KEY,
      vatDueSales: 100,
      vatDueAcquisitions: 0,
      totalVatDue: 100,
    };
    mockHmrcSuccess(mockFetch, vatReturn);

    const event = buildHmrcEvent({
      queryStringParameters: { vrn: "111222333", periodStart: TEST_PERIOD_START, periodEnd: TEST_PERIOD_END },
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcVatReturnGetHandler(event);
    expect(response.statusCode).toBe(200);

    // The window is padded either side of the requested period and carries no status filter
    expect(mockGetVatObligations).toHaveBeenCalled();
    const callArgs = mockGetVatObligations.mock.calls[0];
    expect(callArgs[0]).toBe("111222333"); // vatNumber
    expect(callArgs[5]).toEqual({ from: "2016-12-25", to: "2017-04-07" });
  });

  test("publishes the vat-return-queried event with the hashed sub, never the raw sub", async () => {
    mockObligationsSuccess(TEST_PERIOD_KEY, TEST_PERIOD_START, TEST_PERIOD_END);

    const vatReturn = { periodKey: TEST_PERIOD_KEY, totalVatDue: 100 };
    mockHmrcSuccess(mockFetch, vatReturn);

    const event = buildHmrcEvent({
      queryStringParameters: { vrn: "111222333", periodStart: TEST_PERIOD_START, periodEnd: TEST_PERIOD_END },
      headers: { authorization: "Bearer test-token" },
    });
    await hmrcVatReturnGetHandler(event);

    const queriedCalls = mockEventBridgeSend.mock.calls.filter((call) => {
      const detail = JSON.parse(call[0].input.Entries[0].Detail);
      return detail.event === "vat-return-queried";
    });
    expect(queriedCalls).toHaveLength(1);
    const rawDetail = queriedCalls[0][0].input.Entries[0].Detail;
    expect(rawDetail).not.toContain('"test-sub"');
    const detail = JSON.parse(rawDetail);
    expect(detail.hashedSub).toBe(hashSub("test-sub"));
  });

  test("returns 202 when x-wait-time-ms=0 (async initiation)", async () => {
    mockObligationsSuccess();

    const event = buildHmrcEvent({
      queryStringParameters: { vrn: "111222333", periodStart: TEST_PERIOD_START, periodEnd: TEST_PERIOD_END },
      headers: {
        "authorization": "Bearer test-token",
        "x-wait-time-ms": "0",
        "x-initial-request": "true",
      },
    });
    const response = await hmrcVatReturnGetHandler(event);
    expect(response.statusCode).toBe(202);
    expect(response.headers).toHaveProperty("x-request-id");
    expect(mockSqsSend).toHaveBeenCalled();
  });

  test("returns 200 when processing completes synchronously (large x-wait-time-ms)", async () => {
    mockObligationsSuccess();

    const vatReturn = { periodKey: TEST_PERIOD_KEY, totalVatDue: 100 };
    mockHmrcSuccess(mockFetch, vatReturn);

    const event = buildHmrcEvent({
      queryStringParameters: { vrn: "111222333", periodStart: TEST_PERIOD_START, periodEnd: TEST_PERIOD_END },
      headers: {
        "authorization": "Bearer test-token",
        "x-wait-time-ms": "30000",
        "x-initial-request": "true",
      },
    });
    const response = await hmrcVatReturnGetHandler(event);
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual(vatReturn);
  });

  test("poll after successful retrieval returns persisted result without re-resolving periodKey", async () => {
    const persistedVatReturn = { periodKey: TEST_PERIOD_KEY, totalVatDue: 100 };

    mockSend.mockImplementation(async (cmd) => {
      const lib = await import("@aws-sdk/lib-dynamodb");
      if (cmd instanceof lib.QueryCommand) return { Items: [], Count: 0 };
      if (cmd instanceof lib.PutCommand) return {};
      if (cmd instanceof lib.DeleteCommand) return {};
      if (cmd instanceof lib.GetCommand) {
        if (cmd.input?.TableName === process.env.HMRC_VAT_RETURN_GET_ASYNC_REQUESTS_TABLE_NAME) {
          return {
            Item: {
              hashedSub: "any",
              requestId: "poll-get-after-success",
              status: "completed",
              data: {
                vatReturn: persistedVatReturn,
                hmrcResponse: { ok: true, status: 200, statusText: "OK", headers: {} },
                periodKey: TEST_PERIOD_KEY,
              },
            },
          };
        }
        return { Item: null };
      }
      return {};
    });

    const event = buildHmrcEvent({
      queryStringParameters: { vrn: "111222333", periodStart: TEST_PERIOD_START, periodEnd: TEST_PERIOD_END },
      headers: {
        "authorization": "Bearer test-token",
        "x-initial-request": "false",
        "x-request-id": "poll-get-after-success",
      },
      requestId: "poll-get-after-success",
    });
    const response = await hmrcVatReturnGetHandler(event);
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual(persistedVatReturn);

    expect(mockGetVatObligations).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

import { workerHandler as hmrcVatReturnGetWorker } from "@app/functions/hmrc/hmrcVatReturnGet.js";

describe("hmrcVatReturnGet worker", () => {
  beforeEach(() => {
    Object.assign(process.env, setupTestEnv());
    vi.clearAllMocks();
  });

  test("successfully processes SQS message and marks as completed", async () => {
    const vatReturn = { periodKey: TEST_PERIOD_KEY, totalVatDue: 100 };
    mockHmrcSuccess(mockFetch, vatReturn);

    const event = {
      Records: [
        {
          body: JSON.stringify({
            userId: "user-123",
            requestId: "req-456",
            payload: {
              vrn: "111222333",
              periodKey: TEST_PERIOD_KEY,
              hmrcAccessToken: "token",
              govClientHeaders: {},
              hmrcAccount: "live",
              userSub: "user-123",
            },
          }),
          messageId: "msg-789",
        },
      ],
    };

    await hmrcVatReturnGetWorker(event);

    const lib = await import("@aws-sdk/lib-dynamodb");
    const updateCalls = mockSend.mock.calls.filter((call) => call[0] instanceof lib.UpdateCommand);
    expect(updateCalls.length).toBeGreaterThan(0);
    const completedCall = updateCalls.find((call) => call[0].input.ExpressionAttributeValues[":status"] === "completed");
    expect(completedCall).toBeDefined();
    expect(completedCall[0].input.ExpressionAttributeValues[":data"].vatReturn).toEqual(vatReturn);
  });
});
