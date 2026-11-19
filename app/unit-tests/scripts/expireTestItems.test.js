// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/expireTestItems.test.js

import { describe, test, expect } from "vitest";
import { GetQueryExecutionCommand, GetQueryResultsCommand, StartQueryExecutionCommand } from "@aws-sdk/client-athena";
import { QueryCommand, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

import { parseArgs, buildTestKeysSql, findKeys, expireItem, scanPassKeys, runExpireTestItems } from "../../../scripts/expire-test-items.js";

const NOW = new Date("2026-03-01T12:00:00.000Z");
const TWO_DAYS_LATER = Math.floor(NOW.getTime() / 1000) + 2 * 86400;

function athenaReturning(header, rows) {
  const calls = [];
  return {
    calls,
    send: async (command) => {
      calls.push(command);
      if (command instanceof StartQueryExecutionCommand) return { QueryExecutionId: "q1" };
      if (command instanceof GetQueryExecutionCommand) return { QueryExecution: { Status: { State: "SUCCEEDED" } } };
      if (command instanceof GetQueryResultsCommand) {
        const toRow = (values) => ({ Data: values.map((value) => (value === null ? {} : { VarCharValue: value })) });
        return { ResultSet: { Rows: [toRow(header), ...rows.map(toRow)] } };
      }
      throw new Error(`unexpected athena command ${command.constructor.name}`);
    },
  };
}

function dynamoWith({ queryItems = () => [], scanPages = [], failKeys = [] } = {}) {
  const calls = [];
  return {
    calls,
    send: async (command) => {
      calls.push(command);
      if (command instanceof QueryCommand) return { Items: queryItems(command.input) };
      if (command instanceof ScanCommand) {
        const index = command.input.ExclusiveStartKey ? command.input.ExclusiveStartKey.page : 0;
        const page = scanPages[index] ?? { Items: [], ScannedCount: 0 };
        return index + 1 < scanPages.length ? { ...page, LastEvaluatedKey: { page: index + 1 } } : page;
      }
      if (command instanceof UpdateCommand) {
        if (failKeys.includes(JSON.stringify(command.input.Key))) {
          const error = new Error("The conditional request failed");
          error.name = "ConditionalCheckFailedException";
          throw error;
        }
        return {};
      }
      throw new Error(`unexpected dynamo command ${command.constructor.name}`);
    },
  };
}

const quiet = () => {};

describe("parseArgs", () => {
  test("reads the environment, the table and apply", () => {
    expect(parseArgs(["--environment", "ci", "--table", "passes", "--apply"])).toEqual({
      environment: "ci",
      table: "passes",
      apply: true,
      scan: false,
    });
  });

  test("is a dry run without apply", () => {
    expect(parseArgs(["--environment", "prod", "--table", "receipts"]).apply).toBe(false);
  });

  test("refuses an unknown environment or table", () => {
    expect(() => parseArgs(["--environment", "dev", "--table", "receipts"])).toThrow(/environment/);
    expect(() => parseArgs(["--environment", "ci", "--table", "commissions"])).toThrow(/table/);
    expect(() => parseArgs(["--environment", "ci", "--table", "receipts", "--force"])).toThrow(/unknown argument/);
  });

  test("reads scan with the passes table", () => {
    expect(parseArgs(["--environment", "prod", "--table", "passes", "--scan"]).scan).toBe(true);
  });

  test("refuses scan with any table other than passes", () => {
    for (const table of ["receipts", "bundles", "subscriptions"]) {
      expect(() => parseArgs(["--environment", "ci", "--table", table, "--scan"])).toThrow(/--scan is valid only with --table passes/);
    }
  });
});

describe("buildTestKeysSql", () => {
  test("reads the raw source so each key keeps the hash stored on the item", () => {
    const sql = buildTestKeysSql("receipts");
    expect(sql).toContain("FROM   dynamo_receipts");
    expect(sql).not.toContain("aliased_");
    expect(sql).not.toContain("hash_aliases");
  });

  test("keeps the newest change of each item when it is not a REMOVE and its actor is a test actor", () => {
    const sql = buildTestKeysSql("bundles");
    expect(sql).toContain("PARTITION BY hashed_sub, bundle_id ORDER BY change_ts DESC");
    expect(sql).toContain("i.newest = 1 AND i.change_type <> 'REMOVE' AND i.actor IN ('test-user', 'probe')");
  });

  test("selects the issuer and creation time of a pass, which find its key", () => {
    const sql = buildTestKeysSql("passes");
    expect(sql).toMatch(/^SELECT pass_id, issued_by, created_at\n/);
    expect(sql).toContain("PARTITION BY pass_id");
  });
});

describe("findKeys", () => {
  test("maps receipt, bundle and subscription rows to their item keys", async () => {
    const dynamo = dynamoWith();
    const receipts = await findKeys({ dynamo, environment: "ci", table: "receipts", rows: [{ hashed_sub: "h1", receipt_id: "r1" }] });
    expect(receipts).toEqual({ keys: [{ hashedSub: "h1", receiptId: "r1" }], unresolved: 0 });
    const bundles = await findKeys({ dynamo, environment: "ci", table: "bundles", rows: [{ hashed_sub: "h1", bundle_id: "day-guest" }] });
    expect(bundles.keys).toEqual([{ hashedSub: "h1", bundleId: "day-guest" }]);
    const subscriptions = await findKeys({ dynamo, environment: "ci", table: "subscriptions", rows: [{ subscription_id: "sub_1" }] });
    expect(subscriptions.keys).toEqual([{ pk: "stripe#sub_1" }]);
    expect(dynamo.calls).toHaveLength(0);
  });

  test("finds a pass key with a Query on the issuer index, keeping test passes only", async () => {
    const dynamo = dynamoWith({
      queryItems: (input) =>
        input.ExpressionAttributeValues[":issuedBy"] === "issuer1"
          ? [
              { pk: "pass#one-two-three-four", actor: "test-user" },
              { pk: "pass#five-six-seven-eight", actor: "customer" },
              { pk: "held#x", actor: "test-user" },
            ]
          : [],
    });
    const rows = [
      { pass_id: "p1", issued_by: "issuer1", created_at: "2026-02-01T10:00:00.000Z" },
      { pass_id: "p2", issued_by: "issuer2", created_at: "2026-02-02T10:00:00.000Z" },
      { pass_id: "p3", issued_by: null, created_at: "2026-02-03T10:00:00.000Z" },
    ];
    const result = await findKeys({ dynamo, environment: "prod", table: "passes", rows });
    expect(result).toEqual({ keys: [{ pk: "pass#one-two-three-four" }], unresolved: 2 });
    expect(dynamo.calls).toHaveLength(2);
    const query = dynamo.calls[0].input;
    expect(query.TableName).toBe("prod-env-passes");
    expect(query.IndexName).toBe("issuedBy-index");
    expect(query.KeyConditionExpression).toBe("issuedBy = :issuedBy AND createdAt = :createdAt");
    expect(query.ExpressionAttributeValues).toEqual({ ":issuedBy": "issuer1", ":createdAt": "2026-02-01T10:00:00.000Z" });
  });
});

describe("expireItem", () => {
  test("sets the two-day ttl on condition that the stored actor is still a test actor", async () => {
    const dynamo = dynamoWith();
    expect(await expireItem(dynamo, "ci-env-receipts", { hashedSub: "h1", receiptId: "r1" }, NOW)).toBe(true);
    const input = dynamo.calls[0].input;
    expect(input.TableName).toBe("ci-env-receipts");
    expect(input.Key).toEqual({ hashedSub: "h1", receiptId: "r1" });
    expect(input.ConditionExpression).toBe("#actor IN (:testUser, :probe)");
    expect(input.ExpressionAttributeNames["#actor"]).toBe("actor");
    expect(input.ExpressionAttributeNames["#ttl"]).toBe("ttl");
    expect(input.ExpressionAttributeValues[":ttl"]).toBe(TWO_DAYS_LATER);
    expect(input.ExpressionAttributeValues[":testUser"]).toBe("test-user");
    expect(input.ExpressionAttributeValues[":probe"]).toBe("probe");
  });

  test("leaves an item alone when the condition fails", async () => {
    const key = { pk: "stripe#sub_1" };
    const dynamo = dynamoWith({ failKeys: [JSON.stringify(key)] });
    expect(await expireItem(dynamo, "ci-env-subscriptions", key, NOW)).toBe(false);
  });

  test("throws any other error", async () => {
    const dynamo = {
      send: async () => {
        throw Object.assign(new Error("throttled"), { name: "ProvisionedThroughputExceededException" });
      },
    };
    await expect(expireItem(dynamo, "ci-env-receipts", { hashedSub: "h", receiptId: "r" }, NOW)).rejects.toThrow("throttled");
  });
});

describe("runExpireTestItems", () => {
  const receiptRows = Array.from({ length: 7 }, (_, index) => [`h${index}`, `r${index}`]);

  test("a dry run queries the environment's lake, prints the count and five keys, and writes nothing", async () => {
    const athena = athenaReturning(["hashed_sub", "receipt_id"], receiptRows);
    const dynamo = dynamoWith();
    const lines = [];
    const result = await runExpireTestItems({
      environment: "prod",
      table: "receipts",
      apply: false,
      athena,
      dynamo,
      now: NOW,
      log: (line) => lines.push(line),
    });
    expect(result).toMatchObject({ table: "prod-env-receipts", lakeRows: 7, keys: 7, updated: 0, skipped: 0 });
    expect(result.sample).toHaveLength(5);
    expect(lines[0]).toBe("prod-env-receipts: 7 lake rows, 7 keys");
    expect(lines.filter((line) => line.startsWith("  {"))).toHaveLength(5);
    expect(dynamo.calls).toHaveLength(0);
    const start = athena.calls[0].input;
    expect(start.WorkGroup).toBe("prod-env-analytics");
    expect(start.QueryExecutionContext.Database).toBe("prod_env_analytics");
    expect(start.QueryString).toBe(buildTestKeysSql("receipts"));
  });

  test("apply updates each key and counts the items whose condition failed", async () => {
    const athena = athenaReturning(["hashed_sub", "receipt_id"], receiptRows);
    const dynamo = dynamoWith({ failKeys: [JSON.stringify({ hashedSub: "h2", receiptId: "r2" })] });
    const result = await runExpireTestItems({ environment: "ci", table: "receipts", apply: true, athena, dynamo, now: NOW, log: quiet });
    expect(result).toMatchObject({ keys: 7, updated: 6, skipped: 1 });
    expect(dynamo.calls.every((command) => command instanceof UpdateCommand)).toBe(true);
    expect(dynamo.calls.map((command) => command.input.TableName)).toEqual(Array(7).fill("ci-env-receipts"));
  });

  test("a failed lake query stops the run before any write", async () => {
    const athena = {
      send: async (command) => {
        if (command instanceof StartQueryExecutionCommand) return { QueryExecutionId: "q1" };
        return { QueryExecution: { Status: { State: "FAILED", StateChangeReason: "TABLE_NOT_FOUND" } } };
      },
    };
    const dynamo = dynamoWith();
    await expect(
      runExpireTestItems({ environment: "ci", table: "bundles", apply: true, athena, dynamo, now: NOW, log: quiet }),
    ).rejects.toThrow(/FAILED: TABLE_NOT_FOUND/);
    expect(dynamo.calls).toHaveLength(0);
  });
});

describe("scan of the passes table", () => {
  const firstPage = { Items: [{ pk: "pass#one-two-three-four", actor: "test-user" }], ScannedCount: 500 };
  const secondPage = { Items: [{ pk: "pass#five-six-seven-eight", actor: "probe" }], ScannedCount: 120 };

  test("asks for test pass items only and reads only pk and actor", async () => {
    const dynamo = dynamoWith({ scanPages: [firstPage] });
    await scanPassKeys(dynamo, "prod-env-passes");
    const [scan] = dynamo.calls;
    expect(scan).toBeInstanceOf(ScanCommand);
    expect(scan.input).toMatchObject({
      TableName: "prod-env-passes",
      FilterExpression: "begins_with(pk, :pass) AND #actor IN (:testUser, :probe)",
      ProjectionExpression: "pk, #actor",
      ExpressionAttributeNames: { "#actor": "actor" },
      ExpressionAttributeValues: { ":pass": "pass#", ":testUser": "test-user", ":probe": "probe" },
    });
    expect(scan.input.Limit).toBeGreaterThan(0);
  });

  test("follows every page and returns each pass key", async () => {
    const dynamo = dynamoWith({ scanPages: [firstPage, secondPage] });
    const result = await scanPassKeys(dynamo, "ci-env-passes");
    expect(result).toEqual({ keys: [{ pk: "pass#one-two-three-four" }, { pk: "pass#five-six-seven-eight" }], scanned: 620 });
    expect(dynamo.calls).toHaveLength(2);
    expect(dynamo.calls[1].input.ExclusiveStartKey).toEqual({ page: 1 });
  });

  test("a dry run with scan reads no lake, prints the count and keys, and writes nothing", async () => {
    const athena = athenaReturning([], []);
    const dynamo = dynamoWith({ scanPages: [firstPage, secondPage] });
    const lines = [];
    const result = await runExpireTestItems({
      environment: "prod",
      table: "passes",
      apply: false,
      scan: true,
      athena,
      dynamo,
      now: NOW,
      log: (line) => lines.push(line),
    });
    expect(athena.calls).toHaveLength(0);
    expect(result).toMatchObject({ table: "prod-env-passes", lakeRows: null, scanned: 620, keys: 2, updated: 0, skipped: 0 });
    expect(lines[0]).toBe("prod-env-passes: Scan read 620 items, 2 test pass keys");
    expect(dynamo.calls.every((command) => command instanceof ScanCommand)).toBe(true);
  });

  test("apply sends each scan-found key through the conditional update on actor", async () => {
    const dynamo = dynamoWith({
      scanPages: [firstPage, secondPage],
      failKeys: [JSON.stringify({ pk: "pass#five-six-seven-eight" })],
    });
    const result = await runExpireTestItems({
      environment: "ci",
      table: "passes",
      apply: true,
      scan: true,
      athena: athenaReturning([], []),
      dynamo,
      now: NOW,
      log: quiet,
    });
    expect(result).toMatchObject({ keys: 2, updated: 1, skipped: 1 });
    const updates = dynamo.calls.filter((command) => command instanceof UpdateCommand);
    expect(updates.map((command) => command.input.Key)).toEqual([{ pk: "pass#one-two-three-four" }, { pk: "pass#five-six-seven-eight" }]);
    for (const update of updates) {
      expect(update.input.TableName).toBe("ci-env-passes");
      expect(update.input.ConditionExpression).toBe("#actor IN (:testUser, :probe)");
      expect(update.input.ExpressionAttributeValues[":ttl"]).toBe(TWO_DAYS_LATER);
    }
  });

  test("scan with a table other than passes is refused before anything is read", async () => {
    const athena = athenaReturning([], []);
    const dynamo = dynamoWith();
    await expect(
      runExpireTestItems({ environment: "ci", table: "receipts", apply: true, scan: true, athena, dynamo, now: NOW, log: quiet }),
    ).rejects.toThrow(/--scan is valid only with --table passes/);
    expect(athena.calls).toHaveLength(0);
    expect(dynamo.calls).toHaveLength(0);
  });

  test("without scan no Scan is sent, for passes or any other table", async () => {
    for (const table of ["receipts", "bundles", "subscriptions", "passes"]) {
      const header =
        table === "passes" ? ["pass_id", "issued_by", "created_at"] : ["hashed_sub", "receipt_id", "bundle_id", "subscription_id"];
      const row = table === "passes" ? ["p1", "issuer1", "2026-02-01T10:00:00.000Z"] : ["h1", "r1", "b1", "sub_1"];
      const dynamo = dynamoWith({ queryItems: () => [{ pk: "pass#one-two-three-four", actor: "test-user" }] });
      await runExpireTestItems({
        environment: "ci",
        table,
        apply: true,
        athena: athenaReturning(header, [row]),
        dynamo,
        now: NOW,
        log: quiet,
      });
      expect(dynamo.calls.some((command) => command instanceof ScanCommand)).toBe(false);
      expect(dynamo.calls.length).toBeGreaterThan(0);
    }
  });
});
