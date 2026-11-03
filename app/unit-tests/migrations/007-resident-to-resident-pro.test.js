// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/migrations/007-resident-to-resident-pro.test.js

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

const mockDynamoSend = vi.fn();

vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: class {
    constructor() {}
  },
}));

function command(name) {
  return class {
    constructor(input) {
      this.name = name;
      this.input = input;
    }
  };
}

vi.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: { from: () => ({ send: mockDynamoSend }) },
  QueryCommand: command("Query"),
  GetCommand: command("Get"),
  PutCommand: command("Put"),
  UpdateCommand: command("Update"),
  DeleteCommand: command("Delete"),
}));

import { up, phase } from "../../../scripts/migrations/007-resident-to-resident-pro.js";

const table = "prod-env-bundles";

// Answers each command from a fake table keyed "hashedSub|bundleId" and records the writes.
function fakeTable(rows) {
  const writes = [];
  mockDynamoSend.mockImplementation(async (cmd) => {
    const { input } = cmd;
    if (cmd.name === "Query") {
      const items = rows
        .filter((r) => r.bundleId === input.ExpressionAttributeValues[":bundleId"])
        .map((r) => ({ hashedSub: r.hashedSub, bundleId: r.bundleId }));
      return { Items: items };
    }
    if (cmd.name === "Get") {
      return { Item: rows.find((r) => r.hashedSub === input.Key.hashedSub && r.bundleId === input.Key.bundleId) };
    }
    writes.push(cmd);
    return {};
  });
  return writes;
}

describe("007-resident-to-resident-pro", () => {
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

  test("moves a resident row to resident-pro with 100 tokens, then deletes the resident row", async () => {
    const writes = fakeTable([
      {
        hashedSub: "a",
        bundleId: "resident",
        expiry: "2027-10-01T00:00:00.000Z",
        ttl: 1,
        tokensGranted: 100,
        tokensConsumed: 40,
        stripeSubscriptionId: "sub_1",
      },
    ]);

    await up({ envName: "prod", tableName: table });

    const put = writes.find((w) => w.name === "Put");
    expect(put.input.Item).toMatchObject({
      hashedSub: "a",
      bundleId: "resident-pro",
      expiry: "2027-10-01T00:00:00.000Z",
      tokensGranted: 100,
      tokensConsumed: 0,
      stripeSubscriptionId: "sub_1",
    });
    expect(Date.parse(put.input.Item.tokenResetAt)).toBeGreaterThan(Date.now());
    const del = writes.find((w) => w.name === "Delete");
    expect(del.input.Key).toEqual({ hashedSub: "a", bundleId: "resident" });
  });

  test("keeps the later expiry when the account already holds resident-pro, and deletes the resident row", async () => {
    const writes = fakeTable([
      { hashedSub: "a", bundleId: "resident", expiry: "2027-10-01T00:00:00.000Z", ttl: 9, ttl_datestamp: "x" },
      { hashedSub: "a", bundleId: "resident-pro", expiry: "2027-01-01T00:00:00.000Z", tokensGranted: 100 },
    ]);

    await up({ envName: "prod", tableName: table });

    expect(writes.some((w) => w.name === "Put")).toBe(false);
    const update = writes.find((w) => w.name === "Update");
    expect(update.input.Key).toEqual({ hashedSub: "a", bundleId: "resident-pro" });
    expect(update.input.ExpressionAttributeValues[":expiry"]).toBe("2027-10-01T00:00:00.000Z");
    expect(writes.find((w) => w.name === "Delete").input.Key).toEqual({ hashedSub: "a", bundleId: "resident" });
  });

  test("leaves the expiry of an existing resident-pro row that is later", async () => {
    const writes = fakeTable([
      { hashedSub: "a", bundleId: "resident", expiry: "2027-01-01T00:00:00.000Z" },
      { hashedSub: "a", bundleId: "resident-pro", expiry: "2028-01-01T00:00:00.000Z", tokensGranted: 100 },
    ]);

    await up({ envName: "prod", tableName: table });

    expect(writes.filter((w) => w.name === "Update")).toHaveLength(0);
    expect(writes.filter((w) => w.name === "Delete")).toHaveLength(1);
  });

  test("gives a resident-pro row with the unlimited grant 100 tokens", async () => {
    const writes = fakeTable([
      { hashedSub: "b", bundleId: "resident-pro", expiry: "2027-01-01T00:00:00.000Z", tokensGranted: "unlimited" },
    ]);

    await up({ envName: "prod", tableName: table });

    const update = writes.find((w) => w.name === "Update");
    expect(update.input.Key).toEqual({ hashedSub: "b", bundleId: "resident-pro" });
    expect(update.input.ExpressionAttributeValues[":granted"]).toBe(100);
  });

  test("leaves a resident-pro row that already has 100 tokens", async () => {
    const writes = fakeTable([{ hashedSub: "b", bundleId: "resident-pro", expiry: "2027-01-01T00:00:00.000Z", tokensGranted: 100 }]);

    await up({ envName: "prod", tableName: table });

    expect(writes).toHaveLength(0);
  });

  test("reads only through the bundleId-expiry-index", async () => {
    fakeTable([]);

    await up({ envName: "ci", tableName: "ci-env-bundles" });

    const queries = mockDynamoSend.mock.calls.map(([cmd]) => cmd).filter((cmd) => cmd.name === "Query");
    expect(queries.length).toBeGreaterThan(0);
    for (const q of queries) expect(q.input.IndexName).toBe("bundleId-expiry-index");
    expect(mockDynamoSend.mock.calls.some(([cmd]) => cmd.name === "Scan")).toBe(false);
  });

  test("dry run counts and writes nothing", async () => {
    process.env.MIGRATION_DRY_RUN = "true";
    const writes = fakeTable([
      { hashedSub: "a", bundleId: "resident", expiry: "2027-10-01T00:00:00.000Z" },
      { hashedSub: "b", bundleId: "resident-pro", expiry: "2027-01-01T00:00:00.000Z", tokensGranted: "unlimited" },
    ]);

    await up({ envName: "prod", tableName: table });

    expect(writes).toHaveLength(0);
  });
});
