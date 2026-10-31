// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, vi, beforeEach } from "vitest";

const mockSend = vi.fn();
const dynamoDbModule = {
  PutCommand: class PutCommand {
    constructor(params) {
      this.params = params;
    }
  },
  BatchGetCommand: class BatchGetCommand {
    constructor(params) {
      this.params = params;
    }
  },
};
vi.mock("@app/lib/dynamoDbClient.js", () => ({
  executeDynamoDbCommand: (commandBuilder) => mockSend(commandBuilder(dynamoDbModule)),
  getResourceName: (envVarName) => process.env[envVarName] || "",
}));

const { getPassFigures, putPassFigures } = await import("@app/data/dynamoDbPassRepository.js");

describe("data/dynamoDbPassRepository - figures items", () => {
  beforeEach(() => {
    mockSend.mockReset();
    process.env.PASSES_DYNAMODB_TABLE_NAME = "test-passes";
  });

  test("getPassFigures reads by key in batches of 100 and maps the items by code", async () => {
    const codes = Array.from({ length: 150 }, (_, index) => `code-${index}`);
    mockSend.mockImplementation(async (command) => {
      const keys = command.params.RequestItems["test-passes"].Keys;
      return {
        Responses: { "test-passes": keys.slice(0, 1).map((key) => ({ pk: key.pk, code: key.pk.slice("figures#".length), uses: 1 })) },
      };
    });

    const figuresByCode = await getPassFigures(codes);

    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(mockSend.mock.calls[0][0].params.RequestItems["test-passes"].Keys).toHaveLength(100);
    expect(mockSend.mock.calls[0][0].params.RequestItems["test-passes"].Keys[0]).toEqual({ pk: "figures#code-0" });
    expect(figuresByCode.get("code-0")).toMatchObject({ uses: 1 });
    expect(figuresByCode.get("code-100")).toMatchObject({ uses: 1 });
  });

  test("getPassFigures asks again for unprocessed keys", async () => {
    mockSend
      .mockResolvedValueOnce({
        Responses: { "test-passes": [{ pk: "figures#a", code: "a" }] },
        UnprocessedKeys: { "test-passes": { Keys: [{ pk: "figures#b" }] } },
      })
      .mockResolvedValueOnce({ Responses: { "test-passes": [{ pk: "figures#b", code: "b" }] } });

    const figuresByCode = await getPassFigures(["a", "b"]);

    expect(mockSend.mock.calls[1][0].params.RequestItems["test-passes"].Keys).toEqual([{ pk: "figures#b" }]);
    expect([...figuresByCode.keys()]).toEqual(["a", "b"]);
  });

  test("getPassFigures with no codes makes no call", async () => {
    expect((await getPassFigures([])).size).toBe(0);
    expect(mockSend).not.toHaveBeenCalled();
  });

  test("putPassFigures keys the item by code and sets no issuer", async () => {
    mockSend.mockResolvedValue({});
    await putPassFigures({ code: "a", uses: 5, newAccounts: 3, filed: 2, subscribers: 1, paidCharges: 4, lastUsed: "t", computedAt: "u" });
    const item = mockSend.mock.calls[0][0].params.Item;
    expect(item).toEqual({
      pk: "figures#a",
      code: "a",
      uses: 5,
      newAccounts: 3,
      filed: 2,
      subscribers: 1,
      paidCharges: 4,
      lastUsed: "t",
      computedAt: "u",
    });
    expect(item.issuedBy).toBeUndefined();
  });
});
