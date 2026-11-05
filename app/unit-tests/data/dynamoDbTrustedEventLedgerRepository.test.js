// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/data/dynamoDbTrustedEventLedgerRepository.test.js

import { describe, test, expect, vi, beforeEach } from "vitest";

const mockSend = vi.fn();
vi.mock("@app/lib/dynamoDbClient.js", () => ({
  executeDynamoDbCommand: (commandBuilder) =>
    mockSend(
      commandBuilder({
        GetCommand: class {
          constructor(input) {
            this.type = "get";
            this.input = input;
          }
        },
        PutCommand: class {
          constructor(input) {
            this.type = "put";
            this.input = input;
          }
        },
      }),
    ),
  getResourceName: (name, throwIfMissing) => {
    const value = process.env[name];
    if (!value && throwIfMissing) throw new Error(`${name} environment variable is required`);
    return value || "";
  },
}));

import { getLedgerItem, putVersion, putKey } from "@app/data/dynamoDbTrustedEventLedgerRepository.js";

describe("dynamoDbTrustedEventLedgerRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TRUSTED_EVENT_LEDGER_DYNAMODB_TABLE_NAME = "test-trusted-events";
  });

  test("getLedgerItem reads one item by dedupeKey with a consistent read", async () => {
    mockSend.mockResolvedValue({ Item: { dedupeKey: "k", issueNumber: 4 } });
    expect(await getLedgerItem("k")).toEqual({ dedupeKey: "k", issueNumber: 4 });
    expect(mockSend.mock.calls[0][0].input).toEqual({ TableName: "test-trusted-events", Key: { dedupeKey: "k" }, ConsistentRead: true });
  });

  test("getLedgerItem returns null for a missing item", async () => {
    mockSend.mockResolvedValue({});
    expect(await getLedgerItem("k")).toBeNull();
  });

  test("putVersion writes the version item with a 400 day ttl", async () => {
    mockSend.mockResolvedValue({});
    await putVersion({ key: "k", version: "v", factHash: "h", sourceId: "s", issueNumber: 4, observedAt: "o" });
    const item = mockSend.mock.calls[0][0].input.Item;
    expect(item).toMatchObject({ dedupeKey: "k#v", factHash: "h", sourceId: "s", issueNumber: 4, observedAt: "o" });
    const days = (item.ttl - Date.now() / 1000) / 86400;
    expect(days).toBeGreaterThan(399);
    expect(days).toBeLessThan(401);
  });

  test("putKey writes the key item with the issue and the last version", async () => {
    mockSend.mockResolvedValue({});
    await putKey({ key: "k", issueNumber: 4, lastVersion: "v" });
    expect(mockSend.mock.calls[0][0].input.Item).toMatchObject({ dedupeKey: "k", issueNumber: 4, lastVersion: "v" });
  });

  test("a missing table name throws", async () => {
    delete process.env.TRUSTED_EVENT_LEDGER_DYNAMODB_TABLE_NAME;
    await expect(getLedgerItem("k")).rejects.toThrow("TRUSTED_EVENT_LEDGER_DYNAMODB_TABLE_NAME");
  });
});
