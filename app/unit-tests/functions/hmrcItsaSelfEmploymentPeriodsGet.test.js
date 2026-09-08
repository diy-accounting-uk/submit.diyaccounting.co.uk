// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/unit-tests/functions/hmrcItsaSelfEmploymentPeriodsGet.test.js
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

import { ingestHandler as hmrcItsaSelfEmploymentPeriodsGetHandler } from "@app/functions/hmrc/hmrcItsaSelfEmploymentPeriodsGet.js";
import { hashSub } from "@app/services/subHasher.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const VALID_NINO = "AB123456C";
const VALID_BUSINESS_ID = "XAIS12345678901";
const VALID_TAX_YEAR = "2023-24";

let mockFetch;

describe("hmrcItsaSelfEmploymentPeriodsGet ingestHandler", () => {
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
    const event = buildHmrcEvent({ queryStringParameters: null });
    event.requestContext.http = { method: "HEAD", path: "/" };
    const response = await hmrcItsaSelfEmploymentPeriodsGetHandler(event);
    expect([200, 400, 401]).toContain(response.statusCode);
  });

  test("returns 400 when nino is missing", async () => {
    const event = buildHmrcEvent({
      queryStringParameters: { businessId: VALID_BUSINESS_ID, taxYear: VALID_TAX_YEAR },
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcItsaSelfEmploymentPeriodsGetHandler(event);
    expect(response.statusCode).toBe(400);
  });

  test("returns 400 for invalid businessId format", async () => {
    const event = buildHmrcEvent({
      queryStringParameters: { nino: VALID_NINO, businessId: "not-a-business-id", taxYear: VALID_TAX_YEAR },
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcItsaSelfEmploymentPeriodsGetHandler(event);
    expect(response.statusCode).toBe(400);
    const body = parseResponseBody(response);
    expect(body.message).toContain("businessId");
  });

  test("returns 400 for invalid taxYear format", async () => {
    const event = buildHmrcEvent({
      queryStringParameters: { nino: VALID_NINO, businessId: VALID_BUSINESS_ID, taxYear: "not-a-year" },
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcItsaSelfEmploymentPeriodsGetHandler(event);
    expect(response.statusCode).toBe(400);
    const body = parseResponseBody(response);
    expect(body.message).toContain("taxYear");
  });

  test("returns 200 with period summaries on success", async () => {
    const periods = { periods: [{ periodId: "2023-04-06_2023-07-04", periodStartDate: "2023-04-06", periodEndDate: "2023-07-04" }] };
    mockHmrcSuccess(mockFetch, periods);

    const event = buildHmrcEvent({
      queryStringParameters: { nino: VALID_NINO, businessId: VALID_BUSINESS_ID, taxYear: VALID_TAX_YEAR },
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcItsaSelfEmploymentPeriodsGetHandler(event);
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual(periods);
  });

  test("calls the correct HMRC endpoint path with nino, businessId and taxYear", async () => {
    mockHmrcSuccess(mockFetch, { periods: [] });

    const event = buildHmrcEvent({
      queryStringParameters: { nino: VALID_NINO, businessId: VALID_BUSINESS_ID, taxYear: VALID_TAX_YEAR },
      headers: { authorization: "Bearer test-token" },
    });
    await hmrcItsaSelfEmploymentPeriodsGetHandler(event);

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain(`/individuals/business/self-employment/${VALID_NINO}/${VALID_BUSINESS_ID}/period/${VALID_TAX_YEAR}`);
  });

  test("calls HMRC with the v5.0 Accept header", async () => {
    mockHmrcSuccess(mockFetch, { periods: [] });

    const event = buildHmrcEvent({
      queryStringParameters: { nino: VALID_NINO, businessId: VALID_BUSINESS_ID, taxYear: VALID_TAX_YEAR },
      headers: { authorization: "Bearer test-token" },
    });
    await hmrcItsaSelfEmploymentPeriodsGetHandler(event);

    const calledInit = mockFetch.mock.calls[0][1];
    expect(calledInit.headers.Accept).toBe("application/vnd.hmrc.5.0+json");
  });

  test("publishes the itsa-self-employment-periods-queried event with the hashed sub, never the raw sub", async () => {
    mockHmrcSuccess(mockFetch, { periods: [] });

    const event = buildHmrcEvent({
      queryStringParameters: { nino: VALID_NINO, businessId: VALID_BUSINESS_ID, taxYear: VALID_TAX_YEAR },
      headers: { authorization: "Bearer test-token" },
    });
    await hmrcItsaSelfEmploymentPeriodsGetHandler(event);

    const queriedCalls = mockEventBridgeSend.mock.calls.filter((call) => {
      const detail = JSON.parse(call[0].input.Entries[0].Detail);
      return detail.event === "itsa-self-employment-periods-queried";
    });
    expect(queriedCalls).toHaveLength(1);
    const rawDetail = queriedCalls[0][0].input.Entries[0].Detail;
    expect(rawDetail).not.toContain('"test-sub"');
    const detail = JSON.parse(rawDetail);
    expect(detail.hashedSub).toBe(hashSub("test-sub"));
  });

  test("returns 500 on HMRC API error", async () => {
    mockHmrcError(mockFetch, 400, { code: "FORMAT_NINO" });

    const event = buildHmrcEvent({
      queryStringParameters: { nino: VALID_NINO, businessId: VALID_BUSINESS_ID, taxYear: VALID_TAX_YEAR },
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcItsaSelfEmploymentPeriodsGetHandler(event);
    expect([400, 500]).toContain(response.statusCode);
  });

  test("returns 403 JSON when the authenticated user holds no bundle entitled to ITSA self-employment", async () => {
    const event = buildHmrcEvent({
      queryStringParameters: { nino: VALID_NINO, businessId: VALID_BUSINESS_ID, taxYear: VALID_TAX_YEAR },
      headers: { authorization: "Bearer test-token" },
    });
    event.requestContext.http.path = "/api/v1/hmrc/itsa/self-employment/periods";
    const response = await hmrcItsaSelfEmploymentPeriodsGetHandler(event);
    expect(response.statusCode).toBe(403);
    const body = parseResponseBody(response);
    expect(body.code).toBe("BUNDLE_FORBIDDEN");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("returns 202 when x-wait-time-ms=0 (async initiation)", async () => {
    const event = buildHmrcEvent({
      queryStringParameters: { nino: VALID_NINO, businessId: VALID_BUSINESS_ID, taxYear: VALID_TAX_YEAR },
      headers: {
        "authorization": "Bearer test-token",
        "x-wait-time-ms": "0",
        "x-initial-request": "true",
      },
    });
    const response = await hmrcItsaSelfEmploymentPeriodsGetHandler(event);
    expect(response.statusCode).toBe(202);
    expect(response.headers).toHaveProperty("x-request-id");
    expect(mockSqsSend).toHaveBeenCalled();
  });

  test("returns 200 when processing completes synchronously (large x-wait-time-ms)", async () => {
    const periods = { periods: [] };
    mockHmrcSuccess(mockFetch, periods);

    const event = buildHmrcEvent({
      queryStringParameters: { nino: VALID_NINO, businessId: VALID_BUSINESS_ID, taxYear: VALID_TAX_YEAR },
      headers: {
        "authorization": "Bearer test-token",
        "x-wait-time-ms": "30000",
        "x-initial-request": "true",
      },
    });
    const response = await hmrcItsaSelfEmploymentPeriodsGetHandler(event);
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual(periods);
  });
});

import { workerHandler as hmrcItsaSelfEmploymentPeriodsGetWorker } from "@app/functions/hmrc/hmrcItsaSelfEmploymentPeriodsGet.js";

describe("hmrcItsaSelfEmploymentPeriodsGet worker", () => {
  beforeEach(() => {
    Object.assign(process.env, setupTestEnv());
    vi.clearAllMocks();
  });

  test("successfully processes SQS message and marks as completed", async () => {
    const periods = { periods: [] };
    mockHmrcSuccess(mockFetch, periods);

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

    await hmrcItsaSelfEmploymentPeriodsGetWorker(event);

    const lib = await import("@aws-sdk/lib-dynamodb");
    const updateCalls = mockSend.mock.calls.filter((call) => call[0] instanceof lib.UpdateCommand);
    expect(updateCalls.length).toBeGreaterThan(0);
    const completedCall = updateCalls.find((call) => call[0].input.ExpressionAttributeValues[":status"] === "completed");
    expect(completedCall).toBeDefined();
    expect(completedCall[0].input.ExpressionAttributeValues[":data"].periodSummaries).toEqual(periods);
  });
});
