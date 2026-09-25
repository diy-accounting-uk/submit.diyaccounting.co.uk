// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

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
  buildWindowedSql,
  buildDailySeriesSql,
  computeTrend,
  toObservationWindows,
  toDailySeries,
  buildSnapshot,
  writeSnapshot,
  parseResultSet,
  runAthenaQuery,
  OBJECTIVE_DEFINITIONS,
} from "@app/functions/analytics/operatorSnapshotPublish.js";

const DAILY_SERIES_OBSERVATION_COUNT = OBJECTIVE_DEFINITIONS.reduce(
  (sum, objective) => sum + objective.observations.filter((observation) => observation.dailySeries).length,
  0,
);

function varchar(value) {
  return value === null ? {} : { VarCharValue: value };
}

function resultSetOf(header, row) {
  return { Rows: [{ Data: header.map(varchar) }, { Data: row.map(varchar) }] };
}

function resultSetOfRows(header, rows) {
  return { Rows: [{ Data: header.map(varchar) }, ...rows.map((row) => ({ Data: row.map(varchar) }))] };
}

// A daily-series query is told apart from a windowed one by its own "AS day" column alias
// (buildDailySeriesSql's marker, never present in buildWindowedSql's output), tracked against
// the execution id its StartQueryExecutionCommand call returned.
function mockAllQueriesSucceedWith(windowedRow, dailyRows = [["2026-09-01", "3"]]) {
  let counter = 0;
  const kindByExecutionId = {};
  mockAthenaSend.mockImplementation((command) => {
    switch (command.constructor.name) {
      case "StartQueryExecutionCommand": {
        counter += 1;
        const executionId = `qid-${counter}`;
        kindByExecutionId[executionId] = command.input.QueryString.includes("AS day") ? "daily" : "windowed";
        return Promise.resolve({ QueryExecutionId: executionId });
      }
      case "GetQueryExecutionCommand":
        return Promise.resolve({ QueryExecution: { Status: { State: "SUCCEEDED" } } });
      case "GetQueryResultsCommand": {
        const kind = kindByExecutionId[command.input.QueryExecutionId];
        if (kind === "daily") {
          return Promise.resolve({ ResultSet: resultSetOfRows(["day", "value"], dailyRows) });
        }
        return Promise.resolve({ ResultSet: resultSetOf(["last_30", "prev_30", "last_90", "prev_90"], windowedRow) });
      }
      default:
        throw new Error(`unexpected command ${command.constructor.name}`);
    }
  });
}

// Every other query succeeds with `row`; the one whose SQL names `failingViewFragment` (e.g. a
// missing Glue table) runs to a terminal FAILED state instead, the same shape Athena answers a
// TABLE_NOT_FOUND query with.
function mockQueriesWithOneFailing(failingViewFragment, row) {
  mockAthenaSend.mockImplementation((command) => {
    switch (command.constructor.name) {
      case "StartQueryExecutionCommand": {
        const failing = command.input.QueryString.includes(failingViewFragment);
        return Promise.resolve({ QueryExecutionId: failing ? "failing-qid" : "qid" });
      }
      case "GetQueryExecutionCommand": {
        if (command.input.QueryExecutionId === "failing-qid") {
          return Promise.resolve({
            QueryExecution: { Status: { State: "FAILED", StateChangeReason: "TABLE_NOT_FOUND" } },
          });
        }
        return Promise.resolve({ QueryExecution: { Status: { State: "SUCCEEDED" } } });
      }
      case "GetQueryResultsCommand":
        return Promise.resolve({ ResultSet: resultSetOf(["last_30", "prev_30", "last_90", "prev_90"], row) });
      default:
        throw new Error(`unexpected command ${command.constructor.name}`);
    }
  });
}

// Every query succeeds; the row it answers with is looked up by the first key in `rowsByFragment`
// whose text appears in the query's SQL (e.g. an observation's own valueExpr), falling back to
// `defaultRow` for every other observation.
function mockQueriesWithRowsByFragment(rowsByFragment, defaultRow) {
  const fragments = Object.keys(rowsByFragment);
  mockAthenaSend.mockImplementation((command) => {
    switch (command.constructor.name) {
      case "StartQueryExecutionCommand": {
        const fragment = fragments.find((key) => command.input.QueryString.includes(key));
        return Promise.resolve({ QueryExecutionId: fragment ? `qid-${fragment}` : "qid-default" });
      }
      case "GetQueryExecutionCommand":
        return Promise.resolve({ QueryExecution: { Status: { State: "SUCCEEDED" } } });
      case "GetQueryResultsCommand": {
        const fragment = fragments.find((key) => command.input.QueryExecutionId === `qid-${key}`);
        const row = fragment ? rowsByFragment[fragment] : defaultRow;
        return Promise.resolve({ ResultSet: resultSetOf(["last_30", "prev_30", "last_90", "prev_90"], row) });
      }
      default:
        throw new Error(`unexpected command ${command.constructor.name}`);
    }
  });
}

describe("operatorSnapshotPublish", () => {
  beforeEach(() => {
    mockAthenaSend.mockReset();
    mockS3Send.mockReset();
    mockS3Send.mockResolvedValue({});

    process.env.ENVIRONMENT_NAME = "test";
    process.env.ATHENA_WORK_GROUP_NAME = "test-workgroup";
    process.env.GLUE_DATABASE_NAME = "test_env_analytics";
    process.env.ANALYTICS_LAKE_BUCKET_NAME = "test-env-analytics-lake";
    process.env.ATHENA_POLL_INTERVAL_MS = "1";
    process.env.ATHENA_POLL_MAX_ATTEMPTS = "3";
  });

  afterEach(() => {
    delete process.env.ENVIRONMENT_NAME;
    delete process.env.ATHENA_WORK_GROUP_NAME;
    delete process.env.GLUE_DATABASE_NAME;
    delete process.env.ANALYTICS_LAKE_BUCKET_NAME;
    delete process.env.ATHENA_POLL_INTERVAL_MS;
    delete process.env.ATHENA_POLL_MAX_ATTEMPTS;
    delete process.env.GA4_PROPERTY_ID;
    vi.restoreAllMocks();
  });

  describe("buildWindowedSql", () => {
    test("builds the four conditional aggregates without a filter", () => {
      const sql = buildWindowedSql({
        view: "v_availability_sli_daily",
        dayColumn: "day",
        valueExpr: "pass_rate",
        aggregation: "avg",
      });
      expect(sql).toContain("FROM   v_availability_sli_daily");
      expect(sql).not.toContain("WHERE");
      expect(sql).toContain("avg(CASE WHEN day > date_add('day', -30, current_date) THEN pass_rate END) AS last_30");
      expect(sql).toContain("prev_90");
    });

    test("appends a WHERE clause when the observation names one", () => {
      const sql = buildWindowedSql({
        view: "v_dora_runs_daily",
        dayColumn: "day",
        valueExpr: "runs",
        aggregation: "sum",
        where: "workflow = 'deploy'",
      });
      expect(sql).toContain("WHERE  workflow = 'deploy'");
    });

    test("counts matching rows with a literal value expression, as the security observations do", () => {
      const sql = buildWindowedSql({
        view: "security_hub_findings",
        dayColumn: "dt",
        valueExpr: "1",
        aggregation: "count",
        where: "finding_id IS NOT NULL AND severity_label = 'CRITICAL'",
      });
      expect(sql).toContain("FROM   security_hub_findings");
      expect(sql).toContain("count(CASE WHEN dt > date_add('day', -30, current_date) THEN 1 END) AS last_30");
      expect(sql).toContain("WHERE  finding_id IS NOT NULL AND severity_label = 'CRITICAL'");
    });

    test("runs against a monthly or quarterly grain column exactly as it would a daily one", () => {
      const sql = buildWindowedSql({
        view: "v_cost_vs_target_monthly",
        dayColumn: "month",
        valueExpr: "variance_usd",
        aggregation: "avg",
      });
      expect(sql).toContain("avg(CASE WHEN month > date_add('day', -30, current_date) THEN variance_usd END) AS last_30");
    });
  });

  describe("buildDailySeriesSql", () => {
    test("groups by day over the trailing 30 days", () => {
      const sql = buildDailySeriesSql({
        view: "v_visitors_by_kind_daily",
        dayColumn: "day",
        valueExpr: "sessions",
        aggregation: "sum",
        where: "visitor_kind = 'human'",
      });
      expect(sql).toContain("SELECT day AS day");
      expect(sql).toContain("sum(sessions) AS value");
      expect(sql).toContain("FROM   v_visitors_by_kind_daily");
      expect(sql).toContain("WHERE  day > date_add('day', -30, current_date) AND visitor_kind = 'human'");
      expect(sql).toContain("GROUP BY day");
      expect(sql).toContain("ORDER BY day");
    });

    test("keeps the trailing-30-day window without an observation filter", () => {
      const sql = buildDailySeriesSql({
        view: "v_visitors_by_kind_daily",
        dayColumn: "day",
        valueExpr: "sessions",
        aggregation: "sum",
      });
      expect(sql).toContain("WHERE  day > date_add('day', -30, current_date)");
      expect(sql).not.toContain("AND");
    });
  });

  describe("computeTrend", () => {
    test("is null when either side is missing", () => {
      expect(computeTrend(null, 10)).toBeNull();
      expect(computeTrend(10, null)).toBeNull();
    });

    test("is null when the prior period was zero", () => {
      expect(computeTrend(10, 0)).toBeNull();
    });

    test("is the fractional change otherwise", () => {
      expect(computeTrend(110, 100)).toBeCloseTo(0.1);
      expect(computeTrend(90, 100)).toBeCloseTo(-0.1);
    });
  });

  describe("toObservationWindows", () => {
    test("reads all four columns and computes each window's trend", () => {
      const windows = toObservationWindows({ last_30: "110", prev_30: "100", last_90: "300", prev_90: "300" });
      expect(windows.last30.value).toBe(110);
      expect(windows.last30.trend).toBeCloseTo(0.1);
      expect(windows.last90).toEqual({ value: 300, trend: 0 });
    });

    test("reads a missing row as every window null", () => {
      expect(toObservationWindows(undefined)).toEqual({
        last30: { value: null, trend: null },
        last90: { value: null, trend: null },
      });
    });
  });

  describe("toDailySeries", () => {
    test("reads each row's day and value", () => {
      expect(
        toDailySeries([
          { day: "2026-09-01", value: "12" },
          { day: "2026-09-02", value: "7" },
        ]),
      ).toEqual([
        { day: "2026-09-01", value: 12 },
        { day: "2026-09-02", value: 7 },
      ]);
    });

    test("reads no rows as an empty series", () => {
      expect(toDailySeries(undefined)).toEqual([]);
      expect(toDailySeries([])).toEqual([]);
    });
  });

  describe("parseResultSet and runAthenaQuery", () => {
    test("parseResultSet maps the header row onto the data row", () => {
      const resultSet = resultSetOf(["last_30", "prev_30", "last_90", "prev_90"], ["1", "2", "3", "4"]);
      expect(parseResultSet(resultSet)).toEqual([{ last_30: "1", prev_30: "2", last_90: "3", prev_90: "4" }]);
    });

    test("runAthenaQuery starts, polls, then reads results", async () => {
      mockAllQueriesSucceedWith(["1", "2", "3", "4"]);
      const rows = await runAthenaQuery({ workGroup: "wg", database: "db", sql: "SELECT 1" });
      expect(rows).toEqual([{ last_30: "1", prev_30: "2", last_90: "3", prev_90: "4" }]);
    });
  });

  describe("buildSnapshot", () => {
    test("runs one query per observation and carries a deep link on every row", async () => {
      mockAllQueriesSucceedWith(["10", "5", "30", "20"]);

      const context = {
        envName: "test",
        region: "eu-west-2",
        athenaWorkGroupName: "test-env-analytics",
        githubRepo: "diy-accounting-uk/submit.diyaccounting.co.uk",
        ga4PropertyId: "523400333",
      };
      const snapshot = await buildSnapshot({ workGroup: "wg", database: "db", context });

      const observationCount = OBJECTIVE_DEFINITIONS.reduce((sum, o) => sum + o.observations.length, 0);
      const startCalls = mockAthenaSend.mock.calls.filter(([command]) => command.constructor.name === "StartQueryExecutionCommand");
      expect(startCalls).toHaveLength(observationCount + DAILY_SERIES_OBSERVATION_COUNT);

      expect(snapshot.environment).toBe("test");
      expect(snapshot.objectives).toHaveLength(9);

      const uptime = snapshot.objectives.find((o) => o.id === "uptime");
      expect(uptime.observations.length).toBeGreaterThan(0);
      for (const observation of uptime.observations) {
        expect(observation.deepLink).toEqual(expect.any(String));
        expect(observation.last30).toEqual({ value: 10, trend: 1 });
        expect(observation.last90).toEqual({ value: 30, trend: 0.5 });
      }

      for (const objective of snapshot.objectives) {
        expect(objective.observations.length).toBeGreaterThan(0);
        for (const observation of objective.observations) {
          expect(observation.deepLink).toEqual(expect.any(String));
        }
      }
    });

    test("queries the raw findings tables and the coarser-grain views by their real column names", async () => {
      mockAllQueriesSucceedWith(["10", "5", "30", "20"]);

      const context = {
        envName: "test",
        region: "eu-west-2",
        athenaWorkGroupName: "test-env-analytics",
        githubRepo: "diy-accounting-uk/submit.diyaccounting.co.uk",
        ga4PropertyId: "523400333",
      };
      await buildSnapshot({ workGroup: "wg", database: "db", context });

      const sqlStatements = mockAthenaSend.mock.calls
        .filter(([command]) => command.constructor.name === "StartQueryExecutionCommand")
        .map(([command]) => command.input.QueryString);

      const expectedFragments = [
        "FROM   v_visitors_by_kind_daily",
        "FROM   v_cost_vs_target_monthly",
        "FROM   v_cost_per_submission_daily",
        "FROM   security_hub_findings",
        "FROM   guardduty_findings",
        "FROM   github_alerts",
        "FROM   v_returning_submitters_quarterly",
        "FROM   v_subscription_renewals_daily",
        "FROM   v_subscription_cancellations_daily",
        "FROM   v_operator_interventions_daily",
        "FROM   v_agent_runs_daily",
        "FROM   v_compliance_status",
        "FROM   company_accounts",
      ];
      for (const fragment of expectedFragments) {
        expect(sqlStatements.some((sql) => sql.includes(fragment))).toBe(true);
      }
      expect(sqlStatements.some((sql) => sql.includes("severity_label = 'CRITICAL'"))).toBe(true);
      expect(sqlStatements.some((sql) => sql.includes("area = 'accessibility'"))).toBe(true);
      expect(sqlStatements.some((sql) => sql.includes("area = 'fraud-prevention-headers'"))).toBe(true);
      expect(sqlStatements.some((sql) => sql.includes("visitor_kind = 'human'"))).toBe(true);
      expect(sqlStatements.some((sql) => sql.includes("visitor_kind = 'bot'"))).toBe(true);
      expect(sqlStatements.some((sql) => sql.includes("visitor_kind = 'synthetic'"))).toBe(true);
    });

    test("attaches a daily series to the three visitor-kind observations only", async () => {
      const dailyRows = [
        ["2026-09-01", "12"],
        ["2026-09-02", "9"],
      ];
      mockAllQueriesSucceedWith(["10", "5", "30", "20"], dailyRows);

      const context = {
        envName: "test",
        region: "eu-west-2",
        athenaWorkGroupName: "test-env-analytics",
        githubRepo: "diy-accounting-uk/submit.diyaccounting.co.uk",
        ga4PropertyId: "523400333",
      };
      const snapshot = await buildSnapshot({ workGroup: "wg", database: "db", context });

      const conversion = snapshot.objectives.find((o) => o.id === "conversion-to-submission");
      for (const id of ["sessions-human", "sessions-bot", "sessions-synthetic"]) {
        const observation = conversion.observations.find((o) => o.id === id);
        expect(observation.dailySeries).toEqual([
          { day: "2026-09-01", value: 12 },
          { day: "2026-09-02", value: 9 },
        ]);
      }

      const withoutDailySeries = conversion.observations.filter(
        (o) => !["sessions-human", "sessions-bot", "sessions-synthetic"].includes(o.id),
      );
      expect(withoutDailySeries.length).toBeGreaterThan(0);
      for (const observation of withoutDailySeries) {
        expect(observation.dailySeries).toBeUndefined();
      }

      const uptime = snapshot.objectives.find((o) => o.id === "uptime");
      for (const observation of uptime.observations) {
        expect(observation.dailySeries).toBeUndefined();
      }
    });

    test("a failing observation's query answers null instead of failing the whole snapshot", async () => {
      mockQueriesWithOneFailing("guardduty_findings", ["10", "5", "30", "20"]);

      const context = {
        envName: "test",
        region: "eu-west-2",
        athenaWorkGroupName: "test-env-analytics",
        githubRepo: "diy-accounting-uk/submit.diyaccounting.co.uk",
        ga4PropertyId: "523400333",
      };
      const snapshot = await buildSnapshot({ workGroup: "wg", database: "db", context });

      const security = snapshot.objectives.find((o) => o.id === "security");
      const failed = security.observations.find((o) => o.id === "guardduty-open-findings");
      expect(failed.last30).toEqual({ value: null, trend: null });
      expect(failed.last90).toEqual({ value: null, trend: null });

      const otherSecurityObservations = security.observations.filter((o) => o.id !== "guardduty-open-findings");
      expect(otherSecurityObservations.length).toBeGreaterThan(0);
      for (const observation of otherSecurityObservations) {
        expect(observation.last30.value).toBe(10);
      }

      const uptime = snapshot.objectives.find((o) => o.id === "uptime");
      for (const observation of uptime.observations) {
        expect(observation.last30.value).toBe(10);
      }

      expect(snapshot.failedObservationCount).toBe(1);
    });

    test("the company-accounts observation set reads turnover, profit and the balance sheet lines", async () => {
      mockQueriesWithRowsByFragment(
        {
          "accounts.profitandloss.turnover": ["120000", "100000", "120000", "100000"],
          "accounts.profitandloss.profit": ["15000", "12000", "15000", "12000"],
          "accounts.balancesheet.currentyear.fixedassets": ["5000", "5000", "5000", "5000"],
          "accounts.balancesheet.currentyear.capitalandreserves": ["20000", "18000", "20000", "18000"],
        },
        ["1", "1", "1", "1"],
      );

      const context = {
        envName: "test",
        region: "eu-west-2",
        athenaWorkGroupName: "test-env-analytics",
        githubRepo: "diy-accounting-uk/submit.diyaccounting.co.uk",
        ga4PropertyId: "523400333",
      };
      const snapshot = await buildSnapshot({ workGroup: "wg", database: "db", context });

      const companyAccounts = snapshot.objectives.find((o) => o.id === "company-accounts");
      expect(companyAccounts.observations).toHaveLength(10);

      const byId = Object.fromEntries(companyAccounts.observations.map((o) => [o.id, o]));
      expect(byId["company-turnover"].last30.value).toBe(120000);
      expect(byId["company-profit"].last30.value).toBe(15000);
      expect(byId["company-fixed-assets"].last30.value).toBe(5000);
      expect(byId["company-capital-and-reserves"].last30.value).toBe(20000);
      for (const observation of companyAccounts.observations) {
        expect(observation.deepLink).toEqual(expect.any(String));
      }
      expect(snapshot.failedObservationCount).toBe(0);
    });

    test("the company-accounts observation set answers every value as null while the book pull job is off", async () => {
      mockQueriesWithRowsByFragment({ "FROM   company_accounts": [null, null, null, null] }, ["1", "1", "1", "1"]);

      const context = {
        envName: "test",
        region: "eu-west-2",
        athenaWorkGroupName: "test-env-analytics",
        githubRepo: "diy-accounting-uk/submit.diyaccounting.co.uk",
        ga4PropertyId: "523400333",
      };
      const snapshot = await buildSnapshot({ workGroup: "wg", database: "db", context });

      const companyAccounts = snapshot.objectives.find((o) => o.id === "company-accounts");
      expect(companyAccounts.observations).toHaveLength(10);
      for (const observation of companyAccounts.observations) {
        expect(observation.last30).toEqual({ value: null, trend: null });
        expect(observation.last90).toEqual({ value: null, trend: null });
      }
      expect(snapshot.failedObservationCount).toBe(0);
    });
  });

  describe("writeSnapshot", () => {
    test("writes the latest pointer and a dated copy with the same body", async () => {
      const snapshot = { generatedAt: "2026-09-08T02:15:00.000Z", environment: "test", objectives: [] };
      await writeSnapshot({ bucket: "test-env-analytics-lake", envName: "test", snapshot });

      expect(mockS3Send).toHaveBeenCalledTimes(2);
      const keys = mockS3Send.mock.calls.map(([command]) => command.input.Key);
      expect(keys).toEqual(["snapshots/test/latest.json", "snapshots/test/2026-09-08.json"]);
      for (const [command] of mockS3Send.mock.calls) {
        expect(JSON.parse(command.input.Body)).toEqual(snapshot);
      }
    });
  });

  describe("handler", () => {
    test("requires its environment variables", async () => {
      delete process.env.ANALYTICS_LAKE_BUCKET_NAME;
      await expect(handler()).rejects.toThrow(/ANALYTICS_LAKE_BUCKET_NAME/);
    });

    test("builds and writes a snapshot", async () => {
      mockAllQueriesSucceedWith(["10", "5", "30", "20"]);

      const result = await handler();

      expect(result).toEqual({ environment: "test", objectives: 9 });
      expect(mockS3Send).toHaveBeenCalledTimes(2);
    });

    test("still publishes the snapshot but rejects when an observation failed, so the Lambda's Errors metric still fires", async () => {
      mockQueriesWithOneFailing("guardduty_findings", ["10", "5", "30", "20"]);

      await expect(handler()).rejects.toThrow(/1 observation/);
      expect(mockS3Send).toHaveBeenCalledTimes(2);
    });
  });
});
