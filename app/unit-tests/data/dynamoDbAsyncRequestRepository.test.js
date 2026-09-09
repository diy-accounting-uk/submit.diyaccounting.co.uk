// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/data/dynamoDbAsyncRequestRepository.test.js

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { _setTestSalt, _clearSalt } from "../../services/subHasher.js";

const mockSend = vi.fn();

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
});
