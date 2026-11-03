// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/migrations/008-delete-resident-pro-without-expiry.test.js

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";

const mockDynamoSend = vi.fn();

vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: class {
    constructor() {}
  },
}));

vi.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: { from: () => ({ send: mockDynamoSend }) },
  GetCommand: class {
    constructor(input) {
      this.name = "Get";
      this.input = input;
    }
  },
  DeleteCommand: class {
    constructor(input) {
      this.name = "Delete";
      this.input = input;
    }
  },
}));

import { up, phase } from "../../../scripts/migrations/008-delete-resident-pro-without-expiry.js";

const keyFile = JSON.parse(readFileSync("scripts/migrations/008-resident-pro-without-expiry.keys.json", "utf-8"));

describe("008-delete-resident-pro-without-expiry", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test("runs post-deploy", () => {
    expect(phase).toBe("post-deploy");
  });

  test("the key file holds 120 distinct resident-pro keys and the query that produced them", () => {
    expect(keyFile.bundleId).toBe("resident-pro");
    expect(keyFile.hashedSubs).toHaveLength(120);
    expect(new Set(keyFile.hashedSubs).size).toBe(120);
    for (const key of keyFile.hashedSubs) expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(readFileSync("scripts/migrations/008-resident-pro-without-expiry.sql", "utf-8")).toContain("resident-pro");
  });

  test("skips every environment but prod", async () => {
    await up({ envName: "ci", tableName: "ci-env-bundles" });

    expect(mockDynamoSend).not.toHaveBeenCalled();
  });

  test("deletes each key whose row has no expiry, with a condition that it still has none", async () => {
    mockDynamoSend.mockImplementation(async (cmd) =>
      cmd.name === "Get" ? { Item: { hashedSub: cmd.input.Key.hashedSub, bundleId: "resident-pro" } } : {},
    );

    await up({ envName: "prod", tableName: "prod-env-bundles" });

    const deletes = mockDynamoSend.mock.calls.map(([cmd]) => cmd).filter((cmd) => cmd.name === "Delete");
    expect(deletes).toHaveLength(120);
    expect(deletes[0].input.Key.bundleId).toBe("resident-pro");
    expect(deletes[0].input.ConditionExpression).toBe("attribute_not_exists(expiry)");
  });

  test("leaves a row that now carries an expiry and one that is already gone", async () => {
    const [withExpiry, gone] = keyFile.hashedSubs;
    mockDynamoSend.mockImplementation(async (cmd) => {
      if (cmd.name !== "Get") return {};
      const { hashedSub } = cmd.input.Key;
      if (hashedSub === gone) return {};
      if (hashedSub === withExpiry) return { Item: { hashedSub, bundleId: "resident-pro", expiry: "2027-01-01T00:00:00.000Z" } };
      return { Item: { hashedSub, bundleId: "resident-pro" } };
    });

    await up({ envName: "prod", tableName: "prod-env-bundles" });

    const deleted = mockDynamoSend.mock.calls
      .map(([cmd]) => cmd)
      .filter((cmd) => cmd.name === "Delete")
      .map((cmd) => cmd.input.Key.hashedSub);
    expect(deleted).toHaveLength(118);
    expect(deleted).not.toContain(withExpiry);
    expect(deleted).not.toContain(gone);
  });

  test("a delete refused by the condition is left, not raised", async () => {
    mockDynamoSend.mockImplementation(async (cmd) => {
      if (cmd.name === "Get") return { Item: { hashedSub: cmd.input.Key.hashedSub, bundleId: "resident-pro" } };
      throw Object.assign(new Error("conditional"), { name: "ConditionalCheckFailedException" });
    });

    await expect(up({ envName: "prod", tableName: "prod-env-bundles" })).resolves.toBeUndefined();
  });

  test("dry run deletes nothing", async () => {
    process.env.MIGRATION_DRY_RUN = "true";
    mockDynamoSend.mockImplementation(async (cmd) => ({ Item: { hashedSub: cmd.input.Key.hashedSub, bundleId: "resident-pro" } }));

    await up({ envName: "prod", tableName: "prod-env-bundles" });

    expect(mockDynamoSend.mock.calls.some(([cmd]) => cmd.name === "Delete")).toBe(false);
  });
});
