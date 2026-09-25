// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/data/dynamoDbSecurityStateRepository.test.js

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

const mockSend = vi.fn();

vi.mock("@aws-sdk/lib-dynamodb", () => {
  class UpdateCommand {
    constructor(input) {
      this.input = input;
    }
  }
  class GetCommand {
    constructor(input) {
      this.input = input;
    }
  }
  class PutCommand {
    constructor(input) {
      this.input = input;
    }
  }
  class DeleteCommand {
    constructor(input) {
      this.input = input;
    }
  }
  return {
    DynamoDBDocumentClient: { from: () => ({ send: mockSend }) },
    UpdateCommand,
    GetCommand,
    PutCommand,
    DeleteCommand,
  };
});

vi.mock("@aws-sdk/client-dynamodb", () => {
  class DynamoDBClient {
    constructor(_config) {}
  }
  return { DynamoDBClient };
});

describe("dynamoDbSecurityStateRepository", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.SECURITY_STATE_DYNAMODB_TABLE_NAME = "test-security-state";
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test("incrementRateCounter keys the item as rate#<hash>#<minute>", async () => {
    const { incrementRateCounter } = await import("../../../app/data/dynamoDbSecurityStateRepository.js");
    mockSend.mockResolvedValue({ Attributes: { hits: 1 } });

    await incrementRateCounter({ identifier: "hashed-abc", minute: 12345 });

    expect(mockSend).toHaveBeenCalledTimes(1);
    const command = mockSend.mock.calls[0][0];
    const { UpdateCommand } = await import("@aws-sdk/lib-dynamodb");
    expect(command).toBeInstanceOf(UpdateCommand);

    const input = command.input;
    expect(input.TableName).toBe("test-security-state");
    expect(input.Key).toEqual({ stateKey: "rate#hashed-abc#12345" });
  });

  test("incrementRateCounter sets the TTL only if it doesn't already exist, and ADDs the count", async () => {
    const { incrementRateCounter } = await import("../../../app/data/dynamoDbSecurityStateRepository.js");
    mockSend.mockResolvedValue({ Attributes: { hits: 2 } });

    await incrementRateCounter({ identifier: "hashed-abc", minute: 12345 });

    const input = mockSend.mock.calls[0][0].input;
    expect(input.UpdateExpression).toBe("SET #ttl = if_not_exists(#ttl, :ttl) ADD hits :one");
    expect(input.ExpressionAttributeNames).toEqual({ "#ttl": "ttl" });
    expect(input.ExpressionAttributeValues[":one"]).toBe(1);
    expect(input.ExpressionAttributeValues[":ttl"]).toEqual(expect.any(Number));
    expect(input.ReturnValues).toBe("UPDATED_NEW");
  });

  test("incrementRateCounter returns the updated hit count", async () => {
    const { incrementRateCounter } = await import("../../../app/data/dynamoDbSecurityStateRepository.js");
    mockSend.mockResolvedValue({ Attributes: { hits: 501 } });

    const hits = await incrementRateCounter({ identifier: "hashed-abc", minute: 12345 });

    expect(hits).toBe(501);
  });

  test("incrementRateCounter defaults to the rate# namespace", async () => {
    const { incrementRateCounter } = await import("../../../app/data/dynamoDbSecurityStateRepository.js");
    mockSend.mockResolvedValue({ Attributes: { hits: 1 } });

    await incrementRateCounter({ identifier: "hashed-abc", minute: 12345 });

    const input = mockSend.mock.calls[0][0].input;
    expect(input.Key).toEqual({ stateKey: "rate#hashed-abc#12345" });
  });

  test("incrementRateCounter keys the item under a caller-given namespace", async () => {
    const { incrementRateCounter } = await import("../../../app/data/dynamoDbSecurityStateRepository.js");
    mockSend.mockResolvedValue({ Attributes: { hits: 1 } });

    await incrementRateCounter({ namespace: "supportticket", identifier: "hashed-ip", minute: 12345 });

    const input = mockSend.mock.calls[0][0].input;
    expect(input.Key).toEqual({ stateKey: "supportticket#hashed-ip#12345" });
  });

  test("getSessionGeo keys the item as geo#<hash> and returns the stored item", async () => {
    const { getSessionGeo } = await import("../../../app/data/dynamoDbSecurityStateRepository.js");
    mockSend.mockResolvedValue({ Item: { stateKey: "geo#hashed-abc", country: "GB" } });

    const item = await getSessionGeo("hashed-abc");

    expect(mockSend).toHaveBeenCalledTimes(1);
    const command = mockSend.mock.calls[0][0];
    const { GetCommand } = await import("@aws-sdk/lib-dynamodb");
    expect(command).toBeInstanceOf(GetCommand);
    expect(command.input.TableName).toBe("test-security-state");
    expect(command.input.Key).toEqual({ stateKey: "geo#hashed-abc" });
    expect(item).toEqual({ stateKey: "geo#hashed-abc", country: "GB" });
  });

  test("getSessionGeo returns null when no item exists", async () => {
    const { getSessionGeo } = await import("../../../app/data/dynamoDbSecurityStateRepository.js");
    mockSend.mockResolvedValue({});

    const item = await getSessionGeo("hashed-abc");

    expect(item).toBeNull();
  });

  test("putSessionGeo writes country, revokedAt and a fresh one-hour TTL in one call", async () => {
    const { putSessionGeo } = await import("../../../app/data/dynamoDbSecurityStateRepository.js");
    mockSend.mockResolvedValue({});

    await putSessionGeo("hashed-abc", { country: "FR", revokedAt: 1700000000 });

    expect(mockSend).toHaveBeenCalledTimes(1);
    const command = mockSend.mock.calls[0][0];
    const { PutCommand } = await import("@aws-sdk/lib-dynamodb");
    expect(command).toBeInstanceOf(PutCommand);
    expect(command.input.TableName).toBe("test-security-state");
    expect(command.input.Item).toEqual({
      stateKey: "geo#hashed-abc",
      country: "FR",
      revokedAt: 1700000000,
      ttl: expect.any(Number),
    });
  });

  test("putSessionGeo omits revokedAt when not given", async () => {
    const { putSessionGeo } = await import("../../../app/data/dynamoDbSecurityStateRepository.js");
    mockSend.mockResolvedValue({});

    await putSessionGeo("hashed-abc", { country: "GB" });

    const command = mockSend.mock.calls[0][0];
    expect(command.input.Item).not.toHaveProperty("revokedAt");
  });

  test("getSignInSession keys the item as session#<hash>#<appClient> and returns the stored item", async () => {
    const { getSignInSession } = await import("../../../app/data/dynamoDbSecurityStateRepository.js");
    mockSend.mockResolvedValue({ Item: { stateKey: "session#hashed-abc#submit", lastIssuedAt: 1700000000000 } });

    const item = await getSignInSession("hashed-abc", "submit");

    expect(mockSend).toHaveBeenCalledTimes(1);
    const command = mockSend.mock.calls[0][0];
    const { GetCommand } = await import("@aws-sdk/lib-dynamodb");
    expect(command).toBeInstanceOf(GetCommand);
    expect(command.input.TableName).toBe("test-security-state");
    expect(command.input.Key).toEqual({ stateKey: "session#hashed-abc#submit" });
    expect(item).toEqual({ stateKey: "session#hashed-abc#submit", lastIssuedAt: 1700000000000 });
  });

  test("getSignInSession returns null when no item exists", async () => {
    const { getSignInSession } = await import("../../../app/data/dynamoDbSecurityStateRepository.js");
    mockSend.mockResolvedValue({});

    const item = await getSignInSession("hashed-abc", "submit");

    expect(item).toBeNull();
  });

  test("putSignInSession writes lastIssuedAt, sessionId, sessionStartedAt and a fresh thirty-day TTL", async () => {
    const { putSignInSession } = await import("../../../app/data/dynamoDbSecurityStateRepository.js");
    mockSend.mockResolvedValue({});

    await putSignInSession("hashed-abc", "books", {
      lastIssuedAt: 1700000000000,
      sessionId: "session-id-1",
      sessionStartedAt: 1699999000000,
    });

    expect(mockSend).toHaveBeenCalledTimes(1);
    const command = mockSend.mock.calls[0][0];
    const { PutCommand } = await import("@aws-sdk/lib-dynamodb");
    expect(command).toBeInstanceOf(PutCommand);
    expect(command.input.TableName).toBe("test-security-state");
    expect(command.input.Item).toEqual({
      stateKey: "session#hashed-abc#books",
      lastIssuedAt: 1700000000000,
      sessionId: "session-id-1",
      sessionStartedAt: 1699999000000,
      ttl: expect.any(Number),
    });
  });

  test("deleteSignInSession keys the item as session#<hash>#<appClient>", async () => {
    const { deleteSignInSession } = await import("../../../app/data/dynamoDbSecurityStateRepository.js");
    mockSend.mockResolvedValue({});

    await deleteSignInSession("hashed-abc", "mcp");

    expect(mockSend).toHaveBeenCalledTimes(1);
    const command = mockSend.mock.calls[0][0];
    const { DeleteCommand } = await import("@aws-sdk/lib-dynamodb");
    expect(command).toBeInstanceOf(DeleteCommand);
    expect(command.input.TableName).toBe("test-security-state");
    expect(command.input.Key).toEqual({ stateKey: "session#hashed-abc#mcp" });
  });
});
