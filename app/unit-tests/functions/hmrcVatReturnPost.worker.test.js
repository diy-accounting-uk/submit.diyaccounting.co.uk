// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/hmrcVatReturnPost.worker.test.js
// NOTE: Test data in this file (test-token, test-sub, etc.) are not real credentials

import { describe, test, beforeEach, expect, vi } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { setupTestEnv, setupFetchMock, mockHmrcSuccess, mockHmrcError } from "@app/test-helpers/mockHelpers.js";
import {
  mockSend,
  mockLibDynamoDb,
  mockClientDynamoDb,
  MockQueryCommand,
  MockPutCommand,
  MockUpdateCommand,
  MockGetCommand,
} from "@app/test-helpers/dynamoDbMock.js";
import { isRetryableError } from "@app/lib/sqsWorkerHelper.js";

vi.mock("@aws-sdk/lib-dynamodb", () => mockLibDynamoDb);
vi.mock("@aws-sdk/client-dynamodb", () => mockClientDynamoDb);

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

const mockRequestCustomerEmail = vi.fn();
vi.mock("@app/lib/customerEmailRequest.js", () => ({ requestCustomerEmail: (...args) => mockRequestCustomerEmail(...args) }));

import { workerHandler as hmrcVatReturnPostWorker } from "@app/functions/hmrc/hmrcVatReturnPost.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const mockFetch = setupFetchMock();

const ASYNC_TABLE_ENV = "HMRC_VAT_RETURN_POST_ASYNC_REQUESTS_TABLE_NAME";

function buildSubmissionRecord({
  userId = "user-123",
  requestId = "worker-test-request-1",
  messageId = "msg-1",
  payloadOverrides = {},
} = {}) {
  return {
    messageId,
    body: JSON.stringify({
      userId,
      requestId,
      traceparent: null,
      correlationId: requestId,
      payload: {
        periodKey: "18A2",
        vatReturnData: {
          vatDueSales: 100,
          vatDueAcquisitions: 0,
          vatReclaimedCurrPeriod: 0,
          totalValueSalesExVAT: 500,
          totalValuePurchasesExVAT: 0,
          totalValueGoodsSuppliedExVAT: 0,
          totalAcquisitionsExVAT: 0,
        },
        vatNumber: "111222333",
        hmrcAccount: "live",
        hmrcAccessToken: "test-token",
        govClientHeaders: {},
        userSub: userId,
        govTestScenarioHeader: null,
        runFraudPreventionHeaderValidation: false,
        requestId,
        traceparent: null,
        correlationId: requestId,
        ...payloadOverrides,
      },
    }),
  };
}

async function asyncTableUpdateCalls(requestId) {
  const lib = await import("@aws-sdk/lib-dynamodb");
  return mockSend.mock.calls
    .filter(
      (call) =>
        call[0] instanceof lib.UpdateCommand &&
        call[0].input.TableName === process.env[ASYNC_TABLE_ENV] &&
        (!requestId || call[0].input.Key.requestId === requestId),
    )
    .map((call) => call[0]);
}

async function receiptPutCalls() {
  const lib = await import("@aws-sdk/lib-dynamodb");
  return mockSend.mock.calls
    .filter((call) => call[0] instanceof lib.PutCommand && call[0].input.TableName === process.env.RECEIPTS_DYNAMODB_TABLE_NAME)
    .map((call) => call[0]);
}

async function invocationOrderOf(command) {
  const index = mockSend.mock.calls.findIndex((call) => call[0] === command);
  return mockSend.mock.invocationCallOrder[index];
}

describe("hmrcVatReturnPost workerHandler", () => {
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
  });

  test("files a clean submission, stores the receipt and marks the request completed", async () => {
    mockHmrcSuccess(mockFetch, { formBundleNumber: "123456789012", processingDate: "2023-01-01T12:00:00.000Z" });

    const requestId = "worker-test-clean";
    await hmrcVatReturnPostWorker({ Records: [buildSubmissionRecord({ requestId })] });

    expect(mockFetch).toHaveBeenCalledTimes(1);

    const receipts = await receiptPutCalls();
    expect(receipts).toHaveLength(1);
    expect(receipts[0].input.Item.receipt.formBundleNumber).toBe("123456789012");

    const completedUpdates = await asyncTableUpdateCalls(requestId);
    expect(completedUpdates).toHaveLength(1);
    expect(completedUpdates[0].input.ExpressionAttributeValues[":status"]).toBe("completed");
    expect(completedUpdates[0].input.ExpressionAttributeValues[":data"].hmrcResponse.ok).toBe(true);
    expect(completedUpdates[0].input.ExpressionAttributeValues[":data"].receiptId).toBeDefined();

    expect(mockRequestCustomerEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "submission-receipt",
        userSub: "user-123",
        synthetic: false,
        data: expect.objectContaining({ receiptKind: "vat-return" }),
      }),
    );
  });

  test("asks for the receipt email as synthetic when the filing used the synthetic HMRC account", async () => {
    mockHmrcSuccess(mockFetch, { formBundleNumber: "123456789012", processingDate: "2023-01-01T12:00:00.000Z" });

    await hmrcVatReturnPostWorker({
      Records: [buildSubmissionRecord({ requestId: "worker-test-synthetic", payloadOverrides: { hmrcAccount: "synthetic" } })],
    });

    expect(mockRequestCustomerEmail).toHaveBeenCalledWith(expect.objectContaining({ kind: "submission-receipt", synthetic: true }));
  });

  describe("the due list row a filed return closes", () => {
    const DUE_LIST_TABLE = "worker-test-due-list";
    const OPEN_ROW = { hashedSub: "h", sk: "row#v1#vat-return#2026-09-30", type: "vat-return", periodEnd: "2026-09-30", status: "open" };
    const onDueList = (command) => command.input?.TableName === DUE_LIST_TABLE;

    beforeEach(() => {
      process.env.DUE_LIST_DYNAMODB_TABLE_NAME = DUE_LIST_TABLE;
      mockSend.mockImplementation(async (cmd) => {
        if (cmd instanceof MockQueryCommand) return onDueList(cmd) ? { Items: [OPEN_ROW] } : { Items: [], Count: 0 };
        if (cmd instanceof MockGetCommand) return { Item: null };
        return {};
      });
      mockHmrcSuccess(mockFetch, { formBundleNumber: "123456789012", processingDate: "2023-01-01T12:00:00.000Z" });
    });

    test("closes the row for the message's period end, after the request is marked completed", async () => {
      const requestId = "worker-test-due-list";
      await hmrcVatReturnPostWorker({
        Records: [buildSubmissionRecord({ requestId, payloadOverrides: { periodEnd: "2026-09-30" } })],
      });

      const closes = mockSend.mock.calls.map(([cmd]) => cmd).filter((cmd) => cmd instanceof MockUpdateCommand && onDueList(cmd));
      expect(closes).toHaveLength(1);
      expect(closes[0].input.Key.sk).toBe(OPEN_ROW.sk);
      const completedCommand = (await asyncTableUpdateCalls(requestId))[0];
      expect(await invocationOrderOf(completedCommand)).toBeLessThan(await invocationOrderOf(closes[0]));
    });

    test("completes a message that holds no period end without reading the due list", async () => {
      const requestId = "worker-test-no-period-end";
      await hmrcVatReturnPostWorker({ Records: [buildSubmissionRecord({ requestId })] });

      expect(mockSend.mock.calls.map(([cmd]) => cmd).filter(onDueList)).toHaveLength(0);
      expect((await asyncTableUpdateCalls(requestId))[0].input.ExpressionAttributeValues[":status"]).toBe("completed");
      expect(await receiptPutCalls()).toHaveLength(1);
    });

    test("marks the request completed when the due list cannot be read", async () => {
      mockSend.mockImplementation(async (cmd) => {
        if (onDueList(cmd)) throw Object.assign(new Error("no such table"), { name: "ResourceNotFoundException" });
        if (cmd instanceof MockQueryCommand) return { Items: [], Count: 0 };
        if (cmd instanceof MockGetCommand) return { Item: null };
        return {};
      });
      const requestId = "worker-test-due-list-down";

      await hmrcVatReturnPostWorker({
        Records: [buildSubmissionRecord({ requestId, payloadOverrides: { periodEnd: "2026-09-30" } })],
      });

      expect((await asyncTableUpdateCalls(requestId))[0].input.ExpressionAttributeValues[":status"]).toBe("completed");
      expect(await receiptPutCalls()).toHaveLength(1);
    });
  });

  test("stores the receipt before marking the request completed, so a poll never sees completed without it", async () => {
    mockHmrcSuccess(mockFetch, { formBundleNumber: "123456789012", processingDate: "2023-01-01T12:00:00.000Z" });

    const requestId = "worker-test-order";
    await hmrcVatReturnPostWorker({ Records: [buildSubmissionRecord({ requestId })] });

    const receiptCommand = (await receiptPutCalls())[0];
    const completedCommand = (await asyncTableUpdateCalls(requestId))[0];
    expect(await invocationOrderOf(receiptCommand)).toBeLessThan(await invocationOrderOf(completedCommand));
  });

  test("classifies a retryable HMRC failure as retryable and re-throws it for SQS redelivery", async () => {
    mockHmrcError(mockFetch, 503, { code: "SERVICE_UNAVAILABLE", message: "Service temporarily unavailable" });

    const requestId = "worker-test-retryable";
    let caught;
    try {
      await hmrcVatReturnPostWorker({ Records: [buildSubmissionRecord({ requestId })] });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeDefined();
    expect(caught.message).toContain("HMRC temporary error 503");
    expect(isRetryableError(caught)).toBe(true);

    // A retried message must not be left recorded as finished - the next delivery attempt
    // has to run the submission again, not find a stale terminal state.
    expect(await asyncTableUpdateCalls(requestId)).toHaveLength(0);
  });

  test("does not re-throw a terminal HMRC rejection, and records it as completed rather than retrying", async () => {
    mockHmrcError(mockFetch, 400, {
      code: "INVALID_PERIOD_KEY",
      message: "The remote endpoint has indicated that the period key is invalid",
    });

    const requestId = "worker-test-terminal";
    await expect(hmrcVatReturnPostWorker({ Records: [buildSubmissionRecord({ requestId })] })).resolves.toBeUndefined();

    const updates = await asyncTableUpdateCalls(requestId);
    expect(updates).toHaveLength(1);
    expect(updates[0].input.ExpressionAttributeValues[":status"]).toBe("completed");
    expect(updates[0].input.ExpressionAttributeValues[":data"].hmrcResponse.ok).toBe(false);
    expect(updates[0].input.ExpressionAttributeValues[":data"].hmrcResponse.status).toBe(400);

    // No receipt for a rejected filing
    expect(await receiptPutCalls()).toHaveLength(0);
  });

  test("skips a record missing userId or requestId without touching HMRC or DynamoDB", async () => {
    const malformed = { messageId: "msg-malformed", body: JSON.stringify({ payload: { vatNumber: "111222333" } }) };

    await expect(hmrcVatReturnPostWorker({ Records: [malformed] })).resolves.toBeUndefined();

    expect(mockFetch).not.toHaveBeenCalled();
    expect(await receiptPutCalls()).toHaveLength(0);
    expect(await asyncTableUpdateCalls()).toHaveLength(0);
  });

  test("a malformed record does not block the rest of the batch", async () => {
    mockHmrcSuccess(mockFetch, { formBundleNumber: "123456789013", processingDate: "2023-01-01T12:00:00.000Z" });

    const malformed = { messageId: "msg-malformed", body: JSON.stringify({ payload: {} }) };
    const requestId = "worker-test-batch-clean";
    const clean = buildSubmissionRecord({ requestId, messageId: "msg-clean" });

    await expect(hmrcVatReturnPostWorker({ Records: [malformed, clean] })).resolves.toBeUndefined();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const updates = await asyncTableUpdateCalls(requestId);
    expect(updates).toHaveLength(1);
    expect(updates[0].input.ExpressionAttributeValues[":status"]).toBe("completed");
  });

  test("a record whose body is not JSON is re-thrown for SQS redelivery instead of being silently dropped", async () => {
    const unparseable = { messageId: "msg-unparseable", body: "not json" };

    let caught;
    try {
      await hmrcVatReturnPostWorker({ Records: [unparseable] });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeDefined();
    expect(caught.message).toContain("Failed to parse SQS message body");

    expect(mockFetch).not.toHaveBeenCalled();
    expect(await asyncTableUpdateCalls()).toHaveLength(0);
    expect(await receiptPutCalls()).toHaveLength(0);
  });
});
