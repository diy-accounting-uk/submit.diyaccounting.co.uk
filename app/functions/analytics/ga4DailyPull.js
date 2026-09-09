// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/analytics/ga4DailyPull.js
//
// Nightly job that copies the four one-stop-dashboard aggregate tables analytics/ga4-bigquery.toml
// maintains in BigQuery's ga4_daily dataset (sessions_by_host_source_daily, funnel_steps_daily,
// key_events_daily, downloads_by_product_daily) into the lake, so the dashboard's export and
// Athena views read one place rather than reaching back into BigQuery. Each scheduled query in
// that dataset writes one day at a time for event_date two days back (the margin
// ga4EventExportPull.js also gives GA4's export), so this job targets the same D-2 date.
//
// A missing table or partition throws rather than writing an empty object: it means the
// scheduled query hasn't run yet or was renamed, and the Telegram alarm on this job's errors is
// the right outcome, not a silent gap on the dashboard.

import { gzipSync } from "zlib";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { BigQuery } from "@google-cloud/bigquery";
import { createLogger } from "../../lib/logger.js";

const logger = createLogger({ source: "app/functions/analytics/ga4DailyPull.js" });

// Matches analytics/ga4-bigquery.toml's [dataset] and each [[queries]] destination_table.
const GA4_DAILY_DATASET_ID = "ga4_daily";
const TABLES = [
  "sessions_by_host_source_daily",
  "funnel_steps_daily",
  "key_events_daily",
  "downloads_by_product_daily",
];

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
 * ga4EventExportPull.js uses, and the same secret: this job reads the same GCP project with the
 * same service account.
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
 * ga4EventExportPull.js's getBigQueryClient() does.
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
 * D-2 in UTC, as "YYYY-MM-DD": every scheduled query in analytics/ga4-bigquery.toml writes
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
 * Pull one day of every ga4_daily aggregate table into the lake, one object per table.
 *
 * @param {{date?: string}} [event] - an explicit `date` ("YYYY-MM-DD") overrides D-2, which is
 *   what a backfill invoke passes.
 * @returns {Promise<{date: string, keys: Record<string, string>, counts: Record<string, number>}>}
 */
export async function handler(event = {}) {
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
