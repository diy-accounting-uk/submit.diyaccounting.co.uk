// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/data/dynamoDbWafScanBurstRepository.test.js

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

const mockSend = vi.fn();

vi.mock("@aws-sdk/lib-dynamodb", () => {
  class UpdateCommand {
    constructor(input) {
      this.input = input;
    }
  }
  return {
    DynamoDBDocumentClient: { from: () => ({ send: mockSend }) },
    UpdateCommand,
  };
});

vi.mock("@aws-sdk/client-dynamodb", () => {
  class DynamoDBClient {
    constructor(_config) {}
  }
  return { DynamoDBClient };
});

describe("dynamoDbWafScanBurstRepository", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.WAF_SCAN_BURST_DYNAMODB_TABLE_NAME = "test-waf-scan-bursts";
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test("no table configured: reports a new burst without calling DynamoDB", async () => {
    delete process.env.WAF_SCAN_BURST_DYNAMODB_TABLE_NAME;
    const { openOrExtendBurstWindow } = await import("../../../app/data/dynamoDbWafScanBurstRepository.js");

    const result = await openOrExtendBurstWindow({ clientIp: "203.0.113.9", hitCount: 3 });

    expect(mockSend).not.toHaveBeenCalled();
    expect(result).toEqual({ isNewBurst: true, hitCount: 3 });
  });

  test("first hit for an IP opens the window with a conditional UpdateCommand keyed by clientIp", async () => {
    const { openOrExtendBurstWindow } = await import("../../../app/data/dynamoDbWafScanBurstRepository.js");
    mockSend.mockResolvedValueOnce({ Attributes: { hitCount: 4 } });

    const result = await openOrExtendBurstWindow({ clientIp: "203.0.113.9", hitCount: 4, now: 1_700_000_000_000 });

    expect(mockSend).toHaveBeenCalledTimes(1);
    const { UpdateCommand } = await import("@aws-sdk/lib-dynamodb");
    const command = mockSend.mock.calls[0][0];
    expect(command).toBeInstanceOf(UpdateCommand);
    expect(command.input.TableName).toBe("test-waf-scan-bursts");
    expect(command.input.Key).toEqual({ clientIp: "203.0.113.9" });
    expect(command.input.ConditionExpression).toBe("attribute_not_exists(clientIp) OR windowStart < :windowCutoff");
    expect(command.input.ExpressionAttributeValues[":now"]).toBe(1_700_000_000_000);
    expect(command.input.ExpressionAttributeValues[":hitCount"]).toBe(4);
    expect(command.input.ExpressionAttributeValues[":windowCutoff"]).toBe(1_700_000_000_000 - 600_000);
    expect(result).toEqual({ isNewBurst: true, hitCount: 4 });
  });

  test("sets the TTL past the window's close so no separate flush is needed", async () => {
    const { openOrExtendBurstWindow } = await import("../../../app/data/dynamoDbWafScanBurstRepository.js");
    mockSend.mockResolvedValueOnce({ Attributes: { hitCount: 1 } });

    await openOrExtendBurstWindow({ clientIp: "203.0.113.9", hitCount: 1, now: 1_700_000_000_000 });

    const command = mockSend.mock.calls[0][0];
    expect(command.input.ExpressionAttributeValues[":ttl"]).toBe(Math.floor(1_700_000_000_000 / 1000) + 600 + 60);
  });

  test("a hit inside an already-open window adds to the count instead of opening a new one", async () => {
    const { openOrExtendBurstWindow } = await import("../../../app/data/dynamoDbWafScanBurstRepository.js");
    const conditionalCheckFailed = Object.assign(new Error("The conditional request failed"), {
      name: "ConditionalCheckFailedException",
    });
    mockSend.mockRejectedValueOnce(conditionalCheckFailed).mockResolvedValueOnce({ Attributes: { hitCount: 7 } });

    const result = await openOrExtendBurstWindow({ clientIp: "203.0.113.9", hitCount: 3, now: 1_700_000_000_000 });

    expect(mockSend).toHaveBeenCalledTimes(2);
    const secondCommand = mockSend.mock.calls[1][0];
    expect(secondCommand.input.TableName).toBe("test-waf-scan-bursts");
    expect(secondCommand.input.Key).toEqual({ clientIp: "203.0.113.9" });
    expect(secondCommand.input.UpdateExpression).toBe("ADD hitCount :hitCount");
    expect(secondCommand.input.ExpressionAttributeValues).toEqual({ ":hitCount": 3 });
    expect(result).toEqual({ isNewBurst: false, hitCount: 7 });
  });

  test("a DynamoDB error other than a failed condition is not swallowed", async () => {
    const { openOrExtendBurstWindow } = await import("../../../app/data/dynamoDbWafScanBurstRepository.js");
    mockSend.mockRejectedValueOnce(new Error("ProvisionedThroughputExceededException"));

    await expect(openOrExtendBurstWindow({ clientIp: "203.0.113.9", hitCount: 1 })).rejects.toThrow(
      "ProvisionedThroughputExceededException",
    );
  });
});
