// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/data/dynamoDbCtPendingReturnRepository.test.js

import { describe, test, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

const mockSend = vi.fn();

vi.mock("@aws-sdk/lib-dynamodb", () => {
  const command = (name) =>
    class {
      constructor(input) {
        this.name = name;
        this.input = input;
      }
    };
  return {
    DynamoDBDocumentClient: { from: () => ({ send: mockSend }) },
    UpdateCommand: command("UpdateCommand"),
    QueryCommand: command("QueryCommand"),
    DeleteCommand: command("DeleteCommand"),
    ScanCommand: command("ScanCommand"),
  };
});
vi.mock("@aws-sdk/client-dynamodb", () => ({ DynamoDBClient: class {} }));

vi.mock("@app/lib/codesSeal.js", () => ({
  sealFor: async (purpose, value, boundTo) => JSON.stringify({ purpose, value, boundTo }),
  openFor: async (purpose, sealed, boundTo) => {
    const parsed = JSON.parse(sealed);
    if (parsed.purpose !== purpose || parsed.boundTo !== boundTo) throw new Error("Sealed value does not open here");
    return parsed.value;
  },
}));

import {
  putPendingCtReturn,
  listPendingCtReturns,
  openPendingCtFiler,
  claimPendingCtCheck,
  deletePendingCtReturn,
  CT_PENDING_PARTITION,
} from "@app/data/dynamoDbCtPendingReturnRepository.js";

const TABLE = "test-ch-async-requests";
const sent = () => mockSend.mock.calls.map(([command]) => command);

describe("dynamoDbCtPendingReturnRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSend.mockResolvedValue({});
    process.env.COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME = TABLE;
  });

  test("a marker holds the sealed filer and when the return was sent, and outlives the pending request by a day", async () => {
    const sentAt = new Date("2026-03-01T10:00:00.000Z");
    await putPendingCtReturn({ correlationId: "ABC123", userSub: "filer-sub", sentAt });
    const [update] = sent();
    expect(update.name).toBe("UpdateCommand");
    expect(update.input.TableName).toBe(TABLE);
    expect(update.input.Key).toEqual({ hashedSub: CT_PENDING_PARTITION, requestId: "ABC123" });
    const values = update.input.ExpressionAttributeValues;
    expect(values[":sentAt"]).toBe(sentAt.toISOString());
    expect(values[":ttl"]).toBe(Math.floor(sentAt.getTime() / 1000) + 31 * 86400);
    expect(await openPendingCtFiler({ correlationId: "ABC123", sealedFiler: values[":sealedFiler"] })).toBe("filer-sub");
  });

  test("a sealed filer opens only under its own correlation ID", async () => {
    await putPendingCtReturn({ correlationId: "ABC123", userSub: "filer-sub", sentAt: new Date() });
    const sealedFiler = sent()[0].input.ExpressionAttributeValues[":sealedFiler"];
    await expect(openPendingCtFiler({ correlationId: "DEF456", sealedFiler })).rejects.toThrow();
  });

  test("the pending returns are read by a Query on the marker partition, page by page", async () => {
    mockSend
      .mockResolvedValueOnce({ Items: [{ requestId: "A1", sentAt: "s1", sealedFiler: "f1" }], LastEvaluatedKey: { k: 1 } })
      .mockResolvedValueOnce({ Items: [{ requestId: "B2", sentAt: "s2", sealedFiler: "f2" }] });
    const markers = await listPendingCtReturns();
    expect(markers).toEqual([
      { correlationId: "A1", sentAt: "s1", sealedFiler: "f1" },
      { correlationId: "B2", sentAt: "s2", sealedFiler: "f2" },
    ]);
    const [first, second] = sent();
    expect(first.name).toBe("QueryCommand");
    expect(first.input.KeyConditionExpression).toBe("hashedSub = :partition");
    expect(first.input.ExpressionAttributeValues).toEqual({ ":partition": CT_PENDING_PARTITION });
    expect(second.input.ExclusiveStartKey).toEqual({ k: 1 });
    expect(sent().some((command) => command.name === "ScanCommand")).toBe(false);
  });

  test("no module of the scheduled check builds a Scan", () => {
    for (const file of [
      "app/data/dynamoDbCtPendingReturnRepository.js",
      "app/services/hmrcCtPendingReturnCheck.js",
      "app/functions/hmrc/hmrcCtReturnStatusCheck.js",
    ]) {
      expect(readFileSync(file, "utf-8")).not.toMatch(/Scan/);
    }
  });

  test("a check claims a return for the interval, and a second claim inside it is refused", async () => {
    const now = new Date("2026-03-02T10:00:00.000Z");
    expect(await claimPendingCtCheck("A1", { now, intervalSeconds: 600 })).toBe(true);
    const [claim] = sent();
    expect(claim.input.ConditionExpression).toContain("checkAfter <= :now");
    expect(claim.input.ExpressionAttributeValues).toEqual({ ":now": now.getTime() / 1000, ":next": now.getTime() / 1000 + 600 });

    mockSend.mockRejectedValueOnce(Object.assign(new Error("failed"), { name: "ConditionalCheckFailedException" }));
    expect(await claimPendingCtCheck("A1", { now, intervalSeconds: 600 })).toBe(false);

    mockSend.mockRejectedValueOnce(Object.assign(new Error("throttled"), { name: "ProvisionedThroughputExceededException" }));
    await expect(claimPendingCtCheck("A1", { now, intervalSeconds: 600 })).rejects.toThrow("throttled");
  });

  test("a settled return's marker is deleted by key", async () => {
    await deletePendingCtReturn("A1");
    const [deleted] = sent();
    expect(deleted.name).toBe("DeleteCommand");
    expect(deleted.input).toEqual({ TableName: TABLE, Key: { hashedSub: CT_PENDING_PARTITION, requestId: "A1" } });
  });
});
