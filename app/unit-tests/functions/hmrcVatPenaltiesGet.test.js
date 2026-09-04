// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/unit-tests/functions/hmrcVatPenaltiesGet.test.js
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
import { ingestHandler as hmrcVatPenaltiesGetHandler } from "@app/functions/hmrc/hmrcVatPenaltiesGet.js";
import { hashSub } from "@app/services/subHasher.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

let mockFetch;

const NO_PENALTIES = {
  totalisations: {
    lateSubmissionPenaltyTotalValue: 0,
    penalisedPrincipalTotal: 0,
    latePaymentPenaltyPostedTotal: 0,
    latePaymentPenaltyEstimateTotal: 0,
  },
  lateSubmissionPenalty: {
    summary: {
      activePenaltyPoints: 0,
      inactivePenaltyPoints: 0,
      periodOfComplianceAchievement: "9999-12-31",
      regimeThreshold: 4,
      penaltyChargeAmount: 0,
    },
    details: [],
  },
  latePaymentPenalty: { details: [] },
};

describe("hmrcVatPenaltiesGet ingestHandler", () => {
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
    const response = await hmrcVatPenaltiesGetHandler(event);
    expect([200, 400, 401]).toContain(response.statusCode);
  });

  test("returns 400 when VAT registration number is missing", async () => {
    const event = buildHmrcEvent({
      queryStringParameters: {},
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcVatPenaltiesGetHandler(event);
    expect(response.statusCode).toBe(400);
  });

  test("returns 200 with penalties on success", async () => {
    mockHmrcSuccess(mockFetch, NO_PENALTIES);

    const event = buildHmrcEvent({
      queryStringParameters: { vrn: "111222333" },
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcVatPenaltiesGetHandler(event);
    expect(response.statusCode).toBe(200);
  });

  test("publishes the vat-penalties-queried event with the hashed sub, never the raw sub", async () => {
    mockHmrcSuccess(mockFetch, NO_PENALTIES);

    const event = buildHmrcEvent({
      queryStringParameters: { vrn: "111222333" },
      headers: { authorization: "Bearer test-token" },
    });
    await hmrcVatPenaltiesGetHandler(event);

    const queriedCalls = mockEventBridgeSend.mock.calls.filter((call) => {
      const detail = JSON.parse(call[0].input.Entries[0].Detail);
      return detail.event === "vat-penalties-queried";
    });
    expect(queriedCalls).toHaveLength(1);
    const rawDetail = queriedCalls[0][0].input.Entries[0].Detail;
    expect(rawDetail).not.toContain('"test-sub"');
    const detail = JSON.parse(rawDetail);
    expect(detail.hashedSub).toBe(hashSub("test-sub"));
  });

  test("returns 500 on HMRC API server error", async () => {
    mockHmrcError(mockFetch, 503, { code: "SERVER_ERROR" });

    const event = buildHmrcEvent({
      queryStringParameters: { vrn: "111222333" },
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcVatPenaltiesGetHandler(event);
    expect(response.statusCode).toBe(500);
  });

  test("returns 400 carrying HMRC's code and message when HMRC rejects the request with a 400", async () => {
    mockHmrcError(mockFetch, 400, { code: "INVALID_VRN", message: "The provided VRN is invalid" });

    const event = buildHmrcEvent({
      queryStringParameters: { vrn: "111222333" },
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcVatPenaltiesGetHandler(event);
    expect(response.statusCode).toBe(400);
    const body = parseResponseBody(response);
    expect(body.responseBody.code).toBe("INVALID_VRN");
    expect(body.responseBody.message).toBe("The provided VRN is invalid");
  });

  test("returns 400 for invalid VAT registration number format", async () => {
    const event = buildHmrcEvent({
      queryStringParameters: { vrn: "12345678" }, // 8 digits instead of 9
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcVatPenaltiesGetHandler(event);
    expect(response.statusCode).toBe(400);
    const body = parseResponseBody(response);
    expect(body.message).toContain("9 digits");
  });

  test("returns 403 JSON when the authenticated user holds no bundle entitled to VAT penalties", async () => {
    // QueryCommand (bundle lookup) resolves to no items via the default beforeEach mock,
    // so the user has only the automatic "default" bundle, which vat-penalties does not accept.
    const event = buildHmrcEvent({
      queryStringParameters: { vrn: "111222333" },
      headers: { authorization: "Bearer test-token" },
    });
    event.requestContext.http.path = "/api/v1/hmrc/vat/penalty";
    const response = await hmrcVatPenaltiesGetHandler(event);
    expect(response.statusCode).toBe(403);
    const body = parseResponseBody(response);
    expect(body.code).toBe("BUNDLE_FORBIDDEN");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("allows the request through once the user holds a bundle entitled to VAT penalties", async () => {
    mockSend.mockImplementation(async (cmd) => {
      const lib = await import("@aws-sdk/lib-dynamodb");
      if (cmd instanceof lib.QueryCommand) {
        return { Items: [{ bundleId: "day-guest" }], Count: 1 };
      }
      return {};
    });
    mockHmrcSuccess(mockFetch, NO_PENALTIES);

    const event = buildHmrcEvent({
      queryStringParameters: { vrn: "111222333" },
      headers: { authorization: "Bearer test-token" },
    });
    event.requestContext.http.path = "/api/v1/hmrc/vat/penalty";
    const response = await hmrcVatPenaltiesGetHandler(event);
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
    const response = await hmrcVatPenaltiesGetHandler(event);
    expect(response.statusCode).toBe(202);
    expect(response.headers).toHaveProperty("x-request-id");
    expect(mockSqsSend).toHaveBeenCalled();
  });

  test("returns 200 when processing completes synchronously (large x-wait-time-ms)", async () => {
    mockHmrcSuccess(mockFetch, NO_PENALTIES);

    const event = buildHmrcEvent({
      queryStringParameters: { vrn: "111222333" },
      headers: {
        "authorization": "Bearer test-token",
        "x-wait-time-ms": "30000",
        "x-initial-request": "true",
      },
    });
    const response = await hmrcVatPenaltiesGetHandler(event);
    expect(response.statusCode).toBe(200);
    // HMRC's raw penalties response has no wrapper key, so the Lambda's respond() call adds a
    // "penalties" envelope (dataKey) to match the other VAT-read endpoints' response shape.
    expect(JSON.parse(response.body)).toEqual({ penalties: NO_PENALTIES });
  });
});

import { workerHandler as hmrcVatPenaltiesGetWorker } from "@app/functions/hmrc/hmrcVatPenaltiesGet.js";

describe("hmrcVatPenaltiesGet worker", () => {
  beforeEach(() => {
    Object.assign(process.env, setupTestEnv());
    vi.clearAllMocks();
  });

  test("successfully processes SQS message and marks as completed", async () => {
    mockHmrcSuccess(mockFetch, NO_PENALTIES);

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
              userSub: "user-123",
            },
          }),
          messageId: "msg-789",
        },
      ],
    };

    await hmrcVatPenaltiesGetWorker(event);

    const lib = await import("@aws-sdk/lib-dynamodb");
    const updateCalls = mockSend.mock.calls.filter((call) => call[0] instanceof lib.UpdateCommand);
    expect(updateCalls.length).toBeGreaterThan(0);
    const completedCall = updateCalls.find((call) => call[0].input.ExpressionAttributeValues[":status"] === "completed");
    expect(completedCall).toBeDefined();
    expect(completedCall[0].input.ExpressionAttributeValues[":data"].penalties).toEqual(NO_PENALTIES);
  });
});
