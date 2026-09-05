// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/unit-tests/migrations/005-copy-sandbox-qualifier-to-synthetic.test.js

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

const mockDynamoSend = vi.fn();

vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: class {
    constructor() {}
  },
}));

vi.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: { from: () => ({ send: mockDynamoSend }) },
  ScanCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
  UpdateCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
}));

import { up, phase } from "../../../scripts/migrations/005-copy-sandbox-qualifier-to-synthetic.js";

describe("005-copy-sandbox-qualifier-to-synthetic", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test("runs pre-deploy", () => {
    expect(phase).toBe("pre-deploy");
  });

  test("dry run counts matches, logs the first ten keys, and writes nothing", async () => {
    process.env.MIGRATION_DRY_RUN = "true";

    const items = Array.from({ length: 12 }, (_, i) => ({
      hashedSub: `hash-${i}`,
      bundleId: "resident-pro",
      qualifiers: { sandbox: i % 2 === 0 },
    }));

    mockDynamoSend.mockResolvedValueOnce({ Items: items });

    await up({ envName: "ci", tableName: "ci-env-bundles" });

    // Only the ScanCommand — no UpdateCommand issued in dry run
    expect(mockDynamoSend).toHaveBeenCalledTimes(1);
    const scanInput = mockDynamoSend.mock.calls[0][0].input;
    expect(scanInput.TableName).toBe("ci-env-bundles");
    expect(scanInput.FilterExpression).toContain("attribute_exists(qualifiers.sandbox)");
    expect(scanInput.FilterExpression).toContain("attribute_not_exists(qualifiers.synthetic)");
    expect(scanInput.FilterExpression).toContain('NOT begins_with(hashedSub, :system)');
  });

  test("real run copies qualifiers.sandbox onto qualifiers.synthetic, keyed by hashedSub and bundleId", async () => {
    delete process.env.MIGRATION_DRY_RUN;

    mockDynamoSend.mockResolvedValueOnce({
      Items: [
        { hashedSub: "hash-a", bundleId: "resident-pro", qualifiers: { sandbox: true } },
        { hashedSub: "hash-b", bundleId: "resident-pro", qualifiers: { sandbox: false } },
      ],
    });
    mockDynamoSend.mockResolvedValueOnce({}); // UpdateCommand for hash-a
    mockDynamoSend.mockResolvedValueOnce({}); // UpdateCommand for hash-b

    await up({ envName: "ci", tableName: "ci-env-bundles" });

    expect(mockDynamoSend).toHaveBeenCalledTimes(3);

    const firstUpdate = mockDynamoSend.mock.calls[1][0].input;
    expect(firstUpdate.TableName).toBe("ci-env-bundles");
    expect(firstUpdate.Key).toEqual({ hashedSub: "hash-a", bundleId: "resident-pro" });
    expect(firstUpdate.UpdateExpression).toBe("SET qualifiers.synthetic = :v");
    expect(firstUpdate.ExpressionAttributeValues[":v"]).toBe(true);
    expect(firstUpdate.ConditionExpression).toBe("attribute_not_exists(qualifiers.synthetic)");

    const secondUpdate = mockDynamoSend.mock.calls[2][0].input;
    expect(secondUpdate.Key).toEqual({ hashedSub: "hash-b", bundleId: "resident-pro" });
    expect(secondUpdate.ExpressionAttributeValues[":v"]).toBe(false);
  });

  test("pages through ScanCommand results via LastEvaluatedKey", async () => {
    delete process.env.MIGRATION_DRY_RUN;

    mockDynamoSend.mockResolvedValueOnce({
      Items: [{ hashedSub: "hash-a", bundleId: "resident-pro", qualifiers: { sandbox: true } }],
      LastEvaluatedKey: { hashedSub: "hash-a", bundleId: "resident-pro" },
    });
    mockDynamoSend.mockResolvedValueOnce({}); // UpdateCommand for hash-a
    mockDynamoSend.mockResolvedValueOnce({
      Items: [{ hashedSub: "hash-b", bundleId: "resident-pro", qualifiers: { sandbox: true } }],
    });
    mockDynamoSend.mockResolvedValueOnce({}); // UpdateCommand for hash-b

    await up({ envName: "ci", tableName: "ci-env-bundles" });

    expect(mockDynamoSend).toHaveBeenCalledTimes(4);
    const secondScan = mockDynamoSend.mock.calls[2][0].input;
    expect(secondScan.ExclusiveStartKey).toEqual({ hashedSub: "hash-a", bundleId: "resident-pro" });
  });

  test("falls back to the environment's default table name when none is passed", async () => {
    delete process.env.MIGRATION_DRY_RUN;
    delete process.env.BUNDLE_DYNAMODB_TABLE_NAME;

    mockDynamoSend.mockResolvedValueOnce({ Items: [] });

    await up({ envName: "ci" });

    const scanInput = mockDynamoSend.mock.calls[0][0].input;
    expect(scanInput.TableName).toBe("ci-env-bundles");
  });
});
