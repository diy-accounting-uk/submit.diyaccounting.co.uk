// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, vi, beforeEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const mockExecute = vi.fn();
vi.mock("@app/lib/dynamoDbClient.js", () => ({
  executeDynamoDbCommand: (...args) => mockExecute(...args),
  getResourceName: (name) => `resolved-${name}`,
}));

const { getBundlesByHashedSub, ACCOUNT_SETTINGS_ITEM_ID } = await import("@app/data/dynamoDbBundleRepository.js");

const module = {
  QueryCommand: class QueryCommand {
    constructor(input) {
      this.input = input;
    }
  },
};

describe("dynamoDbBundleRepository.getBundlesByHashedSub", () => {
  beforeEach(() => {
    mockExecute.mockReset();
  });

  test("queries the partition of the hashed sub and leaves out the account settings item", async () => {
    mockExecute.mockImplementationOnce(async (build) => {
      const command = build(module);
      expect(command.input.TableName).toBe("resolved-BUNDLE_DYNAMODB_TABLE_NAME");
      expect(command.input.KeyConditionExpression).toBe("hashedSub = :hashedSub");
      expect(command.input.ExpressionAttributeValues).toEqual({ ":hashedSub": "hash1" });
      return { Items: [{ bundleId: "resident" }, { bundleId: ACCOUNT_SETTINGS_ITEM_ID }] };
    });
    expect(await getBundlesByHashedSub("hash1")).toEqual([{ bundleId: "resident" }]);
  });

  test("follows the last evaluated key across pages", async () => {
    mockExecute
      .mockImplementationOnce(async () => ({ Items: [{ bundleId: "a" }], LastEvaluatedKey: { hashedSub: "hash1", bundleId: "a" } }))
      .mockImplementationOnce(async (build) => {
        expect(build(module).input.ExclusiveStartKey).toEqual({ hashedSub: "hash1", bundleId: "a" });
        return { Items: [{ bundleId: "b" }] };
      });
    expect(await getBundlesByHashedSub("hash1")).toEqual([{ bundleId: "a" }, { bundleId: "b" }]);
    expect(mockExecute).toHaveBeenCalledTimes(2);
  });

  test("returns an empty list when the account has no items", async () => {
    mockExecute.mockResolvedValueOnce({});
    expect(await getBundlesByHashedSub("hash1")).toEqual([]);
  });
});
