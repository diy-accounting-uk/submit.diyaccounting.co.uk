// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/analytics/ga4DailyPull.js
//
// Nightly job that copies the four one-stop-dashboard aggregate tables infra/google/gcp/bigquery.toml
// maintains in BigQuery's ga4_daily dataset (sessions_by_host_source_daily, funnel_steps_daily,
// key_events_daily, downloads_by_product_daily) into the lake, so the dashboard's export and
// Athena views read one place rather than reaching back into BigQuery. Each scheduled query in
// that dataset writes one day at a time for event_date two days back (the margin
// ga4EventExportPull.js also gives GA4's export), so this job targets the same D-2 date.
//
// A missing table or partition throws rather than writing an empty object: it means the
// scheduled query hasn't run yet or was renamed, and the Telegram alarm on this job's errors is
// the right outcome, not a silent gap on the dashboard.
//
// The same function has a second, hourly mode (event.mode === "hourly") that counts sessions
// by hour and visitor kind straight from GA4's raw export for the last few days, reading
// events_intraday_YYYYMMDD while a day is still streaming and events_YYYYMMDD once GA4 has
// replaced it. That is the only source for the dashboard's Last 1 hour, 1 day and 7 days
// visitor columns, because the daily aggregates above land two days late. A day with neither
// table (a property that does not stream, or a day before streaming began) is an empty hour,
// never an error.

import { gzipSync } from "zlib";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { BigQuery } from "@google-cloud/bigquery";
import { federationSettings, createFederatedGoogleAuth } from "../../lib/googleWorkloadIdentity.js";
import { createLogger } from "../../lib/logger.js";

const logger = createLogger({ source: "app/functions/analytics/ga4DailyPull.js" });

// Matches infra/google/gcp/bigquery.toml's [dataset] and each [[queries]] destination_table.
const GA4_DAILY_DATASET_ID = "ga4_daily";
const TABLES = ["sessions_by_host_source_daily", "funnel_steps_daily", "key_events_daily", "downloads_by_product_daily"];

const HOURLY_TABLE_NAME = "sessions_by_hour_kind";
const HOURLY_LOOKBACK_DAYS = 3;
const TABLE_DATE_PATTERN = /^\d{8}$/;

let cachedS3Client = null;

function getS3Client() {
  if (!cachedS3Client) {
    cachedS3Client = new S3Client({ region: process.env.AWS_REGION || "eu-west-2" });
  }
  return cachedS3Client;
}

let cachedBigQueryClient = null;
let cachedFederationKey = null;

/**
 * Get a lazy-initialized federated BigQuery client, caching it across Lambda warm starts the
 * same way ga4EventExportPull.js's getBigQueryClient() does. The federation settings are read
 * on every call, not only the first, so a Lambda invoked with an incomplete environment still
 * throws rather than reusing a client built by an earlier, better-configured invocation.
 *
 * @returns {Promise<BigQuery>}
 */
async function getBigQueryClient() {
  const settings = federationSettings();
  const federationKey = JSON.stringify(settings);
  if (cachedBigQueryClient && cachedFederationKey === federationKey) {
    return cachedBigQueryClient;
  }
  const projectId = process.env.GA4_BIGQUERY_PROJECT_ID;
  const authClient = createFederatedGoogleAuth({
    ...settings,
    scopes: ["https://www.googleapis.com/auth/bigquery", "https://www.googleapis.com/auth/cloud-platform"],
  });
  cachedBigQueryClient = new BigQuery({ projectId, authClient });
  cachedFederationKey = federationKey;
  return cachedBigQueryClient;
}

/**
 * D-2 in UTC, as "YYYY-MM-DD": every scheduled query in infra/google/gcp/bigquery.toml writes
 * event_date two days back, so a D-1 pull would read a partition that doesn't exist yet.
 *
 * @returns {string}
 */
export function defaultTargetDate() {
  const now = new Date();
  const twoDaysAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 2));
  return twoDaysAgo.toISOString().slice(0, 10);
}

function buildQuery(projectId, tableName, targetDate) {
  return `SELECT * FROM \`${projectId}.${GA4_DAILY_DATASET_ID}.${tableName}\` WHERE day = DATE('${targetDate}')`;
}

/**
 * Gzip a list of records as newline-delimited JSON, one object per line. An empty list still
 * produces a valid (empty) gzip member rather than being skipped, so a quiet day's object always
 * exists and a downstream `SELECT count(*)` returns zero, not "table missing".
 *
 * @param {object[]} records
 * @returns {Buffer}
 */
export function toNdjsonGzip(records) {
  const ndjson = records.map((record) => JSON.stringify(record)).join("\n") + (records.length ? "\n" : "");
  return gzipSync(Buffer.from(ndjson, "utf8"));
}

function objectKey(tableName, dateStr) {
  return `curated/ga4_daily/${tableName}/dt=${dateStr}/data.json.gz`;
}

async function putTableObject(s3Client, bucket, tableName, dateStr, records) {
  const key = objectKey(tableName, dateStr);
  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: toNdjsonGzip(records),
      ContentType: "application/json",
      ContentEncoding: "gzip",
    }),
  );
  return key;
}

/**
 * The UTC dates the hourly pull rewrites on each run, newest first: today and the days before it.
 * Older days keep the object their last in-window run wrote.
 *
 * @param {Date} [now]
 * @param {number} [lookbackDays]
 * @returns {string[]} "YYYY-MM-DD"
 */
export function hourlyTargetDates(now = new Date(), lookbackDays = HOURLY_LOOKBACK_DAYS) {
  return Array.from({ length: lookbackDays }, (_, offset) =>
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - offset)).toISOString().slice(0, 10),
  );
}

function toTableDateSuffix(dateStr) {
  const suffix = dateStr.replaceAll("-", "");
  if (!TABLE_DATE_PATTERN.test(suffix)) {
    throw new Error(`Invalid target date "${dateStr}": expected YYYY-MM-DD`);
  }
  return suffix;
}

/**
 * Sessions by hour and visitor kind for one export table. Restricted to session_start events, and
 * to the one table named, so BigQuery bills that table's columns and nothing else. The hour is
 * an ISO 8601 UTC string so Athena's from_iso8601_timestamp reads it back.
 */
export function buildHourlyQuery(projectId, datasetId, tableName) {
  return `
SELECT FORMAT_TIMESTAMP('%Y-%m-%dT%H:00:00Z', TIMESTAMP_TRUNC(TIMESTAMP_MICROS(event_timestamp), HOUR)) AS hour,
       COALESCE(
         (SELECT value.string_value FROM UNNEST(user_properties) WHERE key = 'visitor_kind'),
         '(unclassified)'
       )                                                                                          AS visitor_kind,
       COUNT(DISTINCT CONCAT(user_pseudo_id, '.',
         CAST((SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS STRING))) AS sessions,
       COUNT(DISTINCT user_pseudo_id)                                                             AS users
FROM \`${projectId}.${datasetId}.${tableName}\`
WHERE event_name = 'session_start'
GROUP BY 1, 2
`.trim();
}

async function tableExists(bigQuery, datasetId, tableName) {
  const [exists] = await bigQuery.dataset(datasetId).table(tableName).exists();
  return exists;
}

async function firstExistingTable(bigQuery, datasetId, tableNames) {
  for (const tableName of tableNames) {
    if (await tableExists(bigQuery, datasetId, tableName)) return tableName;
  }
  return null;
}

async function pullHourlyDay({ bigQuery, projectId, datasetId, location, dateStr }) {
  const suffix = toTableDateSuffix(dateStr);
  const sourceTable = await firstExistingTable(bigQuery, datasetId, [`events_${suffix}`, `events_intraday_${suffix}`]);
  if (sourceTable === null) return { sourceTable: null, rows: [] };

  const [job] = await bigQuery.createQueryJob({ query: buildHourlyQuery(projectId, datasetId, sourceTable), location });
  const [rows] = await job.getQueryResults();
  return { sourceTable, rows };
}

/**
 * Hourly mode: rewrite the last few days' sessions-by-hour-and-visitor-kind objects from GA4's
 * raw export.
 *
 * @returns {Promise<{mode: "hourly", dates: string[], keys: Record<string, string>, counts: Record<string, number>, sourceTables: Record<string, string|null>}>}
 */
async function handleHourly() {
  const projectId = process.env.GA4_BIGQUERY_PROJECT_ID;
  if (!projectId) throw new Error("GA4_BIGQUERY_PROJECT_ID environment variable is required");

  const datasetId = process.env.GA4_BIGQUERY_DATASET_ID;
  if (!datasetId) throw new Error("GA4_BIGQUERY_DATASET_ID environment variable is required");

  const location = process.env.GA4_BIGQUERY_LOCATION;
  if (!location) throw new Error("GA4_BIGQUERY_LOCATION environment variable is required");

  const bucket = process.env.ANALYTICS_LAKE_BUCKET_NAME;
  if (!bucket) throw new Error("ANALYTICS_LAKE_BUCKET_NAME environment variable is required");

  const bigQuery = await getBigQueryClient();
  const s3Client = getS3Client();

  const dates = hourlyTargetDates();
  const keys = {};
  const counts = {};
  const sourceTables = {};
  for (const dateStr of dates) {
    const { sourceTable, rows } = await pullHourlyDay({ bigQuery, projectId, datasetId, location, dateStr });
    keys[dateStr] = await putHourlyObject(s3Client, bucket, dateStr, rows);
    counts[dateStr] = rows.length;
    sourceTables[dateStr] = sourceTable;
  }

  logger.info({ message: "GA4 hourly sessions pull complete", dates, counts, sourceTables });
  return { mode: "hourly", dates, keys, counts, sourceTables };
}

async function putHourlyObject(s3Client, bucket, dateStr, records) {
  const key = `curated/ga4_hourly/${HOURLY_TABLE_NAME}/dt=${dateStr}/data.json.gz`;
  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: toNdjsonGzip(records),
      ContentType: "application/json",
      ContentEncoding: "gzip",
    }),
  );
  return key;
}

/**
 * Pull one day of every ga4_daily aggregate table into the lake, one object per table, or, with
 * `mode: "hourly"`, the last few days of sessions by hour and visitor kind.
 *
 * @param {{date?: string}} [event] - an explicit `date` ("YYYY-MM-DD") overrides D-2, which is
 *   what a backfill invoke passes.
 * @returns {Promise<{date: string, keys: Record<string, string>, counts: Record<string, number>}>}
 */
export async function handler(event = {}) {
  if (event.mode === "hourly") {
    return handleHourly();
  }

  const targetDate = event.date ?? defaultTargetDate();

  const projectId = process.env.GA4_BIGQUERY_PROJECT_ID;
  if (!projectId) {
    throw new Error("GA4_BIGQUERY_PROJECT_ID environment variable is required");
  }

  const location = process.env.GA4_BIGQUERY_LOCATION;
  if (!location) {
    throw new Error("GA4_BIGQUERY_LOCATION environment variable is required");
  }

  const bucket = process.env.ANALYTICS_LAKE_BUCKET_NAME;
  if (!bucket) {
    throw new Error("ANALYTICS_LAKE_BUCKET_NAME environment variable is required");
  }

  // Resolved before any query runs or object is written, so a missing credential throws rather
  // than leaving a partial day's worth of objects in the lake.
  const bigQuery = await getBigQueryClient();
  const s3Client = getS3Client();

  const keys = {};
  const counts = {};
  for (const tableName of TABLES) {
    const [job] = await bigQuery.createQueryJob({ query: buildQuery(projectId, tableName, targetDate), location });
    const [rows] = await job.getQueryResults();

    keys[tableName] = await putTableObject(s3Client, bucket, tableName, targetDate, rows);
    counts[tableName] = rows.length;
  }

  logger.info({ message: "GA4 daily aggregate pull complete", date: targetDate, counts, keys });

  return { date: targetDate, keys, counts };
}
