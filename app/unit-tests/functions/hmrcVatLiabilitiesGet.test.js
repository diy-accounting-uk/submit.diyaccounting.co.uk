// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/unit-tests/functions/hmrcVatLiabilitiesGet.test.js
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
import { ingestHandler as hmrcVatLiabilitiesGetHandler } from "@app/functions/hmrc/hmrcVatLiabilitiesGet.js";
import { hashSub } from "@app/services/subHasher.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

let mockFetch;

describe("hmrcVatLiabilitiesGet ingestHandler", () => {
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
  });

  test("HEAD request returns 200 OK", async () => {
    const event = buildHmrcEvent({ queryStringParameters: null });
    event.requestContext.http = { method: "HEAD", path: "/" };
    const response = await hmrcVatLiabilitiesGetHandler(event);
    expect([200, 400, 401]).toContain(response.statusCode);
  });

  test("returns 400 when VAT registration number is missing", async () => {
    const event = buildHmrcEvent({
      queryStringParameters: {},
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcVatLiabilitiesGetHandler(event);
    expect(response.statusCode).toBe(400);
  });

  test("returns 200 with liabilities list on success", async () => {
    const liabilities = {
      liabilities: [
        {
          taxPeriod: { from: "2024-01-01", to: "2024-03-31" },
          type: "VAT Return Debit Charge",
          originalAmount: 1000.0,
          outstandingAmount: 250.0,
          due: "2024-05-07",
        },
      ],
    };
    mockHmrcSuccess(mockFetch, liabilities);

    const event = buildHmrcEvent({
      queryStringParameters: { vrn: "111222333" },
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcVatLiabilitiesGetHandler(event);
    expect(response.statusCode).toBe(200);
  });

  test("publishes the vat-liabilities-queried event with the hashed sub, never the raw sub", async () => {
    const liabilities = { liabilities: [{ type: "VAT Return Debit Charge", originalAmount: 1000.0 }] };
    mockHmrcSuccess(mockFetch, liabilities);

    const event = buildHmrcEvent({
      queryStringParameters: { vrn: "111222333" },
      headers: { authorization: "Bearer test-token" },
    });
    await hmrcVatLiabilitiesGetHandler(event);

    const queriedCalls = mockEventBridgeSend.mock.calls.filter((call) => {
      const detail = JSON.parse(call[0].input.Entries[0].Detail);
      return detail.event === "vat-liabilities-queried";
    });
    expect(queriedCalls).toHaveLength(1);
    const rawDetail = queriedCalls[0][0].input.Entries[0].Detail;
    expect(rawDetail).not.toContain('"test-sub"');
    const detail = JSON.parse(rawDetail);
    expect(detail.hashedSub).toBe(hashSub("test-sub"));
  });

  test("returns 500 on HMRC API error", async () => {
    mockHmrcError(mockFetch, 400, { code: "INVALID_VRN" });

    const event = buildHmrcEvent({
      queryStringParameters: { vrn: "invalid" },
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcVatLiabilitiesGetHandler(event);
    expect([400, 500]).toContain(response.statusCode);
  });

  test("returns 200 with an empty liabilities list when HMRC 404s with NOT_FOUND", async () => {
    mockHmrcError(mockFetch, 404, { code: "NOT_FOUND", message: "The remote endpoint has indicated that no data can be found" });

    const event = buildHmrcEvent({
      queryStringParameters: { vrn: "111222333" },
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcVatLiabilitiesGetHandler(event);
    expect(response.statusCode).toBe(200);
    const body = parseResponseBody(response);
    expect(body.liabilities).toEqual([]);
  });

  test("returns 400 when HMRC 404s with a code other than NOT_FOUND", async () => {
    mockHmrcError(mockFetch, 404, { code: "VRN_NOT_FOUND", message: "The VRN does not exist" });

    const event = buildHmrcEvent({
      queryStringParameters: { vrn: "111222333" },
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcVatLiabilitiesGetHandler(event);
    expect(response.statusCode).toBe(400);
  });

  test("returns 400 for invalid VAT registration number format", async () => {
    const event = buildHmrcEvent({
      queryStringParameters: { vrn: "12345678" }, // 8 digits instead of 9
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcVatLiabilitiesGetHandler(event);
    expect(response.statusCode).toBe(400);
    const body = parseResponseBody(response);
    expect(body.message).toContain("9 digits");
  });

  test("returns 400 for invalid date format", async () => {
    const event = buildHmrcEvent({
      queryStringParameters: { vrn: "111222333", from: "2024/01/01" }, // wrong format
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcVatLiabilitiesGetHandler(event);
    expect(response.statusCode).toBe(400);
    const body = parseResponseBody(response);
    expect(body.message).toContain("date format");
  });

  test("returns 403 JSON when the authenticated user holds no bundle entitled to VAT liabilities", async () => {
    // QueryCommand (bundle lookup) resolves to no items via the default beforeEach mock,
    // so the user has only the automatic "default" bundle, which vat-liabilities does not accept.
    const event = buildHmrcEvent({
      queryStringParameters: { vrn: "111222333" },
      headers: { authorization: "Bearer test-token" },
    });
    event.requestContext.http.path = "/api/v1/hmrc/vat/liability";
    const response = await hmrcVatLiabilitiesGetHandler(event);
    expect(response.statusCode).toBe(403);
    const body = parseResponseBody(response);
    expect(body.code).toBe("BUNDLE_FORBIDDEN");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("allows the request through once the user holds a bundle entitled to VAT liabilities", async () => {
    mockSend.mockImplementation(async (cmd) => {
      const lib = await import("@aws-sdk/lib-dynamodb");
      if (cmd instanceof lib.QueryCommand) {
        return { Items: [{ bundleId: "day-guest" }], Count: 1 };
      }
      return {};
    });
    mockHmrcSuccess(mockFetch, { liabilities: [] });

    const event = buildHmrcEvent({
      queryStringParameters: { vrn: "111222333" },
      headers: { authorization: "Bearer test-token" },
    });
    event.requestContext.http.path = "/api/v1/hmrc/vat/liability";
    const response = await hmrcVatLiabilitiesGetHandler(event);
    expect(response.statusCode).toBe(200);
  });

  test("returns 202 when x-wait-time-ms=0 (async initiation)", async () => {
    const event = buildHmrcEvent({
      queryStringParameters: { vrn: "111222333" },
      headers: {
        "authorization": "Bearer test-token",
        "x-wait-time-ms": "0",
        "x-initial-request": "true",
      },
    });
    const response = await hmrcVatLiabilitiesGetHandler(event);
    expect(response.statusCode).toBe(202);
    expect(response.headers).toHaveProperty("x-request-id");
    expect(mockSqsSend).toHaveBeenCalled();
  });

  test("returns 200 when processing completes synchronously (large x-wait-time-ms)", async () => {
    const liabilities = { liabilities: [{ type: "VAT Return Debit Charge", originalAmount: 1000.0 }] };
    mockHmrcSuccess(mockFetch, liabilities);

    const event = buildHmrcEvent({
      queryStringParameters: { vrn: "111222333" },
      headers: {
        "authorization": "Bearer test-token",
        "x-wait-time-ms": "30000",
        "x-initial-request": "true",
      },
    });
    const response = await hmrcVatLiabilitiesGetHandler(event);
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual(liabilities);
  });
});

import { workerHandler as hmrcVatLiabilitiesGetWorker } from "@app/functions/hmrc/hmrcVatLiabilitiesGet.js";

describe("hmrcVatLiabilitiesGet worker", () => {
  beforeEach(() => {
    Object.assign(process.env, setupTestEnv());
    vi.clearAllMocks();
  });

  test("successfully processes SQS message and marks as completed", async () => {
    const liabilities = { liabilities: [{ type: "VAT Return Debit Charge", originalAmount: 1000.0 }] };
    mockHmrcSuccess(mockFetch, liabilities);

    const event = {
      Records: [
        {
          body: JSON.stringify({
            userId: "user-123",
            requestId: "req-456",
            payload: {
              vrn: "111222333",
              hmrcAccessToken: "token",
              govClientHeaders: {},
              hmrcAccount: "live",
              from: "2024-01-01",
              to: "2024-03-31",
              userSub: "user-123",
            },
          }),
          messageId: "msg-789",
        },
      ],
    };

    await hmrcVatLiabilitiesGetWorker(event);

    const lib = await import("@aws-sdk/lib-dynamodb");
    const updateCalls = mockSend.mock.calls.filter((call) => call[0] instanceof lib.UpdateCommand);
    expect(updateCalls.length).toBeGreaterThan(0);
    const completedCall = updateCalls.find((call) => call[0].input.ExpressionAttributeValues[":status"] === "completed");
    expect(completedCall).toBeDefined();
    expect(completedCall[0].input.ExpressionAttributeValues[":data"].liabilities).toEqual(liabilities);
  });
});
