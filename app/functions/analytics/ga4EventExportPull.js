// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/functions/analytics/ga4EventExportPull.js
//
// Nightly job that pulls one day of GA4's BigQuery event export — one row per event, with a
// session id — and writes it as gzipped NDJSON under the lake's curated/ga4_bq/ prefix. This is
// the only GA4 source that can be joined to what a session went on to do: the Data API job
// (ga4ReportPull.js) keeps its own aggregates as the source of record for sessions and active
// users, this job exists to build funnels and reconciliation views on top of raw events.
//
// GA4's daily export table for a day usually lands within 24 hours of that day ending, so this
// job targets D-2, not D-1: at 03:15 the D-1 table may not exist yet, and D-2 gives about 27
// hours of margin. A missing table throws rather than writing an empty object or falling back to
// the intraday table, because a missing table means the export lagged or broke and the Telegram
// alarm is the right outcome; recovery is one state machine execution with an explicit date.

import { gzipSync } from "zlib";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { BigQuery } from "@google-cloud/bigquery";
import { createLogger } from "../../lib/logger.js";

const logger = createLogger({ source: "app/functions/analytics/ga4EventExportPull.js" });

const TABLE_DATE_PATTERN = /^\d{8}$/;

let cachedS3Client = null;

function getS3Client() {
  if (!cachedS3Client) {
    cachedS3Client = new S3Client({ region: process.env.AWS_REGION || "eu-west-2" });
  }
  return cachedS3Client;
}

let cachedSecretsManagerClient = null;

function getSecretsManagerClient() {
  if (!cachedSecretsManagerClient) {
    cachedSecretsManagerClient = new SecretsManagerClient({ region: process.env.AWS_REGION || "eu-west-2" });
  }
  return cachedSecretsManagerClient;
}

/**
 * Resolve the GA4 service-account key JSON, the same env-var-then-Secrets-Manager precedence
 * ga4ReportPull.js uses, and the same secret: this job reads GA4 BigQuery export data with the
 * same service account that reads the GA4 Data API.
 *
 * @returns {Promise<string>}
 */
async function resolveServiceAccountCredentialsJson() {
  if (process.env.GA4_SERVICE_ACCOUNT_JSON) {
    return process.env.GA4_SERVICE_ACCOUNT_JSON;
  }
  const arn = process.env.GA4_SERVICE_ACCOUNT_ARN;
  if (!arn) {
    throw new Error("Neither GA4_SERVICE_ACCOUNT_JSON nor GA4_SERVICE_ACCOUNT_ARN is set");
  }
  const result = await getSecretsManagerClient().send(new GetSecretValueCommand({ SecretId: arn }));
  return result.SecretString;
}

let cachedBigQueryClient = null;
let cachedCredentialsJson = null;

/**
 * Get a lazy-initialized BigQuery client, caching it across Lambda warm starts the same way
 * ga4ReportPull.js's getGa4Client() does.
 *
 * @returns {Promise<BigQuery>}
 */
async function getBigQueryClient() {
  const credentialsJson = await resolveServiceAccountCredentialsJson();
  if (cachedBigQueryClient && cachedCredentialsJson === credentialsJson) {
    return cachedBigQueryClient;
  }
  const credentials = JSON.parse(credentialsJson);
  const projectId = process.env.GA4_BIGQUERY_PROJECT_ID;
  cachedBigQueryClient = new BigQuery({ projectId, credentials });
  cachedCredentialsJson = credentialsJson;
  return cachedBigQueryClient;
}

/**
 * D-2 in UTC, as "YYYY-MM-DD": GA4's daily export table for D-1 may not exist yet at the job's
 * 03:15 run time, so the default target is two days back rather than one.
 *
 * @returns {string}
 */
export function defaultTargetDate() {
  const now = new Date();
  const twoDaysAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 2));
  return twoDaysAgo.toISOString().slice(0, 10);
}

/**
 * Convert "YYYY-MM-DD" into GA4's export table date suffix, "YYYYMMDD", validating the input
 * first: the table name is built by string concatenation because BigQuery has no parameter
 * placeholder for a table identifier, so an unvalidated date would let one straight into the
 * query text.
 *
 * @param {string} dateStr - "YYYY-MM-DD"
 * @returns {string}
 */
export function toTableDateSuffix(dateStr) {
  const suffix = dateStr.replaceAll("-", "");
  if (!TABLE_DATE_PATTERN.test(suffix)) {
    throw new Error(`Invalid target date "${dateStr}": expected YYYY-MM-DD`);
  }
  return suffix;
}

function buildQuery(projectId, datasetId, tableDateSuffix) {
  return `
SELECT
  FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%SZ', TIMESTAMP_MICROS(event_timestamp))          AS event_ts,
  event_name,
  user_pseudo_id,
  (SELECT value.int_value    FROM UNNEST(event_params) WHERE key = 'ga_session_id')     AS ga_session_id,
  (SELECT value.int_value    FROM UNNEST(event_params) WHERE key = 'ga_session_number') AS ga_session_number,
  (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_location')     AS page_location,
  (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_referrer')     AS page_referrer,
  (SELECT value.int_value    FROM UNNEST(event_params) WHERE key = 'engagement_time_msec') AS engagement_time_msec,
  (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'transaction_id')    AS transaction_id,
  COALESCE(
    (SELECT value.double_value            FROM UNNEST(event_params) WHERE key = 'value'),
    (SELECT CAST(value.int_value AS FLOAT64) FROM UNNEST(event_params) WHERE key = 'value')
  )                                                                                     AS event_value,
  (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'currency')          AS currency,
  device.category                        AS device_category,
  device.operating_system                AS device_os,
  geo.country                            AS country,
  traffic_source.source                  AS traffic_source,
  traffic_source.medium                  AS traffic_medium,
  traffic_source.name                    AS traffic_campaign,
  stream_id,
  platform
FROM \`${projectId}.${datasetId}.events_${tableDateSuffix}\`
`.trim();
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

function objectKey(dateStr) {
  return `curated/ga4_bq/events/dt=${dateStr}/events.json.gz`;
}

async function putEventsObject(s3Client, bucket, dateStr, records) {
  const key = objectKey(dateStr);
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
 * Pull one day of GA4's BigQuery event export into the lake.
 *
 * @param {{date?: string}} [event] - an explicit `date` ("YYYY-MM-DD") overrides D-2, which is
 *   what a backfill invoke passes.
 * @returns {Promise<{date: string, key: string, count: number}>}
 */
export async function handler(event = {}) {
  const targetDate = event.date ?? defaultTargetDate();
  const tableDateSuffix = toTableDateSuffix(targetDate);

  const projectId = process.env.GA4_BIGQUERY_PROJECT_ID;
  if (!projectId) {
    throw new Error("GA4_BIGQUERY_PROJECT_ID environment variable is required");
  }

  const datasetId = process.env.GA4_BIGQUERY_DATASET_ID;
  if (!datasetId) {
    throw new Error("GA4_BIGQUERY_DATASET_ID environment variable is required");
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
  // than leaving a partial or empty day's worth of objects in the lake.
  const bigQuery = await getBigQueryClient();

  const tableName = `events_${tableDateSuffix}`;
  const [tableExists] = await bigQuery.dataset(datasetId).table(tableName).exists();
  if (!tableExists) {
    throw new Error(
      `GA4 BigQuery export table ${projectId}.${datasetId}.${tableName} does not exist for ${targetDate}`,
    );
  }

  const [job] = await bigQuery.createQueryJob({
    query: buildQuery(projectId, datasetId, tableDateSuffix),
    location,
  });
  const [rows] = await job.getQueryResults();

  const s3Client = getS3Client();
  const key = await putEventsObject(s3Client, bucket, targetDate, rows);

  logger.info({ message: "GA4 BigQuery event export pull complete", date: targetDate, count: rows.length, key });

  return { date: targetDate, key, count: rows.length };
}
