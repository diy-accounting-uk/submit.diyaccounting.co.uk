// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/hmrcItsaForeignPropertyDetailsPost.test.js
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
  ingestHandler as handler,
  workerHandler as worker,
  postItsaForeignPropertyDetails,
} from "@app/functions/hmrc/hmrcItsaForeignPropertyDetailsPost.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const VALID_NINO = "AB123456C";
const VALID_BUSINESS_ID = "XAIS12345678901";
const VALID_TAX_YEAR = "2026-27";

let mockFetch;

function requestEvent(overrides = {}) {
  return buildHmrcEvent({
    body: {
      ...{ nino: VALID_NINO, businessId: VALID_BUSINESS_ID, taxYear: VALID_TAX_YEAR, propertyName: "Villa", countryCode: "FRA" },
      ...overrides,
    },
    headers: { authorization: "Bearer test-token" },
  });
}

describe("hmrcItsaForeignPropertyDetailsPost ingestHandler", () => {
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

  test.each([
    ["a tax year before 2026-27", { taxYear: "2025-26" }, /2026-27/],
    ["a missing property name", { propertyName: undefined }, /propertyName/],
    ["a property name over 105 characters", { propertyName: "x".repeat(106) }, /105/],
    ["a lower-case country code", { countryCode: "fra" }, /upper-case/],
    ["an end reason without an end date", { endReason: "disposal" }, /endDate/],
    ["an invalid business id", { businessId: "nope" }, /businessId/],
  ])("returns 400 for %s without calling HMRC", async (_name, overrides, pattern) => {
    const response = await handler(requestEvent(overrides));
    expect(response.statusCode).toBe(400);
    expect(response.body).toMatch(pattern);
    expect(mockFetch.mock.calls.filter(([url]) => String(url).includes("/individuals/"))).toHaveLength(0);
  });

  test("posts the details to the foreign path and answers the property id", async () => {
    mockHmrcSuccess(mockFetch, { propertyId: "P123" });
    const response = await handler(requestEvent());
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({ propertyId: "P123" });

    const [calledUrl, calledInit] = mockFetch.mock.calls[0];
    expect(calledUrl).toContain(`/individuals/business/property/foreign/${VALID_NINO}/${VALID_BUSINESS_ID}/details/${VALID_TAX_YEAR}`);
    expect(calledInit.method).toBe("POST");
    expect(calledInit.headers.Accept).toBe("application/vnd.hmrc.6.0+json");
    expect(JSON.parse(calledInit.body)).toEqual({ propertyName: "Villa", countryCode: "FRA" });
  });

  test("returns the HMRC message when HMRC refuses a duplicate name", async () => {
    mockHmrcError(mockFetch, 400, { code: "RULE_DUPLICATE_PROPERTY_NAME", message: "Duplicate" });
    const response = await handler(requestEvent());
    expect(response.statusCode).toBe(400);
  });

  test("builds the create body through the service function", async () => {
    mockHmrcSuccess(mockFetch, { propertyId: "P9" });
    const result = await postItsaForeignPropertyDetails(
      VALID_NINO,
      VALID_BUSINESS_ID,
      VALID_TAX_YEAR,
      { propertyName: "Flat", countryCode: "ESP" },
      "token",
      {},
      undefined,
      "live",
      "user-123",
    );
    expect(result.propertyDetails).toEqual({ propertyId: "P9" });
  });
});

async function asyncRequestWrites(status) {
  const lib = await import("@aws-sdk/lib-dynamodb");
  return mockSend.mock.calls.filter(
    (call) => call[0] instanceof lib.UpdateCommand && call[0].input.ExpressionAttributeValues[":status"] === status,
  );
}

describe("hmrcItsaForeignPropertyDetailsPost worker", () => {
  beforeEach(() => {
    Object.assign(process.env, setupTestEnv());
    mockFetch = setupFetchMock();
    vi.resetAllMocks();
    mockEventBridgeSend.mockResolvedValue({});
    mockSend.mockResolvedValue({});
  });

  function buildWorkerEvent() {
    return {
      Records: [
        {
          body: JSON.stringify({
            userId: "user-123",
            requestId: "req-456",
            payload: {
              ...{ businessId: VALID_BUSINESS_ID, taxYear: VALID_TAX_YEAR, propertyName: "Villa", countryCode: "FRA" },
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
  }

  test("successfully processes SQS message and marks as completed", async () => {
    mockHmrcSuccess(mockFetch, { propertyId: "P123" });

    await worker(buildWorkerEvent());

    const completed = await asyncRequestWrites("completed");
    expect(completed).toHaveLength(1);
    expect(completed[0][0].input.ExpressionAttributeValues[":data"].hmrcResponse.status).toBe(200);
  });

  test("records a terminal error in the async request and does not re-throw it", async () => {
    mockFetch.mockRejectedValueOnce(new Error("HMRC rejected the request"));

    await expect(worker(buildWorkerEvent())).resolves.toBeUndefined();

    const failed = await asyncRequestWrites("failed");
    expect(failed).toHaveLength(1);
    expect(failed[0][0].input.ExpressionAttributeValues[":data"].message).toContain("HMRC rejected the request");
    expect(await asyncRequestWrites("completed")).toHaveLength(0);
  });

  test("re-throws a retryable error for SQS redelivery and writes no outcome", async () => {
    mockFetch.mockRejectedValueOnce(Object.assign(new Error("connection reset"), { code: "ECONNRESET" }));

    await expect(worker(buildWorkerEvent())).rejects.toThrow("connection reset");

    expect(await asyncRequestWrites("failed")).toHaveLength(0);
    expect(await asyncRequestWrites("completed")).toHaveLength(0);
  });
});

describe("hmrcItsaForeignPropertyDetailsPost bundle enforcement", () => {
  beforeEach(() => {
    Object.assign(process.env, setupTestEnv());
    mockFetch = setupFetchMock();
    vi.resetAllMocks();
    mockEventBridgeSend.mockResolvedValue({});
    mockSend.mockImplementation(async (cmd) => {
      const lib = await import("@aws-sdk/lib-dynamodb");
      if (cmd instanceof lib.QueryCommand) return { Items: [], Count: 0 };
      return {};
    });
  });

  test("returns 403 JSON when the authenticated user holds no bundle entitled to ITSA", async () => {
    const event = requestEvent();
    event.requestContext.http.path = "/api/v1/hmrc/itsa/foreign-property/details";
    const response = await handler(event);
    expect(response.statusCode).toBe(403);
    expect(parseResponseBody(response).code).toBe("BUNDLE_FORBIDDEN");
    expect(mockFetch.mock.calls.filter(([url]) => String(url).includes("/individuals/"))).toHaveLength(0);
  });
});
