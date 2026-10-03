// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/hmrcItsaFinalDeclarationPost.test.js
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

import { ingestHandler as hmrcItsaFinalDeclarationPostHandler } from "@app/functions/hmrc/hmrcItsaFinalDeclarationPost.js";
import { hashSub } from "@app/services/subHasher.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const VALID_NINO = "AB123456C";
const VALID_TAX_YEAR = "2023-24";
const VALID_CALCULATION_ID = "f2fb30e5-4ab6-4a29-b3c1-c7264259ff1c";

function buildDeclarationBody(overrides = {}) {
  return {
    nino: VALID_NINO,
    taxYear: VALID_TAX_YEAR,
    calculationId: VALID_CALCULATION_ID,
    calculationType: "final-declaration",
    totalIncomeTaxAndNicsDue: 1900,
    ...overrides,
  };
}

function buildDeclarationEvent({ body = {}, headers = {} } = {}) {
  return buildHmrcEvent({
    body: buildDeclarationBody(body),
    headers: { authorization: "Bearer test-token", ...headers },
  });
}

let mockFetch;

describe("hmrcItsaFinalDeclarationPost ingestHandler", () => {
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
    const event = buildDeclarationEvent({ body: { nino: undefined } });
    const response = await hmrcItsaFinalDeclarationPostHandler(event);
    expect(response.statusCode).toBe(400);
    const body = parseResponseBody(response);
    expect(body.message).toContain("nino");
  });

  test("returns 400 when calculationId is missing or malformed", async () => {
    const event = buildDeclarationEvent({ body: { calculationId: "not-a-calculation-id" } });
    const response = await hmrcItsaFinalDeclarationPostHandler(event);
    expect(response.statusCode).toBe(400);
  });

  test("returns 400 for a calculationType outside final-declaration, confirm-amendment", async () => {
    const event = buildDeclarationEvent({ body: { calculationType: "not-a-type" } });
    const response = await hmrcItsaFinalDeclarationPostHandler(event);
    expect(response.statusCode).toBe(400);
  });

  test("returns 400 when totalIncomeTaxAndNicsDue is missing", async () => {
    const event = buildDeclarationEvent({ body: { totalIncomeTaxAndNicsDue: undefined } });
    const response = await hmrcItsaFinalDeclarationPostHandler(event);
    expect(response.statusCode).toBe(400);
  });

  test("calls the correct HMRC endpoint path with nino, taxYear, calculationId and calculationType", async () => {
    mockHmrcSuccess(mockFetch, {});

    const event = buildDeclarationEvent({ headers: { "x-wait-time-ms": "30000" } });
    await hmrcItsaFinalDeclarationPostHandler(event);

    expect(mockFetch).toHaveBeenCalled();
    const calledUrl = mockFetch.mock.calls[0][0];
    const calledInit = mockFetch.mock.calls[0][1];
    expect(calledInit.method).toBe("POST");
    expect(calledUrl).toContain(
      `/individuals/calculations/${VALID_NINO}/self-assessment/${VALID_TAX_YEAR}/${VALID_CALCULATION_ID}/final-declaration`,
    );
  });

  test("returns 400 when HMRC rejects the declaration, carrying HMRC's own message", async () => {
    mockHmrcError(mockFetch, 400, { code: "RULE_FINAL_DECLARATION_RECEIVED", message: "Final declaration has already been received" });

    const event = buildDeclarationEvent({ headers: { "x-wait-time-ms": "30000" } });
    const response = await hmrcItsaFinalDeclarationPostHandler(event);
    expect(response.statusCode).toBe(400);
  });

  test("returns 403 JSON when the authenticated user holds no bundle entitled to ITSA self-employment", async () => {
    const event = buildDeclarationEvent();
    event.requestContext.http.path = "/api/v1/hmrc/itsa/final-declaration";
    const response = await hmrcItsaFinalDeclarationPostHandler(event);
    expect(response.statusCode).toBe(403);
    const body = parseResponseBody(response);
    expect(body.code).toBe("BUNDLE_FORBIDDEN");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("returns 202 when x-wait-time-ms=0 (async initiation)", async () => {
    const event = buildDeclarationEvent({ headers: { "x-wait-time-ms": "0" } });
    const response = await hmrcItsaFinalDeclarationPostHandler(event);
    expect(response.statusCode).toBe(202);
    expect(response.headers).toHaveProperty("x-request-id");
    expect(mockSqsSend).toHaveBeenCalled();
  });

  test("returns 200 when processing completes synchronously (large x-wait-time-ms)", async () => {
    mockHmrcSuccess(mockFetch, {});

    const event = buildDeclarationEvent({ headers: { "x-wait-time-ms": "30000" } });
    const response = await hmrcItsaFinalDeclarationPostHandler(event);
    expect(response.statusCode).toBe(200);
  });

  test("publishes the itsa-final-declaration-submitted event with the hashed sub, never the raw sub", async () => {
    mockHmrcSuccess(mockFetch, {});

    const event = buildDeclarationEvent({ headers: { "x-wait-time-ms": "30000" } });
    await hmrcItsaFinalDeclarationPostHandler(event);

    const submittedCalls = mockEventBridgeSend.mock.calls.filter((call) => {
      const detail = JSON.parse(call[0].input.Entries[0].Detail);
      return detail.event === "itsa-final-declaration-submitted";
    });
    expect(submittedCalls).toHaveLength(1);
    const rawDetail = submittedCalls[0][0].input.Entries[0].Detail;
    expect(rawDetail).not.toContain('"test-sub"');
    const detail = JSON.parse(rawDetail);
    expect(detail.hashedSub).toBe(hashSub("test-sub"));
  });
});

import { workerHandler as hmrcItsaFinalDeclarationPostWorker } from "@app/functions/hmrc/hmrcItsaFinalDeclarationPost.js";

describe("hmrcItsaFinalDeclarationPost worker", () => {
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
              taxYear: "2023-24",
              calculationId: "f2fb30e5-4ab6-4a29-b3c1-c7264259ff1c",
              calculationType: "final-declaration",
              totalIncomeTaxAndNicsDue: 1000,
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

    await hmrcItsaFinalDeclarationPostWorker(buildWorkerEvent());

    const completed = await asyncRequestWrites("completed");
    expect(completed).toHaveLength(1);
    expect(completed[0][0].input.ExpressionAttributeValues[":data"].hmrcResponse.status).toBe(200);
  });

  test("records a terminal error in the async request and does not re-throw it", async () => {
    mockFetch.mockRejectedValueOnce(new Error("HMRC rejected the request"));

    await expect(hmrcItsaFinalDeclarationPostWorker(buildWorkerEvent())).resolves.toBeUndefined();

    const failed = await asyncRequestWrites("failed");
    expect(failed).toHaveLength(1);
    expect(failed[0][0].input.ExpressionAttributeValues[":data"].message).toContain("HMRC rejected the request");
    expect(await asyncRequestWrites("completed")).toHaveLength(0);
  });

  test("re-throws a retryable error for SQS redelivery and writes no outcome", async () => {
    mockFetch.mockRejectedValueOnce(Object.assign(new Error("connection reset"), { code: "ECONNRESET" }));

    await expect(hmrcItsaFinalDeclarationPostWorker(buildWorkerEvent())).rejects.toThrow("connection reset");

    expect(await asyncRequestWrites("failed")).toHaveLength(0);
    expect(await asyncRequestWrites("completed")).toHaveLength(0);
  });
});
