// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/security/scanRate404Detect.js
//
// Five-minute scheduled poll (ScanDetectionStack) over the cloudfront_requests Athena table
// (EdgeStack's v2 Parquet delivery into the analytics lake) for one client IP raising more than
// the configured number of 404s in one minute against one CloudFront host — acceptance criteria
// 2 and 5 of GitHub issue #9. A high-water mark in SSM Parameter Store carries the query window
// from one run to the next; it only advances after publishing succeeds, so a failed run
// re-reports its window on the next attempt rather than losing it.
//
// The table is partitioned by date only (CloudFrontAccessLogs.java): every deployment in this
// environment writes into the same year=.../month=.../day=.../ tree, so one query per date
// already covers every deployment's rows. cs_host tells them apart, so the query groups by host
// rather than filtering to one.

import { SSMClient, GetParameterCommand, PutParameterCommand } from "@aws-sdk/client-ssm";
import { publishActivityEvent } from "../../lib/activityAlert.js";
import { runAthenaQuery } from "../analytics/analyticsMetricsPublish.js";
import { createLogger } from "../../lib/logger.js";

const logger = createLogger({ source: "app/functions/security/scanRate404Detect.js" });

const DEFAULT_THRESHOLD_PER_MINUTE = 20;
const FIRST_RUN_LOOKBACK_MINUTES = 10;
const QUERY_END_LAG_MINUTES = 5;
// A telemetry filter, not a security control: it keeps our own behaviour-test traffic out of
// our own alerts and nothing more, because anyone can send this user agent. playwright.config.js
// appends this token to a real desktop Chrome UA rather than replacing it.
const PROBE_USER_AGENT_MARKER = "DIYAccountingProbe";

let cachedSsmClient = null;

function getSsmClient() {
  if (!cachedSsmClient) {
    cachedSsmClient = new SSMClient({ region: process.env.AWS_REGION || "eu-west-2" });
  }
  return cachedSsmClient;
}

/**
 * The SSM parameter this environment's high-water mark lives at.
 *
 * @returns {string}
 */
export function highWaterMarkParameterName() {
  const envName = process.env.ENVIRONMENT_NAME;
  if (!envName) throw new Error("ENVIRONMENT_NAME environment variable is required");
  return `/${envName}/submit/scan-detection/last-evaluated-minute`;
}

/**
 * "YYYY-MM-DDTHH:MM", matching the precision of cloudfront_requests' string-typed date+time
 * columns concatenated together.
 *
 * @param {Date} date
 * @returns {string}
 */
function formatMinute(date) {
  return date.toISOString().slice(0, 16);
}

/**
 * The stored high-water mark, or null on the first run (no parameter yet).
 *
 * @returns {Promise<string|null>}
 */
export async function readHighWaterMark() {
  const ssmClient = getSsmClient();
  try {
    const { Parameter } = await ssmClient.send(new GetParameterCommand({ Name: highWaterMarkParameterName() }));
    return Parameter?.Value ?? null;
  } catch (err) {
    if (err.name === "ParameterNotFound") return null;
    throw err;
  }
}

/**
 * @param {string} value - "YYYY-MM-DDTHH:MM"
 * @returns {Promise<void>}
 */
export async function writeHighWaterMark(value) {
  const ssmClient = getSsmClient();
  await ssmClient.send(
    new PutParameterCommand({
      Name: highWaterMarkParameterName(),
      Value: value,
      Type: "String",
      Overwrite: true,
    }),
  );
}

/**
 * Every UTC calendar date the half-open window (startExclusive, endInclusive] touches, as
 * "YYYY-MM-DD". More than one date only when the window crosses a UTC midnight, which the
 * partitioned Athena table needs queried once per date.
 *
 * @param {Date} startExclusive
 * @param {Date} endInclusive
 * @returns {string[]}
 */
export function datesInWindow(startExclusive, endInclusive) {
  const dates = [];
  const cursor = new Date(Date.UTC(startExclusive.getUTCFullYear(), startExclusive.getUTCMonth(), startExclusive.getUTCDate()));
  const endDate = new Date(Date.UTC(endInclusive.getUTCFullYear(), endInclusive.getUTCMonth(), endInclusive.getUTCDate()));
  while (cursor <= endDate) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

/**
 * The Athena SQL for one date's slice of the window. `year`/`month`/`day` are the table's
 * int-typed partition-projection columns, so they compare as plain numbers; every other column
 * in cloudfront_requests, including `date` and `time`, is string-typed, and `"date"`/`"time"`
 * stay double-quoted because both are Athena reserved words. Grouped by `cs_host` rather than
 * filtered to one host: the table has no distribution-id column, and cs_host carries every
 * deployment's own hostname (CloudFrontAccessLogs.java), so one query already covers all of
 * them and still tells them apart.
 *
 * @param {{dateStr: string, startExclusive: Date, endInclusive: Date, threshold: number}} params
 * @returns {string}
 */
export function buildQuery({ dateStr, startExclusive, endInclusive, threshold }) {
  const [year, month, day] = dateStr.split("-").map((part) => Number(part));
  return `SELECT   cs_host,
         c_ip,
         substr(concat("date", 'T', "time"), 1, 16) AS minute,
         count(*)                                   AS hits
FROM     cloudfront_requests
WHERE    year  = ${year} AND month = ${month} AND day = ${day}
  AND    sc_status = '404'
  AND    concat("date", 'T', "time") >  '${formatMinute(startExclusive)}'
  AND    concat("date", 'T', "time") <= '${formatMinute(endInclusive)}'
  AND    cs_user_agent NOT LIKE '%${PROBE_USER_AGENT_MARKER}%'
GROUP BY 1, 2, 3
HAVING   count(*) > ${threshold}`;
}

/**
 * Run one scheduled evaluation: read the high-water mark, query every date the window touches,
 * publish one ActivityEvent per row, then advance the mark. Publishing happens before the mark
 * is written, and nothing catches a publish failure, so a failed run leaves the mark untouched
 * and re-reports the same window next time.
 *
 * @param {{now?: string}} [event] - an explicit `now` (ISO-8601) overrides the current time, for
 *   deterministic tests.
 * @returns {Promise<{rowsPublished: number}>}
 */
export async function handler(event = {}) {
  const workGroup = process.env.ATHENA_WORK_GROUP_NAME;
  const database = process.env.GLUE_DATABASE_NAME;
  const threshold = Number(process.env.SCAN_DETECTION_404_PER_MINUTE) || DEFAULT_THRESHOLD_PER_MINUTE;
  if (!workGroup) throw new Error("ATHENA_WORK_GROUP_NAME environment variable is required");
  if (!database) throw new Error("GLUE_DATABASE_NAME environment variable is required");

  const now = event.now ? new Date(event.now) : new Date();
  const endInclusive = new Date(now.getTime() - QUERY_END_LAG_MINUTES * 60 * 1000);

  const storedMark = await readHighWaterMark();
  const startExclusive = storedMark
    ? new Date(`${storedMark}:00Z`)
    : new Date(endInclusive.getTime() - FIRST_RUN_LOOKBACK_MINUTES * 60 * 1000);

  if (startExclusive >= endInclusive) {
    logger.info({ message: "Window is empty, nothing to query" });
    return { rowsPublished: 0 };
  }

  const rows = [];
  for (const dateStr of datesInWindow(startExclusive, endInclusive)) {
    const sql = buildQuery({ dateStr, startExclusive, endInclusive, threshold });
    const dateRows = await runAthenaQuery({ workGroup, database, sql });
    rows.push(...dateRows);
  }

  for (const row of rows) {
    await publishActivityEvent({
      event: "scan-404-detected",
      flow: "operational",
      summary: `404 scan: ${row.c_ip} made ${row.hits} 404s in one minute on ${row.cs_host}`,
      detail: {
        host: row.cs_host,
        clientIp: row.c_ip,
        minute: row.minute,
        hits: Number(row.hits),
      },
    });
  }

  await writeHighWaterMark(formatMinute(endInclusive));

  logger.info({
    message: "Scan-rate 404 detection run complete",
    rowsPublished: rows.length,
  });

  return { rowsPublished: rows.length };
}
