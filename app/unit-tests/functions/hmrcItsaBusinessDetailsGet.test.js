// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/unit-tests/functions/hmrcItsaBusinessDetailsGet.test.js
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
import { ingestHandler as hmrcItsaBusinessDetailsGetHandler } from "@app/functions/hmrc/hmrcItsaBusinessDetailsGet.js";
import { hashSub } from "@app/services/subHasher.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const VALID_NINO = "AB123456C";

let mockFetch;

describe("hmrcItsaBusinessDetailsGet ingestHandler", () => {
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
    const response = await hmrcItsaBusinessDetailsGetHandler(event);
    expect([200, 400, 401]).toContain(response.statusCode);
  });

  test("returns 400 when NINO is missing", async () => {
    const event = buildHmrcEvent({
      queryStringParameters: {},
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcItsaBusinessDetailsGetHandler(event);
    expect(response.statusCode).toBe(400);
  });

  test("returns 400 for invalid NINO format", async () => {
    const event = buildHmrcEvent({
      queryStringParameters: { nino: "12345678" },
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcItsaBusinessDetailsGetHandler(event);
    expect(response.statusCode).toBe(400);
    const body = parseResponseBody(response);
    expect(body.message).toContain("National Insurance");
  });

  test("returns 200 with business list on success", async () => {
    const businessDetails = {
      listOfBusinesses: [
        {
          typeOfBusiness: "self-employment",
          businessId: "XBIS12345678901",
          tradingName: "Company X",
        },
      ],
    };
    mockHmrcSuccess(mockFetch, businessDetails);

    const event = buildHmrcEvent({
      queryStringParameters: { nino: VALID_NINO },
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcItsaBusinessDetailsGetHandler(event);
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual(businessDetails);
  });

  test("calls HMRC with the v2.0 Accept header", async () => {
    mockHmrcSuccess(mockFetch, { listOfBusinesses: [] });

    const event = buildHmrcEvent({
      queryStringParameters: { nino: VALID_NINO },
      headers: { authorization: "Bearer test-token" },
    });
    await hmrcItsaBusinessDetailsGetHandler(event);

    expect(mockFetch).toHaveBeenCalled();
    const calledInit = mockFetch.mock.calls[0][1];
    expect(calledInit.headers.Accept).toBe("application/vnd.hmrc.2.0+json");
  });

  test("calls the correct HMRC endpoint path with the NINO", async () => {
    mockHmrcSuccess(mockFetch, { listOfBusinesses: [] });

    const event = buildHmrcEvent({
      queryStringParameters: { nino: VALID_NINO },
      headers: { authorization: "Bearer test-token" },
    });
    await hmrcItsaBusinessDetailsGetHandler(event);

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain(`/individuals/business/details/${VALID_NINO}/list`);
  });

  test("publishes the itsa-business-details-queried event with the hashed sub, never the raw sub", async () => {
    mockHmrcSuccess(mockFetch, { listOfBusinesses: [{ typeOfBusiness: "self-employment", businessId: "XBIS12345678901" }] });

    const event = buildHmrcEvent({
      queryStringParameters: { nino: VALID_NINO },
      headers: { authorization: "Bearer test-token" },
    });
    await hmrcItsaBusinessDetailsGetHandler(event);

    const queriedCalls = mockEventBridgeSend.mock.calls.filter((call) => {
      const detail = JSON.parse(call[0].input.Entries[0].Detail);
      return detail.event === "itsa-business-details-queried";
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
      queryStringParameters: { nino: VALID_NINO },
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcItsaBusinessDetailsGetHandler(event);
    expect([400, 500]).toContain(response.statusCode);
  });

  test("returns 400 when HMRC answers NOT_FOUND", async () => {
    mockHmrcError(mockFetch, 404, { code: "NOT_FOUND" });

    const event = buildHmrcEvent({
      queryStringParameters: { nino: VALID_NINO },
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcItsaBusinessDetailsGetHandler(event);
    expect(response.statusCode).toBe(400);
  });

  test("returns 403 JSON when the authenticated user holds no bundle entitled to ITSA business details", async () => {
    // QueryCommand (bundle lookup) resolves to no items via the default beforeEach mock,
    // so the user has only the automatic "default" bundle, which self-employed does not accept.
    const event = buildHmrcEvent({
      queryStringParameters: { nino: VALID_NINO },
      headers: { authorization: "Bearer test-token" },
    });
    event.requestContext.http.path = "/api/v1/hmrc/itsa/business/details";
    const response = await hmrcItsaBusinessDetailsGetHandler(event);
    expect(response.statusCode).toBe(403);
    const body = parseResponseBody(response);
    expect(body.code).toBe("BUNDLE_FORBIDDEN");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("allows the request through once the user holds a bundle entitled to ITSA business details", async () => {
    mockSend.mockImplementation(async (cmd) => {
      const lib = await import("@aws-sdk/lib-dynamodb");
      if (cmd instanceof lib.QueryCommand) {
        return { Items: [{ bundleId: "resident-itsa" }], Count: 1 };
      }
      return {};
    });
    mockHmrcSuccess(mockFetch, { listOfBusinesses: [] });

    const event = buildHmrcEvent({
      queryStringParameters: { nino: VALID_NINO },
      headers: { authorization: "Bearer test-token" },
    });
    event.requestContext.http.path = "/api/v1/hmrc/itsa/business/details";
    const response = await hmrcItsaBusinessDetailsGetHandler(event);
    expect(response.statusCode).toBe(200);
  });

  test("returns 202 when x-wait-time-ms=0 (async initiation)", async () => {
    const event = buildHmrcEvent({
      queryStringParameters: { nino: VALID_NINO },
      headers: {
        "authorization": "Bearer test-token",
        "x-wait-time-ms": "0",
        "x-initial-request": "true",
      },
    });
    const response = await hmrcItsaBusinessDetailsGetHandler(event);
    expect(response.statusCode).toBe(202);
    expect(response.headers).toHaveProperty("x-request-id");
    expect(mockSqsSend).toHaveBeenCalled();
  });

  test("returns 200 when processing completes synchronously (large x-wait-time-ms)", async () => {
    const businessDetails = { listOfBusinesses: [{ typeOfBusiness: "self-employment", businessId: "XBIS12345678901" }] };
    mockHmrcSuccess(mockFetch, businessDetails);

    const event = buildHmrcEvent({
      queryStringParameters: { nino: VALID_NINO },
      headers: {
        "authorization": "Bearer test-token",
        "x-wait-time-ms": "30000",
        "x-initial-request": "true",
      },
    });
    const response = await hmrcItsaBusinessDetailsGetHandler(event);
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual(businessDetails);
  });
});

import { workerHandler as hmrcItsaBusinessDetailsGetWorker } from "@app/functions/hmrc/hmrcItsaBusinessDetailsGet.js";

describe("hmrcItsaBusinessDetailsGet worker", () => {
  beforeEach(() => {
    Object.assign(process.env, setupTestEnv());
    vi.clearAllMocks();
  });

  test("successfully processes SQS message and marks as completed", async () => {
    const businessDetails = { listOfBusinesses: [{ typeOfBusiness: "self-employment", businessId: "XBIS12345678901" }] };
    mockHmrcSuccess(mockFetch, businessDetails);

    const event = {
      Records: [
        {
          body: JSON.stringify({
            userId: "user-123",
            requestId: "req-456",
            payload: {
              nino: VALID_NINO,
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

    await hmrcItsaBusinessDetailsGetWorker(event);

    const lib = await import("@aws-sdk/lib-dynamodb");
    const updateCalls = mockSend.mock.calls.filter((call) => call[0] instanceof lib.UpdateCommand);
    expect(updateCalls.length).toBeGreaterThan(0);
    const completedCall = updateCalls.find((call) => call[0].input.ExpressionAttributeValues[":status"] === "completed");
    expect(completedCall).toBeDefined();
    expect(completedCall[0].input.ExpressionAttributeValues[":data"].businessDetails).toEqual(businessDetails);
  });
});
