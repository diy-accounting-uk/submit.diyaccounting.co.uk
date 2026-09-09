// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/data/dynamoDbBundleRepository.countActiveAllocations.test.js

import { describe, test, expect, vi, beforeEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const mockSend = vi.fn();
const mockScanCommand = vi.fn();
const dynamoDbModule = {
  QueryCommand: class QueryCommand {
    constructor(params) {
      this.params = params;
    }
  },
  ScanCommand: class ScanCommand {
    constructor(params) {
      mockScanCommand(params);
      this.params = params;
    }
  },
};
vi.mock("@app/lib/dynamoDbClient.js", () => ({
  getDynamoDbDocClient: vi.fn().mockResolvedValue({
    docClient: { send: (...args) => mockSend(...args) },
    module: dynamoDbModule,
  }),
  executeDynamoDbCommand: (commandBuilder) => mockSend(commandBuilder(dynamoDbModule)),
}));

const { countActiveAllocations } = await import("@app/data/dynamoDbBundleRepository.js");

describe("data/dynamoDbBundleRepository - countActiveAllocations", () => {
  beforeEach(() => {
    mockSend.mockReset();
    mockScanCommand.mockClear();
    process.env.BUNDLE_DYNAMODB_TABLE_NAME = "test-bundle-table";
  });

  test("queries bundleId-expiry-index with a count select", async () => {
    mockSend.mockResolvedValue({ Count: 3 });

    await countActiveAllocations("day-guest", "2026-09-06T00:00:00.000Z");

    expect(mockSend).toHaveBeenCalledTimes(1);
    const command = mockSend.mock.calls[0][0];
    expect(command.params).toMatchObject({
      TableName: "test-bundle-table",
      IndexName: "bundleId-expiry-index",
      KeyConditionExpression: "bundleId = :bundleId AND expiry > :now",
      ExpressionAttributeValues: { ":bundleId": "day-guest", ":now": "2026-09-06T00:00:00.000Z" },
      Select: "COUNT",
    });
  });

  test("returns the count from a single-page response", async () => {
    mockSend.mockResolvedValue({ Count: 5 });

    const count = await countActiveAllocations("day-guest", "2026-09-06T00:00:00.000Z");

    expect(count).toBe(5);
  });

  test("sums counts across pages until LastEvaluatedKey is absent", async () => {
    mockSend
      .mockResolvedValueOnce({ Count: 4, LastEvaluatedKey: { bundleId: "day-guest", expiry: "a" } })
      .mockResolvedValueOnce({ Count: 2, LastEvaluatedKey: { bundleId: "day-guest", expiry: "b" } })
      .mockResolvedValueOnce({ Count: 1 });

    const count = await countActiveAllocations("day-guest", "2026-09-06T00:00:00.000Z");

    expect(mockSend).toHaveBeenCalledTimes(3);
    expect(count).toBe(7);
  });

  test("returns 0 when the response carries no Count", async () => {
    mockSend.mockResolvedValue({});

    const count = await countActiveAllocations("day-guest", "2026-09-06T00:00:00.000Z");

    expect(count).toBe(0);
  });

  test("rethrows the underlying error and never falls back to a scan", async () => {
    mockSend.mockRejectedValue(new Error("index not found"));

    await expect(countActiveAllocations("day-guest", "2026-09-06T00:00:00.000Z")).rejects.toThrow("index not found");
    expect(mockScanCommand).not.toHaveBeenCalled();
  });
});
