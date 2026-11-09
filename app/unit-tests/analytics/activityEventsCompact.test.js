// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

const mockAthenaSend = vi.fn();
const mockGlueSend = vi.fn();
const mockS3Send = vi.fn();

function commandClass(name) {
  return class {
    constructor(input) {
      this.name = name;
      this.input = input;
    }
  };
}

vi.mock("@aws-sdk/client-athena", () => ({
  AthenaClient: class {
    send(...args) {
      return mockAthenaSend(...args);
    }
  },
  StartQueryExecutionCommand: commandClass("StartQueryExecution"),
  GetQueryExecutionCommand: commandClass("GetQueryExecution"),
  GetQueryResultsCommand: commandClass("GetQueryResults"),
}));
vi.mock("@aws-sdk/client-glue", () => ({
  GlueClient: class {
    send(...args) {
      return mockGlueSend(...args);
    }
  },
  GetTableCommand: commandClass("GetTable"),
}));
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    send(...args) {
      return mockS3Send(...args);
    }
  },
  GetObjectCommand: commandClass("GetObject"),
  ListObjectsV2Command: commandClass("ListObjectsV2"),
  PutObjectCommand: commandClass("PutObject"),
}));

import {
  handler,
  newestClosedDay,
  selectDays,
  fingerprintObjects,
  dayRanges,
  buildUnloadSql,
  buildVerifySql,
  buildViewSql,
  assertCopyMatches,
} from "@app/functions/analytics/activityEventsCompact.js";

const BUCKET = "ci-env-analytics-lake-111111111111";
const COLUMNS = ["event_id", "event_ts"];
const RAW_OBJECT = { Key: "curated/activity-events/dt=2026-11-01/a.parquet", ETag: '"a"', Size: 10 };

function resultRows(rows) {
  const header = ["source", "row_count", "row_checksum"];
  const cells = (values) => ({ Data: values.map((value) => ({ VarCharValue: value })) });
  return { ResultSet: { Rows: [cells(header), ...rows.map(cells)] } };
}

/**
 * A lake for the handler to run against. Each list and each query reads this object, so a test
 * states the lake and the job's calls follow from it.
 */
function fakeLake({ rawDays = {}, generations = {}, state = null, verification = null, failUnloadOn = null } = {}) {
  const lake = { puts: [], statements: [], state };

  mockGlueSend.mockImplementation(async () => ({
    Table: { StorageDescriptor: { Columns: COLUMNS.map((Name) => ({ Name })) } },
  }));

  mockS3Send.mockImplementation(async (command) => {
    if (command.name === "GetObject") {
      if (!lake.state) throw Object.assign(new Error("missing"), { name: "NoSuchKey" });
      return { ETag: '"state-1"', Body: { transformToString: async () => JSON.stringify(lake.state) } };
    }
    if (command.name === "PutObject") {
      lake.puts.push(command.input);
      lake.state = JSON.parse(command.input.Body);
      return { ETag: `"state-${lake.puts.length + 1}"` };
    }
    const { Prefix, Delimiter } = command.input;
    if (Prefix === "curated/activity-events/") {
      return { CommonPrefixes: Object.keys(rawDays).map((day) => ({ Prefix: `${Prefix}dt=${day}/` })) };
    }
    if (Prefix.startsWith("curated/activity-events/dt=")) {
      return { Contents: rawDays[Prefix.slice(-11, -1)] };
    }
    expect(Delimiter).toBe("/");
    const day = Prefix.slice(-11, -1);
    return { CommonPrefixes: (generations[day] ?? []).map((generation) => ({ Prefix: `${Prefix}generation=${generation}/` })) };
  });

  const queries = new Map();
  mockAthenaSend.mockImplementation(async (command) => {
    if (command.name === "StartQueryExecution") {
      const id = `q${queries.size}`;
      queries.set(id, command.input.QueryString);
      lake.statements.push(command.input.QueryString);
      return { QueryExecutionId: id };
    }
    const sql = queries.get(command.input.QueryExecutionId);
    if (command.name === "GetQueryExecution") {
      const failed = failUnloadOn && sql.startsWith("UNLOAD") && sql.includes(failUnloadOn);
      return { QueryExecution: { Status: failed ? { State: "FAILED", StateChangeReason: "broken" } : { State: "SUCCEEDED" } } };
    }
    return resultRows(
      verification ?? [
        ["raw", "5", "AB"],
        ["compacted", "5", "AB"],
      ],
    );
  });

  return lake;
}

describe("activityEventsCompact", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-05T02:20:00Z"));
    process.env.ANALYTICS_LAKE_BUCKET_NAME = BUCKET;
    process.env.ATHENA_WORK_GROUP_NAME = "ci-env-analytics";
    process.env.GLUE_DATABASE_NAME = "ci_env_analytics";
    process.env.ATHENA_POLL_INTERVAL_MS = "0";
    mockAthenaSend.mockReset();
    mockGlueSend.mockReset();
    mockS3Send.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("day selection", () => {
    test("the newest closed day is two days back, so today and yesterday stay on raw objects", () => {
      expect(newestClosedDay(new Date("2026-11-05T02:15:00Z"))).toBe("2026-11-03");
    });

    test("takes closed days with no copy, oldest first, and leaves open days out", () => {
      const days = selectDays({
        rawDays: ["2026-11-04", "2026-11-02", "2026-11-03", "2026-11-05"],
        compactedDays: {},
        closedThrough: "2026-11-03",
      });
      expect(days).toEqual(["2026-11-02", "2026-11-03"]);
    });

    test("caps new days at twenty and still rechecks the newest compacted days", () => {
      const rawDays = Array.from({ length: 30 }, (_, index) => `2026-09-${String(index + 1).padStart(2, "0")}`);
      const days = selectDays({ rawDays, compactedDays: { "2026-09-30": {}, "2026-09-01": {} }, closedThrough: "2026-09-30" });
      expect(days).toHaveLength(21);
      expect(days[0]).toBe("2026-09-02");
      expect(days.at(-1)).toBe("2026-09-30");
      expect(days).not.toContain("2026-09-01");
    });
  });

  describe("fingerprintObjects", () => {
    test("ignores list order and changes when an object arrives", () => {
      const second = { Key: "b", ETag: '"b"', Size: 1 };
      expect(fingerprintObjects([RAW_OBJECT, second])).toBe(fingerprintObjects([second, RAW_OBJECT]));
      expect(fingerprintObjects([RAW_OBJECT, second])).not.toBe(fingerprintObjects([RAW_OBJECT]));
    });
  });

  describe("dayRanges", () => {
    test("joins consecutive days, across a month end, and splits at a gap", () => {
      expect(dayRanges(["2026-11-01", "2026-10-31", "2026-11-03"])).toEqual([
        ["2026-10-31", "2026-11-01"],
        ["2026-11-03", "2026-11-03"],
      ]);
    });
  });

  describe("SQL", () => {
    test("the unload writes one day to its own generation as Snappy Parquet, without the partition column", () => {
      const sql = buildUnloadSql({ columns: COLUMNS, bucket: BUCKET, day: "2026-11-01", generation: 2 });
      expect(sql).toContain(`SELECT "event_id", "event_ts" FROM activity_events WHERE dt = DATE '2026-11-01'`);
      expect(sql).toContain(`TO 's3://${BUCKET}/compacted/activity-events/data/dt=2026-11-01/generation=2/'`);
      expect(sql).toContain("format = 'PARQUET', compression = 'SNAPPY'");
    });

    test("a value that is not a day never reaches the SQL", () => {
      expect(() => buildUnloadSql({ columns: COLUMNS, bucket: BUCKET, day: "2026-11-01' OR '1'='1", generation: 1 })).toThrow("Not a day");
    });

    test("the verification reads the raw day and the named generation of the copy", () => {
      const sql = buildVerifySql({ columns: COLUMNS, day: "2026-11-01", generation: 3 });
      expect(sql).toContain(`checksum(ROW("event_id", "event_ts"))`);
      expect(sql).toContain(`FROM activity_events WHERE dt = DATE '2026-11-01'`);
      expect(sql).toContain(`FROM activity_events_compacted WHERE dt = DATE '2026-11-01' AND generation = 3`);
    });

    test("each compacted day appears in exactly one branch, and the raw branch excludes it", () => {
      const sql = buildViewSql({
        columns: COLUMNS,
        compactedDays: { "2026-11-01": { generation: 1 }, "2026-11-02": { generation: 2 }, "2026-11-03": { generation: 1 } },
      });
      expect(sql.startsWith("CREATE OR REPLACE VIEW activity_events_lake AS ")).toBe(true);
      expect(sql).toContain(`FROM activity_events WHERE NOT (dt BETWEEN DATE '2026-11-01' AND DATE '2026-11-03')`);
      expect(sql).toContain(
        `FROM activity_events_compacted WHERE generation = 1 AND (dt BETWEEN DATE '2026-11-01' AND DATE '2026-11-01' OR dt BETWEEN DATE '2026-11-03' AND DATE '2026-11-03')`,
      );
      expect(sql).toContain(`FROM activity_events_compacted WHERE generation = 2 AND (dt BETWEEN DATE '2026-11-02' AND DATE '2026-11-02')`);
      expect(sql.split("UNION ALL")).toHaveLength(3);
    });
  });

  describe("assertCopyMatches", () => {
    const row = (source, row_count, row_checksum) => ({ source, row_count, row_checksum });

    test("returns the count and checksum when both sources agree", () => {
      expect(assertCopyMatches([row("raw", "5", "AB"), row("compacted", "5", "AB")])).toEqual({ rowCount: 5, rowChecksum: "AB" });
    });

    test.each([
      ["a count differs", [row("raw", "5", "AB"), row("compacted", "4", "AB")]],
      ["a checksum differs", [row("raw", "5", "AB"), row("compacted", "5", "CD")]],
      ["the raw day is empty", [row("raw", "0", null), row("compacted", "0", null)]],
      ["a source is missing", [row("raw", "5", "AB")]],
    ])("throws when %s", (_, rows) => {
      expect(() => assertCopyMatches(rows)).toThrow();
    });
  });

  describe("handler", () => {
    const day = "2026-11-01";
    const recorded = (generation = 1) => ({
      [day]: { generation, rawFingerprint: fingerprintObjects([RAW_OBJECT]) },
    });

    test("compacts in order: unload, verify, record the day, replace the view", async () => {
      const lake = fakeLake({ rawDays: { [day]: [RAW_OBJECT], "2026-11-04": [RAW_OBJECT] } });

      const result = await handler();

      expect(result).toEqual({ compacted: [day], compactedDays: 1 });
      expect(lake.statements).toHaveLength(3);
      expect(lake.statements[0]).toMatch(/^UNLOAD/);
      expect(lake.statements[1]).toContain("checksum");
      expect(lake.statements[2]).toMatch(/^CREATE OR REPLACE VIEW/);
      expect(lake.puts).toHaveLength(1);
      expect(lake.puts[0].IfNoneMatch).toBe("*");
      expect(lake.state.compactedDays[day]).toMatchObject({ generation: 1, rawObjects: 1, rowCount: 5, rowChecksum: "AB" });
    });

    test("a re-run over an unchanged day writes nothing new and applies the same view", async () => {
      const lake = fakeLake({ rawDays: { [day]: [RAW_OBJECT] }, state: { compactedDays: recorded() } });

      const result = await handler();

      expect(result).toEqual({ compacted: [], compactedDays: 1 });
      expect(lake.puts).toHaveLength(0);
      expect(lake.statements).toHaveLength(1);
      expect(lake.statements[0]).toMatch(/^CREATE OR REPLACE VIEW/);
    });

    test("a late raw object moves the day to the next generation, under a condition on the state", async () => {
      const late = { Key: "curated/activity-events/dt=2026-11-01/late.parquet", ETag: '"l"', Size: 4 };
      const lake = fakeLake({
        rawDays: { [day]: [RAW_OBJECT, late] },
        generations: { [day]: [1] },
        state: { compactedDays: recorded() },
      });

      await handler();

      expect(lake.statements[0]).toContain("generation=2/");
      expect(lake.puts[0].IfMatch).toBe('"state-1"');
      expect(lake.state.compactedDays[day]).toMatchObject({ generation: 2, rawObjects: 2 });
      expect(lake.statements.at(-1)).toContain("generation = 2");
    });

    test("a changed day whose new copy fails goes back to the raw objects", async () => {
      const late = { Key: "curated/activity-events/dt=2026-11-01/late.parquet", ETag: '"l"', Size: 4 };
      const lake = fakeLake({
        rawDays: { [day]: [RAW_OBJECT, late], "2026-10-31": [RAW_OBJECT] },
        generations: { [day]: [1] },
        state: {
          compactedDays: { ...recorded(), "2026-10-31": { generation: 1, rawFingerprint: fingerprintObjects([RAW_OBJECT]) } },
        },
        failUnloadOn: day,
      });

      await expect(handler()).rejects.toThrow(day);

      expect(Object.keys(lake.state.compactedDays)).toEqual(["2026-10-31"]);
      expect(lake.statements.at(-1)).toContain(`NOT (dt BETWEEN DATE '2026-10-31' AND DATE '2026-10-31')`);
    });

    test("an attempt that left objects behind is never reused", async () => {
      const lake = fakeLake({ rawDays: { [day]: [RAW_OBJECT] }, generations: { [day]: [1, 2] } });

      await handler();

      expect(lake.statements[0]).toContain("generation=3/");
    });

    test("a copy that differs is not recorded, and the view keeps the raw day", async () => {
      const lake = fakeLake({
        rawDays: { [day]: [RAW_OBJECT] },
        verification: [
          ["raw", "5", "AB"],
          ["compacted", "4", "CD"],
        ],
      });

      await expect(handler()).rejects.toThrow("1 days were not compacted: 2026-11-01");

      expect(lake.puts).toHaveLength(0);
      expect(lake.statements.some((sql) => sql.startsWith("CREATE OR REPLACE VIEW"))).toBe(false);
    });

    test("a failed day leaves the other days to finish, and the run still fails", async () => {
      const lake = fakeLake({ rawDays: { "2026-10-31": [RAW_OBJECT], [day]: [RAW_OBJECT] }, failUnloadOn: "2026-10-31" });

      await expect(handler()).rejects.toThrow("2026-10-31");

      expect(Object.keys(lake.state.compactedDays)).toEqual([day]);
      const view = lake.statements.at(-1);
      expect(view).toMatch(/^CREATE OR REPLACE VIEW/);
      expect(view).toContain(`NOT (dt BETWEEN DATE '${day}' AND DATE '${day}')`);
    });

    test("a day with every generation used fails and stays as it is", async () => {
      const lake = fakeLake({
        rawDays: { [day]: [RAW_OBJECT] },
        generations: { [day]: Array.from({ length: 20 }, (_, index) => index + 1) },
      });

      await expect(handler()).rejects.toThrow(day);

      expect(lake.statements).toHaveLength(0);
    });

    test("a raw day that changes during the copy is not recorded", async () => {
      const lake = fakeLake({ rawDays: { [day]: [RAW_OBJECT] } });
      const listRaw = mockS3Send.getMockImplementation();
      let rawLists = 0;
      mockS3Send.mockImplementation(async (command) => {
        if (command.name === "ListObjectsV2" && command.input.Prefix.endsWith(`dt=${day}/`) && command.input.Prefix.startsWith("curated")) {
          rawLists += 1;
          if (rawLists === 2) return { Contents: [RAW_OBJECT, { Key: "late", ETag: '"l"', Size: 1 }] };
        }
        return listRaw(command);
      });

      await expect(handler()).rejects.toThrow(day);

      expect(lake.puts).toHaveLength(0);
    });

    test("with nothing compacted the view stays as deployed", async () => {
      const lake = fakeLake({ rawDays: { "2026-11-04": [RAW_OBJECT] } });

      await handler();

      expect(lake.statements).toHaveLength(0);
    });

    test("issues no delete of any kind", async () => {
      fakeLake({ rawDays: { [day]: [RAW_OBJECT] } });

      await handler();

      const names = mockS3Send.mock.calls.map(([command]) => command.name);
      expect(new Set(names)).toEqual(new Set(["GetObject", "ListObjectsV2", "PutObject"]));
    });

    test("needs its three settings", async () => {
      delete process.env.ANALYTICS_LAKE_BUCKET_NAME;
      await expect(handler()).rejects.toThrow("ANALYTICS_LAKE_BUCKET_NAME");
    });
  });
});
