// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/unit-tests/functions/hmrcItsaSelfEmploymentPeriodPut.test.js
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
  ingestHandler as hmrcItsaSelfEmploymentPeriodPutHandler,
  buildAmendSelfEmploymentPeriodRequestBody,
} from "@app/functions/hmrc/hmrcItsaSelfEmploymentPeriodPut.js";
import { hashSub } from "@app/services/subHasher.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const VALID_NINO = "AB123456C";
const VALID_BUSINESS_ID = "XAIS12345678901";
const VALID_TAX_YEAR = "2023-24";
const VALID_PERIOD_ID = "2023-04-06_2023-07-05";

function buildPeriodBody(overrides = {}) {
  return {
    nino: VALID_NINO,
    businessId: VALID_BUSINESS_ID,
    taxYear: VALID_TAX_YEAR,
    periodId: VALID_PERIOD_ID,
    periodIncome: { turnover: 6000 },
    ...overrides,
  };
}

function buildAmendEvent({ body = {}, headers = {} } = {}) {
  return buildHmrcEvent({
    body: buildPeriodBody(body),
    headers: { authorization: "Bearer test-token", ...headers },
  });
}

describe("buildAmendSelfEmploymentPeriodRequestBody", () => {
  test("omits empty income/expenses/disallowable-expenses sections entirely", () => {
    const body = buildAmendSelfEmploymentPeriodRequestBody({
      periodIncome: {},
      periodExpenses: { costOfGoods: 100 },
      periodDisallowableExpenses: {},
    });
    expect(body).toEqual({ periodExpenses: { costOfGoods: 100 } });
  });

  test("rounds money values to 2 decimal places", () => {
    const body = buildAmendSelfEmploymentPeriodRequestBody({ periodIncome: { turnover: 100.005 } });
    expect(body.periodIncome.turnover).toBe(100.01);
  });
});

let mockFetch;

describe("hmrcItsaSelfEmploymentPeriodPut ingestHandler", () => {
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

  test("returns 400 when periodId is missing from body", async () => {
    const event = buildAmendEvent({ body: { periodId: undefined } });
    const response = await hmrcItsaSelfEmploymentPeriodPutHandler(event);
    expect(response.statusCode).toBe(400);
    const body = parseResponseBody(response);
    expect(body.message).toContain("periodId");
  });

  test("returns 400 for invalid businessId format", async () => {
    const event = buildAmendEvent({ body: { businessId: "not-a-business-id" } });
    const response = await hmrcItsaSelfEmploymentPeriodPutHandler(event);
    expect(response.statusCode).toBe(400);
  });

  test("returns 200 with the amended period summary on success", async () => {
    const periodSummary = { periodIncome: { turnover: 6000 } };
    mockHmrcSuccess(mockFetch, periodSummary);

    const event = buildAmendEvent();
    const response = await hmrcItsaSelfEmploymentPeriodPutHandler(event);
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual(periodSummary);
  });

  test("calls HMRC with PUT and the correct endpoint path", async () => {
    mockHmrcSuccess(mockFetch, {});

    const event = buildAmendEvent();
    await hmrcItsaSelfEmploymentPeriodPutHandler(event);

    expect(mockFetch).toHaveBeenCalled();
    const calledUrl = mockFetch.mock.calls[0][0];
    const calledInit = mockFetch.mock.calls[0][1];
    expect(calledInit.method).toBe("PUT");
    expect(calledUrl).toContain(
      `/individuals/business/self-employment/${VALID_NINO}/${VALID_BUSINESS_ID}/period/${VALID_TAX_YEAR}/${VALID_PERIOD_ID}`,
    );
  });

  test("publishes the itsa-self-employment-period-amended event with the hashed sub, never the raw sub", async () => {
    mockHmrcSuccess(mockFetch, {});

    const event = buildAmendEvent();
    await hmrcItsaSelfEmploymentPeriodPutHandler(event);

    const amendedCalls = mockEventBridgeSend.mock.calls.filter((call) => {
      const detail = JSON.parse(call[0].input.Entries[0].Detail);
      return detail.event === "itsa-self-employment-period-amended";
    });
    expect(amendedCalls).toHaveLength(1);
    const rawDetail = amendedCalls[0][0].input.Entries[0].Detail;
    expect(rawDetail).not.toContain('"test-sub"');
    const detail = JSON.parse(rawDetail);
    expect(detail.hashedSub).toBe(hashSub("test-sub"));
  });

  test("returns 400 when HMRC answers with a 400", async () => {
    mockHmrcError(mockFetch, 400, { code: "RULE_TAX_YEAR_NOT_SUPPORTED" });

    const event = buildAmendEvent();
    const response = await hmrcItsaSelfEmploymentPeriodPutHandler(event);
    expect(response.statusCode).toBe(400);
  });

  test("returns 403 JSON when the authenticated user holds no bundle entitled to ITSA self-employment", async () => {
    const event = buildAmendEvent();
    event.requestContext.http.path = "/api/v1/hmrc/itsa/self-employment/period";
    const response = await hmrcItsaSelfEmploymentPeriodPutHandler(event);
    expect(response.statusCode).toBe(403);
    const body = parseResponseBody(response);
    expect(body.code).toBe("BUNDLE_FORBIDDEN");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("returns 202 when x-wait-time-ms=0 (async initiation)", async () => {
    const event = buildAmendEvent({ headers: { "x-wait-time-ms": "0", "x-initial-request": "true" } });
    const response = await hmrcItsaSelfEmploymentPeriodPutHandler(event);
    expect(response.statusCode).toBe(202);
    expect(response.headers).toHaveProperty("x-request-id");
    expect(mockSqsSend).toHaveBeenCalled();
  });

  test("returns 200 when processing completes synchronously (large x-wait-time-ms)", async () => {
    const periodSummary = { periodIncome: { turnover: 6000 } };
    mockHmrcSuccess(mockFetch, periodSummary);

    const event = buildAmendEvent({ headers: { "x-wait-time-ms": "30000", "x-initial-request": "true" } });
    const response = await hmrcItsaSelfEmploymentPeriodPutHandler(event);
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual(periodSummary);
  });
});

import { workerHandler as hmrcItsaSelfEmploymentPeriodPutWorker } from "@app/functions/hmrc/hmrcItsaSelfEmploymentPeriodPut.js";

describe("hmrcItsaSelfEmploymentPeriodPut worker", () => {
  beforeEach(() => {
    Object.assign(process.env, setupTestEnv());
    vi.clearAllMocks();
  });

  test("successfully processes SQS message and marks as completed", async () => {
    const periodSummary = { periodIncome: { turnover: 6000 } };
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
              taxYear: VALID_TAX_YEAR,
              periodId: VALID_PERIOD_ID,
              periodIncome: { turnover: 6000 },
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

    await hmrcItsaSelfEmploymentPeriodPutWorker(event);

    const lib = await import("@aws-sdk/lib-dynamodb");
    const updateCalls = mockSend.mock.calls.filter((call) => call[0] instanceof lib.UpdateCommand);
    expect(updateCalls.length).toBeGreaterThan(0);
    const completedCall = updateCalls.find((call) => call[0].input.ExpressionAttributeValues[":status"] === "completed");
    expect(completedCall).toBeDefined();
    expect(completedCall[0].input.ExpressionAttributeValues[":data"].periodSummary).toEqual(periodSummary);
  });
});
