// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/data/dynamoDbCompaniesHouseCacheRepository.test.js

import { describe, test, expect, vi, beforeEach } from "vitest";

const mockSend = vi.fn();
const commandClass = (name) =>
  class {
    constructor(params) {
      this.name = name;
      this.params = params;
    }
  };
const dynamoDbModule = {
  GetCommand: commandClass("Get"),
  PutCommand: commandClass("Put"),
  QueryCommand: commandClass("Query"),
  DeleteCommand: commandClass("Delete"),
};

vi.mock("@app/lib/dynamoDbClient.js", () => ({
  executeDynamoDbCommand: (commandBuilder) => mockSend(commandBuilder(dynamoDbModule)),
  getResourceName: (envVarName) => process.env[envVarName] || "",
}));

const { getCacheEntry, putCacheEntry, listCacheKeys, deleteCacheEntry } =
  await import("@app/data/dynamoDbCompaniesHouseCacheRepository.js");

const TABLE = "test-companies-house-cache-table";
const nowSeconds = () => Math.floor(Date.now() / 1000);

describe("data/dynamoDbCompaniesHouseCacheRepository", () => {
  beforeEach(() => {
    mockSend.mockReset().mockResolvedValue({});
    process.env.COMPANIES_HOUSE_CACHE_DYNAMODB_TABLE_NAME = TABLE;
  });

  test("putCacheEntry stores the value under the company number and sk, with its read time and ttl", async () => {
    await putCacheEntry("00000001", "/company/00000001", { company_name: "ACME" }, "2026-11-22T14:05:00.000Z", 600);

    const { TableName, Item } = mockSend.mock.calls[0][0].params;
    expect(TableName).toBe(TABLE);
    expect(Item).toMatchObject({
      companyNumber: "00000001",
      sk: "/company/00000001",
      value: { company_name: "ACME" },
      readAt: "2026-11-22T14:05:00.000Z",
    });
    expect(Item.ttl - nowSeconds()).toBeGreaterThanOrEqual(599);
  });

  test("getCacheEntry answers a live entry, and null for one whose ttl has passed or that is missing", async () => {
    mockSend.mockResolvedValueOnce({ Item: { value: { a: 1 }, readAt: "r", ttl: nowSeconds() + 60 } });
    expect(await getCacheEntry("00000001", "k")).toEqual({ value: { a: 1 }, readAt: "r" });
    expect(mockSend.mock.calls[0][0].params.Key).toEqual({ companyNumber: "00000001", sk: "k" });

    mockSend.mockResolvedValueOnce({ Item: { value: { a: 1 }, readAt: "r", ttl: nowSeconds() - 60 } });
    expect(await getCacheEntry("00000001", "k")).toBeNull();

    mockSend.mockResolvedValueOnce({});
    expect(await getCacheEntry("00000001", "k")).toBeNull();
  });

  test("listCacheKeys reads every page of the company's partition", async () => {
    mockSend.mockResolvedValueOnce({ Items: [{ sk: "a" }], LastEvaluatedKey: { sk: "a" } }).mockResolvedValueOnce({ Items: [{ sk: "b" }] });

    expect(await listCacheKeys("00000001")).toEqual(["a", "b"]);
    expect(mockSend.mock.calls[0][0].params.KeyConditionExpression).toBe("companyNumber = :companyNumber");
    expect(mockSend.mock.calls[1][0].params.ExclusiveStartKey).toEqual({ sk: "a" });
  });

  test("deleteCacheEntry removes one entry by its key", async () => {
    await deleteCacheEntry("00000001", "k");
    expect(mockSend.mock.calls[0][0].params.Key).toEqual({ companyNumber: "00000001", sk: "k" });
  });
});
