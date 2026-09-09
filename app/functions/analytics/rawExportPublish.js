// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/analytics/rawExportPublish.js
//
// Nightly job that writes one CSV per Athena view and one JSON per one-stop-dashboard objective
// to s3://<lake>/exports/<env>/<date>/, so every figure on the objectives page is readable by
// Claude without the page (see PLAN_ONE_STOP_DASHBOARD.md's "Raw data for indexing" section).
// scripts/analytics-pull.sh syncs that prefix down to analytics/<env>/ at the workspace root,
// where index/corpus.toml's `analytics` source picks it up.
//
// VIEW_NAMES has to be kept in step with BusinessViews.java's VIEWS list by hand: the two live
// in different languages, so nothing enforces the match at build time.

import { AthenaClient, StartQueryExecutionCommand, GetQueryExecutionCommand, GetQueryResultsCommand } from "@aws-sdk/client-athena";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { createLogger } from "../../lib/logger.js";

const logger = createLogger({ source: "app/functions/analytics/rawExportPublish.js" });

export const VIEW_NAMES = [
  "v_active_users_daily",
  "v_submissions_daily",
  "v_login_to_submission_funnel",
  "v_pass_redemptions_daily",
  "v_revenue_daily",
  "v_hmrc_failures_by_class",
  "v_business_activity_daily",
  "v_signup_to_first_submission",
  "v_traffic_by_country_daily",
  "v_ga4_funnel_daily",
  "v_purchase_reconciliation_daily",
  "v_submissions_by_activity_daily",
  "v_traffic_sources_daily",
  "v_availability_sli_daily",
  "v_alarm_state_changes_daily",
  "v_dora_runs_daily",
  "v_returning_submitters_quarterly",
  "v_subscription_renewals_daily",
  "v_subscription_cancellations_daily",
  "v_operator_interventions_daily",
  "v_compliance_status",
];

// One entry per PLAN_ONE_STOP_DASHBOARD.md objective, in the order its table lists them. `views`
// names the views already built for it; `levers` is the plan table's own text for that column,
// carried verbatim so the export needs no separate source of truth for it. `target` stays null
// until B52g sets one from a baseline month - a null target is a true "not set yet", not a
// zero that would read as a target of zero.
export const OBJECTIVES = [
  {
    objective: "Uptime",
    views: ["v_availability_sli_daily", "v_alarm_state_changes_daily", "v_dora_runs_daily"],
    levers: [
      "Deploy frequency and change failure rate (DORA)",
      "Alarm consolidation",
      "Provisioned concurrency",
      "Canary coverage of each activity",
    ],
  },
  {
    objective: "Conversion to submission",
    views: ["v_login_to_submission_funnel", "v_hmrc_failures_by_class", "v_submissions_by_activity_daily"],
    levers: [
      "Landing copy and demo videos",
      "The CSV and books import",
      "Activity gating and free-bundle scope",
      "Email nudges after sign-in without a submission",
    ],
  },
  {
    objective: "Conversion to paid",
    views: [
      "v_revenue_daily",
      "v_pass_redemptions_daily",
      "v_purchase_reconciliation_daily",
      "v_subscription_renewals_daily",
      "v_subscription_cancellations_daily",
    ],
    levers: [
      "Price and bundle catalogue",
      "The free-bundle boundary",
      "The donate prompt on the DIYA-GL pages",
      "The resident-company bundle when accounts filing lands",
    ],
  },
  {
    objective: "Low running cost",
    views: [],
    levers: [
      "Deployment lifecycle (destroy-* workflows)",
      "Alarm and canary cuts",
      "Scheduled ingestion cadence",
      "Log retention",
      "Reserved capacity",
    ],
  },
  {
    objective: "Security",
    views: [],
    levers: [
      "Dependency updates and runtime upgrades",
      "WAF rules and thresholds",
      "Security Hub standards and AWS Config",
      "Alarm coverage of the detection stacks",
      "The pen test",
      "Backups outside the account",
    ],
  },
  {
    objective: "Retention",
    views: ["v_returning_submitters_quarterly", "v_subscription_renewals_daily", "v_subscription_cancellations_daily"],
    levers: [
      "Reminder emails before a period end",
      "The obligations and receipts views",
      "The books import so the second return is easier than the first",
      "The renewal price",
    ],
  },
  {
    objective: "Operator effort",
    views: ["v_operator_interventions_daily", "v_dora_runs_daily"],
    levers: [
      "Every automation row on the board",
      "The triage chain",
      "The inbox and board skills",
      "The operator brief",
    ],
  },
  {
    objective: "Compliance",
    views: ["v_compliance_status"],
    levers: [
      "Header fixes",
      "The accessibility fixes",
      "The questionnaires' answers",
      "The presenter account's details",
      "The privacy policy",
      "The fraud-prevention email-to-parser path",
    ],
  },
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

/**
 * Yesterday's date in UTC, as "YYYY-MM-DD". The default export date: a run that fires just
 * after midnight exports the day that just ended.
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
 * attempts. Throws on FAILED, CANCELLED, or exhausting the attempt budget, matching
 * analyticsMetricsPublish.js's pollUntilTerminal: a query that never confirms success must never
 * be treated as if it had.
 *
 * @param {AthenaClient} athenaClient
 * @param {string} queryExecutionId
 * @returns {Promise<void>}
 */
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

/**
 * Athena's GetQueryResults returns the column header as the first row, and both cells and rows
 * carry the same shape analyticsMetricsPublish.js's parseResultSet reads.
 *
 * @param {{Rows?: {Data?: {VarCharValue?: string}[]}[]}} resultSet
 * @returns {{header: string[], rows: (string|null)[][]}}
 */
export function parseResultSet(resultSet) {
  const rows = resultSet?.Rows ?? [];
  if (rows.length === 0) return { header: [], rows: [] };

  const header = rows[0].Data.map((cell) => cell.VarCharValue);
  const dataRows = rows.slice(1).map((row) => header.map((_, index) => row.Data?.[index]?.VarCharValue ?? null));
  return { header, rows: dataRows };
}

/**
 * Start one Athena query, wait for it to succeed, and return its header and rows.
 *
 * @param {{workGroup: string, database: string, sql: string}} params
 * @returns {Promise<{header: string[], rows: (string|null)[][]}>}
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
 * One CSV field, quoted only when it carries a comma, quote or newline. A null value renders as
 * an empty field, matching how a missing metric is skipped rather than published as zero
 * elsewhere in this pipeline: an empty CSV cell reads as "no value", not "zero".
 *
 * @param {string|null} value
 * @returns {string}
 */
export function csvField(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/**
 * Turn a header and rows into CSV text, header first.
 *
 * @param {string[]} header
 * @param {(string|null)[][]} rows
 * @returns {string}
 */
export function toCsv(header, rows) {
  const lines = [header.map(csvField).join(",")];
  for (const row of rows) {
    lines.push(row.map(csvField).join(","));
  }
  return lines.join("\n") + "\n";
}

/**
 * Turn a view's header/rows into an array of plain row objects, for embedding a view's latest
 * snapshot in an objective's JSON.
 *
 * @param {{header: string[], rows: (string|null)[][]}} result
 * @returns {Record<string, string|null>[]}
 */
export function toObjects({ header, rows }) {
  return rows.map((row) => {
    const record = {};
    header.forEach((column, index) => {
      record[column] = row[index];
    });
    return record;
  });
}

function objectKey(env, dateStr, fileName) {
  return `exports/${env}/${dateStr}/${fileName}`;
}

async function putExportObject(s3Client, bucket, env, dateStr, fileName, body, contentType) {
  const key = objectKey(env, dateStr, fileName);
  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
  return key;
}

/**
 * Export every Athena view as a CSV and every objective as a JSON summary for one date.
 *
 * @param {{date?: string}} [event] - an explicit `date` ("YYYY-MM-DD") overrides yesterday,
 *   matching every other job in the nightly chain.
 * @returns {Promise<{date: string, viewsExported: number, objectivesExported: number}>}
 */
export async function handler(event = {}) {
  const targetDate = event.date ?? defaultTargetDate();
  const env = process.env.ENVIRONMENT_NAME;
  const workGroup = process.env.ATHENA_WORK_GROUP_NAME;
  const database = process.env.GLUE_DATABASE_NAME;
  const bucket = process.env.ANALYTICS_LAKE_BUCKET_NAME;
  if (!env) throw new Error("ENVIRONMENT_NAME environment variable is required");
  if (!workGroup) throw new Error("ATHENA_WORK_GROUP_NAME environment variable is required");
  if (!database) throw new Error("GLUE_DATABASE_NAME environment variable is required");
  if (!bucket) throw new Error("ANALYTICS_LAKE_BUCKET_NAME environment variable is required");

  const s3Client = getS3Client();
  const resultsByView = {};

  for (const viewName of VIEW_NAMES) {
    const result = await runAthenaQuery({ workGroup, database, sql: `SELECT * FROM ${viewName}` });
    resultsByView[viewName] = result;
    await putExportObject(s3Client, bucket, env, targetDate, `${viewName}.csv`, toCsv(result.header, result.rows), "text/csv");
  }

  for (const { objective, views, levers } of OBJECTIVES) {
    const supportingMetrics = views.map((viewName) => ({
      view: viewName,
      rows: toObjects(resultsByView[viewName] ?? { header: [], rows: [] }),
    }));
    const objectiveJson = {
      objective,
      target: null,
      supportingMetrics,
      levers,
      openExperiments: [],
    };
    const fileName = `${objective.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}.json`;
    await putExportObject(
      s3Client,
      bucket,
      env,
      targetDate,
      fileName,
      JSON.stringify(objectiveJson, null, 2),
      "application/json",
    );
  }

  logger.info({
    message: "Raw export published",
    date: targetDate,
    viewsExported: VIEW_NAMES.length,
    objectivesExported: OBJECTIVES.length,
  });

  return { date: targetDate, viewsExported: VIEW_NAMES.length, objectivesExported: OBJECTIVES.length };
}
