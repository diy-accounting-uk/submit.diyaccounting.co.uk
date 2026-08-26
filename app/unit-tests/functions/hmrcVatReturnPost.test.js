// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/unit-tests/functions/hmrcVatReturnPost.test.js
// NOTE: Test data in this file (test-token, test-client-id, etc.) are not real credentials

import { describe, test, beforeEach, expect, vi } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { buildHmrcEvent } from "@app/test-helpers/eventBuilders.js";
import { setupTestEnv, parseResponseBody, setupFetchMock, mockHmrcSuccess, mockHmrcError } from "@app/test-helpers/mockHelpers.js";
import {
  mockSend,
  mockLibDynamoDb,
  mockClientDynamoDb,
  MockQueryCommand,
  MockPutCommand,
  MockGetCommand,
  MockUpdateCommand,
} from "@app/test-helpers/dynamoDbMock.js";

// ---------------------------------------------------------------------------
// Mock AWS DynamoDB used by bundle management to avoid real AWS calls
// ---------------------------------------------------------------------------
vi.mock("@aws-sdk/lib-dynamodb", () => mockLibDynamoDb);
vi.mock("@aws-sdk/client-dynamodb", () => mockClientDynamoDb);

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

// Mock getVatObligations to return obligations for period key resolution
const mockGetVatObligations = vi.fn();
vi.mock("@app/functions/hmrc/hmrcVatObligationGet.js", () => ({
  getVatObligations: (...args) => mockGetVatObligations(...args),
}));

// Mock token enforcement to always allow submissions in unit tests
vi.mock("@app/services/tokenEnforcement.js", () => ({
  consumeTokenForActivity: vi.fn().mockResolvedValue({ consumed: true, tokensRemaining: 2, cost: 1 }),
}));

// Defer importing the ingestHandlers until after mocks are defined
import { ingestHandler as hmrcVatReturnPostHandler } from "@app/functions/hmrc/hmrcVatReturnPost.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const mockFetch = setupFetchMock();

// Standard test period dates (matches simulator default open obligation)
const TEST_PERIOD_START = "2017-04-01";
const TEST_PERIOD_END = "2017-06-30";
const TEST_PERIOD_KEY = "18A2";

// Helper to set up mock obligations response
// Note: getVatObligations returns { obligations: hmrcResponse.data } where hmrcResponse.data is the HMRC JSON body { obligations: [...] }
function mockObligationsSuccess(periodKey = TEST_PERIOD_KEY, periodStart = TEST_PERIOD_START, periodEnd = TEST_PERIOD_END) {
  mockGetVatObligations.mockResolvedValue({
    obligations: { obligations: [{ periodKey, start: periodStart, end: periodEnd, status: "O" }] },
    hmrcResponse: { ok: true, status: 200 },
  });
}

function mockObligationsNotFound() {
  mockGetVatObligations.mockResolvedValue({
    obligations: { obligations: [] },
    hmrcResponse: { ok: true, status: 200 },
  });
}

function mockObligationsError(status = 500) {
  mockGetVatObligations.mockResolvedValue({
    obligations: { obligations: [] },
    hmrcResponse: { ok: false, status },
  });
}

describe("hmrcVatReturnPost ingestHandler", () => {
  beforeEach(() => {
    Object.assign(process.env, setupTestEnv());
    // Reset and provide default mock DynamoDB behaviour
    vi.clearAllMocks();
    mockSend.mockImplementation(async (cmd) => {
      if (cmd instanceof MockQueryCommand) {
        return { Items: [], Count: 0 };
      }
      if (cmd instanceof MockPutCommand) {
        return {};
      }
      if (cmd instanceof MockUpdateCommand) {
        return {};
      }
      if (cmd instanceof MockGetCommand) {
        return { Item: null };
      }
      return {};
    });
    // Default: obligations resolve successfully
    mockObligationsSuccess();
  });

  test("HEAD request returns 200 OK", async () => {
    const event = buildHmrcEvent({ body: null });
    event.requestContext.http = { method: "HEAD", path: "/" };
    const response = await hmrcVatReturnPostHandler(event);
    expect([200, 400, 401]).toContain(response.statusCode);
  });

  test("returns 400 when vatNumber is missing", async () => {
    const event = buildHmrcEvent({
      body: { periodStart: TEST_PERIOD_START, periodEnd: TEST_PERIOD_END, vatDue: 100, accessToken: "token" },
    });
    const response = await hmrcVatReturnPostHandler(event);
    expect(response.statusCode).toBe(400);
    const body = parseResponseBody(response);
    expect(body.message).toContain("vatNumber");
  });

  test("returns 400 when periodStart is missing", async () => {
    const event = buildHmrcEvent({
      body: { vatNumber: "111222333", periodEnd: TEST_PERIOD_END, vatDue: 100, accessToken: "token" },
    });
    const response = await hmrcVatReturnPostHandler(event);
    expect(response.statusCode).toBe(400);
    const body = parseResponseBody(response);
    expect(body.message).toContain("periodStart");
  });

  test("returns 400 when periodEnd is missing", async () => {
    const event = buildHmrcEvent({
      body: { vatNumber: "111222333", periodStart: TEST_PERIOD_START, vatDue: 100, accessToken: "token" },
    });
    const response = await hmrcVatReturnPostHandler(event);
    expect(response.statusCode).toBe(400);
    const body = parseResponseBody(response);
    expect(body.message).toContain("periodEnd");
  });

  test("returns 400 when vatDue is missing", async () => {
    const event = buildHmrcEvent({
      body: { vatNumber: "111222333", periodStart: TEST_PERIOD_START, periodEnd: TEST_PERIOD_END, accessToken: "token" },
    });
    const response = await hmrcVatReturnPostHandler(event);
    expect(response.statusCode).toBe(400);
  });

  test("returns 400 when accessToken is missing", async () => {
    const event = buildHmrcEvent({
      body: { vatNumber: "111222333", periodStart: TEST_PERIOD_START, periodEnd: TEST_PERIOD_END, vatDue: 100 },
    });
    const response = await hmrcVatReturnPostHandler(event);
    expect(response.statusCode).toBe(400);
  });

  test("returns 400 when vatNumber has invalid format", async () => {
    const event = buildHmrcEvent({
      body: { vatNumber: "12345678", periodStart: TEST_PERIOD_START, periodEnd: TEST_PERIOD_END, vatDue: 100, accessToken: "token" }, // 8 digits instead of 9
    });
    const response = await hmrcVatReturnPostHandler(event);
    expect(response.statusCode).toBe(400);
    const body = parseResponseBody(response);
    expect(body.message).toContain("vatNumber");
    expect(body.message).toContain("9 digits");
  });

  test("returns 400 when periodStart has invalid format", async () => {
    const event = buildHmrcEvent({
      body: { vatNumber: "111222333", periodStart: "invalid-date", periodEnd: TEST_PERIOD_END, vatDue: 100, accessToken: "token" },
    });
    const response = await hmrcVatReturnPostHandler(event);
    expect(response.statusCode).toBe(400);
    const body = parseResponseBody(response);
    expect(body.message).toContain("periodStart");
    expect(body.message).toContain("YYYY-MM-DD");
  });

  test("returns 400 when periodEnd has invalid format", async () => {
    const event = buildHmrcEvent({
      body: { vatNumber: "111222333", periodStart: TEST_PERIOD_START, periodEnd: "invalid-date", vatDue: 100, accessToken: "token" },
    });
    const response = await hmrcVatReturnPostHandler(event);
    expect(response.statusCode).toBe(400);
    const body = parseResponseBody(response);
    expect(body.message).toContain("periodEnd");
    expect(body.message).toContain("YYYY-MM-DD");
  });

  test("returns 400 when no matching obligation found for period dates", async () => {
    mockObligationsNotFound();

    const event = buildHmrcEvent({
      body: { vatNumber: "111222333", periodStart: TEST_PERIOD_START, periodEnd: TEST_PERIOD_END, vatDue: 100, accessToken: "test-token" },
    });
    const response = await hmrcVatReturnPostHandler(event);
    expect(response.statusCode).toBe(400);
    const body = parseResponseBody(response);
    expect(body.message).toContain("No open VAT obligation found");
  });

  test("names the periods HMRC is expecting when the requested one does not match", async () => {
    mockGetVatObligations.mockResolvedValue({
      obligations: {
        obligations: [{ periodKey: "18A3", start: "2017-07-01", end: "2017-09-30", status: "O" }],
      },
      hmrcResponse: { ok: true, status: 200 },
    });

    const event = buildHmrcEvent({
      body: { vatNumber: "111222333", periodStart: TEST_PERIOD_START, periodEnd: TEST_PERIOD_END, vatDue: 100, accessToken: "test-token" },
    });
    const response = await hmrcVatReturnPostHandler(event);
    expect(response.statusCode).toBe(400);
    const body = parseResponseBody(response);
    expect(body.message).toContain("No open VAT obligation found");
    expect(body.message).toMatch(/1 Jul 2017 to 30 Sept? 2017/);
  });

  test("reports the period as already filed when HMRC has fulfilled it since the last attempt", async () => {
    mockGetVatObligations.mockResolvedValue({
      obligations: {
        obligations: [
          { periodKey: TEST_PERIOD_KEY, start: TEST_PERIOD_START, end: TEST_PERIOD_END, status: "F", received: "2017-08-05" },
        ],
      },
      hmrcResponse: { ok: true, status: 200 },
    });

    const event = buildHmrcEvent({
      body: { vatNumber: "111222333", periodStart: TEST_PERIOD_START, periodEnd: TEST_PERIOD_END, vatDue: 100, accessToken: "test-token" },
    });
    const response = await hmrcVatReturnPostHandler(event);

    expect(response.statusCode).toBe(409);
    const body = parseResponseBody(response);
    expect(body.reason).toBe("obligation_already_fulfilled");
    expect(body.userMessage).toContain("1 Apr 2017 to 30 Jun 2017");
    expect(body.userMessage).toContain("already been submitted to HMRC");
    expect(body.userMessage).toContain("5 Aug 2017");
    expect(body.actionAdvice).toContain("receipts page");

    // A period HMRC has already accepted must not be sent again.
    const returnPosts = mockFetch.mock.calls.filter(([url]) => String(url).includes("/returns"));
    expect(returnPosts).toHaveLength(0);
  });

  test("matches the obligation when each entered boundary is a day out", async () => {
    mockObligationsSuccess("18A2", TEST_PERIOD_START, TEST_PERIOD_END);
    mockHmrcSuccess(mockFetch, {
      formBundleNumber: "123456789012",
      chargeRefNumber: "XM002610011594",
      processingDate: "2017-08-05T12:00:00.000Z",
    });

    const event = buildHmrcEvent({
      body: {
        vatNumber: "111222333",
        periodStart: "2017-04-02",
        periodEnd: "2017-07-01",
        vatDue: 100,
        accessToken: "test-token",
      },
    });
    const response = await hmrcVatReturnPostHandler(event);

    expect(response.statusCode).toBe(200);
    const returnPost = mockFetch.mock.calls.find(([url]) => String(url).includes("/returns"));
    expect(JSON.parse(returnPost[1].body).periodKey).toBe("18A2");
  });

  test("returns error when obligations API fails", async () => {
    mockObligationsError(500);

    const event = buildHmrcEvent({
      body: { vatNumber: "111222333", periodStart: TEST_PERIOD_START, periodEnd: TEST_PERIOD_END, vatDue: 100, accessToken: "test-token" },
    });
    const response = await hmrcVatReturnPostHandler(event);
    expect(response.statusCode).toBe(400);
    const body = parseResponseBody(response);
    expect(body.message).toContain("Failed to resolve period key");
  });

  test("resolves periodKey from obligations and returns 200 on successful submission", async () => {
    mockObligationsSuccess("18A2", TEST_PERIOD_START, TEST_PERIOD_END);

    const receipt = {
      formBundleNumber: "123456789012",
      chargeRefNumber: "XM002610011594",
      processingDate: "2023-01-01T12:00:00.000Z",
    };
    mockHmrcSuccess(mockFetch, receipt);

    const event = buildHmrcEvent({
      body: {
        vatNumber: "111222333",
        periodStart: TEST_PERIOD_START,
        periodEnd: TEST_PERIOD_END,
        vatDue: 100,
        accessToken: "test-token",
      },
    });
    const response = await hmrcVatReturnPostHandler(event);
    expect(response.statusCode).toBe(200);
    const body = parseResponseBody(response);
    expect(body).toHaveProperty("receipt");
    expect(body).toHaveProperty("receiptId");

    // Verify getVatObligations was called
    expect(mockGetVatObligations).toHaveBeenCalled();
    // Verify key parameters
    const callArgs = mockGetVatObligations.mock.calls[0];
    expect(callArgs[0]).toBe("111222333"); // vatNumber
    expect(callArgs[1]).toBe("test-token"); // hmrcAccessToken
    // The window is padded either side of the requested period and carries no status filter,
    // so a period already filed comes back as fulfilled rather than as an empty result.
    expect(callArgs[5]).toEqual({ from: "2017-03-25", to: "2017-07-07" });

    // Verify receipt was persisted to DynamoDB
    const lib = await import("@aws-sdk/lib-dynamodb");
    const putCalls = mockSend.mock.calls.filter((call) => {
      return call[0] instanceof lib.PutCommand && call[0].input.TableName === process.env.RECEIPTS_DYNAMODB_TABLE_NAME;
    });
    expect(putCalls.length).toBeGreaterThan(0);
    const receiptItem = putCalls[0][0].input.Item;
    expect(receiptItem.receipt).toEqual(receipt);
    expect(receiptItem.receiptId).toContain(receipt.formBundleNumber);
  });

  test("returns 500 on HMRC API error", async () => {
    mockObligationsSuccess();
    mockHmrcError(mockFetch, 400, { error: "INVALID_VAT_NUMBER" });

    const event = buildHmrcEvent({
      body: {
        vatNumber: "111222333",
        periodStart: TEST_PERIOD_START,
        periodEnd: TEST_PERIOD_END,
        vatDue: 100,
        accessToken: "test-token",
      },
    });
    const response = await hmrcVatReturnPostHandler(event);
    expect(response.statusCode).toBe(500);
  });

  test("returns user-friendly error message for HMRC error codes", async () => {
    mockObligationsSuccess();
    mockHmrcError(mockFetch, 400, { code: "DUPLICATE_SUBMISSION", message: "Duplicate submission" });

    const event = buildHmrcEvent({
      body: {
        vatNumber: "111222333",
        periodStart: TEST_PERIOD_START,
        periodEnd: TEST_PERIOD_END,
        vatDue: 100,
        accessToken: "test-token",
      },
    });
    const response = await hmrcVatReturnPostHandler(event);
    expect(response.statusCode).toBe(500);
    const body = parseResponseBody(response);
    // The error details are in the response body
    expect(body).toHaveProperty("userMessage");
    expect(body).toHaveProperty("actionAdvice");
    expect(body.userMessage).toContain("already been submitted");
    expect(body.actionAdvice).toContain("contact HMRC");
  });

  test("poll after successful submission returns persisted result without re-resolving periodKey", async () => {
    // Background: HMRC flips obligation status O→F right after submission, so re-resolving
    // the periodKey on a poll would 404 and surface a phantom "Failed to resolve period key"
    // error to the customer. The handler must short-circuit on polls with a persisted record.
    const persistedReceipt = {
      formBundleNumber: "096056627239",
      processingDate: "2026-05-11T14:01:01.000Z",
      paymentIndicator: "BANK",
    };

    mockSend.mockImplementation(async (cmd) => {
      if (cmd instanceof MockQueryCommand) return { Items: [], Count: 0 };
      if (cmd instanceof MockPutCommand) return {};
      if (cmd instanceof MockUpdateCommand) return {};
      if (cmd instanceof MockGetCommand) {
        // Return a persisted "completed" record for the async-request lookup.
        if (cmd.input?.TableName === process.env.HMRC_VAT_RETURN_POST_ASYNC_REQUESTS_TABLE_NAME) {
          return {
            Item: {
              hashedSub: "any",
              requestId: "poll-after-success",
              status: "completed",
              data: {
                receipt: persistedReceipt,
                hmrcResponse: { ok: true, status: 200, statusText: "OK", headers: {} },
                hmrcResponseBody: persistedReceipt,
                periodKey: "26A1",
                receiptId: "2026-05-11T14:01:01.000Z-096056627239",
              },
            },
          };
        }
        return { Item: null };
      }
      return {};
    });

    const event = buildHmrcEvent({
      headers: { "x-initial-request": "false", "x-request-id": "poll-after-success" },
      requestId: "poll-after-success",
      body: {
        vatNumber: "860611051",
        periodStart: "2026-02-01",
        periodEnd: "2026-04-30",
        vatDue: 100,
        accessToken: "test-token",
      },
    });

    const response = await hmrcVatReturnPostHandler(event);
    expect(response.statusCode).toBe(200);
    const body = parseResponseBody(response);
    expect(body.receipt).toEqual(persistedReceipt);
    expect(body.receiptId).toBe("2026-05-11T14:01:01.000Z-096056627239");

    // Critical: obligations endpoint must NOT be called on a poll with a persisted record.
    expect(mockGetVatObligations).not.toHaveBeenCalled();
    // And no HMRC POST should be issued.
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
