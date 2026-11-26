// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/data/dynamoDbAsyncRequestRepository.test.js

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { _setTestSalt, _clearSalt } from "../../services/subHasher.js";

const mockSend = vi.fn();
const mockLogger = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }));
vi.mock("@app/lib/logger.js", async (importOriginal) => ({ ...(await importOriginal()), createLogger: () => mockLogger }));

vi.mock("@aws-sdk/lib-dynamodb", () => {
  class PutCommand {
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
    UpdateCommand,
  };
});

vi.mock("@aws-sdk/client-dynamodb", () => {
  class DynamoDBClient {
    constructor(_config) {}
  }
  return { DynamoDBClient };
});

describe("dynamoDbAsyncRequestRepository", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.ASYNC_REQUESTS_DYNAMODB_TABLE_NAME = "test-async-requests";
    // Initialize salt for tests that use hashSub
    _setTestSalt("test-salt-for-unit-tests");
  });

  afterEach(() => {
    process.env = originalEnv;
    _clearSalt();
  });

  test("putAsyncRequest uses UpdateCommand and preserves createdAt via if_not_exists", async () => {
    const { putAsyncRequest } = await import("../../../app/data/dynamoDbAsyncRequestRepository.js");
    const userId = "user-123";
    const requestId = "req-456";
    const status = "processing";
    const data = { foo: "bar" };

    mockSend.mockResolvedValue({});

    await putAsyncRequest(userId, requestId, status, data);

    expect(mockSend).toHaveBeenCalledTimes(1);
    const command = mockSend.mock.calls[0][0];
    const { UpdateCommand } = await import("@aws-sdk/lib-dynamodb");
    expect(command).toBeInstanceOf(UpdateCommand);

    const input = command.input;
    expect(input.TableName).toBe("test-async-requests");
    expect(input.Key).toEqual({
      hashedSub: expect.any(String),
      requestId: requestId,
    });

    expect(input.UpdateExpression).toContain("SET");
    expect(input.UpdateExpression).toContain("#createdAt = if_not_exists(#createdAt, :createdAt)");
    expect(input.UpdateExpression).toContain("#status = :status");
    expect(input.UpdateExpression).toContain("#updatedAt = :updatedAt");
    expect(input.UpdateExpression).toContain("#data = :data");

    expect(input.ExpressionAttributeNames["#createdAt"]).toBe("createdAt");
    expect(input.ExpressionAttributeNames["#status"]).toBe("status");
    expect(input.ExpressionAttributeValues[":status"]).toBe(status);
    expect(input.ExpressionAttributeValues[":data"]).toEqual(data);
    expect(input.ExpressionAttributeValues[":createdAt"]).toEqual(expect.any(String));
  });

  test("putAsyncRequest removes data attribute when data is null", async () => {
    const { putAsyncRequest } = await import("../../../app/data/dynamoDbAsyncRequestRepository.js");
    const userId = "user-123";
    const requestId = "req-456";
    const status = "pending";
    const data = null;

    mockSend.mockResolvedValue({});

    await putAsyncRequest(userId, requestId, status, data);

    const command = mockSend.mock.calls[0][0];
    const input = command.input;

    expect(input.UpdateExpression).toContain("REMOVE #data");
    expect(input.ExpressionAttributeNames["#data"]).toBe("data");
    expect(input.ExpressionAttributeValues[":data"]).toBeUndefined();
  });

  test("putAsyncRequest logs the item's key as asyncRequestId and leaves requestId to the request context", async () => {
    const { putAsyncRequest } = await import("../../../app/data/dynamoDbAsyncRequestRepository.js");
    mockSend.mockResolvedValue({});

    await putAsyncRequest("user-123", "46DCD4CC7E194088B99857931C185829", "pending", { kind: "company-tax-return" });

    const logged = mockLogger.info.mock.calls.map(([fields]) => fields);
    expect(logged.length).toBeGreaterThan(0);
    for (const fields of logged) {
      expect(fields.asyncRequestId).toBe("46DCD4CC7E194088B99857931C185829");
      expect(fields).not.toHaveProperty("requestId");
    }
  });

  test("putAsyncRequest counts the retention from retention.from when it is given, and from now otherwise", async () => {
    const { putAsyncRequest } = await import("../../../app/data/dynamoDbAsyncRequestRepository.js");
    mockSend.mockResolvedValue({});
    const sentAt = "2026-01-01T00:00:00.000Z";

    await putAsyncRequest("user-123", "req-1", "pending", { a: 1 }, "t", { days: 30, from: sentAt });
    const fromSent = mockSend.mock.calls[0][0].input.ExpressionAttributeValues;
    expect(fromSent[":ttl"]).toBe(Math.floor(Date.parse(sentAt) / 1000) + 30 * 86400);
    expect(fromSent[":ttl_datestamp"]).toBe("2026-01-31T00:00:00.000Z");

    const before = Math.floor(Date.now() / 1000);
    await putAsyncRequest("user-123", "req-1", "completed", { a: 1 }, "t");
    const fromNow = mockSend.mock.calls[1][0].input.ExpressionAttributeValues[":ttl"];
    expect(fromNow).toBeGreaterThanOrEqual(before + 3600);
    expect(fromNow).toBeLessThanOrEqual(Math.floor(Date.now() / 1000) + 3600);
  });

  test("recordStatusCheck sets data.lastCheckedAt in place on a request that is still pending", async () => {
    const { recordStatusCheck } = await import("../../../app/data/dynamoDbAsyncRequestRepository.js");
    const { hashSub } = await import("../../services/subHasher.js");
    mockSend.mockResolvedValue({});

    await recordStatusCheck("user-123", "00001A", new Date("2026-11-26T09:20:00.000Z"), "test-async-requests");

    const [[command]] = mockSend.mock.calls;
    expect(command.input.Key).toEqual({ hashedSub: hashSub("user-123"), requestId: "00001A" });
    expect(command.input.UpdateExpression).toBe("SET #data.#lastCheckedAt = :checkedAt");
    expect(command.input.ConditionExpression).toBe("#status = :pending");
    expect(command.input.ExpressionAttributeValues).toEqual({ ":checkedAt": "2026-11-26T09:20:00.000Z", ":pending": "pending" });
  });

  test("recordStatusCheck leaves a request that is no longer pending, and throws any other failure", async () => {
    const { recordStatusCheck } = await import("../../../app/data/dynamoDbAsyncRequestRepository.js");
    mockSend.mockRejectedValueOnce(Object.assign(new Error("The conditional request failed"), { name: "ConditionalCheckFailedException" }));
    await expect(recordStatusCheck("user-123", "00001A", new Date(), "test-async-requests")).resolves.toBeUndefined();

    mockSend.mockRejectedValueOnce(Object.assign(new Error("throttled"), { name: "ProvisionedThroughputExceededException" }));
    await expect(recordStatusCheck("user-123", "00001A", new Date(), "test-async-requests")).rejects.toThrow("throttled");
  });
});
