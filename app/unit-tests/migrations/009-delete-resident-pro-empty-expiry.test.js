// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/migrations/009-delete-resident-pro-empty-expiry.test.js

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync, existsSync } from "node:fs";

const mockDynamoSend = vi.fn();
const mockAthenaSend = vi.fn();

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

vi.mock("@aws-sdk/client-athena", () => ({
  AthenaClient: class {
    send = mockAthenaSend;
  },
  StartQueryExecutionCommand: command("Start"),
  GetQueryExecutionCommand: command("GetExecution"),
  GetQueryResultsCommand: command("GetResults"),
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

import { up, phase, hasEmptyExpiry } from "../../../scripts/migrations/009-delete-resident-pro-empty-expiry.js";

const SUBS = Array.from({ length: 120 }, (_, i) => i.toString(16).padStart(64, "0"));

function athenaAnswers(subs, { state = "SUCCEEDED" } = {}) {
  mockAthenaSend.mockImplementation(async (cmd) => {
    if (cmd.name === "Start") return { QueryExecutionId: "q-1" };
    if (cmd.name === "GetExecution") return { QueryExecution: { Status: { State: state, StateChangeReason: "boom" } } };
    return {
      ResultSet: {
        Rows: [{ Data: [{ VarCharValue: "hashed_sub" }] }, ...subs.map((hashedSub) => ({ Data: [{ VarCharValue: hashedSub }] }))],
      },
    };
  });
}

describe("009-delete-resident-pro-empty-expiry", () => {
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

  test("commits no key list, and the query file names the bundle", () => {
    expect(existsSync("scripts/migrations/008-resident-pro-without-expiry.keys.json")).toBe(false);
    expect(readFileSync("scripts/migrations/008-resident-pro-without-expiry.sql", "utf-8")).toContain("resident-pro");
  });

  test("runs the query file on the prod workgroup and database", async () => {
    athenaAnswers([]);

    await up({ envName: "prod", tableName: "prod-env-bundles" });

    const start = mockAthenaSend.mock.calls.map(([cmd]) => cmd).find((cmd) => cmd.name === "Start");
    expect(start.input.WorkGroup).toBe("prod-env-analytics");
    expect(start.input.QueryExecutionContext).toEqual({ Database: "prod_env_analytics" });
    expect(start.input.QueryString).toBe(readFileSync("scripts/migrations/008-resident-pro-without-expiry.sql", "utf-8"));
  });

  test("fails and deletes nothing when the query fails", async () => {
    athenaAnswers([], { state: "FAILED" });

    await expect(up({ envName: "prod", tableName: "prod-env-bundles" })).rejects.toThrow(/FAILED: boom/);
    expect(mockDynamoSend).not.toHaveBeenCalled();
  });

  test("skips every environment but prod", async () => {
    await up({ envName: "ci", tableName: "ci-env-bundles" });

    expect(mockDynamoSend).not.toHaveBeenCalled();
    expect(mockAthenaSend).not.toHaveBeenCalled();
  });

  test("deletes each key whose row has no expiry, with a condition that it is still absent or empty", async () => {
    athenaAnswers(SUBS);
    mockDynamoSend.mockImplementation(async (cmd) =>
      cmd.name === "Get" ? { Item: { hashedSub: cmd.input.Key.hashedSub, bundleId: "resident-pro" } } : {},
    );

    await up({ envName: "prod", tableName: "prod-env-bundles" });

    const deletes = mockDynamoSend.mock.calls.map(([cmd]) => cmd).filter((cmd) => cmd.name === "Delete");
    expect(deletes).toHaveLength(120);
    expect(deletes[0].input.Key.bundleId).toBe("resident-pro");
    expect(deletes[0].input.ConditionExpression).toBe(
      "attribute_not_exists(expiry) OR attribute_type(expiry, :nullType) OR expiry = :empty",
    );
    expect(deletes[0].input.ExpressionAttributeValues).toEqual({ ":nullType": "NULL", ":empty": "" });
  });

  test("leaves a row that now carries an expiry and one that is already gone", async () => {
    athenaAnswers(SUBS);
    const [withExpiry, gone] = SUBS;
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
    athenaAnswers(SUBS);
    mockDynamoSend.mockImplementation(async (cmd) => {
      if (cmd.name === "Get") return { Item: { hashedSub: cmd.input.Key.hashedSub, bundleId: "resident-pro" } };
      throw Object.assign(new Error("conditional"), { name: "ConditionalCheckFailedException" });
    });

    await expect(up({ envName: "prod", tableName: "prod-env-bundles" })).resolves.toBeUndefined();
  });

  test("dry run deletes nothing", async () => {
    athenaAnswers(SUBS);
    process.env.MIGRATION_DRY_RUN = "true";
    mockDynamoSend.mockImplementation(async (cmd) => ({ Item: { hashedSub: cmd.input.Key.hashedSub, bundleId: "resident-pro" } }));

    await up({ envName: "prod", tableName: "prod-env-bundles" });

    expect(mockDynamoSend.mock.calls.some(([cmd]) => cmd.name === "Delete")).toBe(false);
  });

  describe("which expiry values count as empty", () => {
    test.each([
      ["an empty string", { expiry: "" }, true],
      ["a NULL value", { expiry: null }, true],
      ["a missing attribute", {}, true],
      ["a set timestamp", { expiry: "2027-01-01T00:00:00.000Z" }, false],
    ])("%s", (_name, item, expected) => {
      expect(hasEmptyExpiry(item)).toBe(expected);
    });
  });

  function rowsWithExpiries(items) {
    mockDynamoSend.mockImplementation(async (cmd) =>
      cmd.name === "Get"
        ? { Item: { hashedSub: cmd.input.Key.hashedSub, bundleId: "resident-pro", ...items[cmd.input.Key.hashedSub] } }
        : {},
    );
  }

  test("deletes rows holding an empty-string, NULL or missing expiry and leaves a set one", async () => {
    const [emptyString, nullValue, missing, set] = SUBS;
    athenaAnswers([emptyString, nullValue, missing, set]);
    rowsWithExpiries({
      [emptyString]: { expiry: "" },
      [nullValue]: { expiry: null },
      [missing]: {},
      [set]: { expiry: "2027-01-01T00:00:00.000Z" },
    });

    await up({ envName: "prod", tableName: "prod-env-bundles" });

    const deleted = mockDynamoSend.mock.calls
      .map(([cmd]) => cmd)
      .filter((cmd) => cmd.name === "Delete")
      .map((cmd) => cmd.input.Key.hashedSub);
    expect(deleted).toEqual([emptyString, nullValue, missing]);
  });

  test("dry run counts the same rows the real run deletes", async () => {
    const [emptyString, nullValue, missing, set] = SUBS;
    athenaAnswers([emptyString, nullValue, missing, set]);
    rowsWithExpiries({
      [emptyString]: { expiry: "" },
      [nullValue]: { expiry: null },
      [missing]: {},
      [set]: { expiry: "2027-01-01T00:00:00.000Z" },
    });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    process.env.MIGRATION_DRY_RUN = "true";
    await up({ envName: "prod", tableName: "prod-env-bundles" });
    process.env.MIGRATION_DRY_RUN = "false";
    await up({ envName: "prod", tableName: "prod-env-bundles" });

    const summaries = log.mock.calls.map(([line]) => String(line)).filter((line) => line.includes("prod-env-bundles:"));
    log.mockRestore();
    expect(summaries[0]).toContain("would delete 3");
    expect(summaries[1]).toContain("deleted 3");
  });
});
