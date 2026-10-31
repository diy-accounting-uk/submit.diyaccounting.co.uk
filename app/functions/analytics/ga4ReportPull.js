// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability DATA-06 Pull GA4 reports and BigQuery event export
// - **Use when:** the previous day's GA4 Data API reports or raw BigQuery event export must land in the lake.
// - **Does:** ga4ReportPull.js pulls three GA4 Data API reports (traffic, pages, events) via BetaAnalyticsDataClient and writes gzipped NDJSON. ga4EventExportPull.js pulls one D-2 day of GA4's raw BigQuery event export, one row per event with a session id. Both authenticate through workload identity federation.
// - **Run:** no command; see Does and Entry
// - **Entry:** `app/functions/analytics/ga4ReportPull.js:handler`; `app/functions/analytics/ga4EventExportPull.js:handler`
// - **Files:** app/functions/analytics/ga4ReportPull.js, app/unit-tests/analytics/ga4ReportPull.test.js, app/functions/analytics/ga4EventExportPull.js, app/unit-tests/analytics/ga4EventExportPull.test.js, infra/main/java/co/uk/diyaccounting/submit/stacks/analytics/Ga4Tables.java, infra/test/java/co/uk/diyaccounting/submit/stacks/analytics/Ga4TablesTest.java, app/unit-tests/ga4BigQueryDatasetIdEnvFiles.test.js
// - **Keywords:** ga4 data api, betaanalyticsdataclient, event export, session funnel, traffic report, pages report, workload identity federation
// - **Related:** DATA-05, DATA-43
// @end-capability

// app/functions/analytics/ga4ReportPull.js
//
// Nightly job that pulls three GA4 Data API reports — traffic, pages and events — for the
// previous day and writes them as gzipped NDJSON under the lake's curated/ga4/ prefix. GA4's
// `date` dimension comes back as "YYYYMMDD" with no separators, and every metric value comes
// back as a string regardless of its declared type; both are converted here so a downstream
// Athena query never has to.

import { gzipSync } from "zlib";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { BetaAnalyticsDataClient } from "@google-analytics/data";
import { federationSettings, createFederatedGoogleAuth } from "../../lib/googleWorkloadIdentity.js";
import { createLogger } from "../../lib/logger.js";
import { recentPullDays } from "../../lib/dateUtils.js";

const logger = createLogger({ source: "app/functions/analytics/ga4ReportPull.js" });

const REPORTS = [
  {
    name: "traffic",
    dimensions: ["date", "country", "sessionDefaultChannelGroup"],
    metrics: ["sessions", "activeUsers", "newUsers", "engagedSessions", "averageSessionDuration"],
  },
  {
    name: "pages",
    dimensions: ["date", "pagePath", "hostName"],
    metrics: ["screenPageViews", "activeUsers"],
  },
  {
    name: "events",
    dimensions: ["date", "eventName"],
    metrics: ["eventCount", "activeUsers", "eventValue"],
  },
];

let cachedS3Client = null;

function getS3Client() {
  if (!cachedS3Client) {
    cachedS3Client = new S3Client({ region: process.env.AWS_REGION || "eu-west-2" });
  }
  return cachedS3Client;
}

let cachedGa4Client = null;
let cachedFederationKey = null;

/**
 * Get a lazy-initialized federated GA4 Data API client, caching it across Lambda warm starts.
 * The federation settings are read on every call, not only the first, so a Lambda invoked with
 * an incomplete environment still throws rather than reusing a client built by an earlier,
 * better-configured invocation.
 *
 * @returns {Promise<BetaAnalyticsDataClient>}
 */
async function getGa4Client() {
  const settings = federationSettings();
  const federationKey = JSON.stringify(settings);
  if (cachedGa4Client && cachedFederationKey === federationKey) {
    return cachedGa4Client;
  }
  const authClient = createFederatedGoogleAuth({
    ...settings,
    scopes: ["https://www.googleapis.com/auth/analytics.readonly"],
  });
  cachedGa4Client = new BetaAnalyticsDataClient({ authClient });
  cachedFederationKey = federationKey;
  return cachedGa4Client;
}

/**
 * Convert GA4's `date` dimension value, "YYYYMMDD" with no separators, into "YYYY-MM-DD".
 *
 * @param {string} value
 * @returns {string}
 */
export function formatGa4Date(value) {
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

/**
 * Convert one GA4 report row into a plain object keyed by dimension and metric name. GA4 returns
 * every metric value as a string regardless of its declared numeric type, so each one is cast to
 * a number here rather than left for every downstream query to cast inconsistently.
 *
 * @param {{dimensionValues: {value: string}[], metricValues: {value: string}[]}} row
 * @param {string[]} dimensionNames
 * @param {string[]} metricNames
 * @returns {object}
 */
export function rowToRecord(row, dimensionNames, metricNames) {
  const record = {};
  dimensionNames.forEach((name, index) => {
    const raw = row.dimensionValues[index].value;
    record[name] = name === "date" ? formatGa4Date(raw) : raw;
  });
  metricNames.forEach((name, index) => {
    record[name] = Number(row.metricValues[index].value);
  });
  return record;
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

async function runOneReport(client, propertyId, report, targetDate) {
  const [response] = await client.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [{ startDate: targetDate, endDate: targetDate }],
    dimensions: report.dimensions.map((name) => ({ name })),
    metrics: report.metrics.map((name) => ({ name })),
  });
  const rows = response.rows ?? [];
  return rows.map((row) => rowToRecord(row, report.dimensions, report.metrics));
}

function objectKey(reportName, dateStr) {
  return `curated/ga4/report=${reportName}/dt=${dateStr}/${reportName}.json.gz`;
}

async function putReportObject(s3Client, bucket, reportName, dateStr, records) {
  const key = objectKey(reportName, dateStr);
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
 * Pull GA4 traffic, pages and events reports into the lake: yesterday and today so far, or one
 * explicit day. The Data API serves the current day, so today's object is a partial that the
 * next run overwrites.
 *
 * @param {{date?: string}} [event] - an explicit `date` ("YYYY-MM-DD") replaces the default pair
 *   of days, which is what a backfill invoke passes.
 * @returns {Promise<{days: Array<{date: string, keys: object, counts: object}>}>}
 */
export async function handler(event = {}) {
  const days = event.date ? [event.date] : recentPullDays();

  const propertyId = process.env.GA4_PROPERTY_ID;
  if (!propertyId) {
    throw new Error("GA4_PROPERTY_ID environment variable is required");
  }

  const bucket = process.env.ANALYTICS_LAKE_BUCKET_NAME;
  if (!bucket) {
    throw new Error("ANALYTICS_LAKE_BUCKET_NAME environment variable is required");
  }

  // Resolved before any report runs or object is written, so a missing credential throws rather
  // than leaving a partial or empty day's worth of objects in the lake.
  const client = await getGa4Client();

  const s3Client = getS3Client();
  const results = [];
  for (const targetDate of days) {
    results.push(await pullDay(client, s3Client, bucket, propertyId, targetDate));
  }
  return { days: results };
}

async function pullDay(client, s3Client, bucket, propertyId, targetDate) {
  const keys = {};
  const counts = {};
  for (const report of REPORTS) {
    const records = await runOneReport(client, propertyId, report, targetDate);
    keys[report.name] = await putReportObject(s3Client, bucket, report.name, targetDate, records);
    counts[report.name] = records.length;
  }

  logger.info({ message: "GA4 report pull complete", date: targetDate, counts, keys });

  return { date: targetDate, keys, counts };
}
