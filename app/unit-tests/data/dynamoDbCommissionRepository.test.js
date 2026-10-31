// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, vi, beforeEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const mockSend = vi.fn();
const command = (name) =>
  class {
    constructor(params) {
      this.name = name;
      this.params = params;
    }
  };
const dynamoDbModule = {
  GetCommand: command("Get"),
  PutCommand: command("Put"),
  UpdateCommand: command("Update"),
  DeleteCommand: command("Delete"),
  QueryCommand: command("Query"),
  TransactWriteCommand: command("TransactWrite"),
};
vi.mock("@app/lib/dynamoDbClient.js", () => ({
  executeDynamoDbCommand: (commandBuilder) => mockSend(commandBuilder(dynamoDbModule)),
  getResourceName: (envVarName) => process.env[envVarName] || "",
}));

const repo = await import("@app/data/dynamoDbCommissionRepository.js");

const cancelled = (...codes) =>
  Object.assign(new Error("cancelled"), { name: "TransactionCanceledException", CancellationReasons: codes.map((Code) => ({ Code })) });

const heldLine = {
  pk: "commission#ref-1",
  sk: "line#in_1",
  invoiceId: "in_1",
  amountPence: 300,
  releaseAt: "2026-02-01T00:00:00.000Z",
};

beforeEach(() => {
  mockSend.mockReset();
  mockSend.mockResolvedValue({});
});

describe("data/dynamoDbCommissionRepository", () => {
  test("getLine reads the line key in the commissions table", async () => {
    mockSend.mockResolvedValue({ Item: heldLine });
    expect(await repo.getLine("ref-1", "in_1")).toEqual(heldLine);
    const params = mockSend.mock.calls[0][0].params;
    expect(params.TableName).toBe("test-commissions-table");
    expect(params.Key).toEqual({ pk: "commission#ref-1", sk: "line#in_1" });
  });

  test("getChargePointer reads the charge pointer", async () => {
    await repo.getChargePointer("ch_1");
    expect(mockSend.mock.calls[0][0].params.Key).toEqual({ pk: "charge#ch_1", sk: "line" });
  });

  test("putAnchorWithConversion writes the anchor if absent and counts the conversion", async () => {
    const wrote = await repo.putAnchorWithConversion({
      referrerHash: "ref-1",
      redeemerHash: "red-1",
      anchor: { tier: "customer" },
      referralCode: "code-1",
      day: "2026-01-01",
    });
    expect(wrote).toBe(true);
    const [put, update] = mockSend.mock.calls[0][0].params.TransactItems;
    expect(put.Put.Item).toEqual({ pk: "commission#ref-1", sk: "redeemer#red-1", tier: "customer" });
    expect(put.Put.ConditionExpression).toBe("attribute_not_exists(pk)");
    expect(update.Update.Key).toEqual({ pk: "commission#ref-1", sk: "conversions#code-1#2026-01-01" });
    expect(update.Update.UpdateExpression).toBe("ADD conversions :one");
  });

  test("putAnchorWithConversion returns false when the transaction is cancelled", async () => {
    mockSend.mockRejectedValue(cancelled("ConditionalCheckFailed", "None"));
    expect(
      await repo.putAnchorWithConversion({ referrerHash: "r", redeemerHash: "d", anchor: {}, referralCode: "c", day: "2026-01-01" }),
    ).toBe(false);
  });

  test("putLineWithPointers writes the line, charge pointer and held pointer", async () => {
    const wrote = await repo.putLineWithPointers({ ...heldLine, referrerHash: "ref-1", chargeId: "ch_1", state: "held" });
    expect(wrote).toBe(true);
    const items = mockSend.mock.calls[0][0].params.TransactItems;
    expect(items).toHaveLength(3);
    expect(items[0].Put.Item.pk).toBe("commission#ref-1");
    expect(items[0].Put.Item.referrerHash).toBeUndefined();
    expect(items[0].Put.ConditionExpression).toBe("attribute_not_exists(pk)");
    expect(items[1].Put.Item).toEqual({ pk: "charge#ch_1", sk: "line", linePk: "commission#ref-1", lineSk: "line#in_1" });
    expect(items[2].Put.Item).toEqual({
      pk: "held",
      sk: "2026-02-01T00:00:00.000Z#ref-1#in_1",
      linePk: "commission#ref-1",
      lineSk: "line#in_1",
    });
  });

  test("putLineWithPointers writes no held pointer for a reversed line", async () => {
    await repo.putLineWithPointers({ ...heldLine, referrerHash: "ref-1", chargeId: "ch_1", state: "reversed" });
    expect(mockSend.mock.calls[0][0].params.TransactItems).toHaveLength(2);
  });

  test("putLineWithPointers treats a failed line condition as already recorded", async () => {
    mockSend.mockRejectedValue(cancelled("ConditionalCheckFailed", "None", "None"));
    expect(await repo.putLineWithPointers({ ...heldLine, referrerHash: "ref-1", chargeId: "ch_1", state: "held" })).toBe(false);
  });

  test("putLineWithPointers rethrows any other failure", async () => {
    mockSend.mockRejectedValue(new Error("boom"));
    await expect(repo.putLineWithPointers({ ...heldLine, referrerHash: "ref-1", chargeId: "ch_1", state: "held" })).rejects.toThrow("boom");
  });

  test("putCardPayer keeps the first sighting", async () => {
    await repo.putCardPayer("fp_1", "hash-1", "2026-01-01T00:00:00.000Z");
    const params = mockSend.mock.calls[0][0].params;
    expect(params.Key).toEqual({ pk: "card#fp_1", sk: "payer#hash-1" });
    expect(params.UpdateExpression).toContain("if_not_exists(firstSeenAt");
  });

  test("queryDueHeldPointers queries the held partition up to now and follows pages", async () => {
    mockSend
      .mockResolvedValueOnce({ Items: [{ sk: "a" }], LastEvaluatedKey: { pk: "held", sk: "a" } })
      .mockResolvedValueOnce({ Items: [{ sk: "b" }] });
    const items = await repo.queryDueHeldPointers("2026-02-01T00:00:00.000Z");
    expect(items.map((i) => i.sk)).toEqual(["a", "b"]);
    const first = mockSend.mock.calls[0][0].params;
    expect(first.KeyConditionExpression).toBe("pk = :held AND sk <= :upper");
    expect(first.ExpressionAttributeValues).toEqual({ ":held": "held", ":upper": "2026-02-01T00:00:00.000Z~" });
    expect(mockSend.mock.calls[1][0].params.ExclusiveStartKey).toEqual({ pk: "held", sk: "a" });
  });

  test("deleteHeldPointer deletes by held key", async () => {
    await repo.deleteHeldPointer("sk-1");
    expect(mockSend.mock.calls[0][0].params.Key).toEqual({ pk: "held", sk: "sk-1" });
  });

  test("queryConversions and queryCardPayers use their key prefixes", async () => {
    mockSend.mockResolvedValue({ Items: [] });
    await repo.queryConversions("ref-1", "code-1");
    await repo.queryCardPayers("fp_1");
    expect(mockSend.mock.calls[0][0].params.ExpressionAttributeValues).toEqual({
      ":pk": "commission#ref-1",
      ":prefix": "conversions#code-1#",
    });
    expect(mockSend.mock.calls[1][0].params.ExpressionAttributeValues).toEqual({ ":pk": "card#fp_1" });
  });

  test("setHoldReasons needs the line to be held and returns false when it is not", async () => {
    expect(await repo.setHoldReasons(heldLine, ["volume"], "now")).toBe(true);
    expect(mockSend.mock.calls[0][0].params.ConditionExpression).toBe("#state = :held");
    mockSend.mockRejectedValue(Object.assign(new Error("x"), { name: "ConditionalCheckFailedException" }));
    expect(await repo.setHoldReasons(heldLine, ["volume"], "now")).toBe(false);
  });

  test("releaseLine moves the line, deletes the pointer and adds to each total with its cap", async () => {
    const result = await repo.releaseLine(heldLine, {
      now: "2026-02-02T00:00:00.000Z",
      payableMonth: "2026-02",
      payableTaxYear: "2025-26",
      totals: [
        { sk: "totals#month#2026-02", field: "cashPence", cap: 10000 },
        { sk: "totals#credit", field: "creditPence", cap: null },
      ],
    });
    expect(result).toEqual({ released: true });
    const items = mockSend.mock.calls[0][0].params.TransactItems;
    expect(items[0].Update.ConditionExpression).toBe("#state = :held");
    expect(items[0].Update.UpdateExpression).toContain("REMOVE holdReasons");
    expect(items[1].Delete.Key).toEqual({ pk: "held", sk: "2026-02-01T00:00:00.000Z#ref-1#in_1" });
    expect(items[2].Update.ConditionExpression).toBe("attribute_not_exists(cashPence) OR cashPence <= :capMinusAmt");
    expect(items[2].Update.ExpressionAttributeValues).toEqual({ ":amt": 300, ":capMinusAmt": 9700 });
    expect(items[3].Update.ConditionExpression).toBeUndefined();
  });

  test("releaseLine maps a cancelled total to its index in the totals list", async () => {
    mockSend.mockRejectedValue(cancelled("None", "None", "None", "ConditionalCheckFailed"));
    const result = await repo.releaseLine(heldLine, {
      now: "n",
      payableMonth: "m",
      payableTaxYear: "t",
      totals: [
        { sk: "a", field: "cashPence", cap: 1 },
        { sk: "b", field: "cashPence", cap: 1 },
      ],
    });
    expect(result).toEqual({ released: false, cancelledIndex: 3, totalsIndex: 1 });
  });

  test("releaseLine reports the line itself when index zero is cancelled", async () => {
    mockSend.mockRejectedValue(cancelled("ConditionalCheckFailed", "None"));
    const result = await repo.releaseLine(heldLine, { now: "n", payableMonth: "m", payableTaxYear: "t", totals: [] });
    expect(result.totalsIndex).toBe(-1);
  });

  test("reverseHeldLine conditions on held and deletes the pointer", async () => {
    expect(await repo.reverseHeldLine(heldLine, { reason: "refund", now: "n" })).toBe(true);
    const items = mockSend.mock.calls[0][0].params.TransactItems;
    expect(items[0].Update.ConditionExpression).toBe("#state = :held");
    expect(items[1].Delete.Key.pk).toBe("held");
  });

  test("reverseHeldLine returns false when the line changed", async () => {
    mockSend.mockRejectedValue(cancelled("ConditionalCheckFailed", "None"));
    expect(await repo.reverseHeldLine(heldLine, { reason: "refund", now: "n" })).toBe(false);
  });

  test("reversePayableLine conditions on payable and subtracts the amount from each total", async () => {
    await repo.reversePayableLine(heldLine, { reason: "refund", now: "n", totals: [{ sk: "totals#credit", field: "creditPence" }] });
    const items = mockSend.mock.calls[0][0].params.TransactItems;
    expect(items[0].Update.ExpressionAttributeValues[":payable"]).toBe("payable");
    expect(items[1].Update.ExpressionAttributeValues).toEqual({ ":amt": -300 });
  });

  test("putReversalLine refuses to overwrite and returns false when it exists", async () => {
    expect(await repo.putReversalLine({ pk: "p", sk: "s" })).toBe(true);
    expect(mockSend.mock.calls[0][0].params.ConditionExpression).toBe("attribute_not_exists(pk)");
    mockSend.mockRejectedValue(Object.assign(new Error("x"), { name: "ConditionalCheckFailedException" }));
    expect(await repo.putReversalLine({ pk: "p", sk: "s" })).toBe(false);
  });
});
