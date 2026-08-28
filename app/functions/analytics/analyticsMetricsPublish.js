// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/functions/analytics/analyticsMetricsPublish.js
//
// Nightly job that turns yesterday's row from each WP-6 Athena view into a CloudWatch custom
// metric in the Submit/Analytics namespace, so the operator's dashboard shows business numbers
// next to the operational ones. A query that fails throws and stops the run before anything is
// published: a missing metric for a day is a visible gap, a published zero for a query that
// actually errored would read as "nothing happened" and hide the failure.

import {
  AthenaClient,
  StartQueryExecutionCommand,
  GetQueryExecutionCommand,
  GetQueryResultsCommand,
} from "@aws-sdk/client-athena";
import { CloudWatchClient, PutMetricDataCommand } from "@aws-sdk/client-cloudwatch";
import { createLogger } from "../../lib/logger.js";

const logger = createLogger({ source: "app/functions/analytics/analyticsMetricsPublish.js" });

const SECONDS_PER_DAY = 24 * 60 * 60;

// Namespace the dashboard reads from and the Lambda's IAM policy scopes PutMetricData to via a
// cloudwatch:namespace condition. Fixed rather than read from the environment: the CDK grant and
// this literal have to match exactly, and a per-environment namespace was never asked for.
export const METRICS_NAMESPACE = "Submit/Analytics";

// PutMetricData accepts at most 20 MetricDatum entries per call.
const PUT_METRIC_DATA_BATCH_SIZE = 20;

/**
 * One row per view, read for yesterday's date (or the day named by an explicit column). Column
 * names for v_active_users_daily, v_submissions_daily, v_login_to_submission_funnel and
 * v_hmrc_failures_by_class come straight from the SQL sketches in
 * PLAN_USAGE_DATA_PIPELINE.md's WP-6 section. v_pass_redemptions_daily, v_revenue_daily,
 * v_signup_to_first_submission and v_traffic_by_country_daily have no SQL sketch there, only the
 * question they answer, so the columns below (pass_type/issued/redeemed, product/revenue_gbp,
 * signup_day/new_accounts, country/sessions) are this Lambda's side of that contract. The view
 * implementation has to land with matching column names.
 *
 * Submissions, PassesIssued, PassesRedeemed, RevenueGbp and HmrcFailures carry a dimension, so
 * one day's query can produce more than one datum: one per distinct outcome, pass type, product
 * or failure class. Sessions is capped to the top 5 countries by volume in its own query, per the
 * design's "Sessions: Country, top 5 only". The other dimensioned metrics stay within the
 * account's ~20 custom-metric budget because those categories are small and fixed by the product
 * (outcomes, pass types, products, HMRC failure classes), not because anything here enforces a
 * limit on them.
 */
export const METRIC_DEFINITIONS = [
  {
    metricName: "ActiveUsers",
    unit: "Count",
    valueColumn: "active_users",
    dimension: null,
    sql: (day) => `SELECT active_users FROM v_active_users_daily WHERE day = DATE '${day}'`,
  },
  {
    metricName: "Submissions",
    unit: "Count",
    valueColumn: "submissions",
    dimension: { name: "Outcome", column: "outcome" },
    sql: (day) => `SELECT outcome, submissions FROM v_submissions_daily WHERE day = DATE '${day}'`,
  },
  {
    metricName: "Submitters",
    unit: "Count",
    valueColumn: "submitters",
    dimension: null,
    // Summed across outcomes: the view groups by (day, outcome), and this metric has no
    // dimension, so one datum for the day is wanted, not one per outcome carrying the same name.
    sql: (day) => `SELECT sum(submitters) AS submitters FROM v_submissions_daily WHERE day = DATE '${day}'`,
  },
  {
    metricName: "LoginToSubmissionConversion",
    unit: "None",
    valueColumn: "conversion",
    dimension: null,
    sql: (day) => `SELECT conversion FROM v_login_to_submission_funnel WHERE cohort_day = DATE '${day}'`,
  },
  {
    metricName: "PassesIssued",
    unit: "Count",
    valueColumn: "issued",
    dimension: { name: "PassType", column: "pass_type" },
    sql: (day) => `SELECT pass_type, issued FROM v_pass_redemptions_daily WHERE day = DATE '${day}'`,
  },
  {
    metricName: "PassesRedeemed",
    unit: "Count",
    valueColumn: "redeemed",
    dimension: { name: "PassType", column: "pass_type" },
    sql: (day) => `SELECT pass_type, redeemed FROM v_pass_redemptions_daily WHERE day = DATE '${day}'`,
  },
  {
    metricName: "RevenueGbp",
    unit: "None",
    valueColumn: "revenue_gbp",
    dimension: { name: "Product", column: "product" },
    sql: (day) => `SELECT product, revenue_gbp FROM v_revenue_daily WHERE day = DATE '${day}'`,
  },
  {
    metricName: "HmrcFailures",
    unit: "Count",
    valueColumn: "failures",
    dimension: { name: "FailureClass", column: "failure_class" },
    sql: (day) =>
      `SELECT failure_class, sum(failures) AS failures FROM v_hmrc_failures_by_class WHERE day = DATE '${day}' GROUP BY failure_class`,
  },
  {
    metricName: "NewAccounts",
    unit: "Count",
    valueColumn: "new_accounts",
    dimension: null,
    sql: (day) => `SELECT new_accounts FROM v_signup_to_first_submission WHERE signup_day = DATE '${day}'`,
  },
  {
    metricName: "Sessions",
    unit: "Count",
    valueColumn: "sessions",
    dimension: { name: "Country", column: "country" },
    sql: (day) =>
      `SELECT country, sessions FROM v_traffic_by_country_daily WHERE day = DATE '${day}' ORDER BY sessions DESC LIMIT 5`,
  },
];

let cachedAthenaClient = null;
let cachedCloudWatchClient = null;

function getAthenaClient() {
  if (!cachedAthenaClient) {
    cachedAthenaClient = new AthenaClient({ region: process.env.AWS_REGION || "eu-west-2" });
  }
  return cachedAthenaClient;
}

function getCloudWatchClient() {
  if (!cachedCloudWatchClient) {
    cachedCloudWatchClient = new CloudWatchClient({ region: process.env.AWS_REGION || "eu-west-2" });
  }
  return cachedCloudWatchClient;
}

/**
 * Yesterday's date in UTC, as "YYYY-MM-DD". The default reporting day: a run that fires at
 * 05:00 UTC reports the day that just ended.
 *
 * @returns {string}
 */
export function defaultTargetDate() {
  const now = new Date();
  const yesterday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
  return yesterday.toISOString().slice(0, 10);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Poll GetQueryExecution until the query reaches a terminal state, with a bounded number of
 * attempts. Throws on FAILED, CANCELLED, or exhausting the attempt budget, rather than ever
 * returning a "probably fine" result for an execution that never confirmed success.
 *
 * @param {AthenaClient} athenaClient
 * @param {string} queryExecutionId
 * @returns {Promise<void>}
 */
export async function pollUntilTerminal(athenaClient, queryExecutionId) {
  const maxAttempts = Number(process.env.ATHENA_POLL_MAX_ATTEMPTS || 20);
  const intervalMs = Number(process.env.ATHENA_POLL_INTERVAL_MS || 500);

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const { QueryExecution } = await athenaClient.send(
      new GetQueryExecutionCommand({ QueryExecutionId: queryExecutionId }),
    );
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

/**
 * Athena's GetQueryResults returns the column header as the first row. Turns that plus the data
 * rows into plain objects keyed by column name.
 *
 * @param {{Rows?: {Data?: {VarCharValue?: string}[]}[]}} resultSet
 * @returns {Record<string, string|null>[]}
 */
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

/**
 * Start one Athena query, wait for it to succeed, and return its rows.
 *
 * @param {{workGroup: string, database: string, sql: string}} params
 * @returns {Promise<Record<string, string|null>[]>}
 */
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
 * Turn one metric definition's query rows into CloudWatch MetricDatum entries. A row whose
 * value column is null or missing is skipped rather than published as zero: that happens when a
 * view genuinely has no data for the day (nobody triggered that failure class, say), which is a
 * true absence, not the "query errored" case this Lambda refuses to mask.
 *
 * @param {object} definition - one entry from METRIC_DEFINITIONS
 * @param {Record<string, string|null>[]} rows
 * @param {Date} timestamp
 * @returns {object[]} CloudWatch MetricDatum entries
 */
export function toMetricData(definition, rows, timestamp) {
  const datums = [];
  for (const row of rows) {
    const rawValue = row[definition.valueColumn];
    if (rawValue === null || rawValue === undefined) continue;

    datums.push({
      MetricName: definition.metricName,
      Value: Number(rawValue),
      Unit: definition.unit,
      Timestamp: timestamp,
      Dimensions: definition.dimension
        ? [{ Name: definition.dimension.name, Value: row[definition.dimension.column] }]
        : [],
    });
  }
  return datums;
}

/**
 * Publish metric data in batches of 20, the most PutMetricData accepts in one call.
 *
 * @param {object[]} metricData
 * @param {string} namespace
 * @returns {Promise<void>}
 */
export async function publishMetricData(metricData, namespace) {
  if (metricData.length === 0) return;

  const cloudWatchClient = getCloudWatchClient();
  for (let start = 0; start < metricData.length; start += PUT_METRIC_DATA_BATCH_SIZE) {
    const batch = metricData.slice(start, start + PUT_METRIC_DATA_BATCH_SIZE);
    await cloudWatchClient.send(new PutMetricDataCommand({ Namespace: namespace, MetricData: batch }));
  }
}

/**
 * Run every metric definition's Athena query for the target day and publish the results as
 * CloudWatch metrics. Queries run to completion, one after another, before anything is
 * published: a failure partway through throws and leaves the whole day unpublished rather than
 * risking a set of metrics where some are missing and others aren't.
 *
 * @param {{date?: string}} [event] - an explicit `date` ("YYYY-MM-DD") overrides yesterday.
 * @returns {Promise<{date: string, metricsPublished: number}>}
 */
export async function handler(event = {}) {
  const targetDate = event.date ?? defaultTargetDate();
  const workGroup = process.env.ATHENA_WORK_GROUP_NAME;
  const database = process.env.GLUE_DATABASE_NAME;
  if (!workGroup) throw new Error("ATHENA_WORK_GROUP_NAME environment variable is required");
  if (!database) throw new Error("GLUE_DATABASE_NAME environment variable is required");

  const timestamp = new Date(`${targetDate}T00:00:00Z`);
  const metricData = [];

  for (const definition of METRIC_DEFINITIONS) {
    const rows = await runAthenaQuery({ workGroup, database, sql: definition.sql(targetDate) });
    metricData.push(...toMetricData(definition, rows, timestamp));
  }

  await publishMetricData(metricData, METRICS_NAMESPACE);

  logger.info({
    message: "Analytics metrics published",
    date: targetDate,
    metricsPublished: metricData.length,
  });

  return { date: targetDate, metricsPublished: metricData.length };
}
