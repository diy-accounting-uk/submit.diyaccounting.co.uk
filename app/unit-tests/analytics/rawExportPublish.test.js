// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

const mockAthenaSend = vi.fn();
vi.mock("@aws-sdk/client-athena", () => ({
  AthenaClient: class {
    send(...args) {
      return mockAthenaSend(...args);
    }
  },
  StartQueryExecutionCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
  GetQueryExecutionCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
  GetQueryResultsCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
}));

const mockS3Send = vi.fn();
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    send(...args) {
      return mockS3Send(...args);
    }
  },
  PutObjectCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
}));

import {
  handler,
  defaultTargetDate,
  pollUntilTerminal,
  parseResultSet,
  runAthenaQuery,
  csvField,
  toCsv,
  toObjects,
  VIEW_NAMES,
  OBJECTIVES,
} from "@app/functions/analytics/rawExportPublish.js";

function varchar(value) {
  return { VarCharValue: value };
}

function resultSetOf(header, rows) {
  return {
    Rows: [{ Data: header.map(varchar) }, ...rows.map((row) => ({ Data: row.map(varchar) }))],
  };
}

function mockAllQueriesSucceedEmpty() {
  mockAthenaSend.mockImplementation((command) => {
    switch (command.constructor.name) {
      case "StartQueryExecutionCommand":
        return Promise.resolve({ QueryExecutionId: "qid" });
      case "GetQueryExecutionCommand":
        return Promise.resolve({ QueryExecution: { Status: { State: "SUCCEEDED" } } });
      case "GetQueryResultsCommand":
        return Promise.resolve({ ResultSet: { Rows: [] } });
      default:
        throw new Error(`unexpected command ${command.constructor.name}`);
    }
  });
}

describe("rawExportPublish", () => {
  beforeEach(() => {
    mockAthenaSend.mockReset();
    mockS3Send.mockReset();
    mockS3Send.mockResolvedValue({});

    process.env.ENVIRONMENT_NAME = "test";
    process.env.ATHENA_WORK_GROUP_NAME = "test-workgroup";
    process.env.GLUE_DATABASE_NAME = "test_env_analytics";
    process.env.ANALYTICS_LAKE_BUCKET_NAME = "test-lake";
    process.env.ATHENA_POLL_INTERVAL_MS = "0";
  });

  afterEach(() => {
    delete process.env.ENVIRONMENT_NAME;
    delete process.env.ATHENA_WORK_GROUP_NAME;
    delete process.env.GLUE_DATABASE_NAME;
    delete process.env.ANALYTICS_LAKE_BUCKET_NAME;
    delete process.env.ATHENA_POLL_INTERVAL_MS;
  });

  test("defaultTargetDate returns yesterday in UTC", () => {
    const now = new Date();
    const expected = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1))
      .toISOString()
      .slice(0, 10);
    expect(defaultTargetDate()).toBe(expected);
  });

  test("csvField quotes only values carrying a comma, quote or newline", () => {
    expect(csvField("plain")).toBe("plain");
    expect(csvField(null)).toBe("");
    expect(csvField("a,b")).toBe('"a,b"');
    expect(csvField('a"b')).toBe('"a""b"');
    expect(csvField("a\nb")).toBe('"a\nb"');
  });

  test("toCsv renders the header first, then one line per row", () => {
    const csv = toCsv(["day", "count"], [["2026-09-01", "3"], ["2026-09-02", null]]);
    expect(csv).toBe("day,count\n2026-09-01,3\n2026-09-02,\n");
  });

  test("toObjects zips the header onto every row", () => {
    const objects = toObjects({ header: ["day", "count"], rows: [["2026-09-01", "3"]] });
    expect(objects).toEqual([{ day: "2026-09-01", count: "3" }]);
  });

  test("parseResultSet returns an empty header and rows for an empty result set", () => {
    expect(parseResultSet({ Rows: [] })).toEqual({ header: [], rows: [] });
  });

  test("parseResultSet splits the header row from the data rows", () => {
    const result = parseResultSet(resultSetOf(["day", "count"], [["2026-09-01", "3"]]));
    expect(result).toEqual({ header: ["day", "count"], rows: [["2026-09-01", "3"]] });
  });

  test("runAthenaQuery starts, polls to success and returns the parsed result", async () => {
    mockAthenaSend.mockImplementation((command) => {
      switch (command.constructor.name) {
        case "StartQueryExecutionCommand":
          return Promise.resolve({ QueryExecutionId: "qid-1" });
        case "GetQueryExecutionCommand":
          return Promise.resolve({ QueryExecution: { Status: { State: "SUCCEEDED" } } });
        case "GetQueryResultsCommand":
          return Promise.resolve({ ResultSet: resultSetOf(["day"], [["2026-09-01"]]) });
        default:
          throw new Error(`unexpected command ${command.constructor.name}`);
      }
    });

    const result = await runAthenaQuery({ workGroup: "wg", database: "db", sql: "SELECT 1" });
    expect(result).toEqual({ header: ["day"], rows: [["2026-09-01"]] });
  });

  test("pollUntilTerminal throws on FAILED with the state change reason", async () => {
    const athenaClient = {
      send: vi.fn().mockResolvedValue({
        QueryExecution: { Status: { State: "FAILED", StateChangeReason: "syntax error" } },
      }),
    };
    await expect(pollUntilTerminal(athenaClient, "qid")).rejects.toThrow("syntax error");
  });

  test("handler writes one CSV object per view and one JSON object per objective", async () => {
    mockAllQueriesSucceedEmpty();

    const result = await handler({ date: "2026-09-05" });

    expect(result).toEqual({
      date: "2026-09-05",
      viewsExported: VIEW_NAMES.length,
      objectivesExported: OBJECTIVES.length,
    });

    const putCalls = mockS3Send.mock.calls.map((call) => call[0].input);
    const csvKeys = putCalls.filter((input) => input.Key.endsWith(".csv")).map((input) => input.Key);
    const jsonKeys = putCalls.filter((input) => input.Key.endsWith(".json")).map((input) => input.Key);

    expect(csvKeys).toHaveLength(VIEW_NAMES.length);
    expect(jsonKeys).toHaveLength(OBJECTIVES.length);
    expect(csvKeys).toContain("exports/test/2026-09-05/v_active_users_daily.csv");
    for (const input of putCalls) {
      expect(input.Bucket).toBe("test-lake");
      expect(input.Key.startsWith("exports/test/2026-09-05/")).toBe(true);
    }
  });

  test("handler throws when a required environment variable is missing", async () => {
    delete process.env.ANALYTICS_LAKE_BUCKET_NAME;
    await expect(handler({ date: "2026-09-05" })).rejects.toThrow("ANALYTICS_LAKE_BUCKET_NAME");
  });

  test("every objective names only views present in VIEW_NAMES", () => {
    for (const { views } of OBJECTIVES) {
      for (const viewName of views) {
        expect(VIEW_NAMES).toContain(viewName);
      }
    }
  });
});
