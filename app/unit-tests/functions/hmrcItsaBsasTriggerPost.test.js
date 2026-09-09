// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/hmrcItsaBsasTriggerPost.test.js
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
  ingestHandler as hmrcItsaBsasTriggerPostHandler,
  buildBsasTriggerRequestBody,
} from "@app/functions/hmrc/hmrcItsaBsasTriggerPost.js";
import { hashSub } from "@app/services/subHasher.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const VALID_NINO = "AB123456C";
const VALID_BUSINESS_ID = "XAIS12345678901";
const VALID_START_DATE = "2023-04-06";
const VALID_END_DATE = "2024-04-05";

function buildTriggerBody(overrides = {}) {
  return {
    nino: VALID_NINO,
    businessId: VALID_BUSINESS_ID,
    accountingPeriodStartDate: VALID_START_DATE,
    accountingPeriodEndDate: VALID_END_DATE,
    ...overrides,
  };
}

function buildTriggerEvent({ body = {}, headers = {} } = {}) {
  return buildHmrcEvent({
    body: buildTriggerBody(body),
    headers: { authorization: "Bearer test-token", ...headers },
  });
}

describe("buildBsasTriggerRequestBody", () => {
  test("shapes accountingPeriod, fixes typeOfBusiness to self-employment, and carries businessId", () => {
    const body = buildBsasTriggerRequestBody({
      accountingPeriodStartDate: VALID_START_DATE,
      accountingPeriodEndDate: VALID_END_DATE,
      businessId: VALID_BUSINESS_ID,
    });
    expect(body).toEqual({
      accountingPeriod: { startDate: VALID_START_DATE, endDate: VALID_END_DATE },
      typeOfBusiness: "self-employment",
      businessId: VALID_BUSINESS_ID,
    });
  });
});

let mockFetch;

describe("hmrcItsaBsasTriggerPost ingestHandler", () => {
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

  test("returns 400 when nino is missing", async () => {
    const event = buildTriggerEvent({ body: { nino: undefined } });
    const response = await hmrcItsaBsasTriggerPostHandler(event);
    expect(response.statusCode).toBe(400);
    const body = parseResponseBody(response);
    expect(body.message).toContain("nino");
  });

  test("returns 400 when businessId is missing", async () => {
    const event = buildTriggerEvent({ body: { businessId: undefined } });
    const response = await hmrcItsaBsasTriggerPostHandler(event);
    expect(response.statusCode).toBe(400);
  });

  test("returns 400 when the accounting period dates are missing or malformed", async () => {
    const event = buildTriggerEvent({ body: { accountingPeriodStartDate: "not-a-date" } });
    const response = await hmrcItsaBsasTriggerPostHandler(event);
    expect(response.statusCode).toBe(400);
  });

  test("returns 200 with the calculationId on success", async () => {
    mockHmrcSuccess(mockFetch, { calculationId: "f2fb30e5-4ab6-4a29-b3c1-c7264259ff1c" });

    const event = buildTriggerEvent();
    const response = await hmrcItsaBsasTriggerPostHandler(event);
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ calculationId: "f2fb30e5-4ab6-4a29-b3c1-c7264259ff1c" });
  });

  test("calls the correct HMRC endpoint path with the NINO", async () => {
    mockHmrcSuccess(mockFetch, { calculationId: "12345678" });

    const event = buildTriggerEvent();
    await hmrcItsaBsasTriggerPostHandler(event);

    expect(mockFetch).toHaveBeenCalled();
    const calledUrl = mockFetch.mock.calls[0][0];
    const calledInit = mockFetch.mock.calls[0][1];
    expect(calledInit.method).toBe("POST");
    expect(calledUrl).toContain(`/individuals/self-assessment/adjustable-summary/${VALID_NINO}/trigger`);
  });

  test("publishes the itsa-bsas-triggered event with the hashed sub, never the raw sub", async () => {
    mockHmrcSuccess(mockFetch, { calculationId: "12345678" });

    const event = buildTriggerEvent();
    await hmrcItsaBsasTriggerPostHandler(event);

    const triggeredCalls = mockEventBridgeSend.mock.calls.filter((call) => {
      const detail = JSON.parse(call[0].input.Entries[0].Detail);
      return detail.event === "itsa-bsas-triggered";
    });
    expect(triggeredCalls).toHaveLength(1);
    const rawDetail = triggeredCalls[0][0].input.Entries[0].Detail;
    expect(rawDetail).not.toContain('"test-sub"');
    const detail = JSON.parse(rawDetail);
    expect(detail.hashedSub).toBe(hashSub("test-sub"));
  });

  test("returns 400 when HMRC rejects the trigger", async () => {
    mockHmrcError(mockFetch, 400, { code: "RULE_OBLIGATIONS_NOT_MET", message: "The obligations for the business have not been met" });

    const event = buildTriggerEvent();
    const response = await hmrcItsaBsasTriggerPostHandler(event);
    expect(response.statusCode).toBe(400);
    expect(mockFetch).toHaveBeenCalled();
  });

  test("returns a client error when HMRC answers MATCHING_RESOURCE_NOT_FOUND", async () => {
    mockHmrcError(mockFetch, 404, { code: "MATCHING_RESOURCE_NOT_FOUND" });

    const event = buildTriggerEvent();
    const response = await hmrcItsaBsasTriggerPostHandler(event);
    expect(response.statusCode).toBe(400);
  });

  test("returns 403 JSON when the authenticated user holds no bundle entitled to ITSA self-employment", async () => {
    const event = buildTriggerEvent();
    event.requestContext.http.path = "/api/v1/hmrc/itsa/bsas/trigger";
    const response = await hmrcItsaBsasTriggerPostHandler(event);
    expect(response.statusCode).toBe(403);
    const body = parseResponseBody(response);
    expect(body.code).toBe("BUNDLE_FORBIDDEN");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("returns 202 when x-wait-time-ms=0 (async initiation)", async () => {
    const event = buildTriggerEvent({ headers: { "x-wait-time-ms": "0", "x-initial-request": "true" } });
    const response = await hmrcItsaBsasTriggerPostHandler(event);
    expect(response.statusCode).toBe(202);
    expect(response.headers).toHaveProperty("x-request-id");
    expect(mockSqsSend).toHaveBeenCalled();
  });

  test("returns 200 when processing completes synchronously (large x-wait-time-ms)", async () => {
    mockHmrcSuccess(mockFetch, { calculationId: "12345678" });

    const event = buildTriggerEvent({ headers: { "x-wait-time-ms": "30000", "x-initial-request": "true" } });
    const response = await hmrcItsaBsasTriggerPostHandler(event);
    expect(response.statusCode).toBe(200);
  });
});

import { workerHandler as hmrcItsaBsasTriggerPostWorker } from "@app/functions/hmrc/hmrcItsaBsasTriggerPost.js";

describe("hmrcItsaBsasTriggerPost worker", () => {
  beforeEach(() => {
    Object.assign(process.env, setupTestEnv());
    vi.clearAllMocks();
  });

  test("successfully processes SQS message and marks as completed", async () => {
    mockHmrcSuccess(mockFetch, { calculationId: "12345678" });

    const event = {
      Records: [
        {
          body: JSON.stringify({
            userId: "user-123",
            requestId: "req-456",
            payload: {
              nino: VALID_NINO,
              businessId: VALID_BUSINESS_ID,
              accountingPeriodStartDate: VALID_START_DATE,
              accountingPeriodEndDate: VALID_END_DATE,
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

    await hmrcItsaBsasTriggerPostWorker(event);

    const lib = await import("@aws-sdk/lib-dynamodb");
    const updateCalls = mockSend.mock.calls.filter((call) => call[0] instanceof lib.UpdateCommand);
    expect(updateCalls.length).toBeGreaterThan(0);
    const completedCall = updateCalls.find((call) => call[0].input.ExpressionAttributeValues[":status"] === "completed");
    expect(completedCall).toBeDefined();
    expect(completedCall[0].input.ExpressionAttributeValues[":data"].triggerResult).toEqual({ calculationId: "12345678" });
  });
});
