// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/unit-tests/functions/hmrcVatReturnPost.activity.test.js
// NOTE: Test data in this file (test-token, test-sub, etc.) are not real credentials

import { describe, test, beforeAll, beforeEach, expect, vi } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { buildHmrcEvent } from "@app/test-helpers/eventBuilders.js";
import { setupTestEnv, setupFetchMock, mockHmrcSuccess, mockHmrcError } from "@app/test-helpers/mockHelpers.js";
import {
  mockSend,
  mockLibDynamoDb,
  mockClientDynamoDb,
  MockQueryCommand,
  MockPutCommand,
  MockGetCommand,
  MockUpdateCommand,
} from "@app/test-helpers/dynamoDbMock.js";

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

const mockGetVatObligations = vi.fn();
vi.mock("@app/functions/hmrc/hmrcVatObligationGet.js", () => ({
  getVatObligations: (...args) => mockGetVatObligations(...args),
}));

const mockConsumeTokenForActivity = vi.fn();
vi.mock("@app/services/tokenEnforcement.js", () => ({
  consumeTokenForActivity: (...args) => mockConsumeTokenForActivity(...args),
}));

// Capture activity events and metrics rather than reaching EventBridge or the log stream.
const mockPublishActivityEvent = vi.fn();
const mockPublishActivityFailureEvent = vi.fn();
vi.mock("@app/lib/activityAlert.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    publishActivityEvent: (...args) => mockPublishActivityEvent(...args),
    publishActivityFailureEvent: (...args) => mockPublishActivityFailureEvent(...args),
  };
});

const mockEmitMetric = vi.fn();
vi.mock("@app/lib/emfMetrics.js", () => ({
  emitMetric: (...args) => mockEmitMetric(...args),
}));

import { ingestHandler as hmrcVatReturnPostHandler } from "@app/functions/hmrc/hmrcVatReturnPost.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const mockFetch = setupFetchMock();

const TEST_PERIOD_START = "2017-04-01";
const TEST_PERIOD_END = "2017-06-30";
const TEST_VRN = "111222333";

function mockObligationsSuccess(periodKey = "18A2") {
  mockGetVatObligations.mockResolvedValue({
    obligations: { obligations: [{ periodKey, start: TEST_PERIOD_START, end: TEST_PERIOD_END, status: "O" }] },
    hmrcResponse: { ok: true, status: 200 },
  });
}

function buildSubmissionEvent(headers = {}) {
  return buildHmrcEvent({
    headers,
    body: {
      vatNumber: TEST_VRN,
      periodStart: TEST_PERIOD_START,
      periodEnd: TEST_PERIOD_END,
      vatDue: 100,
      accessToken: "test-token",
    },
  });
}

function failureEventsWithCategory(category) {
  return mockPublishActivityFailureEvent.mock.calls.filter((call) => call[0].failure === category);
}

function metricCalls(metricName) {
  return mockEmitMetric.mock.calls.filter((call) => call[0].metricName === metricName);
}

async function storedReceiptItems() {
  const lib = await import("@aws-sdk/lib-dynamodb");
  return mockSend.mock.calls
    .filter((call) => call[0] instanceof lib.PutCommand && call[0].input.TableName === process.env.RECEIPTS_DYNAMODB_TABLE_NAME)
    .map((call) => call[0].input.Item);
}

describe("hmrcVatReturnPost activity events and business metrics", () => {
  beforeAll(async () => {
    // The vendor IP lookup runs once per module, so settle it before any test queues
    // an HMRC response — otherwise the first test's response is consumed by the lookup.
    const { detectVendorPublicIp } = await import("@app/lib/buildFraudHeaders.js");
    await detectVendorPublicIp();
  });

  beforeEach(() => {
    Object.assign(process.env, setupTestEnv());
    vi.clearAllMocks();
    mockSend.mockImplementation(async (cmd) => {
      if (cmd instanceof MockQueryCommand) return { Items: [], Count: 0 };
      if (cmd instanceof MockPutCommand) return {};
      if (cmd instanceof MockUpdateCommand) return {};
      if (cmd instanceof MockGetCommand) return { Item: null };
      return {};
    });
    mockObligationsSuccess();
    mockConsumeTokenForActivity.mockResolvedValue({ consumed: true, tokensRemaining: 2, cost: 1 });
  });

  test("a successful submission emits a success metric alongside the success event", async () => {
    mockHmrcSuccess(mockFetch, { formBundleNumber: "123456789012", processingDate: "2023-01-01T12:00:00.000Z" });

    const response = await hmrcVatReturnPostHandler(buildSubmissionEvent());
    expect(response.statusCode).toBe(200);

    expect(mockPublishActivityEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: "vat-return-submitted", actor: "customer", userSub: "test-sub" }),
    );
    expect(metricCalls("VatSubmissionSuccess")).toHaveLength(1);
    expect(metricCalls("VatSubmissionSuccess")[0][0]).toMatchObject({
      namespace: "Submit/Business",
      dimensions: { Actor: "customer" },
    });
    expect(metricCalls("VatSubmissionFailure")).toHaveLength(0);
  });

  test("an HMRC rejection emits a failure event and a failure metric", async () => {
    mockHmrcError(mockFetch, 400, { code: "DUPLICATE_SUBMISSION", message: "Duplicate submission" });

    await hmrcVatReturnPostHandler(buildSubmissionEvent());

    const rejections = failureEventsWithCategory("hmrc-rejected");
    expect(rejections).toHaveLength(1);
    expect(rejections[0][0]).toMatchObject({
      event: "vat-return-failed",
      actor: "customer",
      detail: { hmrcStatus: 400 },
    });
    expect(metricCalls("VatSubmissionFailure")).toHaveLength(1);
    expect(metricCalls("VatSubmissionSuccess")).toHaveLength(0);
  });

  test("no VRN or HMRC response body reaches the failure event", async () => {
    mockHmrcError(mockFetch, 400, { code: "INVALID_VRN", message: `The VRN ${TEST_VRN} is invalid` });

    await hmrcVatReturnPostHandler(buildSubmissionEvent());

    const published = JSON.stringify(failureEventsWithCategory("hmrc-rejected")[0][0]);
    expect(published).not.toContain(TEST_VRN);
    expect(published).not.toContain("INVALID_VRN");
    expect(published).not.toContain("test-token");
  });

  test("an unmatched obligation reports itself as a failed filing", async () => {
    mockGetVatObligations.mockResolvedValue({
      obligations: { obligations: [] },
      hmrcResponse: { ok: true, status: 200 },
    });

    const response = await hmrcVatReturnPostHandler(buildSubmissionEvent());
    expect(response.statusCode).toBe(400);

    expect(failureEventsWithCategory("obligation-not-matched")).toHaveLength(1);
    expect(metricCalls("VatSubmissionFailure")).toHaveLength(1);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("an obligations lookup failure reports the HMRC status without a payload", async () => {
    mockGetVatObligations.mockResolvedValue({
      obligations: { obligations: [] },
      hmrcResponse: { ok: false, status: 503 },
    });

    await hmrcVatReturnPostHandler(buildSubmissionEvent());

    const lookupFailures = failureEventsWithCategory("obligation-lookup-failed");
    expect(lookupFailures).toHaveLength(1);
    expect(lookupFailures[0][0].detail).toEqual({ hmrcStatus: 503 });
  });

  test("an exhausted submission allowance reports itself as a failed filing", async () => {
    mockConsumeTokenForActivity.mockResolvedValue({ consumed: false, reason: "tokens_exhausted", tokensRemaining: 0 });

    const response = await hmrcVatReturnPostHandler(buildSubmissionEvent({ "x-initial-request": "true" }));
    expect(response.statusCode).toBe(403);

    expect(failureEventsWithCategory("tokens-exhausted")).toHaveLength(1);
    expect(metricCalls("VatSubmissionFailure")).toHaveLength(1);
  });

  test("an internal error while resolving the period reports itself as a failed filing", async () => {
    mockGetVatObligations.mockRejectedValue(new Error("obligations unavailable"));

    const response = await hmrcVatReturnPostHandler(buildSubmissionEvent());
    expect(response.statusCode).toBe(500);

    expect(failureEventsWithCategory("internal-error")).toHaveLength(1);
    expect(metricCalls("VatSubmissionFailure")).toHaveLength(1);
  });

  test("the stored receipt records the filer as a customer", async () => {
    mockHmrcSuccess(mockFetch, { formBundleNumber: "123456789012", processingDate: "2023-01-01T12:00:00.000Z" });

    await hmrcVatReturnPostHandler(buildSubmissionEvent());

    const receipts = await storedReceiptItems();
    expect(receipts).toHaveLength(1);
    expect(receipts[0].actor).toBe("customer");
    expect(receipts[0].receipt).toBeDefined();
    expect(receipts[0].hashedSub).toBeDefined();
  });

  test("the stored receipt records a test submission as test-user", async () => {
    mockHmrcSuccess(mockFetch, { formBundleNumber: "123456789012", processingDate: "2023-01-01T12:00:00.000Z" });

    await hmrcVatReturnPostHandler(buildSubmissionEvent({ "x-request-id": "test_run-1" }));

    const receipts = await storedReceiptItems();
    expect(receipts).toHaveLength(1);
    expect(receipts[0].actor).toBe("test-user");
  });

  test("a test run is classified as test-user on both the event and the metric", async () => {
    mockHmrcError(mockFetch, 400, { code: "DUPLICATE_SUBMISSION", message: "Duplicate submission" });

    await hmrcVatReturnPostHandler(buildSubmissionEvent({ "x-request-id": "test_run-1" }));

    expect(failureEventsWithCategory("hmrc-rejected")[0][0].actor).toBe("test-user");
    expect(metricCalls("VatSubmissionFailure")[0][0].dimensions).toEqual({ Actor: "test-user" });
  });
});
