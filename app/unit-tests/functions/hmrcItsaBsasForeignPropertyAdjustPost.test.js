// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/hmrcItsaBsasForeignPropertyAdjustPost.test.js
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
  ingestHandler as hmrcItsaBsasForeignPropertyAdjustPostHandler,
  buildBsasForeignPropertyAdjustRequestBody,
} from "@app/functions/hmrc/hmrcItsaBsasForeignPropertyAdjustPost.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

describe("buildBsasForeignPropertyAdjustRequestBody", () => {
  const entry = { income: { totalRentsReceived: 9000 }, expenses: { costOfServices: 500 } };

  test("sends a plain list of countries up to 2023-24", () => {
    const body = buildBsasForeignPropertyAdjustRequestBody("2023-24", { foreignProperty: [{ countryCode: "FRA", ...entry }] });
    expect(body).toEqual({ foreignProperty: [{ countryCode: "FRA", ...entry }] });
  });

  test("wraps countries in countryLevelDetail for 2024-25", () => {
    const body = buildBsasForeignPropertyAdjustRequestBody("2024-25", { foreignProperty: [{ countryCode: "FRA", ...entry }] });
    expect(body).toEqual({ foreignProperty: { countryLevelDetail: [{ countryCode: "FRA", ...entry }] } });
  });

  test("wraps countries in countryLevelDetail for 2025-26", () => {
    const body = buildBsasForeignPropertyAdjustRequestBody("2025-26", { foreignProperty: [{ countryCode: "ESP", ...entry }] });
    expect(body).toEqual({ foreignProperty: { countryLevelDetail: [{ countryCode: "ESP", ...entry }] } });
  });

  test("wraps properties in propertyLevelDetail for 2026-27", () => {
    const body = buildBsasForeignPropertyAdjustRequestBody("2026-27", { foreignProperty: [{ propertyId: "8e8b8450dc1c", ...entry }] });
    expect(body).toEqual({ foreignProperty: { propertyLevelDetail: [{ propertyId: "8e8b8450dc1c", ...entry }] } });
  });

  test("refuses a countryCode entry in 2026-27", () => {
    expect(() => buildBsasForeignPropertyAdjustRequestBody("2026-27", { foreignProperty: [{ countryCode: "FRA", ...entry }] })).toThrow(
      /propertyId/,
    );
  });

  test("carries foreignFhlEea beside the countries for 2024-25", () => {
    const body = buildBsasForeignPropertyAdjustRequestBody("2024-25", {
      foreignProperty: [{ countryCode: "FRA", ...entry }],
      foreignFhlEea: { income: { totalRentsReceived: 300 } },
    });
    expect(body.foreignFhlEea).toEqual({ income: { totalRentsReceived: 300 } });
    expect(body.foreignProperty.countryLevelDetail).toHaveLength(1);
  });

  test("accepts foreignFhlEea on its own for 2024-25", () => {
    const body = buildBsasForeignPropertyAdjustRequestBody("2024-25", { foreignFhlEea: { income: { totalRentsReceived: 300 } } });
    expect(body).toEqual({ foreignFhlEea: { income: { totalRentsReceived: 300 } } });
  });

  test("refuses foreignFhlEea from 2025-26", () => {
    expect(() => buildBsasForeignPropertyAdjustRequestBody("2025-26", { foreignFhlEea: { income: { totalRentsReceived: 300 } } })).toThrow(
      /2024-25/,
    );
  });

  test("accepts zeroAdjustments on its own from 2024-25 in every shape", () => {
    for (const taxYear of ["2024-25", "2025-26", "2026-27"]) {
      expect(buildBsasForeignPropertyAdjustRequestBody(taxYear, { zeroAdjustments: true })).toEqual({
        foreignProperty: { zeroAdjustments: true },
      });
    }
  });

  test("refuses zeroAdjustments before 2024-25", () => {
    expect(() => buildBsasForeignPropertyAdjustRequestBody("2023-24", { zeroAdjustments: true })).toThrow(/2024-25/);
  });

  test("refuses zeroAdjustments together with figures", () => {
    expect(() =>
      buildBsasForeignPropertyAdjustRequestBody("2025-26", { foreignProperty: [{ countryCode: "FRA", ...entry }], zeroAdjustments: true }),
    ).toThrow(/Both adjustments/);
  });

  test("refuses a body with neither zeroAdjustments nor figures", () => {
    expect(() => buildBsasForeignPropertyAdjustRequestBody("2025-26", {})).toThrow(/empty or non-matching body/);
    expect(() => buildBsasForeignPropertyAdjustRequestBody("2025-26", { foreignProperty: [{ countryCode: "FRA" }] })).toThrow(
      /empty or non-matching body/,
    );
  });

  test("refuses a repeated country before HMRC", () => {
    expect(() =>
      buildBsasForeignPropertyAdjustRequestBody("2025-26", {
        foreignProperty: [
          { countryCode: "FRA", ...entry },
          { countryCode: "FRA", ...entry },
        ],
      }),
    ).toThrow(/more than one entry/);
  });

  test("rounds amounts to 2 decimal places", () => {
    const body = buildBsasForeignPropertyAdjustRequestBody("2025-26", {
      foreignProperty: [{ countryCode: "FRA", income: { totalRentsReceived: 100.005 } }],
    });
    expect(body.foreignProperty.countryLevelDetail[0].income.totalRentsReceived).toBe(100.01);
  });
});

const VALID_NINO = "AB123456C";
const VALID_CALCULATION_ID = "f2fb30e5-4ab6-4a29-b3c1-c7264259ff1c";
const VALID_TAX_YEAR = "2025-26";

function buildAdjustBody(overrides = {}) {
  return {
    nino: VALID_NINO,
    calculationId: VALID_CALCULATION_ID,
    taxYear: VALID_TAX_YEAR,
    foreignProperty: [{ countryCode: "FRA", income: { totalRentsReceived: 9000 } }],
    ...overrides,
  };
}

let mockFetch;

describe("hmrcItsaBsasForeignPropertyAdjustPost ingestHandler", () => {
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
      body: buildAdjustBody({ foreignProperty: undefined }),
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcItsaBsasForeignPropertyAdjustPostHandler(event);
    expect(response.statusCode).toBe(400);
  });

  test("calls the foreign-property adjust path", async () => {
    mockHmrcSuccess(mockFetch, {});

    const event = buildHmrcEvent({
      body: buildAdjustBody(),
      headers: { authorization: "Bearer test-token" },
    });
    await hmrcItsaBsasForeignPropertyAdjustPostHandler(event);

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain(
      `/individuals/self-assessment/adjustable-summary/${VALID_NINO}/foreign-property/${VALID_CALCULATION_ID}/adjust/${VALID_TAX_YEAR}`,
    );
  });

  test("sends the 2025-26 countryLevelDetail body to HMRC", async () => {
    mockHmrcSuccess(mockFetch, {});

    const event = buildHmrcEvent({
      body: buildAdjustBody(),
      headers: { authorization: "Bearer test-token" },
    });
    await hmrcItsaBsasForeignPropertyAdjustPostHandler(event);

    const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(sentBody).toEqual({
      foreignProperty: { countryLevelDetail: [{ countryCode: "FRA", income: { totalRentsReceived: 9000 } }] },
    });
  });

  test("returns 400 for zeroAdjustments beside figures", async () => {
    const event = buildHmrcEvent({
      body: buildAdjustBody({ zeroAdjustments: true }),
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcItsaBsasForeignPropertyAdjustPostHandler(event);
    expect(response.statusCode).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("sends zeroAdjustments alone", async () => {
    mockHmrcSuccess(mockFetch, {});

    const event = buildHmrcEvent({
      body: buildAdjustBody({ foreignProperty: undefined, zeroAdjustments: true }),
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcItsaBsasForeignPropertyAdjustPostHandler(event);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({ foreignProperty: { zeroAdjustments: true } });
  });

  test("returns 200 on success", async () => {
    mockHmrcSuccess(mockFetch, {});

    const event = buildHmrcEvent({
      body: buildAdjustBody(),
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcItsaBsasForeignPropertyAdjustPostHandler(event);
    expect(response.statusCode).toBe(200);
  });

  test("returns a client error when HMRC rejects the adjustment", async () => {
    mockHmrcError(mockFetch, 400, { code: "RULE_ALREADY_ADJUSTED", message: "A summary may only be adjusted once" });

    const event = buildHmrcEvent({
      body: buildAdjustBody(),
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcItsaBsasForeignPropertyAdjustPostHandler(event);
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
  });

  test("returns 403 JSON when the authenticated user holds no bundle entitled to adjust a summary", async () => {
    const event = buildHmrcEvent({
      body: buildAdjustBody(),
      headers: { authorization: "Bearer test-token" },
    });
    event.requestContext.http.path = "/api/v1/hmrc/itsa/bsas/foreign-property/adjust";
    const response = await hmrcItsaBsasForeignPropertyAdjustPostHandler(event);
    expect(response.statusCode).toBe(403);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

import { workerHandler as hmrcItsaBsasForeignPropertyAdjustPostWorker } from "@app/functions/hmrc/hmrcItsaBsasForeignPropertyAdjustPost.js";

describe("hmrcItsaBsasForeignPropertyAdjustPost worker", () => {
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
              taxYear: "2025-26",
              foreignProperty: [{ countryCode: "FRA", income: { totalRentsReceived: 9000 } }],
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

    await hmrcItsaBsasForeignPropertyAdjustPostWorker(buildWorkerEvent());

    const completed = await asyncRequestWrites("completed");
    expect(completed).toHaveLength(1);
    expect(completed[0][0].input.ExpressionAttributeValues[":data"].hmrcResponse.status).toBe(200);
  });

  test("records a terminal error in the async request and does not re-throw it", async () => {
    mockFetch.mockRejectedValueOnce(new Error("HMRC rejected the request"));

    await expect(hmrcItsaBsasForeignPropertyAdjustPostWorker(buildWorkerEvent())).resolves.toBeUndefined();

    const failed = await asyncRequestWrites("failed");
    expect(failed).toHaveLength(1);
    expect(failed[0][0].input.ExpressionAttributeValues[":data"].message).toContain("HMRC rejected the request");
    expect(await asyncRequestWrites("completed")).toHaveLength(0);
  });

  test("re-throws a retryable error for SQS redelivery and writes no outcome", async () => {
    mockFetch.mockRejectedValueOnce(Object.assign(new Error("connection reset"), { code: "ECONNRESET" }));

    await expect(hmrcItsaBsasForeignPropertyAdjustPostWorker(buildWorkerEvent())).rejects.toThrow("connection reset");

    expect(await asyncRequestWrites("failed")).toHaveLength(0);
    expect(await asyncRequestWrites("completed")).toHaveLength(0);
  });
});
