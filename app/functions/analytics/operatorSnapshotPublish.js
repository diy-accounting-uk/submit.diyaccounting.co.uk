// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/analytics/operatorSnapshotPublish.js
//
// Nightly job that reads the analytics views behind the one-stop objectives dashboard and
// writes one JSON snapshot per environment: the trailing 30 and 90 days for each of the eight
// objectives' observations, each carrying its value, its trend against the prior comparable
// period, and a deep link to where the operator can see more. The API route
// (operatorSnapshotGet.js) only ever reads what this Lambda writes; it never queries Athena
// itself, so the dashboard stays fast even while a query here is slow.

import { AthenaClient, StartQueryExecutionCommand, GetQueryExecutionCommand, GetQueryResultsCommand } from "@aws-sdk/client-athena";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { createLogger } from "../../lib/logger.js";
import {
  buildCloudWatchDashboardLink,
  buildCloudWatchAlarmsOverviewLink,
  buildAthenaSavedQueryLink,
  buildGithubActionsWorkflowLink,
  buildGa4ReportsLink,
} from "../../lib/consoleLinks.js";

const logger = createLogger({ source: "app/functions/analytics/operatorSnapshotPublish.js" });

/**
 * Every observation names a view under infra/main/resources/analytics/views, the column it
 * reads, how to aggregate it across a window (sum for a count, avg for a ratio), and the deep
 * link the page shows beside it. Objectives with no observation yet (low running cost,
 * security, retention, operator effort, compliance) still appear on the page as an empty
 * section: each waits on its own lake source, not on this Lambda.
 */
export const OBJECTIVE_DEFINITIONS = [
  {
    id: "uptime",
    name: "Uptime",
    observations: [
      {
        id: "probe-pass-rate",
        label: "Probe pass rate",
        unit: "ratio",
        view: "v_availability_sli_daily",
        dayColumn: "day",
        valueExpr: "pass_rate",
        aggregation: "avg",
        deepLink: (ctx) => buildCloudWatchDashboardLink(ctx.region, `${ctx.envName}-env-operations`),
      },
      {
        id: "error-budget-remaining-runs",
        label: "Error budget remaining",
        unit: "runs",
        view: "v_availability_sli_daily",
        dayColumn: "day",
        valueExpr: "budget_remaining_runs",
        aggregation: "sum",
        deepLink: (ctx) => buildCloudWatchDashboardLink(ctx.region, `${ctx.envName}-env-operations`),
      },
      {
        id: "alarms-fired",
        label: "Alarms fired",
        unit: "count",
        view: "v_alarm_state_changes_daily",
        dayColumn: "day",
        valueExpr: "times_fired",
        aggregation: "sum",
        deepLink: (ctx) => buildCloudWatchAlarmsOverviewLink(ctx.region),
      },
      {
        id: "deploy-frequency",
        label: "Deploy frequency",
        unit: "count",
        view: "v_dora_runs_daily",
        dayColumn: "day",
        valueExpr: "runs",
        aggregation: "sum",
        where: "workflow = 'deploy'",
        deepLink: (ctx) => buildGithubActionsWorkflowLink(ctx.githubRepo, "deploy.yml"),
      },
      {
        id: "deploy-failure-rate",
        label: "Deploy failure rate",
        unit: "ratio",
        view: "v_dora_runs_daily",
        dayColumn: "day",
        valueExpr: "failure_rate",
        aggregation: "avg",
        where: "workflow = 'deploy'",
        deepLink: (ctx) => buildGithubActionsWorkflowLink(ctx.githubRepo, "deploy.yml"),
      },
    ],
  },
  {
    id: "conversion-to-submission",
    name: "Conversion to submission",
    observations: [
      {
        id: "login-to-submission-conversion",
        label: "Login-to-submission conversion",
        unit: "ratio",
        view: "v_login_to_submission_funnel",
        dayColumn: "cohort_day",
        valueExpr: "conversion",
        aggregation: "avg",
        deepLink: (ctx) => buildCloudWatchDashboardLink(ctx.region, `${ctx.envName}-env-analytics`),
      },
      {
        id: "completions-by-activity",
        label: "Completions, all activities",
        unit: "count",
        view: "v_submissions_by_activity_daily",
        dayColumn: "day",
        valueExpr: "completions",
        aggregation: "sum",
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
      {
        id: "new-accounts",
        label: "New accounts",
        unit: "count",
        view: "v_signup_to_first_submission",
        dayColumn: "signup_day",
        valueExpr: "new_accounts",
        aggregation: "sum",
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
      {
        id: "sessions-by-channel",
        label: "Sessions, all channels",
        unit: "count",
        view: "v_traffic_sources_daily",
        dayColumn: "day",
        valueExpr: "sessions",
        aggregation: "sum",
        deepLink: (ctx) => buildGa4ReportsLink(ctx.ga4PropertyId),
      },
    ],
  },
  {
    id: "conversion-to-paid",
    name: "Conversion to paid",
    observations: [
      {
        id: "revenue-gbp",
        label: "Revenue",
        unit: "gbp",
        view: "v_revenue_daily",
        dayColumn: "day",
        valueExpr: "revenue_gbp",
        aggregation: "sum",
        deepLink: (ctx) => buildCloudWatchDashboardLink(ctx.region, `${ctx.envName}-env-analytics`),
      },
      {
        id: "passes-issued",
        label: "Passes issued",
        unit: "count",
        view: "v_pass_redemptions_daily",
        dayColumn: "day",
        valueExpr: "passes_issued",
        aggregation: "sum",
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
      {
        id: "passes-redeemed",
        label: "Passes redeemed",
        unit: "count",
        view: "v_pass_redemptions_daily",
        dayColumn: "day",
        valueExpr: "passes_redeemed",
        aggregation: "sum",
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
    ],
  },
  { id: "low-running-cost", name: "Low running cost", observations: [] },
  { id: "security", name: "Security", observations: [] },
  { id: "retention", name: "Retention", observations: [] },
  { id: "operator-effort", name: "Operator effort", observations: [] },
  { id: "compliance", name: "Compliance", observations: [] },
];

let cachedAthenaClient = null;
let cachedS3Client = null;

function getAthenaClient() {
  if (!cachedAthenaClient) {
    cachedAthenaClient = new AthenaClient({ region: process.env.AWS_REGION || "eu-west-2" });
  }
  return cachedAthenaClient;
}

function getS3Client() {
  if (!cachedS3Client) {
    cachedS3Client = new S3Client({ region: process.env.AWS_REGION || "eu-west-2" });
  }
  return cachedS3Client;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Athena polling and result parsing, duplicated from analyticsMetricsPublish.js rather than
// imported: that module's query shape is one metric for one day, this one is a windowed
// trend for one observation, and the two are free to diverge without either dragging the
// other's tests along.
export async function pollUntilTerminal(athenaClient, queryExecutionId) {
  const maxAttempts = Number(process.env.ATHENA_POLL_MAX_ATTEMPTS || 90);
  const intervalMs = Number(process.env.ATHENA_POLL_INTERVAL_MS || 1000);

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const { QueryExecution } = await athenaClient.send(new GetQueryExecutionCommand({ QueryExecutionId: queryExecutionId }));
    const state = QueryExecution?.Status?.State;

    if (state === "SUCCEEDED") return;
    if (state === "FAILED" || state === "CANCELLED") {
      const reason = QueryExecution?.Status?.StateChangeReason || "no reason given";
      throw new Error(`Athena query ${queryExecutionId} ${state}: ${reason}`);
    }
    await sleep(intervalMs);
  }

  throw new Error(`Athena query ${queryExecutionId} did not reach a terminal state after ${maxAttempts} polls`);
}

export function parseResultSet(resultSet) {
  const rows = resultSet?.Rows ?? [];
  if (rows.length === 0) return [];

  const header = rows[0].Data.map((cell) => cell.VarCharValue);
  return rows.slice(1).map((row) => {
    const record = {};
    header.forEach((columnName, index) => {
      record[columnName] = row.Data?.[index]?.VarCharValue ?? null;
    });
    return record;
  });
}

export async function runAthenaQuery({ workGroup, database, sql }) {
  const athenaClient = getAthenaClient();

  const { QueryExecutionId } = await athenaClient.send(
    new StartQueryExecutionCommand({
      QueryString: sql,
      QueryExecutionContext: { Database: database },
      WorkGroup: workGroup,
    }),
  );

  await pollUntilTerminal(athenaClient, QueryExecutionId);

  const { ResultSet } = await athenaClient.send(new GetQueryResultsCommand({ QueryExecutionId }));
  return parseResultSet(ResultSet);
}

/**
 * One query per observation, computing the trailing 30 and 90 day figures and their
 * immediately preceding comparable periods (the 30 or 90 days before that) in a single pass,
 * so a day with no rows for a window reads as SQL NULL rather than a false zero.
 *
 * @param {{view: string, dayColumn: string, valueExpr: string, aggregation: string, where?: string}} observation
 * @returns {string}
 */
export function buildWindowedSql({ view, dayColumn, valueExpr, aggregation, where }) {
  const whereClause = where ? `\nWHERE  ${where}` : "";
  return (
    `SELECT ${aggregation}(CASE WHEN ${dayColumn} > date_add('day', -30, current_date) THEN ${valueExpr} END) AS last_30,\n` +
    `       ${aggregation}(CASE WHEN ${dayColumn} > date_add('day', -60, current_date) AND ${dayColumn} <= date_add('day', -30, current_date) THEN ${valueExpr} END) AS prev_30,\n` +
    `       ${aggregation}(CASE WHEN ${dayColumn} > date_add('day', -90, current_date) THEN ${valueExpr} END) AS last_90,\n` +
    `       ${aggregation}(CASE WHEN ${dayColumn} > date_add('day', -180, current_date) AND ${dayColumn} <= date_add('day', -90, current_date) THEN ${valueExpr} END) AS prev_90\n` +
    `FROM   ${view}${whereClause}`
  );
}

function toNumberOrNull(value) {
  if (value === null || value === undefined) return null;
  return Number(value);
}

/**
 * A window's trend against the prior comparable window, as a fraction (0.1 is a 10% rise).
 * Null whenever either side is missing or the prior period was zero, rather than a divide
 * that reads as an infinite or undefined rise.
 */
export function computeTrend(current, previous) {
  if (current === null || previous === null || previous === 0) return null;
  return (current - previous) / previous;
}

export function toObservationWindows(row) {
  const last30 = toNumberOrNull(row?.last_30);
  const prev30 = toNumberOrNull(row?.prev_30);
  const last90 = toNumberOrNull(row?.last_90);
  const prev90 = toNumberOrNull(row?.prev_90);
  return {
    last30: { value: last30, trend: computeTrend(last30, prev30) },
    last90: { value: last90, trend: computeTrend(last90, prev90) },
  };
}

/**
 * Runs every observation's query and assembles the snapshot document, organised by objective.
 *
 * @param {{workGroup: string, database: string, context: object}} params
 * @returns {Promise<object>}
 */
export async function buildSnapshot({ workGroup, database, context }) {
  const objectives = [];
  for (const objective of OBJECTIVE_DEFINITIONS) {
    const observations = [];
    for (const observation of objective.observations) {
      const sql = buildWindowedSql(observation);
      const rows = await runAthenaQuery({ workGroup, database, sql });
      const windows = toObservationWindows(rows[0]);
      observations.push({
        id: observation.id,
        label: observation.label,
        unit: observation.unit,
        last30: windows.last30,
        last90: windows.last90,
        deepLink: observation.deepLink(context),
      });
    }
    objectives.push({ id: objective.id, name: objective.name, observations });
  }

  return {
    generatedAt: new Date().toISOString(),
    environment: context.envName,
    objectives,
  };
}

/**
 * Writes the snapshot to its latest pointer and a dated copy alongside it, so the page always
 * reads the same key while a historical run stays available under its own date.
 *
 * @param {{bucket: string, envName: string, snapshot: object}} params
 */
export async function writeSnapshot({ bucket, envName, snapshot }) {
  const s3Client = getS3Client();
  const body = JSON.stringify(snapshot, null, 2);
  const date = snapshot.generatedAt.slice(0, 10);

  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: `snapshots/${envName}/latest.json`,
      Body: body,
      ContentType: "application/json",
    }),
  );
  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: `snapshots/${envName}/${date}.json`,
      Body: body,
      ContentType: "application/json",
    }),
  );
}

export async function handler() {
  const envName = process.env.ENVIRONMENT_NAME;
  const workGroup = process.env.ATHENA_WORK_GROUP_NAME;
  const database = process.env.GLUE_DATABASE_NAME;
  const lakeBucket = process.env.ANALYTICS_LAKE_BUCKET_NAME;
  if (!envName) throw new Error("ENVIRONMENT_NAME environment variable is required");
  if (!workGroup) throw new Error("ATHENA_WORK_GROUP_NAME environment variable is required");
  if (!database) throw new Error("GLUE_DATABASE_NAME environment variable is required");
  if (!lakeBucket) throw new Error("ANALYTICS_LAKE_BUCKET_NAME environment variable is required");

  const context = {
    envName,
    region: process.env.AWS_REGION || "eu-west-2",
    athenaWorkGroupName: workGroup,
    githubRepo: process.env.GITHUB_REPO || "diy-accounting-uk/submit.diyaccounting.co.uk",
    ga4PropertyId: process.env.GA4_PROPERTY_ID || null,
  };

  const snapshot = await buildSnapshot({ workGroup, database, context });
  await writeSnapshot({ bucket: lakeBucket, envName, snapshot });

  logger.info({
    message: "Operator snapshot published",
    environment: envName,
    objectives: snapshot.objectives.length,
  });

  return { environment: envName, objectives: snapshot.objectives.length };
}
