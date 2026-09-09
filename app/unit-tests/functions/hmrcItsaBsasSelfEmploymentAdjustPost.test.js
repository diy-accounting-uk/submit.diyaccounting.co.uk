// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/hmrcItsaBsasSelfEmploymentAdjustPost.test.js
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
    constructor(_config) {
      // no-op in unit tests
    }
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
  ingestHandler as hmrcItsaBsasSelfEmploymentAdjustPostHandler,
  buildBsasAdjustRequestBody,
} from "@app/functions/hmrc/hmrcItsaBsasSelfEmploymentAdjustPost.js";
import { hashSub } from "@app/services/subHasher.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const VALID_NINO = "AB123456C";
const VALID_CALCULATION_ID = "f2fb30e5-4ab6-4a29-b3c1-c7264259ff1c";
const VALID_TAX_YEAR = "2023-24";

function buildAdjustBody(overrides = {}) {
  return {
    nino: VALID_NINO,
    calculationId: VALID_CALCULATION_ID,
    taxYear: VALID_TAX_YEAR,
    income: { turnover: 1000 },
    ...overrides,
  };
}

function buildAdjustEvent({ body = {}, headers = {} } = {}) {
  return buildHmrcEvent({
    body: buildAdjustBody(body),
    headers: { authorization: "Bearer test-token", ...headers },
  });
}

describe("buildBsasAdjustRequestBody", () => {
  test("builds income, expenses and additions sections, omitting empty ones", () => {
    const body = buildBsasAdjustRequestBody({
      income: { turnover: 1000 },
      expenses: {},
      additions: { costOfGoodsDisallowable: 50 },
    });
    expect(body).toEqual({ income: { turnover: 1000 }, additions: { costOfGoodsDisallowable: 50 } });
  });

  test("rounds money values to 2 decimal places", () => {
    const body = buildBsasAdjustRequestBody({ income: { turnover: 100.005 } });
    expect(body.income.turnover).toBe(100.01);
  });

  test("accepts zeroAdjustments on its own", () => {
    const body = buildBsasAdjustRequestBody({ zeroAdjustments: true });
    expect(body).toEqual({ zeroAdjustments: true });
  });

  test("rejects zeroAdjustments together with income, expenses or additions", () => {
    expect(() => buildBsasAdjustRequestBody({ zeroAdjustments: true, income: { turnover: 1000 } })).toThrow(
      /Both adjustments and zero adjustments/,
    );
  });

  test("rejects an entirely empty body", () => {
    expect(() => buildBsasAdjustRequestBody({})).toThrow(/An empty or non-matching body/);
  });

  test("rejects a body whose only sections are empty and zeroAdjustments is not set", () => {
    expect(() => buildBsasAdjustRequestBody({ income: {}, expenses: {}, additions: {} })).toThrow(
      /An empty or non-matching body/,
    );
  });
});

let mockFetch;

describe("hmrcItsaBsasSelfEmploymentAdjustPost ingestHandler", () => {
  beforeEach(() => {
    Object.assign(process.env, setupTestEnv());
    mockFetch = setupFetchMock();
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

  test("returns 400 when calculationId is missing from body", async () => {
    const event = buildAdjustEvent({ body: { calculationId: undefined } });
    const response = await hmrcItsaBsasSelfEmploymentAdjustPostHandler(event);
    expect(response.statusCode).toBe(400);
    const body = parseResponseBody(response);
    expect(body.message).toContain("calculationId");
  });

  test("returns 400 for invalid taxYear format", async () => {
    const event = buildAdjustEvent({ body: { taxYear: "not-a-year" } });
    const response = await hmrcItsaBsasSelfEmploymentAdjustPostHandler(event);
    expect(response.statusCode).toBe(400);
  });

  test("returns 400 for an entirely empty body without ever calling HMRC", async () => {
    const event = buildAdjustEvent({ body: { income: undefined } });
    const response = await hmrcItsaBsasSelfEmploymentAdjustPostHandler(event);
    expect(response.statusCode).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("returns 400 when zeroAdjustments is supplied together with figures, without ever calling HMRC", async () => {
    const event = buildAdjustEvent({ body: { zeroAdjustments: true, income: { turnover: 1000 } } });
    const response = await hmrcItsaBsasSelfEmploymentAdjustPostHandler(event);
    expect(response.statusCode).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("accepts zeroAdjustments on its own", async () => {
    mockHmrcSuccess(mockFetch, {});

    const event = buildAdjustEvent({ body: { income: undefined, zeroAdjustments: true } });
    const response = await hmrcItsaBsasSelfEmploymentAdjustPostHandler(event);
    expect(response.statusCode).toBe(200);
    const calledInit = mockFetch.mock.calls[0][1];
    expect(JSON.parse(calledInit.body)).toEqual({ zeroAdjustments: true });
  });

  test("returns 200 on success", async () => {
    mockHmrcSuccess(mockFetch, {});

    const event = buildAdjustEvent();
    const response = await hmrcItsaBsasSelfEmploymentAdjustPostHandler(event);
    expect(response.statusCode).toBe(200);
  });

  test("calls HMRC with POST and the correct endpoint path", async () => {
    mockHmrcSuccess(mockFetch, {});

    const event = buildAdjustEvent();
    await hmrcItsaBsasSelfEmploymentAdjustPostHandler(event);

    expect(mockFetch).toHaveBeenCalled();
    const calledUrl = mockFetch.mock.calls[0][0];
    const calledInit = mockFetch.mock.calls[0][1];
    expect(calledInit.method).toBe("POST");
    expect(calledUrl).toContain(
      `/individuals/self-assessment/adjustable-summary/${VALID_NINO}/self-employment/${VALID_CALCULATION_ID}/adjust/${VALID_TAX_YEAR}`,
    );
  });

  test("publishes the itsa-bsas-adjusted event with the hashed sub, never the raw sub", async () => {
    mockHmrcSuccess(mockFetch, {});

    const event = buildAdjustEvent();
    await hmrcItsaBsasSelfEmploymentAdjustPostHandler(event);

    const adjustedCalls = mockEventBridgeSend.mock.calls.filter((call) => {
      const detail = JSON.parse(call[0].input.Entries[0].Detail);
      return detail.event === "itsa-bsas-adjusted";
    });
    expect(adjustedCalls).toHaveLength(1);
    const rawDetail = adjustedCalls[0][0].input.Entries[0].Detail;
    expect(rawDetail).not.toContain('"test-sub"');
    const detail = JSON.parse(rawDetail);
    expect(detail.hashedSub).toBe(hashSub("test-sub"));
  });

  test("returns 400 when HMRC answers RULE_ALREADY_ADJUSTED", async () => {
    mockHmrcError(mockFetch, 400, { code: "RULE_ALREADY_ADJUSTED", message: "A summary may only be adjusted once. Request a new summary" });

    const event = buildAdjustEvent();
    const response = await hmrcItsaBsasSelfEmploymentAdjustPostHandler(event);
    expect(response.statusCode).toBe(400);
    const body = parseResponseBody(response);
    expect(JSON.stringify(body)).toContain("RULE_ALREADY_ADJUSTED");
  });

  test("returns 403 JSON when the authenticated user holds no bundle entitled to ITSA self-employment", async () => {
    const event = buildAdjustEvent();
    event.requestContext.http.path = "/api/v1/hmrc/itsa/bsas/self-employment/adjust";
    const response = await hmrcItsaBsasSelfEmploymentAdjustPostHandler(event);
    expect(response.statusCode).toBe(403);
    const body = parseResponseBody(response);
    expect(body.code).toBe("BUNDLE_FORBIDDEN");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("returns 202 when x-wait-time-ms=0 (async initiation)", async () => {
    const event = buildAdjustEvent({ headers: { "x-wait-time-ms": "0", "x-initial-request": "true" } });
    const response = await hmrcItsaBsasSelfEmploymentAdjustPostHandler(event);
    expect(response.statusCode).toBe(202);
    expect(response.headers).toHaveProperty("x-request-id");
    expect(mockSqsSend).toHaveBeenCalled();
  });

  test("returns 200 when processing completes synchronously (large x-wait-time-ms)", async () => {
    mockHmrcSuccess(mockFetch, {});

    const event = buildAdjustEvent({ headers: { "x-wait-time-ms": "30000", "x-initial-request": "true" } });
    const response = await hmrcItsaBsasSelfEmploymentAdjustPostHandler(event);
    expect(response.statusCode).toBe(200);
  });
});

import { workerHandler as hmrcItsaBsasSelfEmploymentAdjustPostWorker } from "@app/functions/hmrc/hmrcItsaBsasSelfEmploymentAdjustPost.js";

describe("hmrcItsaBsasSelfEmploymentAdjustPost worker", () => {
  beforeEach(() => {
    Object.assign(process.env, setupTestEnv());
    vi.clearAllMocks();
  });

  test("successfully processes SQS message and marks as completed", async () => {
    mockHmrcSuccess(mockFetch, {});

    const event = {
      Records: [
        {
          body: JSON.stringify({
            userId: "user-123",
            requestId: "req-456",
            payload: {
              nino: VALID_NINO,
              calculationId: VALID_CALCULATION_ID,
              taxYear: VALID_TAX_YEAR,
              income: { turnover: 1000 },
              expenses: {},
              additions: {},
              zeroAdjustments: false,
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

    await hmrcItsaBsasSelfEmploymentAdjustPostWorker(event);

    const lib = await import("@aws-sdk/lib-dynamodb");
    const updateCalls = mockSend.mock.calls.filter((call) => call[0] instanceof lib.UpdateCommand);
    expect(updateCalls.length).toBeGreaterThan(0);
    const completedCall = updateCalls.find((call) => call[0].input.ExpressionAttributeValues[":status"] === "completed");
    expect(completedCall).toBeDefined();
  });
});
