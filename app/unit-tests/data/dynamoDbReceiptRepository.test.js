// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/data/dynamoDbReceiptRepository.test.js

import { describe, test, expect, vi, beforeEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const mockSend = vi.fn();
const mockPutCommand = vi.fn();
const mockGetCommand = vi.fn();
const mockQueryCommand = vi.fn();

const dynamoDbModule = {
  PutCommand: class PutCommand {
    constructor(params) {
      mockPutCommand(params);
      this.params = params;
    }
  },
  GetCommand: class GetCommand {
    constructor(params) {
      mockGetCommand(params);
      this.params = params;
    }
  },
  QueryCommand: class QueryCommand {
    constructor(params) {
      mockQueryCommand(params);
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
  getResourceName: (envVarName) => process.env[envVarName] || "",
}));

vi.mock("@app/services/subHasher.js", () => ({
  hashSub: vi.fn((sub) => `hashed-${sub}`),
  hashSubWithVersion: vi.fn((sub, version) => `hashed-${version}-${sub}`),
  getSaltVersion: vi.fn(() => "v1"),
  getPreviousVersions: vi.fn(() => []),
}));

const { putReceipt, listUserReceipts } = await import("@app/data/dynamoDbReceiptRepository.js");

describe("data/dynamoDbReceiptRepository", () => {
  beforeEach(() => {
    mockSend.mockReset();
    mockPutCommand.mockClear();
    mockGetCommand.mockClear();
    mockQueryCommand.mockClear();
    mockSend.mockResolvedValue({});
    process.env.RECEIPTS_DYNAMODB_TABLE_NAME = "test-receipts-table";
  });

  describe("putReceipt", () => {
    test("carries the client id onto the stored item for a client-scoped filing", async () => {
      await putReceipt("practice-sub", "receipt-1", { formBundleNumber: "FB1" }, "customer", "client-1");

      expect(mockPutCommand.mock.calls[0][0].Item.clientId).toBe("client-1");
    });

    test("omits the client id for the practice's own filing", async () => {
      await putReceipt("practice-sub", "receipt-1", { formBundleNumber: "FB1" }, "customer");

      expect(mockPutCommand.mock.calls[0][0].Item.clientId).toBeUndefined();
    });
  });

  describe("listUserReceipts", () => {
    const items = [
      { hashedSub: "hashed-practice-sub", receiptId: "2026-01-01T00:00:00.000Z-FB1", createdAt: "2026-01-01T00:00:00.000Z" },
      {
        hashedSub: "hashed-practice-sub",
        receiptId: "2026-01-02T00:00:00.000Z-FB2",
        createdAt: "2026-01-02T00:00:00.000Z",
        clientId: "client-1",
      },
      {
        hashedSub: "hashed-practice-sub",
        receiptId: "2026-01-03T00:00:00.000Z-FB3",
        createdAt: "2026-01-03T00:00:00.000Z",
        clientId: "client-2",
      },
    ];

    test("with no client id, returns only the caller's own receipts (no client id)", async () => {
      mockSend.mockResolvedValueOnce({ Items: items });

      const receipts = await listUserReceipts("practice-sub");

      expect(receipts.map((receipt) => receipt.receiptId)).toEqual(["2026-01-01T00:00:00.000Z-FB1"]);
      expect(receipts[0].clientId).toBeNull();
    });

    test("with a client id, returns only that client's receipts", async () => {
      mockSend.mockResolvedValueOnce({ Items: items });

      const receipts = await listUserReceipts("practice-sub", "client-1");

      expect(receipts.map((receipt) => receipt.receiptId)).toEqual(["2026-01-02T00:00:00.000Z-FB2"]);
      expect(receipts[0].clientId).toBe("client-1");
    });

    test("a client id matching no receipt returns an empty list, never another client's", async () => {
      mockSend.mockResolvedValueOnce({ Items: items });

      const receipts = await listUserReceipts("practice-sub", "client-unknown");

      expect(receipts).toEqual([]);
    });
  });
});
