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
  GetObjectCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
}));

import {
  handler,
  buildWindowedBatchSql,
  buildFastWindowBatchSql,
  computeTrend,
  betterDirection,
  measureDescription,
  OBJECTIVE_GUIDANCE,
  DAILY_CHART_DAYS,
  dailyChartDays,
  buildChartSeries,
  buildDailyChartDefinitions,
  buildDailyCharts,
  hourlyChartHours,
  buildCostDrivers,
  buildPaidSubscribers,
  shortResourceName,
  vatSubmissionReconciliationText,
  toObservationWindows,
  toActivityFastWindows,
  buildSnapshot,
  buildReinvestment,
  REINVESTMENT_FRACTION,
  mapInOrderWithConcurrency,
  writeSnapshot,
  parseResultSet,
  runAthenaQuery,
  OBJECTIVE_DEFINITIONS,
} from "@app/functions/analytics/operatorSnapshotPublish.js";
import { loadCatalogFromRoot, isActivityListedInEnvironment } from "@app/services/productCatalog.js";

const WINDOWED_QUERY_COUNT = new Set(
  OBJECTIVE_DEFINITIONS.flatMap((objective) => objective.observations.map((o) => `${o.view}|${o.dayColumn}`)),
).size;

const FAST_WINDOW_VIEW_COUNT = new Set(
  OBJECTIVE_DEFINITIONS.flatMap((objective) => objective.observations.filter((o) => o.fastWindowView).map((o) => o.fastWindowView)),
).size;

function varchar(value) {
  return value === null ? {} : { VarCharValue: value };
}

function resultSetOf(header, row) {
  return { Rows: [{ Data: header.map(varchar) }, { Data: row.map(varchar) }] };
}

function resultSetOfRows(header, rows) {
  return { Rows: [{ Data: header.map(varchar) }, ...rows.map((row) => ({ Data: row.map(varchar) }))] };
}

const WINDOWED_COLUMN_POSITION = { last_30: 0, prev_30: 1, last_90: 2, prev_90: 3 };
const FAST_COLUMN_KEY = { today: "today", prev_1: "previousDay", last_7: "last7" };

// Answers one batch query the way Athena would: one column per `AS o<i>_<column>` alias in its
// SQL. A windowed column (last_30, prev_30, last_90, prev_90) takes its value by position from
// windowedRowFor(line, sql), the row chosen for the SQL line that defines it; o<i>_data_since
// answers null; an hourly query's column (today, prev_1, last_7) takes
// fastValues.today|previousDay|last7; the other columns of a day query answer null.
// SQL with no such alias answers the plain windowed header with windowedRowFor(sql, sql).
function resultSetForSql(sql, windowedRowFor, fastValues) {
  const aliasLines = sql.split("\n").filter((line) => /AS o\d+_\w+,?$/.test(line));
  if (aliasLines.length === 0) {
    return resultSetOf(["last_30", "prev_30", "last_90", "prev_90"], windowedRowFor(sql, sql));
  }
  const header = [];
  const row = [];
  for (const line of aliasLines) {
    const [, alias, column] = line.match(/AS (o\d+_(\w+)),?$/);
    header.push(alias);
    if (column in WINDOWED_COLUMN_POSITION) {
      row.push(windowedRowFor(line, sql)[WINDOWED_COLUMN_POSITION[column]]);
    } else if (sql.includes("_first_hour") || sql.includes("AS o0_first_hour")) {
      row.push(column in FAST_COLUMN_KEY ? fastValues[FAST_COLUMN_KEY[column]] : null);
    } else {
      row.push(null);
    }
  }
  return resultSetOf(header, row);
}

// Every query succeeds and answers through resultSetForSql, except one whose SQL contains
// `failingFragment` (e.g. a missing Glue table): that one runs to a terminal FAILED state, the
// same shape Athena answers a TABLE_NOT_FOUND query with.
function mockQueries({ windowedRowFor, fastValues = { today: null, previousDay: null, last7: null }, failingFragment }) {
  const sqlById = new Map();
  let counter = 0;
  mockAthenaSend.mockImplementation((command) => {
    switch (command.constructor.name) {
      case "StartQueryExecutionCommand": {
        counter += 1;
        const sql = command.input.QueryString;
        const id = failingFragment && sql.includes(failingFragment) ? `failing-${counter}` : `qid-${counter}`;
        sqlById.set(id, sql);
        return Promise.resolve({ QueryExecutionId: id });
      }
      case "GetQueryExecutionCommand":
        if (command.input.QueryExecutionId.startsWith("failing-")) {
          return Promise.resolve({ QueryExecution: { Status: { State: "FAILED", StateChangeReason: "TABLE_NOT_FOUND" } } });
        }
        return Promise.resolve({ QueryExecution: { Status: { State: "SUCCEEDED" } } });
      case "GetQueryResultsCommand":
        return Promise.resolve({ ResultSet: resultSetForSql(sqlById.get(command.input.QueryExecutionId), windowedRowFor, fastValues) });
      default:
        throw new Error(`unexpected command ${command.constructor.name}`);
    }
  });
}

function mockAllQueriesSucceedWith(windowedRow) {
  mockQueries({ windowedRowFor: () => windowedRow });
}

function mockQueriesWithOneFailing(failingFragment, windowedRow) {
  mockQueries({ windowedRowFor: () => windowedRow, failingFragment });
}

// Each windowed column answers the row of the first key in `rowsByFragment` that its own SQL
// line contains (e.g. an observation's own valueExpr), or `defaultRow`.
function mockQueriesWithRowsByFragment(rowsByFragment, defaultRow) {
  const fragments = Object.keys(rowsByFragment);
  mockQueries({
    windowedRowFor: (line) => {
      const fragment = fragments.find((key) => line.includes(key));
      return fragment ? rowsByFragment[fragment] : defaultRow;
    },
  });
}

function mockFastWindowBatchAnswering(fastValues, windowedRow = ["10", "5", "30", "20"]) {
  mockQueries({ windowedRowFor: () => windowedRow, fastValues });
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
    process.env.ATHENA_THROTTLE_BACKOFF_MS = "1";
  });

  afterEach(() => {
    delete process.env.ENVIRONMENT_NAME;
    delete process.env.ATHENA_WORK_GROUP_NAME;
    delete process.env.GLUE_DATABASE_NAME;
    delete process.env.ANALYTICS_LAKE_BUCKET_NAME;
    delete process.env.ATHENA_POLL_INTERVAL_MS;
    delete process.env.ATHENA_POLL_MAX_ATTEMPTS;
    delete process.env.ATHENA_THROTTLE_BACKOFF_MS;
    delete process.env.GA4_PROPERTY_ID;
    vi.restoreAllMocks();
  });

  describe("buildWindowedBatchSql", () => {
    test("adds an observation's earliest day only when asked, filtered by its where clause", () => {
      const sql = buildWindowedBatchSql({
        view: "v",
        dayColumn: "day",
        observations: [
          { valueExpr: "n", aggregation: "sum" },
          { valueExpr: "n", aggregation: "sum", reportDataSince: true },
          { valueExpr: "n", aggregation: "sum", where: "kind = 'a'", reportDataSince: true },
        ],
      });
      expect(sql).not.toContain("o0_data_since");
      expect(sql).toContain("cast(min(day) AS varchar) AS o1_data_since");
      expect(sql).toContain("cast(min(CASE WHEN kind = 'a' THEN day END) AS varchar) AS o2_data_since");
    });

    test("reads the value on the newest day in each window for a latest aggregation", () => {
      const sql = buildWindowedBatchSql({
        view: "company_accounts",
        dayColumn: "dt",
        observations: [{ valueExpr: "cashatbank", aggregation: "latest" }],
      });
      expect(sql).toContain("max_by(cashatbank, dt) FILTER (WHERE dt > date_add('day', -30, current_date)) AS o0_last_30");
      expect(sql).toContain(
        "max_by(cashatbank, dt) FILTER (WHERE dt > date_add('day', -180, current_date) AND dt <= date_add('day', -90, current_date)) AS o0_prev_90",
      );
      expect(sql).toContain("FROM   company_accounts");
    });

    test("builds every window as a conditional aggregate without a filter", () => {
      const sql = buildWindowedBatchSql({
        view: "v_availability_sli_daily",
        dayColumn: "day",
        observations: [{ valueExpr: "pass_rate", aggregation: "avg" }],
      });
      const ukToday = "CAST(current_timestamp AT TIME ZONE 'Europe/London' AS date)";
      expect(sql).toBe(
        `SELECT avg(CASE WHEN day >= ${ukToday} THEN pass_rate END) AS o0_today,\n` +
          `       avg(CASE WHEN day = date_add('day', -1, ${ukToday}) THEN pass_rate END) AS o0_prev_1,\n` +
          "       avg(CASE WHEN day > date_add('day', -7, current_date) THEN pass_rate END) AS o0_last_7,\n" +
          "       avg(CASE WHEN day > date_add('day', -30, current_date) THEN pass_rate END) AS o0_last_30,\n" +
          "       avg(CASE WHEN day > date_add('day', -60, current_date) AND day <= date_add('day', -30, current_date) THEN pass_rate END) AS o0_prev_30,\n" +
          "       avg(CASE WHEN day > date_add('day', -90, current_date) THEN pass_rate END) AS o0_last_90,\n" +
          "       avg(CASE WHEN day > date_add('day', -180, current_date) AND day <= date_add('day', -90, current_date) THEN pass_rate END) AS o0_prev_90,\n" +
          "       cast(min(day) AS varchar) AS o0_first_day\n" +
          "FROM   v_availability_sli_daily",
      );
    });

    test("answers every observation of one view in one query, each filtered inside its own CASE", () => {
      const sql = buildWindowedBatchSql({
        view: "v_login_to_submission_funnel",
        dayColumn: "day",
        observations: [
          { valueExpr: "runs", aggregation: "sum", where: "workflow = 'deploy'" },
          { valueExpr: "failure_rate", aggregation: "avg", where: "workflow = 'deploy'" },
        ],
      });
      expect(sql).toContain(
        "sum(CASE WHEN day > date_add('day', -30, current_date) AND (workflow = 'deploy') THEN runs END) AS o0_last_30",
      );
      expect(sql).toContain(
        "avg(CASE WHEN day > date_add('day', -180, current_date) AND day <= date_add('day', -90, current_date) AND (workflow = 'deploy') THEN failure_rate END) AS o1_prev_90",
      );
      expect(sql).not.toContain("WHERE");
    });

    test("a whole-day source's Today is its newest reading up to today, with the reading's day beside it", () => {
      const sql = buildWindowedBatchSql({
        view: "v_cost_daily",
        dayColumn: "day",
        observations: [{ valueExpr: "cost_usd", aggregation: "sum", where: "sub_account_id = '1'" }],
      });
      const ukToday = "CAST(current_timestamp AT TIME ZONE 'Europe/London' AS date)";
      expect(sql).toContain(`max_by(cost_usd, day) FILTER (WHERE day <= ${ukToday} AND (sub_account_id = '1')) AS o0_today`);
      expect(sql).toContain(`cast(max(day) FILTER (WHERE day <= ${ukToday} AND (sub_account_id = '1')) AS varchar) AS o0_today_as_of`);
      expect(sql).toContain(
        `sum(CASE WHEN day = date_add('day', -1, ${ukToday}) AND (sub_account_id = '1') THEN cost_usd END) AS o0_prev_1`,
      );
    });

    test("a live source's Today counts the rows since UK midnight and carries no reading day", () => {
      const sql = buildWindowedBatchSql({
        view: "v_alarm_state_changes_daily",
        dayColumn: "day",
        observations: [{ valueExpr: "times_fired", aggregation: "sum" }],
      });
      expect(sql).toContain(
        "sum(CASE WHEN day >= CAST(current_timestamp AT TIME ZONE 'Europe/London' AS date) THEN times_fired END) AS o0_today",
      );
      expect(sql).not.toContain("today_as_of");
    });

    test("counts matching rows with a literal value expression, as the security observations do", () => {
      const sql = buildWindowedBatchSql({
        view: "security_hub_findings",
        dayColumn: "dt",
        observations: [{ valueExpr: "1", aggregation: "count", where: "finding_id IS NOT NULL AND severity_label = 'CRITICAL'" }],
      });
      expect(sql).toContain("FROM   security_hub_findings");
      expect(sql).toContain(
        "count(CASE WHEN dt > date_add('day', -30, current_date) AND (finding_id IS NOT NULL AND severity_label = 'CRITICAL') THEN 1 END) AS o0_last_30",
      );
    });

    test("a monthly or quarterly grain column has the longer windows and no Today or Previous day", () => {
      const sql = buildWindowedBatchSql({
        view: "v_cost_vs_target_monthly",
        dayColumn: "month",
        observations: [{ valueExpr: "variance_usd", aggregation: "avg" }],
      });
      expect(sql).toContain("avg(CASE WHEN month > date_add('day', -30, current_date) THEN variance_usd END) AS o0_last_30");
      expect(sql).not.toContain("o0_today");
      expect(sql).not.toContain("o0_prev_1");
    });
  });

  describe("observation guidance", () => {
    test("better names the good direction for a figure, and none for a neutral one", () => {
      expect(betterDirection("alarms-fired")).toBe("down");
      expect(betterDirection("revenue-gbp")).toBe("up");
      expect(betterDirection("submit-vat::started")).toBe("up");
      expect(betterDirection("sessions-bot")).toBeNull();
    });

    test("measureDescription says how a window is built from its periods", () => {
      expect(measureDescription({ aggregation: "sum", dayColumn: "day" })).toBe("total of the days");
      expect(measureDescription({ aggregation: "avg", dayColumn: "day" })).toBe("average of the days");
      expect(measureDescription({ aggregation: "avg", dayColumn: "month" })).toBe("average of the months");
      expect(measureDescription({ aggregation: "max", dayColumn: "dt" })).toBe("highest in the window");
    });

    test("every defined observation has a measure, and every dashboard objective carries what it measures", () => {
      for (const objective of OBJECTIVE_DEFINITIONS) {
        for (const observation of objective.observations) {
          expect(measureDescription(observation), observation.id).toBeTruthy();
        }
      }
      for (const id of [
        "uptime",
        "conversion-to-submission",
        "conversion-to-paid",
        "low-running-cost",
        "security",
        "retention",
        "operator-effort",
        "compliance",
      ]) {
        expect(OBJECTIVE_GUIDANCE[id].sli, id).toBeTruthy();
        expect(OBJECTIVE_GUIDANCE[id].levers, id).toBeTruthy();
      }
    });
  });

  describe("daily charts", () => {
    const END_DAY = "2026-10-28";

    test("dailyChartDays lists 90 consecutive UTC days ending on the given day, oldest first", () => {
      const days = dailyChartDays(END_DAY);

      expect(days).toHaveLength(DAILY_CHART_DAYS);
      expect(days[0]).toBe("2026-07-31");
      expect(days.at(-1)).toBe(END_DAY);
      expect(new Set(days).size).toBe(90);
    });

    test("buildChartSeries gives every component a value for every day, zero where no row came back, and a total line", () => {
      const days = dailyChartDays(END_DAY);
      const rows = [
        { day: END_DAY, component: "human", value: "5" },
        { day: END_DAY, component: "bot", value: "2.5" },
        { day: "2026-10-27", component: "human", value: "1" },
        { day: "1999-01-01", component: "human", value: "99" },
      ];
      const mode = { total: "All visitors", labelOf: (id) => id.toUpperCase() };

      const series = buildChartSeries({ days, rows, mode });

      expect(series.map((line) => line.label)).toEqual(["All visitors", "HUMAN", "BOT"]);
      for (const line of series) expect(line.values).toHaveLength(90);
      const human = series.find((line) => line.id === "human");
      expect(human.values.at(-1)).toBe(5);
      expect(human.values.at(-2)).toBe(1);
      expect(human.values[0]).toBe(0);
      expect(series[0].isTotal).toBe(true);
      expect(series[0].values.at(-1)).toBe(7.5);
    });

    test("buildChartSeries keeps a fixed component order and adds no total when the mode names none", () => {
      const days = dailyChartDays(END_DAY);
      const mode = { total: null, componentOrder: ["b", "a"], labelOf: (id) => id };

      const series = buildChartSeries({ days, rows: [{ day: END_DAY, component: "a", value: "1" }], mode });

      expect(series.map((line) => line.id)).toEqual(["b", "a"]);
      expect(series[0].values.every((value) => value === 0)).toBe(true);
    });

    test("buildChartSeries folds the smallest components into Other and keeps the total", () => {
      const days = dailyChartDays(END_DAY);
      const rows = ["a", "b", "c", "d"].map((component, index) => ({ day: END_DAY, component, value: String(10 - index) }));
      const mode = { total: "All", maxComponents: 2, labelOf: (id) => id };

      const series = buildChartSeries({ days, rows, mode });

      expect(series.map((line) => line.id)).toEqual(["total", "a", "b", "other"]);
      expect(series.find((line) => line.id === "other").values.at(-1)).toBe(15);
      expect(series[0].values.at(-1)).toBe(34);
    });

    test("the AWS costs chart folds to 12 services and offers account and deployment modes with account names", () => {
      const chart = buildDailyChartDefinitions().find((definition) => definition.id === "low-running-cost");

      expect(chart.title).toBe("AWS costs");
      expect(chart.modes.map((mode) => mode.id)).toEqual(["cost", "account", "deployment", "charge", "agent"]);
      expect(chart.modes[0].maxComponents).toBe(12);
      const account = chart.modes.find((mode) => mode.id === "account");
      expect(account.labelOf("972912397388")).toBe("submit-prod");
      expect(account.labelOf("887764105431")).toBe("management");
      expect(chart.modes.find((mode) => mode.id === "deployment").sql).toContain("deployment AS component");
    });

    test("the AWS costs chart offers CloudWatch by charge and Bedrock cost per agent result", () => {
      const chart = buildDailyChartDefinitions().find((definition) => definition.id === "low-running-cost");

      const charge = chart.modes.find((mode) => mode.id === "charge");
      expect(charge.sql).toContain("charge_description AS component");
      expect(charge.sql).toContain("FROM   v_cost_by_resource_daily");
      expect(charge.sql).toContain("service_name LIKE '%CloudWatch%'");
      expect(charge.maxComponents).toBe(10);
      expect(charge.descriptionOf("$3.00 per Dashboard per Month")).toContain("$3.00 per Dashboard per Month");

      const agent = chart.modes.find((mode) => mode.id === "agent");
      expect(agent.sql).toContain("FROM   v_agent_cost_daily");
      expect(agent.sql).toContain("cost_per_posted_run_usd IS NOT NULL");
      expect(agent.descriptionOf("cost-per-accepted-pr")).toContain("merged");
    });

    test("Uptime charts HMRC failures by class and by status and the failure rate as a percentage", () => {
      const chart = buildDailyChartDefinitions().find((definition) => definition.id === "hmrc-failures");

      expect(chart.objectiveId).toBe("uptime");
      expect(chart.modes.map((mode) => mode.id)).toEqual(["class", "status", "rate"]);
      expect(chart.modes[0].sql).toContain("failure_class AS component");
      expect(chart.modes[1].sql).toContain("hmrc_status AS component");
      expect(chart.modes[1].sql).toContain("FROM   v_hmrc_failures_by_class");
      expect(chart.modes[1].labelOf("none")).toBe("No HMRC status");
      expect(chart.modes[1].labelOf("429")).toBe("HMRC 429");
      expect(chart.modes[2].sql).toContain("failure_rate * 100");
      expect(chart.modes[2].sql).toContain("failure_rate IS NOT NULL");
    });

    test("failures and agent cost sit on the objectives that own them, each with a description", () => {
      const observationsOf = (objectiveId) => OBJECTIVE_DEFINITIONS.find((objective) => objective.id === objectiveId).observations;
      const byId = (objectiveId, id) => observationsOf(objectiveId).find((observation) => observation.id === id);

      expect(byId("uptime", "hmrc-submission-failures")).toMatchObject({ view: "v_submission_failure_rate_daily", valueExpr: "failures" });
      expect(byId("uptime", "hmrc-submission-failure-rate")).toMatchObject({ unit: "ratio", valueExpr: "failure_rate" });
      expect(byId("conversion-to-submission", "submission-failure-rate")).toMatchObject({ unit: "ratio", valueExpr: "failure_rate" });
      expect(byId("low-running-cost", "bedrock-cost-per-posted-run-usd")).toMatchObject({ view: "v_agent_cost_daily", unit: "usd" });
      expect(byId("low-running-cost", "bedrock-cost-per-accepted-pr-usd")).toMatchObject({ valueExpr: "cost_per_accepted_pr_usd" });
      expect(byId("operator-effort", "agent-cost-per-posted-run-usd")).toMatchObject({ view: "v_agent_cost_daily" });
      expect(byId("operator-effort", "agent-cost-per-accepted-pr-usd")).toMatchObject({ view: "v_agent_cost_daily" });
      for (const id of ["hmrc-submission-failures", "hmrc-submission-failure-rate"]) {
        expect(byId("uptime", id).description.length).toBeGreaterThan(20);
        expect(betterDirection(id)).toBe("down");
      }
      expect(betterDirection("agent-cost-per-accepted-pr-usd")).toBe("down");
    });

    test("money in and money out: contribution, runway, Ads performance and unactivated charges are described rows", () => {
      const byId = (objectiveId, id) =>
        OBJECTIVE_DEFINITIONS.find((objective) => objective.id === objectiveId).observations.find((observation) => observation.id === id);

      expect(byId("conversion-to-paid", "contribution-gbp")).toMatchObject({
        view: "v_contribution_daily",
        valueExpr: "contribution_gbp",
        unit: "gbp",
      });
      expect(byId("company-accounts", "company-contribution-gbp")).toMatchObject({ view: "v_contribution_daily", aggregation: "sum" });
      expect(byId("company-accounts", "company-runway-months")).toMatchObject({
        view: "v_company_runway",
        valueExpr: "runway_months",
        unit: "months",
        aggregation: "latest",
      });
      expect(byId("company-accounts", "company-net-monthly-burn-gbp")).toMatchObject({ view: "v_company_runway", unit: "gbp" });
      expect(byId("conversion-to-paid", "ads-ctr")).toMatchObject({ view: "v_ads_performance_daily", valueExpr: "ctr", unit: "ratio" });
      expect(byId("conversion-to-paid", "charges-without-activation")).toMatchObject({
        view: "v_purchase_reconciliation_daily",
        valueExpr: "greatest(-activity_minus_stripe, 0)",
        aggregation: "sum",
      });
      for (const id of [
        "contribution-gbp",
        "ads-impressions",
        "ads-clicks",
        "ads-ctr",
        "ads-cost-per-click-gbp",
        "charges-without-activation",
      ]) {
        expect(byId("conversion-to-paid", id).description.length, id).toBeGreaterThan(20);
      }
      for (const id of ["company-contribution-gbp", "company-net-monthly-burn-gbp", "company-runway-months"]) {
        expect(byId("company-accounts", id).description.length, id).toBeGreaterThan(20);
      }
      expect(betterDirection("contribution-gbp")).toBe("up");
      expect(betterDirection("company-runway-months")).toBe("up");
      expect(betterDirection("company-net-monthly-burn-gbp")).toBe("down");
      expect(betterDirection("ads-cost-per-click-gbp")).toBe("down");
      expect(betterDirection("charges-without-activation")).toBe("down");
    });

    test("the funnel starts at the spreadsheets site and the signup observations carry a weighted share", () => {
      const submission = OBJECTIVE_DEFINITIONS.find((objective) => objective.id === "conversion-to-submission");
      const byId = (id) => submission.observations.find((observation) => observation.id === id);

      expect(byId("spreadsheets-downloads")).toMatchObject({ view: "v_spreadsheets_downloads_daily", valueExpr: "downloads" });
      expect(byId("sessions-from-spreadsheets")).toMatchObject({ view: "v_submit_referrals_daily", where: "origin = 'spreadsheets'" });
      expect(byId("sessions-from-www")).toMatchObject({ view: "v_submit_referrals_daily", where: "origin = 'www'" });
      expect(byId("active-customers-7d")).toMatchObject({
        view: "v_active_customers_7d_daily",
        valueExpr: "active_users_7d",
        where: "app_client = 'all'",
      });
      expect(byId("new-accounts-submitted-share")).toMatchObject({
        view: "v_signup_to_first_submission",
        valueExpr: "submitted",
        denominatorExpr: "new_accounts",
        aggregation: "ratio",
        unit: "ratio",
      });
      expect(byId("median-hours-to-first-submission")).toMatchObject({ unit: "hours", valueExpr: "median_hours_to_first_submission" });
      const retention = OBJECTIVE_DEFINITIONS.find((objective) => objective.id === "retention");
      for (const id of ["retention-active-customers-7d", "retention-new-accounts", "retention-new-accounts-submitted-share"]) {
        expect(retention.observations.map((observation) => observation.id)).toContain(id);
      }
      for (const observation of [...submission.observations, ...retention.observations].filter((o) =>
        /spreadsheet|from-www|active-customers|submitted|median-hours|retention-new/.test(o.id),
      )) {
        expect(observation.description.length, observation.id).toBeGreaterThan(20);
      }
      expect(measureDescription(byId("new-accounts-submitted-share"))).toBe("total of submitted over total of new_accounts");

      const chart = buildDailyChartDefinitions().find((definition) => definition.id === "conversion-to-submission");
      expect(chart.modes.map((mode) => mode.id)).toEqual(["funnel", "active-customers", "active-customers-7d"]);
      const funnel = chart.modes[0];
      expect(funnel.componentOrder.slice(0, 3)).toEqual(["spreadsheet-downloads", "sessions-from-spreadsheets", "sessions-from-www"]);
      for (const id of funnel.componentOrder) expect(funnel.descriptionOf(id), id).toBeTruthy();
      expect(chart.modes[1].sql).toContain("FROM   v_active_customers_7d_daily");
      expect(chart.modes[2].labelOf("all")).toBe("All clients");
    });

    test("the Visitors chart reads sessions by landing page, the sign-in rate and sessions by country with AI agents apart", () => {
      const visitors = buildDailyChartDefinitions().find((definition) => definition.id === "visitors");

      expect(visitors.modes.map((mode) => mode.id)).toEqual([
        "sessions",
        "landing-page",
        "landing-page-sign-in",
        "country",
        "ai-agent-country",
      ]);
      expect(visitors.modes[1].label).toBe("By landing page");
      expect(visitors.modes[1].sql).toContain("FROM   v_ga4_landing_pages_daily");
      expect(visitors.modes[2].unit).toBe("ratio");
      expect(visitors.modes[2].sql).toContain("sum(sign_ins)");
      expect(visitors.modes[3].sql).toContain("human_sessions");
      expect(visitors.modes[4].sql).toContain("ai_agent_sessions");
      for (const mode of visitors.modes.slice(1)) {
        expect(mode.descriptionOf("/pricing"), mode.id).toBeTruthy();
        if (mode.total) expect(mode.totalDescription, mode.id).toBeTruthy();
      }
    });

    test("a ratio observation divides the window's total by the window's total of its denominator", () => {
      const sql = buildWindowedBatchSql({
        view: "v_signup_to_first_submission",
        dayColumn: "signup_day",
        observations: [{ valueExpr: "submitted", denominatorExpr: "new_accounts", aggregation: "ratio" }],
      });

      expect(sql).toContain(
        "cast(sum(CASE WHEN signup_day > date_add('day', -30, current_date) THEN submitted END) AS double) / nullif(sum(CASE WHEN signup_day > date_add('day', -30, current_date) THEN new_accounts END), 0) AS o0_last_30",
      );
      const empty = toObservationWindows({ first_day: "2026-01-01", last_30: null }, "ratio", new Date("2026-10-29T12:00:00Z"));
      expect(empty.last30).toEqual({ value: null, trend: null, noEvents: true });
    });

    test("each Google Ads row reads the google platform and has a Microsoft twin that reads the microsoft platform", () => {
      const paid = OBJECTIVE_DEFINITIONS.find((objective) => objective.id === "conversion-to-paid").observations;
      const byId = (id) => paid.find((observation) => observation.id === id);

      for (const id of [
        "ads-cost-gbp",
        "ads-impressions",
        "ads-clicks",
        "ads-ctr",
        "ads-cost-per-click-gbp",
        "ads-cost-per-paid-landing-gbp",
      ]) {
        const twin = byId(`ms-${id}`);
        expect(byId(id).where, id).toBe("platform = 'google'");
        expect(twin, id).toBeTruthy();
        expect(twin.where, id).toBe("platform = 'microsoft'");
        expect({ view: twin.view, valueExpr: twin.valueExpr, unit: twin.unit, aggregation: twin.aggregation }, id).toEqual({
          view: byId(id).view,
          valueExpr: byId(id).valueExpr,
          unit: byId(id).unit,
          aggregation: byId(id).aggregation,
        });
        expect(twin.label, id).toMatch(/^Microsoft Ads/);
        expect(twin.description.length, id).toBeGreaterThan(20);
      }
      expect(byId("ms-paid-landings")).toMatchObject({ view: "v_paid_landings_daily", valueExpr: "msclkid_landings", unit: "count" });
      expect(byId("ms-ads-conversions")).toMatchObject({
        view: "v_ads_performance_daily",
        valueExpr: "conversions",
        where: "platform = 'microsoft'",
      });
      expect(betterDirection("ms-ads-cost-gbp")).toBe("down");
      expect(betterDirection("ms-ads-ctr")).toBe("up");
      expect(betterDirection("ms-ads-conversions")).toBe("up");
    });

    test("the Conversion to paid chart draws contribution and the Ads campaigns, each line described", () => {
      const paid = buildDailyChartDefinitions().find((definition) => definition.id === "conversion-to-paid");

      expect(paid.modes.map((mode) => mode.id)).toEqual([
        "revenue",
        "passes",
        "contribution",
        "ads-impressions",
        "ads-clicks",
        "ads-ctr",
        "ads-cpc",
        "ads-cost",
        "ads-paid-landings",
        "ads-cost-per-paid-landing",
        "ads-conversions",
      ]);
      const contribution = paid.modes.find((mode) => mode.id === "contribution");
      expect(contribution.componentOrder).toEqual(["revenue", "aws-cost", "ads-cost", "contribution"]);
      expect(contribution.sql).toContain("FROM   v_contribution_daily");
      expect(contribution.sql).toContain("aws_cost_gbp");
      for (const id of contribution.componentOrder) expect(contribution.descriptionOf(id)).toBeTruthy();
      for (const id of ["ads-impressions", "ads-clicks", "ads-ctr", "ads-cpc"]) {
        const mode = paid.modes.find((candidate) => candidate.id === id);
        expect(mode.sql, id).toContain("|| campaign_name AS component");
        expect(mode.sql, id).toContain("'Microsoft: '");
        expect(mode.descriptionOf("Search: MTD VAT"), id).toContain("Search: MTD VAT");
      }
      for (const id of ["ads-cost", "ads-paid-landings", "ads-cost-per-paid-landing", "ads-conversions"]) {
        const mode = paid.modes.find((candidate) => candidate.id === id);
        expect(mode.componentOrder, id).toEqual(["google", "microsoft"]);
        expect(mode.labelOf("microsoft"), id).toBe("Microsoft");
        expect(mode.descriptionOf("microsoft"), id).toContain("Microsoft");
      }
      expect(paid.modes.find((mode) => mode.id === "ads-paid-landings").sql).toContain("sum(msclkid_landings)");
      expect(paid.modes.find((mode) => mode.id === "ads-cost-per-paid-landing").unit).toBe("gbp");
      expect(paid.modes.find((mode) => mode.id === "ads-ctr").unit).toBe("ratio");
      expect(paid.modes.find((mode) => mode.id === "ads-cpc").unit).toBe("gbp");
    });

    test("buildPaidSubscribers reads the latest month by channel and bundle and adds the totals", async () => {
      mockAthenaSend.mockImplementation((command) => {
        switch (command.constructor.name) {
          case "StartQueryExecutionCommand":
            return Promise.resolve({ QueryExecutionId: "q" });
          case "GetQueryExecutionCommand":
            return Promise.resolve({ QueryExecution: { Status: { State: "SUCCEEDED" } } });
          default:
            return Promise.resolve({
              ResultSet: resultSetOfRows(
                ["month", "source", "bundle_id", "subscribers", "mrr_gbp", "arr_gbp"],
                [
                  ["2026-10-01", "google-ads", "resident-vat", "3", "27", "324"],
                  ["2026-10-01", "unknown", "resident-pro", "1", "19", "228"],
                ],
              ),
            });
        }
      });

      const result = await buildPaidSubscribers({ workGroup: "wg", database: "db" });

      const sql = mockAthenaSend.mock.calls.find(([command]) => command.constructor.name === "StartQueryExecutionCommand")[0].input
        .QueryString;
      expect(sql).toContain("FROM   v_paid_subscribers_by_channel");
      expect(sql).toContain("SELECT max(month)");
      expect(result.month).toBe("2026-10-01");
      expect(result.rows[0]).toEqual({ source: "google-ads", bundleId: "resident-vat", subscribers: 3, mrrGbp: 27, arrGbp: 324 });
      expect(result.totals).toEqual({ subscribers: 4, mrrGbp: 46, arrGbp: 552 });
    });

    test("shortResourceName drops the partition, service, region and account from an ARN", () => {
      expect(shortResourceName("arn:aws:logs:eu-west-2:972912397388:log-group:/aws/cloudtrail/prod-env-cloud-trail")).toBe(
        "log-group:/aws/cloudtrail/prod-env-cloud-trail",
      );
      expect(shortResourceName("arn:aws:synthetics:eu-west-2:972912397388:canary:prod-dbf4e0a-api")).toBe("canary:prod-dbf4e0a-api");
      expect(shortResourceName("(no resource)")).toBe("(no resource)");
    });

    test("buildCostDrivers reads the ten dearest CloudWatch charges of the last 30 days", async () => {
      mockAthenaSend.mockImplementation((command) => {
        switch (command.constructor.name) {
          case "StartQueryExecutionCommand":
            return Promise.resolve({ QueryExecutionId: "q" });
          case "GetQueryExecutionCommand":
            return Promise.resolve({ QueryExecution: { Status: { State: "SUCCEEDED" } } });
          default:
            return Promise.resolve({
              ResultSet: resultSetOfRows(
                ["charge_description", "resource_id", "cost_usd"],
                [["$0.5985 per GB custom log data ingested", "arn:aws:logs:eu-west-2:1:log-group:/aws/x", "67.862"]],
              ),
            });
        }
      });

      const drivers = await buildCostDrivers({ workGroup: "wg", database: "db" });

      const sql = mockAthenaSend.mock.calls.find(([command]) => command.constructor.name === "StartQueryExecutionCommand")[0].input
        .QueryString;
      expect(sql).toContain("FROM   v_cost_by_resource_daily");
      expect(sql).toContain("service_name LIKE '%CloudWatch%'");
      expect(sql).toContain("LIMIT  10");
      expect(drivers).toEqual({
        days: 30,
        rows: [
          {
            charge: "$0.5985 per GB custom log data ingested",
            resource: "log-group:/aws/x",
            resourceId: "arn:aws:logs:eu-west-2:1:log-group:/aws/x",
            costUsd: 67.862,
          },
        ],
      });
    });

    test("AWS costs holds AWS figures only and the ads figures sit under Conversion to paid", () => {
      const idsOf = (objectiveId) => OBJECTIVE_DEFINITIONS.find((objective) => objective.id === objectiveId).observations.map((o) => o.id);

      expect(OBJECTIVE_DEFINITIONS.find((objective) => objective.id === "low-running-cost").name).toBe("AWS costs");
      expect(idsOf("low-running-cost")).toEqual(
        expect.arrayContaining([
          "cost-submit-prod-usd",
          "cost-submit-ci-usd",
          "cost-other-accounts-usd",
          "cost-bedrock-usd",
          "cost-cloudwatch-usd",
          "cost-cloudfront-usd",
        ]),
      );
      expect(idsOf("low-running-cost")).not.toContain("ads-cost-gbp");
      expect(idsOf("conversion-to-paid")).toEqual(
        expect.arrayContaining(["paid-landings", "ads-cost-gbp", "ads-cost-per-paid-landing-gbp"]),
      );
    });

    test("every chart carries a note and every mode describes its lines", () => {
      for (const definition of buildDailyChartDefinitions()) {
        expect(definition.note, definition.id).toBeTruthy();
        for (const mode of definition.modes) {
          expect(mode.descriptionOf, `${definition.id}/${mode.id}`).toBeTypeOf("function");
          if (mode.total) expect(mode.totalDescription, `${definition.id}/${mode.id}`).toBeTruthy();
        }
      }
    });

    test("buildChartSeries gives each line, the total and Other a description", () => {
      const days = dailyChartDays(END_DAY);
      const rows = ["a", "b", "c"].map((component, index) => ({ day: END_DAY, component, value: String(3 - index) }));
      const mode = {
        total: "All",
        totalDescription: "Everything.",
        maxComponents: 2,
        labelOf: (id) => id,
        descriptionOf: (id) => `Line ${id}.`,
      };

      const series = buildChartSeries({ days, rows, mode });

      expect(series.map((line) => line.description)).toEqual(["Everything.", "Line a.", "Line b.", "The 1 smaller lines added together."]);
    });

    test("the Retention table and graph read the same rolling definition of returning submitters", () => {
      const retention = OBJECTIVE_DEFINITIONS.find((objective) => objective.id === "retention");
      const returning = retention.observations.find((observation) => observation.id === "returning-submitters");
      const chart = buildDailyChartDefinitions().find((definition) => definition.id === "retention");

      expect(returning.view).toBe("v_returning_submitters_rolling_daily");
      expect(returning.valueExpr).toBe("returning_submitters_90d");
      expect(returning.aggregation).toBe("latest");
      expect(chart.modes[0].sql).toContain("returning_submitters_90d");
      expect(chart.modes[0].sql).toContain("FROM   v_returning_submitters_rolling_daily");
      expect(chart.note).toContain("roll");
    });

    test("Passes issued is a Retention row and line and a Conversion to paid line counted, not in pounds", () => {
      const retention = OBJECTIVE_DEFINITIONS.find((objective) => objective.id === "retention");
      const row = retention.observations.find((observation) => observation.id === "retention-passes-issued");
      const charts = buildDailyChartDefinitions();
      const paid = charts.find((definition) => definition.id === "conversion-to-paid");
      const passes = paid.modes.find((mode) => mode.id === "passes");

      expect(row).toMatchObject({ view: "v_pass_redemptions_daily", valueExpr: "passes_issued", aggregation: "sum" });
      expect(charts.find((definition) => definition.id === "retention").modes[0].sql).toContain("'passes-issued'");
      expect(passes.unit).toBe("count");
      expect(passes.sql).toContain("passes_issued");
      expect(passes.descriptionOf("passes-issued")).toBeTruthy();
    });

    test("the reconciliation line sets distinct submitters against completions, test accounts apart", () => {
      const text = vatSubmissionReconciliationText({
        rows: [
          { actor_group: "customer", submissions: "90", submitters: "12" },
          { actor_group: "test", submissions: "40", submitters: "3" },
        ],
        series: [{ id: "submitters-90d", values: [1, 11] }],
        days: 90,
      });

      expect(text).toContain("12 distinct submitters");
      expect(text).toContain("90 Submit VAT (HMRC) completions");
      expect(text).toContain("reads 11");
      expect(text).toContain("3 accounts made 40 completions");
    });

    test("the reconciliation line shows operator submissions apart from customers and test accounts", () => {
      const text = vatSubmissionReconciliationText({
        rows: [
          { actor_group: "customer", submissions: "90", submitters: "12" },
          { actor_group: "operator", submissions: "7", submitters: "1" },
          { actor_group: "test", submissions: "40", submitters: "3" },
        ],
        series: [{ id: "submitters-90d", values: [1, 11] }],
        days: 90,
      });

      expect(text).toContain("12 distinct submitters");
      expect(text).toContain("Operators apart: 1 account made 7 completions");
      expect(text).toContain("3 accounts made 40 completions");
    });

    test("the reconciliation line reads zero operators when the lake has none", () => {
      const text = vatSubmissionReconciliationText({
        rows: [{ actor_group: "customer", submissions: "5", submitters: "2" }],
        series: [],
        days: 30,
      });

      expect(text).toContain("Operators apart: 0 accounts made 0 completions");
    });

    test("buildDailyCharts attaches the Retention reconciliation line", async () => {
      mockAthenaSend.mockImplementation((command) => {
        switch (command.constructor.name) {
          case "StartQueryExecutionCommand":
            return Promise.resolve({ QueryExecutionId: "q" });
          case "GetQueryExecutionCommand":
            return Promise.resolve({ QueryExecution: { Status: { State: "SUCCEEDED" } } });
          case "GetQueryResultsCommand":
            return Promise.resolve({
              ResultSet: resultSetOfRows(
                ["day", "component", "value", "actor_group", "submissions", "submitters"],
                [[END_DAY, "x", "1", "customer", "5", "2"]],
              ),
            });
          default:
            return Promise.resolve({});
        }
      });

      const { dailyCharts } = await buildDailyCharts({ workGroup: "wg", database: "db", endDay: END_DAY });

      expect(dailyCharts.charts.find((chart) => chart.id === "retention").reconciliation).toContain("2 distinct submitters");
      expect(dailyCharts.charts.find((chart) => chart.id === "visitors").reconciliation).toBeUndefined();
    });

    test("Bot and Synthetic visitors read the CloudFront log view, the other three kinds read Google Analytics", () => {
      const conversion = OBJECTIVE_DEFINITIONS.find((objective) => objective.id === "conversion-to-submission");
      const viewOf = (id) => conversion.observations.find((observation) => observation.id === id).view;

      expect(["sessions-bot", "sessions-synthetic"].map(viewOf)).toEqual(["v_visitors_cloudfront_daily", "v_visitors_cloudfront_daily"]);
      expect(["sessions-operator", "sessions-authenticated", "sessions-human"].map(viewOf)).toEqual(
        Array(3).fill("v_visitors_by_kind_daily"),
      );
      const chart = buildDailyChartDefinitions().find((definition) => definition.id === "visitors");
      expect(chart.modes[0].componentOrder).toEqual(["operator", "authenticated", "human", "synthetic", "bot"]);
      expect(chart.modes[0].sql).toContain("v_visitors_cloudfront_daily");
      expect(chart.note).toContain("CloudFront");
    });

    test("Bot and Synthetic rows count distinct visitors, not page requests", () => {
      const conversion = OBJECTIVE_DEFINITIONS.find((objective) => objective.id === "conversion-to-submission");
      const observations = ["sessions-bot", "sessions-synthetic"].map((id) =>
        conversion.observations.find((observation) => observation.id === id),
      );

      expect(observations.map((observation) => observation.valueExpr)).toEqual(["visitors", "visitors"]);
      expect(observations.map((observation) => observation.label)).toEqual(["Visitors, bot", "Visitors, synthetic"]);
      const sql = buildDailyChartDefinitions().find((definition) => definition.id === "visitors").modes[0].sql;
      expect(sql).toContain("sum(visitors)");
      expect(sql).not.toContain("page_requests");
    });

    test("every chart mode asks for the last 90 days and answers day, component and value", () => {
      for (const definition of buildDailyChartDefinitions()) {
        for (const mode of definition.modes) {
          expect(mode.sql, `${definition.id}/${mode.id}`).toContain("date_add('day', -90, current_date)");
          expect(mode.sql).toMatch(/AS day/);
          expect(mode.sql).toMatch(/AS component|'[a-z0-9-]+' AS component/);
          expect(mode.sql).toMatch(/AS value/);
        }
      }
    });

    test("buildDailyCharts publishes seven charts with 90 points on every series", async () => {
      mockAthenaSend.mockImplementation((command) => {
        switch (command.constructor.name) {
          case "StartQueryExecutionCommand":
            return Promise.resolve({ QueryExecutionId: "q" });
          case "GetQueryExecutionCommand":
            return Promise.resolve({ QueryExecution: { Status: { State: "SUCCEEDED" } } });
          case "GetQueryResultsCommand":
            return Promise.resolve({
              ResultSet: resultSetOfRows(["day", "component", "value"], [[END_DAY, "human", "3"]]),
            });
          default:
            throw new Error(`unexpected command ${command.constructor.name}`);
        }
      });

      const { dailyCharts, failedChartIds } = await buildDailyCharts({ workGroup: "wg", database: "db", endDay: END_DAY });

      expect(failedChartIds).toEqual([]);
      expect(dailyCharts.days).toHaveLength(90);
      expect(dailyCharts.charts.map((chart) => chart.id)).toEqual([
        "activity-started-and-completed",
        "hmrc-failures",
        "conversion-to-submission",
        "conversion-to-paid",
        "low-running-cost",
        "retention",
        "visitors",
      ]);
      for (const chart of dailyCharts.charts) {
        expect(chart.modes.length).toBeGreaterThan(0);
        for (const mode of chart.modes) {
          for (const line of mode.series) expect(line.values, `${chart.id}/${mode.id}/${line.id}`).toHaveLength(90);
        }
      }
      const activities = dailyCharts.charts[0];
      expect(activities.modes.map((mode) => mode.id)).toEqual(["started", "completed"]);
    });

    test("hourlyChartHours lists 168 UTC hours ending on the hour of now, oldest first", () => {
      const hours = hourlyChartHours(new Date("2026-10-29T14:37:12.000Z"));
      expect(hours).toHaveLength(168);
      expect(hours[0]).toBe("2026-10-22T15:00:00Z");
      expect(hours.at(-1)).toBe("2026-10-29T14:00:00Z");
    });

    test("only the modes read from an hourly view carry an hourly query, one over each view for 168 hours", () => {
      const withHourly = buildDailyChartDefinitions().flatMap((definition) =>
        definition.modes.filter((mode) => mode.hourlySql).map((mode) => `${definition.id}/${mode.id}`),
      );
      expect(withHourly).toEqual([
        "activity-started-and-completed/started",
        "activity-started-and-completed/completed",
        "visitors/sessions",
      ]);
      for (const definition of buildDailyChartDefinitions()) {
        for (const mode of definition.modes.filter((candidate) => candidate.hourlySql)) {
          expect(mode.hourlySql).toContain("date_add('hour', -168,");
          expect(mode.hourlySql).toMatch(/FROM\s+v_[a-z_]+_hourly/);
          expect(mode.hourlySql).toMatch(/AS day/);
        }
      }
    });

    test("buildDailyCharts publishes 168 hourly points on the hourly modes and none elsewhere, with three extra queries", async () => {
      const queries = [];
      mockAthenaSend.mockImplementation((command) => {
        switch (command.constructor.name) {
          case "StartQueryExecutionCommand":
            queries.push(command.input.QueryString);
            return Promise.resolve({ QueryExecutionId: "q" });
          case "GetQueryExecutionCommand":
            return Promise.resolve({ QueryExecution: { Status: { State: "SUCCEEDED" } } });
          default:
            return Promise.resolve({
              ResultSet: resultSetOfRows(["day", "component", "value"], [["2026-10-29T14:00:00Z", "human", "3"]]),
            });
        }
      });

      const now = new Date("2026-10-29T14:37:00.000Z");
      const { dailyCharts, failedChartIds } = await buildDailyCharts({ workGroup: "wg", database: "db", endDay: END_DAY, now });

      expect(failedChartIds).toEqual([]);
      expect(dailyCharts.hours).toHaveLength(168);
      expect(queries.filter((sql) => /_hourly/.test(sql))).toHaveLength(3);
      const hourlyModes = dailyCharts.charts.flatMap((chart) =>
        chart.modes.filter((mode) => mode.hourly).map((mode) => `${chart.id}/${mode.id}`),
      );
      expect(hourlyModes).toEqual([
        "activity-started-and-completed/started",
        "activity-started-and-completed/completed",
        "visitors/sessions",
      ]);
      const visitors = dailyCharts.charts.find((chart) => chart.id === "visitors").modes[0];
      expect(visitors.hourly.series.map((line) => line.id)).toEqual(["operator", "authenticated", "human"]);
      for (const line of visitors.hourly.series) expect(line.values).toHaveLength(168);
      expect(visitors.hourly.series[2].values.at(-1)).toBe(3);
    });

    test("a failing hourly query leaves the chart without its hourly series and counts as a failure", async () => {
      mockAthenaSend.mockImplementation((command) => {
        switch (command.constructor.name) {
          case "StartQueryExecutionCommand": {
            const failing = command.input.QueryString.includes("v_visitors_by_kind_hourly");
            return Promise.resolve({ QueryExecutionId: failing ? "failing-1" : "q" });
          }
          case "GetQueryExecutionCommand":
            return Promise.resolve({
              QueryExecution: {
                Status: command.input.QueryExecutionId.startsWith("failing")
                  ? { State: "FAILED", StateChangeReason: "TABLE_NOT_FOUND" }
                  : { State: "SUCCEEDED" },
              },
            });
          default:
            return Promise.resolve({ ResultSet: resultSetOfRows(["day", "component", "value"], []) });
        }
      });

      const { dailyCharts, failedChartIds } = await buildDailyCharts({ workGroup: "wg", database: "db", endDay: END_DAY });

      expect(failedChartIds).toEqual(["visitors-hourly"]);
      const visitors = dailyCharts.charts.find((chart) => chart.id === "visitors");
      expect(visitors.modes[0].hourly).toBeUndefined();
      expect(visitors.modes[0].series.length).toBeGreaterThan(0);
    });

    test("a chart whose query fails is left out and reported, and the others still publish", async () => {
      mockAthenaSend.mockImplementation((command) => {
        switch (command.constructor.name) {
          case "StartQueryExecutionCommand": {
            const failing = command.input.QueryString.includes("v_visitors_cloudfront_daily");
            return Promise.resolve({ QueryExecutionId: failing ? "failing-1" : "q" });
          }
          case "GetQueryExecutionCommand":
            return Promise.resolve({
              QueryExecution: {
                Status: command.input.QueryExecutionId.startsWith("failing")
                  ? { State: "FAILED", StateChangeReason: "TABLE_NOT_FOUND" }
                  : { State: "SUCCEEDED" },
              },
            });
          default:
            return Promise.resolve({ ResultSet: resultSetOfRows(["day", "component", "value"], []) });
        }
      });

      const { dailyCharts, failedChartIds } = await buildDailyCharts({ workGroup: "wg", database: "db", endDay: END_DAY });

      expect(failedChartIds).toEqual(["visitors"]);
      expect(dailyCharts.charts.map((chart) => chart.id)).not.toContain("visitors");
      expect(dailyCharts.charts).toHaveLength(6);
    });

    test("runAthenaQuery follows result pages, reading the header from the first only", async () => {
      mockAthenaSend.mockImplementation((command) => {
        switch (command.constructor.name) {
          case "StartQueryExecutionCommand":
            return Promise.resolve({ QueryExecutionId: "q" });
          case "GetQueryExecutionCommand":
            return Promise.resolve({ QueryExecution: { Status: { State: "SUCCEEDED" } } });
          case "GetQueryResultsCommand":
            return Promise.resolve(
              command.input.NextToken
                ? { ResultSet: { Rows: [{ Data: [varchar("2026-10-27"), varchar("b"), varchar("2")] }] } }
                : { ResultSet: resultSetOfRows(["day", "component", "value"], [["2026-10-28", "a", "1"]]), NextToken: "page-2" },
            );
          default:
            throw new Error(`unexpected command ${command.constructor.name}`);
        }
      });

      const rows = await runAthenaQuery({ workGroup: "wg", database: "db", sql: "SELECT 1" });

      expect(rows).toEqual([
        { day: "2026-10-28", component: "a", value: "1" },
        { day: "2026-10-27", component: "b", value: "2" },
      ]);
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
    const TODAY = new Date("2026-10-29T12:00:00Z");

    test("a sum over a window with no rows is a measured zero once the source began before the window ended", () => {
      const windows = toObservationWindows(
        { last_30: null, prev_30: null, last_90: null, prev_90: null, first_day: "2026-09-05" },
        "sum",
        TODAY,
      );

      expect(windows.last30.value).toBe(0);
      expect(windows.last90.value).toBe(0);
    });

    test("a window that ends before the source's first day stays not measured", () => {
      const windows = toObservationWindows(
        { last_30: "4", prev_30: null, last_90: "4", prev_90: null, first_day: "2026-10-20" },
        "sum",
        TODAY,
      );

      expect(windows.last30.value).toBe(4);
      expect(windows.last30.isNew).toBe(true);
      expect(windows.last30.trend).toBeNull();
    });

    test("an average over a covered window with no rows is flagged noEvents, and a window with a figure is not", () => {
      const windows = toObservationWindows({ last_30: null, last_90: "0.5", first_day: "2026-09-05" }, "avg", TODAY);

      expect(windows.last30).toMatchObject({ value: null, noEvents: true });
      expect(windows.last90.noEvents).toBeUndefined();
      expect(toObservationWindows({ last_30: null, first_day: "2026-10-30" }, "avg", TODAY).last30.noEvents).toBeUndefined();
    });

    test("a source with no first day reports nothing", () => {
      expect(toObservationWindows({ last_30: null, first_day: null }, "sum", TODAY).last30.value).toBeNull();
    });

    test("reads all four columns and computes each window's trend", () => {
      const windows = toObservationWindows({ last_30: "110", prev_30: "100", last_90: "300", prev_90: "300" });
      expect(windows.last30.value).toBe(110);
      expect(windows.last30.trend).toBeCloseTo(0.1);
      expect(windows.last90).toEqual({ value: 300, trend: 0 });
    });

    test("marks a non-zero window against an empty prior window as new", () => {
      const windows = toObservationWindows({ last_30: "4", prev_30: null, last_90: "4", prev_90: "0" });
      expect(windows.last30).toEqual({ value: 4, trend: null, isNew: true });
      expect(windows.last90).toEqual({ value: 4, trend: null, isNew: true });
    });

    test("does not mark a zero or absent window as new", () => {
      const windows = toObservationWindows({ last_30: "0", prev_30: "0", last_90: null, prev_90: null });
      expect(windows.last30).toEqual({ value: 0, trend: null });
      expect(windows.last90).toEqual({ value: null, trend: null });
    });

    test("carries the earliest day the data holds when the query reports it", () => {
      expect(toObservationWindows({ last_30: "1", data_since: "2026-09-28" }).dataSince).toBe("2026-09-28");
      expect(toObservationWindows({ last_30: "1" }).dataSince).toBeUndefined();
    });

    test("reads a missing row as every window null", () => {
      expect(toObservationWindows(undefined)).toEqual({
        today: { value: null },
        previousDay: { value: null },
        last7: { value: null },
        last30: { value: null, trend: null },
        last90: { value: null, trend: null },
      });
    });

    test("a live source's Today and Previous day are measured zeros once the source began", () => {
      const windows = toObservationWindows({ today: null, prev_1: null, last_7: "3", first_day: "2026-09-05" }, "sum", TODAY);
      expect(windows.today).toEqual({ value: 0 });
      expect(windows.previousDay).toEqual({ value: 0 });
      expect(windows.last7).toEqual({ value: 3 });
    });

    test("a whole-day source's Today is its latest reading with that reading's day, and never a zero", () => {
      const reported = toObservationWindows(
        { today: "12.5", today_as_of: "2026-10-28", prev_1: "12.5", first_day: "2026-09-05" },
        "sum",
        TODAY,
        { latestReading: true },
      );
      expect(reported.today).toEqual({ value: 12.5, asOf: "2026-10-28" });

      const silent = toObservationWindows({ today: null, today_as_of: null, first_day: "2026-09-05" }, "sum", TODAY, {
        latestReading: true,
      });
      expect(silent.today).toEqual({ value: null });
    });

    test("a monthly figure has no Today or Previous day", () => {
      const windows = toObservationWindows({ last_30: "5", first_day: "2026-01-01" }, "avg", TODAY, { periodic: true });
      expect(windows.today).toEqual({ value: null, notApplicable: true });
      expect(windows.previousDay).toEqual({ value: null, notApplicable: true });
    });

    test("Today is judged against the UK calendar day when the UTC day has not turned over yet", () => {
      const justAfterUkMidnight = new Date("2026-10-29T23:30:00Z");
      expect(toObservationWindows({ today: null, first_day: "2026-10-29" }, "sum", justAfterUkMidnight).today.value).toBe(0);
      const duringBst = new Date("2026-06-30T23:30:00Z");
      expect(toObservationWindows({ today: null, first_day: "2026-07-01" }, "sum", duringBst).today.value).toBe(0);
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

    // The first `failingStarts` executions fail with `reason`; every later one succeeds.
    function mockFailingThenSucceeding(reason, failingStarts) {
      let starts = 0;
      mockAthenaSend.mockImplementation((command) => {
        switch (command.constructor.name) {
          case "StartQueryExecutionCommand":
            starts += 1;
            return Promise.resolve({ QueryExecutionId: `qid-${starts}` });
          case "GetQueryExecutionCommand": {
            const start = Number(command.input.QueryExecutionId.slice(4));
            if (start <= failingStarts) {
              return Promise.resolve({ QueryExecution: { Status: { State: "FAILED", StateChangeReason: reason } } });
            }
            return Promise.resolve({ QueryExecution: { Status: { State: "SUCCEEDED" } } });
          }
          case "GetQueryResultsCommand":
            return Promise.resolve({ ResultSet: resultSetOf(["value"], ["7"]) });
          default:
            throw new Error(`unexpected command ${command.constructor.name}`);
        }
      });
      return () => starts;
    }

    const THROTTLED = "HIVE_S3_THROTTLING: Please reduce your request rate.";
    const INTERNAL_ERROR = "GENERIC_INTERNAL_ERROR: Cannot invoke a method because factory is null.";

    test("runAthenaQuery starts a query again when S3 throttled it", async () => {
      const startCount = mockFailingThenSucceeding(THROTTLED, 2);
      const rows = await runAthenaQuery({ workGroup: "wg", database: "db", sql: "SELECT 1" });
      expect(rows).toEqual([{ value: "7" }]);
      expect(startCount()).toBe(3);
    });

    test("runAthenaQuery gives up after its throttling retries", async () => {
      const startCount = mockFailingThenSucceeding(THROTTLED, 3);
      await expect(runAthenaQuery({ workGroup: "wg", database: "db", sql: "SELECT 1" })).rejects.toThrow("HIVE_S3_THROTTLING");
      expect(startCount()).toBe(3);
    });

    test("runAthenaQuery starts a query again once after Athena's own internal error, and then succeeds", async () => {
      const startCount = mockFailingThenSucceeding(INTERNAL_ERROR, 1);
      const rows = await runAthenaQuery({ workGroup: "wg", database: "db", sql: "SELECT 1" });
      expect(rows).toEqual([{ value: "7" }]);
      expect(startCount()).toBe(2);
    });

    test("runAthenaQuery fails when Athena's internal error comes back on the second run too", async () => {
      const startCount = mockFailingThenSucceeding(INTERNAL_ERROR, 2);
      await expect(runAthenaQuery({ workGroup: "wg", database: "db", sql: "SELECT 1" })).rejects.toThrow("GENERIC_INTERNAL_ERROR");
      expect(startCount()).toBe(2);
    });

    test("runAthenaQuery does not start a SQL error again", async () => {
      const startCount = mockFailingThenSucceeding("SYNTAX_ERROR: line 1:8: mismatched input 'FROM'.", 1);
      await expect(runAthenaQuery({ workGroup: "wg", database: "db", sql: "SELECT 1" })).rejects.toThrow("SYNTAX_ERROR");
      expect(startCount()).toBe(1);
    });

    test("runAthenaQuery does not start a query again for any other failure", async () => {
      mockQueriesWithOneFailing("SELECT 1", ["1", "2", "3", "4"]);
      await expect(runAthenaQuery({ workGroup: "wg", database: "db", sql: "SELECT 1" })).rejects.toThrow("TABLE_NOT_FOUND");
      const starts = mockAthenaSend.mock.calls.filter(([command]) => command.constructor.name === "StartQueryExecutionCommand");
      expect(starts).toHaveLength(1);
    });
  });

  describe("mapInOrderWithConcurrency", () => {
    test("returns results in input order while never running more than the limit at once", async () => {
      let running = 0;
      let peak = 0;
      const delays = [30, 5, 20, 1, 15, 10, 2];
      const results = await mapInOrderWithConcurrency(delays, 3, async (delay) => {
        running += 1;
        peak = Math.max(peak, running);
        await new Promise((resolve) => setTimeout(resolve, delay));
        running -= 1;
        return delay * 2;
      });
      expect(results).toEqual(delays.map((delay) => delay * 2));
      expect(peak).toBe(3);
    });

    test("answers an empty list with an empty list", async () => {
      expect(await mapInOrderWithConcurrency([], 5, async () => 1)).toEqual([]);
    });
  });

  describe("buildSnapshot", () => {
    test("runs one windowed query per view, one fast-window query per hourly view, and carries a deep link on every row", async () => {
      mockAllQueriesSucceedWith(["10", "5", "30", "20"]);

      const context = {
        envName: "test",
        region: "eu-west-2",
        athenaWorkGroupName: "test-env-analytics",
        githubRepo: "diy-accounting-uk/submit.diyaccounting.co.uk",
        ga4PropertyId: "523400333",
      };
      const snapshot = await buildSnapshot({ workGroup: "wg", database: "db", context });

      const startCalls = mockAthenaSend.mock.calls.filter(([command]) => command.constructor.name === "StartQueryExecutionCommand");
      expect(startCalls).toHaveLength(WINDOWED_QUERY_COUNT + FAST_WINDOW_VIEW_COUNT);

      expect(snapshot.environment).toBe("test");
      expect(snapshot.objectives).toHaveLength(10);

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
        "FROM   v_paid_landings_daily",
        "FROM   v_ads_cost_daily",
        "FROM   v_ads_cost_per_paid_landing_daily",
        "FROM   security_hub_findings",
        "FROM   guardduty_findings",
        "FROM   github_alerts",
        "FROM   v_returning_submitters_rolling_daily",
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
      expect(sqlStatements.some((sql) => sql.includes("visitor_kind = 'operator'"))).toBe(true);
      expect(sqlStatements.some((sql) => sql.includes("visitor_kind = 'bot'"))).toBe(true);
      expect(sqlStatements.some((sql) => sql.includes("visitor_kind = 'synthetic'"))).toBe(true);
    });

    test("publishes a windowed observation for each of the four visitor kinds", async () => {
      mockAllQueriesSucceedWith(["10", "5", "30", "20"]);

      const context = {
        envName: "test",
        region: "eu-west-2",
        athenaWorkGroupName: "test-env-analytics",
        githubRepo: "diy-accounting-uk/submit.diyaccounting.co.uk",
        ga4PropertyId: "523400333",
      };
      const snapshot = await buildSnapshot({ workGroup: "wg", database: "db", context });

      const conversion = snapshot.objectives.find((o) => o.id === "conversion-to-submission");
      for (const id of ["sessions-human", "sessions-operator", "sessions-authenticated", "sessions-bot", "sessions-synthetic"]) {
        const observation = conversion.observations.find((o) => o.id === id);
        expect(observation.last30).toEqual({ value: 10, trend: 1 });
        expect(observation.last90).toEqual({ value: 30, trend: 0.5 });
      }
    });

    test("splits revenue into Stripe donations and subscriptions by product label", async () => {
      mockAllQueriesSucceedWith(["10", "5", "30", "20"]);

      const context = {
        envName: "test",
        region: "eu-west-2",
        athenaWorkGroupName: "test-env-analytics",
        githubRepo: "diy-accounting-uk/submit.diyaccounting.co.uk",
        ga4PropertyId: "523400333",
      };
      const snapshot = await buildSnapshot({ workGroup: "wg", database: "db", context });

      const paid = snapshot.objectives.find((o) => o.id === "conversion-to-paid");
      const ids = paid.observations.map((o) => o.id);
      expect(ids).toEqual(expect.arrayContaining(["revenue-gbp", "revenue-donations-gbp", "donations-count", "revenue-subscriptions-gbp"]));
      const donations = paid.observations.find((o) => o.id === "revenue-donations-gbp");
      expect(donations.last30).toEqual({ value: 10, trend: 1 });
      const queries = mockAthenaSend.mock.calls
        .filter(([command]) => command.constructor.name === "StartQueryExecutionCommand")
        .map(([command]) => command.input.QueryString);
      expect(queries.some((q) => q.includes("FROM   v_revenue_daily") && q.includes("'donation-custom'"))).toBe(true);
      expect(queries.some((q) => q.includes("FROM   v_revenue_daily") && q.includes("NOT LIKE 'donation-%'"))).toBe(true);
    });

    test("publishes PayPal donation revenue and charges filtered to the donation-paypal product", async () => {
      mockAllQueriesSucceedWith(["10", "5", "30", "20"]);

      const context = {
        envName: "test",
        region: "eu-west-2",
        athenaWorkGroupName: "test-env-analytics",
        githubRepo: "diy-accounting-uk/submit.diyaccounting.co.uk",
        ga4PropertyId: "523400333",
      };
      const snapshot = await buildSnapshot({ workGroup: "wg", database: "db", context });

      const paid = snapshot.objectives.find((o) => o.id === "conversion-to-paid");
      const revenue = paid.observations.find((o) => o.id === "revenue-paypal-donations-gbp");
      expect(revenue.label).toBe("Revenue, PayPal donations");
      expect(revenue.unit).toBe("gbp");
      expect(revenue.last30).toEqual({ value: 10, trend: 1 });
      const charges = paid.observations.find((o) => o.id === "paypal-donations-count");
      expect(charges.label).toBe("PayPal donations, charges");
      expect(charges.unit).toBe("count");
      expect(charges.last30).toEqual({ value: 10, trend: 1 });
      const queries = mockAthenaSend.mock.calls
        .filter(([command]) => command.constructor.name === "StartQueryExecutionCommand")
        .map(([command]) => command.input.QueryString);
      expect(
        queries.some((q) => q.includes("FROM   v_revenue_daily") && q.includes("AND (product = 'donation-paypal') THEN revenue_gbp END")),
      ).toBe(true);
      expect(
        queries.some((q) => q.includes("FROM   v_revenue_daily") && q.includes("AND (product = 'donation-paypal') THEN charges END")),
      ).toBe(true);
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

    test("a failing view query answers null for every observation of that view and counts each one", async () => {
      mockQueriesWithOneFailing("FROM   v_dora_runs_daily", ["10", "5", "30", "20"]);

      const context = { envName: "test", region: "eu-west-2", athenaWorkGroupName: "wg", githubRepo: "r", ga4PropertyId: null };
      const snapshot = await buildSnapshot({ workGroup: "wg", database: "db", context });

      const uptime = snapshot.objectives.find((o) => o.id === "uptime");
      for (const id of ["deploy-frequency", "deploy-failure-rate"]) {
        expect(uptime.observations.find((o) => o.id === id).last30).toEqual({ value: null, trend: null });
      }
      expect(uptime.observations.find((o) => o.id === "probe-pass-rate").last30.value).toBe(10);
      expect(snapshot.failedObservationCount).toBe(2);
    });

    test("the company-accounts observation set reads turnover, profit and the balance sheet lines", async () => {
      mockQueriesWithRowsByFragment(
        {
          "cashatbank": ["3500.5", "3000", "3500.5", "3000"],
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
      expect(companyAccounts.observations).toHaveLength(14);

      const byId = Object.fromEntries(companyAccounts.observations.map((o) => [o.id, o]));
      expect(byId["company-cash-at-bank"].last30.value).toBe(3500.5);
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
      mockQueries({
        windowedRowFor: (line, sql) =>
          sql.includes("FROM   company_accounts") || sql.includes("FROM   v_company_runway")
            ? [null, null, null, null]
            : ["1", "1", "1", "1"],
      });

      const context = {
        envName: "test",
        region: "eu-west-2",
        athenaWorkGroupName: "test-env-analytics",
        githubRepo: "diy-accounting-uk/submit.diyaccounting.co.uk",
        ga4PropertyId: "523400333",
      };
      const snapshot = await buildSnapshot({ workGroup: "wg", database: "db", context });

      const companyAccounts = snapshot.objectives.find((o) => o.id === "company-accounts");
      expect(companyAccounts.observations).toHaveLength(14);
      for (const observation of companyAccounts.observations.filter((o) => o.source !== "v_contribution_daily")) {
        expect(observation.last30).toEqual({ value: null, trend: null });
        expect(observation.last90).toEqual({ value: null, trend: null });
      }
      expect(snapshot.failedObservationCount).toBe(0);
    });

    test("the activity-started-and-completed observation set has a started and completed pair for every prod-listed catalogue activity", async () => {
      mockAllQueriesSucceedWith(["4", "3", "9", "7"]);

      const context = {
        envName: "test",
        region: "eu-west-2",
        athenaWorkGroupName: "test-env-analytics",
        githubRepo: "diy-accounting-uk/submit.diyaccounting.co.uk",
        ga4PropertyId: "523400333",
      };
      const snapshot = await buildSnapshot({ workGroup: "wg", database: "db", context });

      const activities = snapshot.objectives.find((o) => o.id === "activity-started-and-completed");
      const catalog = loadCatalogFromRoot();
      const prodActivityIds = (catalog.activities || [])
        .filter((activity) => isActivityListedInEnvironment(activity, "prod"))
        .map((activity) => activity.id);

      expect(prodActivityIds.length).toBeGreaterThan(0);
      expect(activities.observations).toHaveLength(prodActivityIds.length * 2);
      for (const activityId of prodActivityIds) {
        expect(activities.observations.some((o) => o.id === `${activityId}::started`)).toBe(true);
        expect(activities.observations.some((o) => o.id === `${activityId}::completed`)).toBe(true);
      }
      for (const observation of activities.observations) {
        expect(observation.deepLink).toEqual(expect.any(String));
      }

      // self-employed is catalogued but not listed in prod (environments excludes it) -- its
      // pair must not appear, or a non-prod activity would silently join the operator's table.
      expect(activities.observations.some((o) => o.id === "self-employed::started")).toBe(false);
    });
  });

  describe("reinvestment budget", () => {
    const context = {
      envName: "test",
      region: "eu-west-2",
      athenaWorkGroupName: "test-env-analytics",
      githubRepo: "diy-accounting-uk/submit.diyaccounting.co.uk",
      ga4PropertyId: "523400333",
    };

    test("the reinvestment fraction is one fifth", () => {
      expect(REINVESTMENT_FRACTION).toBe(0.2);
    });

    test("the revenue observation sums only the days after the 30-day cutoff into its trailing window", () => {
      const revenue = OBJECTIVE_DEFINITIONS.flatMap((o) => o.observations).find((o) => o.id === "revenue-gbp");
      const sql = buildWindowedBatchSql({ view: revenue.view, dayColumn: revenue.dayColumn, observations: [revenue] });
      const trailingColumn = sql.split("\n").find((line) => line.includes("AS o0_last_30"));

      expect(trailingColumn.trim()).toBe("sum(CASE WHEN day > date_add('day', -30, current_date) THEN revenue_gbp END) AS o0_last_30,");
      expect(sql).toContain("FROM   v_revenue_daily");
    });

    test("buildReinvestment gives a budget of the fraction of the trailing 30-day revenue", () => {
      const objectives = [{ id: "conversion-to-paid", observations: [{ id: "revenue-gbp", last30: { value: 250 } }] }];

      expect(buildReinvestment(objectives)).toEqual({ fraction: 0.2, trailing30IncomeGbp: 250, budgetGbp: 50 });
    });

    test("buildReinvestment gives no budget while the revenue query has no figure", () => {
      const objectives = [{ id: "conversion-to-paid", observations: [{ id: "revenue-gbp", last30: { value: null } }] }];

      expect(buildReinvestment(objectives)).toEqual({ fraction: 0.2, trailing30IncomeGbp: null, budgetGbp: null });
    });

    test("buildSnapshot carries the reinvestment figures from the revenue observation", async () => {
      mockAllQueriesSucceedWith(["100", "50", "300", "200"]);

      const snapshot = await buildSnapshot({ workGroup: "wg", database: "db", context });

      expect(snapshot.reinvestment).toEqual({ fraction: 0.2, trailing30IncomeGbp: 100, budgetGbp: 20 });
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

  describe("buildFastWindowBatchSql", () => {
    const midnightToday =
      "CAST(with_timezone(date_trunc('day', CAST(current_timestamp AT TIME ZONE 'Europe/London' AS timestamp)), 'Europe/London') AT TIME ZONE 'UTC' AS timestamp)";
    const midnightYesterday =
      "CAST(with_timezone(date_trunc('day', CAST(current_timestamp AT TIME ZONE 'Europe/London' AS timestamp)) - interval '1' day, 'Europe/London') AT TIME ZONE 'UTC' AS timestamp)";

    test("builds Today, Previous day and Last 7 days for every observation of one hourly view in one query", () => {
      const sql = buildFastWindowBatchSql({
        fastWindowView: "v_activity_started_hourly",
        fastWindowColumn: "hour",
        observations: [
          { valueExpr: "starts", aggregation: "sum", where: "activity = 'submit-vat'" },
          { valueExpr: "starts", aggregation: "sum", where: "activity = 'bundle'" },
        ],
      });
      expect(sql).toContain("FROM   v_activity_started_hourly");
      expect(sql).toContain(`sum(CASE WHEN hour >= ${midnightToday} AND (activity = 'submit-vat') THEN starts END) AS o0_today`);
      expect(sql).toContain(
        `sum(CASE WHEN hour >= ${midnightYesterday} AND hour < ${midnightToday} AND (activity = 'submit-vat') THEN starts END) AS o0_prev_1`,
      );
      expect(sql).toContain(
        "sum(CASE WHEN hour > date_add('day', -7, current_timestamp) AND (activity = 'submit-vat') THEN starts END) AS o0_last_7",
      );
      expect(sql).toContain(`sum(CASE WHEN hour >= ${midnightToday} AND (activity = 'bundle') THEN starts END) AS o1_today`);
      expect(sql).not.toContain("WHERE");
      expect(sql).not.toContain("last_30");
    });

    test("adds no filter for an observation without a where clause", () => {
      const sql = buildFastWindowBatchSql({
        fastWindowView: "v_visitors_by_kind_hourly",
        fastWindowColumn: "hour",
        observations: [{ valueExpr: "sessions", aggregation: "sum" }],
      });
      expect(sql).toBe(
        `SELECT sum(CASE WHEN hour >= ${midnightToday} THEN sessions END) AS o0_today,\n` +
          `       sum(CASE WHEN hour >= ${midnightYesterday} AND hour < ${midnightToday} THEN sessions END) AS o0_prev_1,\n` +
          "       sum(CASE WHEN hour > date_add('day', -7, current_timestamp) THEN sessions END) AS o0_last_7,\n" +
          "       cast(min(hour) AS varchar) AS o0_first_hour\n" +
          "FROM   v_visitors_by_kind_hourly",
      );
    });
  });

  describe("toActivityFastWindows", () => {
    test("empty fast windows read zero when the hourly view holds rows and null when it holds none", () => {
      expect(toActivityFastWindows({ today: null, prev_1: "2", last_7: "5", first_hour: "2026-10-22 10:00:00.000" })).toEqual({
        today: { value: 0 },
        previousDay: { value: 2 },
        last7: { value: 5 },
      });
      expect(toActivityFastWindows({ today: null, prev_1: null, last_7: null, first_hour: null }).today.value).toBeNull();
    });

    test("reads the three columns, each with no trend", () => {
      expect(toActivityFastWindows({ today: "1", prev_1: "4", last_7: "20" })).toEqual({
        today: { value: 1 },
        previousDay: { value: 4 },
        last7: { value: 20 },
      });
    });

    test("reads a missing row as every window null", () => {
      expect(toActivityFastWindows(undefined)).toEqual({
        today: { value: null },
        previousDay: { value: null },
        last7: { value: null },
      });
    });
  });

  describe("hourly-grain observations in the snapshot", () => {
    const visitorIds = ["sessions-human", "sessions-operator", "sessions-authenticated"];
    const context = {
      envName: "test",
      region: "eu-west-2",
      athenaWorkGroupName: "test-env-analytics",
      githubRepo: "r",
      ga4PropertyId: null,
    };

    test("one query per hourly view answers every activity and visitor observation that reads it", async () => {
      mockFastWindowBatchAnswering({ today: "1", previousDay: "3", last7: "12" });
      await buildSnapshot({ workGroup: "wg", database: "db", context });

      const sqlStatements = mockAthenaSend.mock.calls
        .filter(([command]) => command.constructor.name === "StartQueryExecutionCommand")
        .map(([command]) => command.input.QueryString);
      const hourly = sqlStatements.filter((sql) => /FROM   \w+_hourly/.test(sql));
      expect(hourly).toHaveLength(3);
      const visitors = hourly.find((sql) => sql.includes("FROM   v_visitors_by_kind_hourly"));
      for (const kind of ["human", "operator", "authenticated"]) {
        expect(visitors).toContain(`AND (visitor_kind = '${kind}') THEN sessions END`);
      }
    });

    test("an hourly figure replaces the day-grain Today, Previous day and Last 7 days and leaves the 30 and 90 day windows", async () => {
      mockFastWindowBatchAnswering({ today: "1", previousDay: "3", last7: "12" });
      const snapshot = await buildSnapshot({ workGroup: "wg", database: "db", context });

      const conversion = snapshot.objectives.find((o) => o.id === "conversion-to-submission");
      const human = conversion.observations.find((o) => o.id === "sessions-human");
      expect(human.today).toEqual({ value: 1 });
      expect(human.previousDay).toEqual({ value: 3 });
      expect(human.last7).toEqual({ value: 12 });
      expect(human.last30.value).toBe(10);
      expect(conversion.observations.filter((o) => o.id.startsWith("sessions-")).length).toBeGreaterThan(visitorIds.length);
    });

    test("a visitor's hourly figures are null when the hourly view has no rows", async () => {
      mockFastWindowBatchAnswering({ today: null, previousDay: null, last7: null });
      const snapshot = await buildSnapshot({ workGroup: "wg", database: "db", context });

      const human = snapshot.objectives
        .find((o) => o.id === "conversion-to-submission")
        .observations.find((o) => o.id === "sessions-human");
      expect(human.today).toEqual({ value: null });
      expect(human.last7).toEqual({ value: null });
    });

    test("a failing hourly query leaves its observations on the day-grain windows and counts each one as failed", async () => {
      mockQueriesWithOneFailing("v_visitors_by_kind_hourly", ["1", "1", "1", "1"]);
      const snapshot = await buildSnapshot({ workGroup: "wg", database: "db", context });

      expect(snapshot.failedObservationCount).toBe(visitorIds.length);
    });
  });

  describe("handler", () => {
    test("requires its environment variables", async () => {
      delete process.env.ANALYTICS_LAKE_BUCKET_NAME;
      await expect(handler()).rejects.toThrow(/ANALYTICS_LAKE_BUCKET_NAME/);
    });

    test("builds and writes a whole snapshot", async () => {
      mockAllQueriesSucceedWith(["10", "5", "30", "20"]);

      const result = await handler();

      expect(result).toEqual({ environment: "test", objectives: 10 });
      expect(mockS3Send).toHaveBeenCalledTimes(2);
    });

    test("a failing cost drivers query publishes the snapshot without them and counts as one failure", async () => {
      mockQueriesWithOneFailing("LIMIT  10", ["10", "5", "30", "20"]);

      await expect(handler()).rejects.toThrow(/1 observation/);
      const putCalls = mockS3Send.mock.calls.filter(([command]) => command.constructor.name === "PutObjectCommand");
      expect(JSON.parse(putCalls[0][0].input.Body).costDrivers).toBeUndefined();
    });

    test("still publishes the snapshot but rejects when an observation failed, so the Lambda's Errors metric still fires", async () => {
      mockQueriesWithOneFailing("guardduty_findings", ["10", "5", "30", "20"]);

      await expect(handler()).rejects.toThrow(/1 observation/);
      expect(mockS3Send).toHaveBeenCalledTimes(2);
    });
  });
});
