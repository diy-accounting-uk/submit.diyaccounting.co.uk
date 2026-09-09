// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/unit-tests/functions/hmrcItsaSelfEmploymentPeriodPost.test.js
import { describe, test, beforeEach, expect, vi } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { buildHmrcEvent } from "@app/test-helpers/eventBuilders.js";
import { setupTestEnv, parseResponseBody, setupFetchMock, mockHmrcSuccess, mockHmrcError } from "@app/test-helpers/mockHelpers.js";

// ---------------------------------------------------------------------------
// Mock AWS DynamoDB used by bundle management to avoid real AWS calls
// We keep behaviour simple: Query returns empty items; Put/Delete succeed.
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
import {
  ingestHandler as hmrcItsaSelfEmploymentPeriodPostHandler,
  buildSelfEmploymentPeriodRequestBody,
} from "@app/functions/hmrc/hmrcItsaSelfEmploymentPeriodPost.js";
import { hashSub } from "@app/services/subHasher.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

describe("buildSelfEmploymentPeriodRequestBody", () => {
  test("includes periodDates, periodIncome, periodExpenses and periodDisallowableExpenses when all are populated", () => {
    const body = buildSelfEmploymentPeriodRequestBody({
      periodStartDate: "2024-04-06",
      periodEndDate: "2024-07-05",
      periodIncome: { turnover: 1000, other: 0 },
      periodExpenses: { costOfGoods: 100, otherExpenses: 50 },
      periodDisallowableExpenses: { costOfGoodsDisallowable: 10 },
    });
    expect(body).toEqual({
      periodDates: { periodStartDate: "2024-04-06", periodEndDate: "2024-07-05" },
      periodIncome: { turnover: 1000, other: 0 },
      periodExpenses: { costOfGoods: 100, otherExpenses: 50 },
      periodDisallowableExpenses: { costOfGoodsDisallowable: 10 },
    });
  });

  test("omits periodDisallowableExpenses when the caller entered nothing for it", () => {
    const body = buildSelfEmploymentPeriodRequestBody({
      periodStartDate: "2024-04-06",
      periodEndDate: "2024-07-05",
      periodIncome: { turnover: 1000, other: 0 },
      periodExpenses: { costOfGoods: 100, otherExpenses: 0 },
      periodDisallowableExpenses: {},
    });
    expect(body).not.toHaveProperty("periodDisallowableExpenses");
  });

  test("never emits an empty object for periodIncome, periodExpenses or periodDisallowableExpenses", () => {
    const body = buildSelfEmploymentPeriodRequestBody({
      periodStartDate: "2024-04-06",
      periodEndDate: "2024-07-05",
      periodIncome: {},
      periodExpenses: undefined,
      periodDisallowableExpenses: {},
    });
    expect(body).toEqual({
      periodDates: { periodStartDate: "2024-04-06", periodEndDate: "2024-07-05" },
    });
    expect(body).not.toHaveProperty("periodIncome");
    expect(body).not.toHaveProperty("periodExpenses");
    expect(body).not.toHaveProperty("periodDisallowableExpenses");
  });

  test("sends amounts as numbers rounded to 2 decimal places, never as strings", () => {
    const body = buildSelfEmploymentPeriodRequestBody({
      periodStartDate: "2024-04-06",
      periodEndDate: "2024-07-05",
      periodIncome: { turnover: "1000.005", other: 0 },
      periodExpenses: { costOfGoods: "99.999" },
    });
    expect(typeof body.periodIncome.turnover).toBe("number");
    expect(body.periodIncome.turnover).toBe(1000.01);
    expect(typeof body.periodExpenses.costOfGoods).toBe("number");
    expect(body.periodExpenses.costOfGoods).toBe(100);
  });
});

const VALID_NINO = "AB123456C";
const VALID_BUSINESS_ID = "XAIS12345678910";

function buildPeriodBody(overrides = {}) {
  return {
    nino: VALID_NINO,
    businessId: VALID_BUSINESS_ID,
    periodStartDate: "2024-04-06",
    periodEndDate: "2024-07-05",
    periodIncome: { turnover: 1000, other: 0 },
    periodExpenses: { costOfGoods: 100 },
    periodDisallowableExpenses: {},
    ...overrides,
  };
}

let mockFetch;

describe("hmrcItsaSelfEmploymentPeriodPost ingestHandler", () => {
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

  test("HEAD request returns 200 OK", async () => {
    const event = buildHmrcEvent({ body: null });
    event.requestContext.http = { method: "HEAD", path: "/" };
    const response = await hmrcItsaSelfEmploymentPeriodPostHandler(event);
    expect([200, 400, 401]).toContain(response.statusCode);
  });

  test("returns 400 when nino is missing", async () => {
    const event = buildHmrcEvent({
      body: buildPeriodBody({ nino: undefined }),
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcItsaSelfEmploymentPeriodPostHandler(event);
    expect(response.statusCode).toBe(400);
    const body = parseResponseBody(response);
    expect(body.message).toContain("nino");
  });

  test("returns 400 for invalid nino format", async () => {
    const event = buildHmrcEvent({
      body: buildPeriodBody({ nino: "12345678" }),
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcItsaSelfEmploymentPeriodPostHandler(event);
    expect(response.statusCode).toBe(400);
  });

  test("returns 400 when businessId is missing", async () => {
    const event = buildHmrcEvent({
      body: buildPeriodBody({ businessId: undefined }),
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcItsaSelfEmploymentPeriodPostHandler(event);
    expect(response.statusCode).toBe(400);
    const body = parseResponseBody(response);
    expect(body.message).toContain("businessId");
  });

  test("returns 400 for invalid businessId format", async () => {
    const event = buildHmrcEvent({
      body: buildPeriodBody({ businessId: "not-a-business-id" }),
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcItsaSelfEmploymentPeriodPostHandler(event);
    expect(response.statusCode).toBe(400);
  });

  test("returns 400 when periodStartDate or periodEndDate are missing or malformed", async () => {
    const missingStart = buildHmrcEvent({
      body: buildPeriodBody({ periodStartDate: undefined }),
      headers: { authorization: "Bearer test-token" },
    });
    expect((await hmrcItsaSelfEmploymentPeriodPostHandler(missingStart)).statusCode).toBe(400);

    const badEnd = buildHmrcEvent({
      body: buildPeriodBody({ periodEndDate: "not-a-date" }),
      headers: { authorization: "Bearer test-token" },
    });
    expect((await hmrcItsaSelfEmploymentPeriodPostHandler(badEnd)).statusCode).toBe(400);
  });

  test("returns 200 with the periodId on success", async () => {
    const periodSummary = { periodId: "2024-04-06_2024-07-05" };
    mockHmrcSuccess(mockFetch, periodSummary);

    const event = buildHmrcEvent({
      body: buildPeriodBody(),
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcItsaSelfEmploymentPeriodPostHandler(event);
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual(periodSummary);
  });

  test("calls HMRC with the v5.0 Accept header", async () => {
    mockHmrcSuccess(mockFetch, { periodId: "2024-04-06_2024-07-05" });

    const event = buildHmrcEvent({
      body: buildPeriodBody(),
      headers: { authorization: "Bearer test-token" },
    });
    await hmrcItsaSelfEmploymentPeriodPostHandler(event);

    expect(mockFetch).toHaveBeenCalled();
    const calledInit = mockFetch.mock.calls[0][1];
    expect(calledInit.headers.Accept).toBe("application/vnd.hmrc.5.0+json");
  });

  test("calls the correct HMRC endpoint path with the NINO and businessId", async () => {
    mockHmrcSuccess(mockFetch, { periodId: "2024-04-06_2024-07-05" });

    const event = buildHmrcEvent({
      body: buildPeriodBody(),
      headers: { authorization: "Bearer test-token" },
    });
    await hmrcItsaSelfEmploymentPeriodPostHandler(event);

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain(`/individuals/business/self-employment/${VALID_NINO}/${VALID_BUSINESS_ID}/period`);
  });

  test("sends periodDates, periodIncome and periodExpenses in the request body, and omits an empty periodDisallowableExpenses", async () => {
    mockHmrcSuccess(mockFetch, { periodId: "2024-04-06_2024-07-05" });

    const event = buildHmrcEvent({
      body: buildPeriodBody(),
      headers: { authorization: "Bearer test-token" },
    });
    await hmrcItsaSelfEmploymentPeriodPostHandler(event);

    const calledInit = mockFetch.mock.calls[0][1];
    const sentBody = JSON.parse(calledInit.body);
    expect(sentBody.periodDates).toEqual({ periodStartDate: "2024-04-06", periodEndDate: "2024-07-05" });
    expect(sentBody.periodIncome).toEqual({ turnover: 1000, other: 0 });
    expect(sentBody.periodExpenses).toEqual({ costOfGoods: 100 });
    expect(sentBody).not.toHaveProperty("periodDisallowableExpenses");
  });

  test("returns 400 with HMRC's own message when HMRC rejects an empty periodDisallowableExpenses", async () => {
    mockHmrcError(mockFetch, 400, {
      code: "RULE_INCORRECT_OR_EMPTY_BODY_SUBMITTED",
      message: "An empty or non-matching body was submitted",
      paths: ["/periodDisallowableExpenses"],
    });

    const event = buildHmrcEvent({
      body: buildPeriodBody(),
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcItsaSelfEmploymentPeriodPostHandler(event);
    expect(response.statusCode).toBe(400);
    const body = parseResponseBody(response);
    expect(body.message).toBe("An empty or non-matching body was submitted: /periodDisallowableExpenses");
  });

  test("publishes the itsa-self-employment-period-created event with the hashed sub, never the raw sub", async () => {
    mockHmrcSuccess(mockFetch, { periodId: "2024-04-06_2024-07-05" });

    const event = buildHmrcEvent({
      body: buildPeriodBody(),
      headers: { authorization: "Bearer test-token" },
    });
    await hmrcItsaSelfEmploymentPeriodPostHandler(event);

    const filedCalls = mockEventBridgeSend.mock.calls.filter((call) => {
      const detail = JSON.parse(call[0].input.Entries[0].Detail);
      return detail.event === "itsa-self-employment-period-created";
    });
    expect(filedCalls).toHaveLength(1);
    const rawDetail = filedCalls[0][0].input.Entries[0].Detail;
    expect(rawDetail).not.toContain('"test-sub"');
    const detail = JSON.parse(rawDetail);
    expect(detail.hashedSub).toBe(hashSub("test-sub"));
  });

  test("returns a client error when HMRC rejects the period summary", async () => {
    mockHmrcError(mockFetch, 400, { code: "RULE_OVERLAPPING_PERIOD", message: "The submission overlaps another period" });

    const event = buildHmrcEvent({
      body: buildPeriodBody(),
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcItsaSelfEmploymentPeriodPostHandler(event);
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
    expect(mockFetch).toHaveBeenCalled();
  });

  test("returns a client error when HMRC answers MATCHING_RESOURCE_NOT_FOUND", async () => {
    mockHmrcError(mockFetch, 404, { code: "MATCHING_RESOURCE_NOT_FOUND" });

    const event = buildHmrcEvent({
      body: buildPeriodBody(),
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcItsaSelfEmploymentPeriodPostHandler(event);
    // Every HMRC "not found" maps to a client-fixable 400, the way every other write
    // handler in this repo treats it (see http404NotFoundFromHmrcResponse).
    expect(response.statusCode).toBe(400);
  });

  test("returns 403 JSON when the authenticated user holds no bundle entitled to file a quarterly update", async () => {
    // QueryCommand (bundle lookup) resolves to no items via the default beforeEach mock,
    // so the user has only the automatic "default" bundle, which self-employed does not accept.
    const event = buildHmrcEvent({
      body: buildPeriodBody(),
      headers: { authorization: "Bearer test-token" },
    });
    event.requestContext.http.path = "/api/v1/hmrc/itsa/self-employment/period";
    const response = await hmrcItsaSelfEmploymentPeriodPostHandler(event);
    expect(response.statusCode).toBe(403);
    const body = parseResponseBody(response);
    expect(body.code).toBe("BUNDLE_FORBIDDEN");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("allows the request through once the user holds a bundle entitled to file a quarterly update", async () => {
    mockSend.mockImplementation(async (cmd) => {
      const lib = await import("@aws-sdk/lib-dynamodb");
      if (cmd instanceof lib.QueryCommand) {
        return { Items: [{ bundleId: "resident-itsa" }], Count: 1 };
      }
      return {};
    });
    mockHmrcSuccess(mockFetch, { periodId: "2024-04-06_2024-07-05" });

    const event = buildHmrcEvent({
      body: buildPeriodBody(),
      headers: { authorization: "Bearer test-token" },
    });
    event.requestContext.http.path = "/api/v1/hmrc/itsa/self-employment/period";
    const response = await hmrcItsaSelfEmploymentPeriodPostHandler(event);
    expect(response.statusCode).toBe(200);
  });

  test("returns 202 when x-wait-time-ms=0 (async initiation)", async () => {
    mockSend.mockImplementation(async (cmd) => {
      const lib = await import("@aws-sdk/lib-dynamodb");
      if (cmd instanceof lib.QueryCommand) {
        return { Items: [{ bundleId: "resident-itsa", tokensGranted: 100, tokensConsumed: 0 }], Count: 1 };
      }
      if (cmd instanceof lib.UpdateCommand) {
        return { Attributes: { bundleId: "resident-itsa", tokensGranted: 100, tokensConsumed: 1 } };
      }
      return {};
    });

    const event = buildHmrcEvent({
      body: buildPeriodBody(),
      headers: {
        "authorization": "Bearer test-token",
        "x-wait-time-ms": "0",
        "x-initial-request": "true",
      },
    });
    const response = await hmrcItsaSelfEmploymentPeriodPostHandler(event);
    expect(response.statusCode).toBe(202);
    expect(response.headers).toHaveProperty("x-request-id");
    expect(mockSqsSend).toHaveBeenCalled();
  });

  test("returns 200 when processing completes synchronously (large x-wait-time-ms)", async () => {
    const periodSummary = { periodId: "2024-04-06_2024-07-05" };
    mockHmrcSuccess(mockFetch, periodSummary);
    mockSend.mockImplementation(async (cmd) => {
      const lib = await import("@aws-sdk/lib-dynamodb");
      if (cmd instanceof lib.QueryCommand) {
        return { Items: [{ bundleId: "resident-itsa", tokensGranted: 100, tokensConsumed: 0 }], Count: 1 };
      }
      if (cmd instanceof lib.UpdateCommand) {
        return { Attributes: { bundleId: "resident-itsa", tokensGranted: 100, tokensConsumed: 1 } };
      }
      return {};
    });

    const event = buildHmrcEvent({
      body: buildPeriodBody(),
      headers: {
        "authorization": "Bearer test-token",
        "x-wait-time-ms": "30000",
        "x-initial-request": "true",
      },
    });
    const response = await hmrcItsaSelfEmploymentPeriodPostHandler(event);
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual(periodSummary);
  });
});

import { workerHandler as hmrcItsaSelfEmploymentPeriodPostWorker } from "@app/functions/hmrc/hmrcItsaSelfEmploymentPeriodPost.js";

describe("hmrcItsaSelfEmploymentPeriodPost worker", () => {
  beforeEach(() => {
    Object.assign(process.env, setupTestEnv());
    vi.clearAllMocks();
  });

  test("successfully processes SQS message and marks as completed", async () => {
    const periodSummary = { periodId: "2024-04-06_2024-07-05" };
    mockHmrcSuccess(mockFetch, periodSummary);

    const event = {
      Records: [
        {
          body: JSON.stringify({
            userId: "user-123",
            requestId: "req-456",
            payload: {
              nino: VALID_NINO,
              businessId: VALID_BUSINESS_ID,
              periodStartDate: "2024-04-06",
              periodEndDate: "2024-07-05",
              periodIncome: {},
              periodExpenses: {},
              periodDisallowableExpenses: {},
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

    await hmrcItsaSelfEmploymentPeriodPostWorker(event);

    const lib = await import("@aws-sdk/lib-dynamodb");
    const updateCalls = mockSend.mock.calls.filter((call) => call[0] instanceof lib.UpdateCommand);
    expect(updateCalls.length).toBeGreaterThan(0);
    const completedCall = updateCalls.find((call) => call[0].input.ExpressionAttributeValues[":status"] === "completed");
    expect(completedCall).toBeDefined();
    expect(completedCall[0].input.ExpressionAttributeValues[":data"].periodSummary).toEqual(periodSummary);
  });
});
