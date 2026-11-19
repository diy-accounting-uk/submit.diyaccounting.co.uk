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
const mockUpdateCommand = vi.fn();

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
  UpdateCommand: class UpdateCommand {
    constructor(params) {
      mockUpdateCommand(params);
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
  subHashCandidates: vi.fn((sub) => [{ version: "v1", hashedSub: `hashed-${sub}` }]),
}));

const { putReceipt, putReceiptIfNew, listUserReceipts, findReceiptForSubmission, markReceiptStepDone, clearReceiptStep } =
  await import("@app/data/dynamoDbReceiptRepository.js");
const { subHashCandidates } = await import("@app/services/subHasher.js");

describe("data/dynamoDbReceiptRepository", () => {
  beforeEach(() => {
    mockSend.mockReset();
    mockPutCommand.mockClear();
    mockGetCommand.mockClear();
    mockQueryCommand.mockClear();
    mockUpdateCommand.mockClear();
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

  describe("putReceiptIfNew", () => {
    test("stores the receipt only when none is stored under its id, and answers the hash it is stored under", async () => {
      expect(await putReceiptIfNew("user-sub", "receipt-1", { formBundleNumber: "FB1" }, "customer")).toBe("hashed-user-sub");

      expect(mockPutCommand.mock.calls[0][0].ConditionExpression).toBe("attribute_not_exists(receiptId)");
    });

    test("leaves a receipt already stored under its id as it is and says so", async () => {
      mockSend.mockRejectedValueOnce(
        Object.assign(new Error("The conditional request failed"), { name: "ConditionalCheckFailedException" }),
      );

      expect(await putReceiptIfNew("user-sub", "receipt-1", { formBundleNumber: "FB1" }, "customer")).toBeNull();
    });

    test("a write that fails for another reason fails the caller", async () => {
      mockSend.mockRejectedValueOnce(Object.assign(new Error("throttled"), { name: "ProvisionedThroughputExceededException" }));

      await expect(putReceiptIfNew("user-sub", "receipt-1", { formBundleNumber: "FB1" }, "customer")).rejects.toThrow("throttled");
    });

    test("putReceipt writes without a condition", async () => {
      await putReceipt("user-sub", "receipt-1", { formBundleNumber: "FB1" }, "customer");

      expect(mockPutCommand.mock.calls[0][0].ConditionExpression).toBeUndefined();
    });
  });

  describe("findReceiptForSubmission", () => {
    const SENT_AT = "2026-03-01T10:00:00.000Z";

    test("reads only the receipts stored since the submission was sent, and finds the one ending with its number", async () => {
      mockSend.mockResolvedValueOnce({
        Items: [
          { receiptId: "2026-03-01T10:05:00.000Z-00001B" },
          { receiptId: "2026-03-02T08:00:00.000Z-00001A", emailRequestedAt: SENT_AT },
        ],
      });

      expect(await findReceiptForSubmission("user-sub", "00001A", SENT_AT)).toEqual({
        receiptId: "2026-03-02T08:00:00.000Z-00001A",
        emailRequestedAt: SENT_AT,
        hashedSub: "hashed-user-sub",
      });
      const query = mockQueryCommand.mock.calls[0][0];
      expect(query.KeyConditionExpression).toBe("hashedSub = :hashedSub AND receiptId >= :sentAt");
      expect(query.ExpressionAttributeValues).toEqual({ ":hashedSub": "hashed-user-sub", ":sentAt": SENT_AT });
    });

    test("does not take a submission number that only ends the same way", async () => {
      mockSend.mockResolvedValue({ Items: [{ receiptId: "2026-03-02T08:00:00.000Z-100001A" }] });

      expect(await findReceiptForSubmission("user-sub", "00001A", SENT_AT)).toBeNull();
    });

    test("reads every page of every salt version until it finds the receipt", async () => {
      subHashCandidates.mockReturnValueOnce([
        { version: "v1", hashedSub: "hashed-user-sub" },
        { version: "v0", hashedSub: "hashed-v0-user-sub" },
      ]);
      mockSend
        .mockResolvedValueOnce({ Items: [], LastEvaluatedKey: { receiptId: "k" } })
        .mockResolvedValueOnce({ Items: [] })
        .mockResolvedValueOnce({ Items: [{ receiptId: "2026-03-02T08:00:00.000Z-00001A" }] });

      expect(await findReceiptForSubmission("user-sub", "00001A", SENT_AT)).toMatchObject({ hashedSub: "hashed-v0-user-sub" });
      expect(mockQueryCommand).toHaveBeenCalledTimes(3);
      expect(mockQueryCommand.mock.calls[1][0].ExclusiveStartKey).toEqual({ receiptId: "k" });
    });
  });

  describe("markReceiptStepDone", () => {
    test("records a step on a stored receipt only when it is not recorded", async () => {
      const recordedAt = await markReceiptStepDone("hashed-user-sub", "receipt-1", "tokenChargedAt");

      expect(recordedAt).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/);

      const update = mockUpdateCommand.mock.calls[0][0];
      expect(update.Key).toEqual({ hashedSub: "hashed-user-sub", receiptId: "receipt-1" });
      expect(update.ConditionExpression).toBe("attribute_exists(receiptId) AND attribute_not_exists(#step)");
      expect(update.ExpressionAttributeNames).toEqual({ "#step": "tokenChargedAt" });
    });

    test("answers false for a step already recorded", async () => {
      mockSend.mockRejectedValueOnce(
        Object.assign(new Error("The conditional request failed"), { name: "ConditionalCheckFailedException" }),
      );

      expect(await markReceiptStepDone("hashed-user-sub", "receipt-1", "emailRequestedAt")).toBeNull();
    });
  });

  describe("clearReceiptStep", () => {
    test("removes a step only while it holds the time the caller recorded", async () => {
      expect(await clearReceiptStep("hashed-user-sub", "receipt-1", "tokenChargedAt", "2026-11-19T10:00:00.000Z")).toBe(true);

      const update = mockUpdateCommand.mock.calls[0][0];
      expect(update.UpdateExpression).toBe("REMOVE #step");
      expect(update.ConditionExpression).toBe("#step = :recordedAt");
      expect(update.ExpressionAttributeValues).toEqual({ ":recordedAt": "2026-11-19T10:00:00.000Z" });
    });

    test("answers false when the step holds another time", async () => {
      mockSend.mockRejectedValueOnce(
        Object.assign(new Error("The conditional request failed"), { name: "ConditionalCheckFailedException" }),
      );

      expect(await clearReceiptStep("hashed-user-sub", "receipt-1", "tokenChargedAt", "2026-11-19T10:00:00.000Z")).toBe(false);
    });
  });

  describe("putReceipt ttl", () => {
    const SEVEN_YEARS_SECONDS = 2555 * 86400;
    const TWO_DAYS_SECONDS = 2 * 86400;
    const ttlSpan = () => {
      const item = mockPutCommand.mock.calls[0][0].Item;
      return item.ttl - Math.floor(new Date(item.createdAt).getTime() / 1000);
    };

    test("a customer filing keeps the 7-year ttl", async () => {
      await putReceipt("real-sub", "receipt-1", { formBundleNumber: "FB1" }, "customer");

      expect(ttlSpan()).toBe(SEVEN_YEARS_SECONDS);
    });

    test.each(["test-user", "probe"])("a %s filing gets a 2-day ttl", async (actor) => {
      await putReceipt("test-sub", "receipt-1", { formBundleNumber: "FB1" }, actor);

      expect(ttlSpan()).toBe(TWO_DAYS_SECONDS);
    });

    test("a test actor filing gets a 2-day ttl in any flow", async () => {
      await putReceipt("test-sub", "receipt-1", { formBundleNumber: "FB1" }, "test-user");

      expect(ttlSpan()).toBe(TWO_DAYS_SECONDS);
    });

    test.each([undefined, null, "", "system", "operator"])("an actor of %s keeps the 7-year ttl", async (actor) => {
      await putReceipt("unknown-sub", "receipt-1", { formBundleNumber: "FB1" }, actor);

      expect(ttlSpan()).toBe(SEVEN_YEARS_SECONDS);
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

    test("reads every page of the query, so the newest receipt of a long list is not lost", async () => {
      const lastKeyOfPageOne = { hashedSub: "hashed-practice-sub", receiptId: "2026-01-01T00:00:00.000Z-FB1" };
      mockSend.mockResolvedValueOnce({ Items: [items[0]], Count: 1, LastEvaluatedKey: lastKeyOfPageOne }).mockResolvedValueOnce({
        Items: [{ hashedSub: "hashed-practice-sub", receiptId: "2026-01-04T00:00:00.000Z-FB4", createdAt: "2026-01-04T00:00:00.000Z" }],
        Count: 1,
      });

      const receipts = await listUserReceipts("practice-sub");

      expect(receipts.map((receipt) => receipt.receiptId)).toEqual(["2026-01-04T00:00:00.000Z-FB4", "2026-01-01T00:00:00.000Z-FB1"]);
      expect(mockQueryCommand.mock.calls.map(([params]) => params.ExclusiveStartKey)).toEqual([undefined, lastKeyOfPageOne]);
    });

    test("with a client id, returns only that client's receipts", async () => {
      mockSend.mockResolvedValueOnce({ Items: items });

      const receipts = await listUserReceipts("practice-sub", "client-1");

      expect(receipts.map((receipt) => receipt.receiptId)).toEqual(["2026-01-02T00:00:00.000Z-FB2"]);
      expect(receipts[0].clientId).toBe("client-1");
    });

    test("each receipt carries the long period of its return, or null", async () => {
      const longPeriod = {
        filingId: "0b8f3a52-6f1e-4c8e-9a47-5d2f7c1e4b10",
        part: 1,
        parts: 2,
        periodOfAccountStart: "2025-01-01",
        periodOfAccountEnd: "2026-03-31",
      };
      mockSend.mockResolvedValueOnce({
        Items: [
          {
            hashedSub: "h",
            receiptId: "2026-01-01T00:00:00.000Z-FB1",
            createdAt: "2026-01-01T00:00:00.000Z",
            receipt: { kind: "company-tax-return", longPeriod },
          },
          {
            hashedSub: "h",
            receiptId: "2026-01-02T00:00:00.000Z-FB2",
            createdAt: "2026-01-02T00:00:00.000Z",
            receipt: { kind: "company-tax-return" },
          },
        ],
      });

      const receipts = await listUserReceipts("practice-sub");

      expect(receipts.map((receipt) => receipt.longPeriod)).toEqual([null, longPeriod]);
    });

    test("each receipt carries the byte size of its stored record, whatever its kind", async () => {
      const vatReceipt = { formBundleNumber: "FB1" };
      const ctReceipt = { kind: "company-tax-return", formBundleNumber: "FB2", figures: { turnover: 1000 } };
      mockSend.mockResolvedValueOnce({
        Items: [
          { hashedSub: "h", receiptId: "2026-01-01T00:00:00.000Z-FB1", createdAt: "2026-01-01T00:00:00.000Z", receipt: vatReceipt },
          { hashedSub: "h", receiptId: "2026-01-02T00:00:00.000Z-FB2", createdAt: "2026-01-02T00:00:00.000Z", receipt: ctReceipt },
        ],
      });

      const receipts = await listUserReceipts("practice-sub");

      const byId = Object.fromEntries(receipts.map((receipt) => [receipt.receiptId, receipt.size]));
      expect(byId["2026-01-01T00:00:00.000Z-FB1"]).toBe(Buffer.byteLength(JSON.stringify(vatReceipt)));
      expect(byId["2026-01-02T00:00:00.000Z-FB2"]).toBe(Buffer.byteLength(JSON.stringify(ctReceipt)));
    });

    test("a client id matching no receipt returns an empty list, never another client's", async () => {
      mockSend.mockResolvedValueOnce({ Items: items });

      const receipts = await listUserReceipts("practice-sub", "client-unknown");

      expect(receipts).toEqual([]);
    });
  });
});
