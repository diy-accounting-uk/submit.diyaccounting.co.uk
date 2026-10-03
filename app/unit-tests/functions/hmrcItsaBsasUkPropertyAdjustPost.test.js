// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/hmrcItsaBsasUkPropertyAdjustPost.test.js
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

import {
  ingestHandler as hmrcItsaBsasUkPropertyAdjustPostHandler,
  buildBsasUkPropertyAdjustRequestBody,
} from "@app/functions/hmrc/hmrcItsaBsasUkPropertyAdjustPost.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

describe("buildBsasUkPropertyAdjustRequestBody", () => {
  test("wraps income and expenses in ukProperty", () => {
    const body = buildBsasUkPropertyAdjustRequestBody({
      income: { totalRentsReceived: 9000 },
      expenses: { costOfReplacingDomesticItems: 500 },
    });
    expect(body).toEqual({
      ukProperty: { income: { totalRentsReceived: 9000 }, expenses: { costOfReplacingDomesticItems: 500 } },
    });
  });

  test("accepts zeroAdjustments wrapped in ukProperty on its own", () => {
    const body = buildBsasUkPropertyAdjustRequestBody({ zeroAdjustments: true });
    expect(body).toEqual({ ukProperty: { zeroAdjustments: true } });
  });

  test("rejects zeroAdjustments together with figures", () => {
    expect(() => buildBsasUkPropertyAdjustRequestBody({ income: { totalRentsReceived: 100 }, zeroAdjustments: true })).toThrow(
      /RULE_BOTH_ADJUSTMENTS_SUPPLIED|Both adjustments/,
    );
  });

  test("rejects a body with neither zeroAdjustments nor figures", () => {
    expect(() => buildBsasUkPropertyAdjustRequestBody({})).toThrow(/empty or non-matching body/);
  });

  test("sends amounts as numbers rounded to 2 decimal places", () => {
    const body = buildBsasUkPropertyAdjustRequestBody({ income: { totalRentsReceived: "100.005" } });
    expect(body.ukProperty.income.totalRentsReceived).toBe(100.01);
  });
});

const VALID_NINO = "AB123456C";
const VALID_CALCULATION_ID = "f2fb30e5-4ab6-4a29-b3c1-c7264259ff1c";
const VALID_TAX_YEAR = "2023-24";

function buildAdjustBody(overrides = {}) {
  return {
    nino: VALID_NINO,
    calculationId: VALID_CALCULATION_ID,
    taxYear: VALID_TAX_YEAR,
    income: { totalRentsReceived: 9000 },
    ...overrides,
  };
}

let mockFetch;

describe("hmrcItsaBsasUkPropertyAdjustPost ingestHandler", () => {
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

  test("returns 400 for an empty body", async () => {
    const event = buildHmrcEvent({
      body: buildAdjustBody({ income: undefined }),
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcItsaBsasUkPropertyAdjustPostHandler(event);
    expect(response.statusCode).toBe(400);
  });

  test("calls the uk-property adjust path", async () => {
    mockHmrcSuccess(mockFetch, {});

    const event = buildHmrcEvent({
      body: buildAdjustBody(),
      headers: { authorization: "Bearer test-token" },
    });
    await hmrcItsaBsasUkPropertyAdjustPostHandler(event);

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain(
      `/individuals/self-assessment/adjustable-summary/${VALID_NINO}/uk-property/${VALID_CALCULATION_ID}/adjust/${VALID_TAX_YEAR}`,
    );
  });

  test("returns 200 on success", async () => {
    mockHmrcSuccess(mockFetch, {});

    const event = buildHmrcEvent({
      body: buildAdjustBody(),
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcItsaBsasUkPropertyAdjustPostHandler(event);
    expect(response.statusCode).toBe(200);
  });

  test("returns a client error when HMRC rejects the adjustment", async () => {
    mockHmrcError(mockFetch, 400, { code: "RULE_ALREADY_ADJUSTED", message: "A summary may only be adjusted once" });

    const event = buildHmrcEvent({
      body: buildAdjustBody(),
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcItsaBsasUkPropertyAdjustPostHandler(event);
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
  });

  test("returns 403 JSON when the authenticated user holds no bundle entitled to adjust a summary", async () => {
    const event = buildHmrcEvent({
      body: buildAdjustBody(),
      headers: { authorization: "Bearer test-token" },
    });
    event.requestContext.http.path = "/api/v1/hmrc/itsa/bsas/uk-property/adjust";
    const response = await hmrcItsaBsasUkPropertyAdjustPostHandler(event);
    expect(response.statusCode).toBe(403);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

import { workerHandler as hmrcItsaBsasUkPropertyAdjustPostWorker } from "@app/functions/hmrc/hmrcItsaBsasUkPropertyAdjustPost.js";

describe("hmrcItsaBsasUkPropertyAdjustPost worker", () => {
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
              calculationId: "f2fb30e5-4ab6-4a29-b3c1-c7264259ff1c",
              taxYear: "2023-24",
              income: {
                totalRentsReceived: 9000,
              },
              expenses: {
                costOfReplacingDomesticItems: 500,
              },
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
    mockHmrcSuccess(mockFetch, {});

    await hmrcItsaBsasUkPropertyAdjustPostWorker(buildWorkerEvent());

    const completed = await asyncRequestWrites("completed");
    expect(completed).toHaveLength(1);
    expect(completed[0][0].input.ExpressionAttributeValues[":data"].hmrcResponse.status).toBe(200);
  });

  test("records a terminal error in the async request and does not re-throw it", async () => {
    mockFetch.mockRejectedValueOnce(new Error("HMRC rejected the request"));

    await expect(hmrcItsaBsasUkPropertyAdjustPostWorker(buildWorkerEvent())).resolves.toBeUndefined();

    const failed = await asyncRequestWrites("failed");
    expect(failed).toHaveLength(1);
    expect(failed[0][0].input.ExpressionAttributeValues[":data"].message).toContain("HMRC rejected the request");
    expect(await asyncRequestWrites("completed")).toHaveLength(0);
  });

  test("re-throws a retryable error for SQS redelivery and writes no outcome", async () => {
    mockFetch.mockRejectedValueOnce(Object.assign(new Error("connection reset"), { code: "ECONNRESET" }));

    await expect(hmrcItsaBsasUkPropertyAdjustPostWorker(buildWorkerEvent())).rejects.toThrow("connection reset");

    expect(await asyncRequestWrites("failed")).toHaveLength(0);
    expect(await asyncRequestWrites("completed")).toHaveLength(0);
  });
});
