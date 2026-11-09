// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability DATA-70 Compact closed days of activity events
// - **Use when:** Athena reads too many small activity_events objects, or a day's compacted copy must be checked or written again.
// - **Does:** activityEventsCompact.js rewrites each closed day of activity_events into one generation of a compacted Parquet copy with an Athena UNLOAD. It compares the row count and an order-free checksum of the copy with the raw day. It then records the day in a state object and replaces the activity_events_lake view, which is the one read path, in one Athena statement. It deletes nothing. A raw day that changes gets a new generation on a later run.
// - **Run:** `gh workflow run run-nightly.yml -f environment-name=ci -f date=YYYY-MM-DD`
// - **Entry:** `app/functions/analytics/activityEventsCompact.js:handler`
// - **Files:** app/functions/analytics/activityEventsCompact.js, app/unit-tests/analytics/activityEventsCompact.test.js, infra/main/resources/analytics/views/activity_events_lake.sql, infra/main/java/co/uk/diyaccounting/submit/stacks/analytics/ActivityEventsCompaction.java, infra/test/java/co/uk/diyaccounting/submit/stacks/analytics/ActivityEventsCompactionTest.java
// - **Keywords:** compaction, small files, activity_events_lake, activity_events_compacted, unload, s3 get requests, guardduty s3 events, generation
// - **Related:** DATA-10, DATA-12, DATA-22, DATA-27
// @end-capability

// app/functions/analytics/activityEventsCompact.js
//
// Firehose writes about 45 small Parquet objects a day, and each Athena query pays S3 and GuardDuty
// for each object it opens. This job gives each closed day one compacted copy.
//
// The swap is one catalog update. Every reader goes through the activity_events_lake view, which
// names the compacted days as constants. A query resolves the view once, when Athena plans it, so
// a query reads a day from the raw objects or from the compacted copy, and never from both. A query
// planned before the swap still reads the raw objects, so the raw objects stay in place. The lake
// has no bucket versioning, so a delete there is permanent, and this role holds no delete grant.
//
// Failure leaves figures unchanged, because a day joins the view only after its copy matches the
// raw day. An attempt that fails leaves its objects in a generation that the view does not name.
// The next run writes the next generation. A compacted day whose raw objects change, and whose new
// copy then fails, goes back to the raw objects.

import { createHash } from "node:crypto";
import { AthenaClient, StartQueryExecutionCommand } from "@aws-sdk/client-athena";
import { GlueClient, GetTableCommand } from "@aws-sdk/client-glue";
import { S3Client, GetObjectCommand, ListObjectsV2Command, PutObjectCommand } from "@aws-sdk/client-s3";
import { createLogger } from "../../lib/logger.js";
import { pollUntilTerminal, runAthenaQuery, toObjects } from "./rawExportPublish.js";

const logger = createLogger({ source: "app/functions/analytics/activityEventsCompact.js" });

const RAW_TABLE = "activity_events";
const COMPACTED_TABLE = "activity_events_compacted";
const READ_VIEW = "activity_events_lake";
const RAW_PREFIX = "curated/activity-events/";
const COMPACTED_DATA_PREFIX = "compacted/activity-events/data/";
const STATE_KEY = "compacted/activity-events/state.json";

// Firehose retries a failed S3 delivery for up to 24 hours. At 02:15 UTC the newest day this
// selects ended 26 hours ago, so no delivery for it is still due.
const CLOSED_DAY_LAG_DAYS = 2;
// A delivery that exceeds that limit changes a raw day after compaction, so each run compares this
// many of the newest compacted days with the raw objects again.
const RECHECK_DAYS = 7;
// About 20 seconds a day keeps a run inside the 15 minute Lambda limit during a backfill.
const MAX_NEW_DAYS_PER_RUN = 20;
// The upper end of the generation projection on the compacted table.
const MAX_GENERATION = 20;

const DAY_FORMAT = /^\d{4}-\d{2}-\d{2}$/;
const MILLISECONDS_PER_DAY = 86_400_000;

let athenaClient = null;
let glueClient = null;
let s3Client = null;

function getAthenaClient() {
  if (!athenaClient) athenaClient = new AthenaClient({ region: process.env.AWS_REGION || "eu-west-2" });
  return athenaClient;
}

function getGlueClient() {
  if (!glueClient) glueClient = new GlueClient({ region: process.env.AWS_REGION || "eu-west-2" });
  return glueClient;
}

function getS3Client() {
  if (!s3Client) s3Client = new S3Client({ region: process.env.AWS_REGION || "eu-west-2" });
  return s3Client;
}

function addDays(day, count) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + count * MILLISECONDS_PER_DAY).toISOString().slice(0, 10);
}

export function newestClosedDay(now) {
  return addDays(now.toISOString().slice(0, 10), -CLOSED_DAY_LAG_DAYS);
}

/**
 * The days this run looks at: closed days with no compacted copy, oldest first and capped, then the
 * newest compacted days again, to find a raw day that changed.
 *
 * @param {{rawDays: string[], compactedDays: Record<string, object>, closedThrough: string}} params
 * @returns {string[]}
 */
export function selectDays({ rawDays, compactedDays, closedThrough }) {
  const closedDays = rawDays.filter((day) => day <= closedThrough).sort();
  const newDays = closedDays.filter((day) => !compactedDays[day]).slice(0, MAX_NEW_DAYS_PER_RUN);
  const recheckFrom = addDays(closedThrough, 1 - RECHECK_DAYS);
  const recheckDays = closedDays.filter((day) => compactedDays[day] && day >= recheckFrom);
  return [...newDays, ...recheckDays];
}

/**
 * One value for a day's raw objects. It changes when an object arrives or changes.
 *
 * @param {{Key: string, ETag: string, Size: number}[]} objects
 * @returns {string}
 */
export function fingerprintObjects(objects) {
  const lines = objects.map(({ Key, ETag, Size }) => `${Key} ${ETag} ${Size}`).sort();
  return createHash("sha256").update(lines.join("\n")).digest("hex");
}

/**
 * Sorted days as ranges of consecutive days, so a view with hundreds of days stays short.
 *
 * @param {string[]} days
 * @returns {[string, string][]}
 */
export function dayRanges(days) {
  const ranges = [];
  for (const day of [...days].sort()) {
    const last = ranges.at(-1);
    if (last && addDays(last[1], 1) === day) {
      last[1] = day;
    } else {
      ranges.push([day, day]);
    }
  }
  return ranges;
}

function dayRangePredicate(days) {
  return dayRanges(days)
    .map(([first, last]) => `dt BETWEEN DATE '${first}' AND DATE '${last}'`)
    .join(" OR ");
}

function columnList(columns) {
  return columns.map((column) => `"${column}"`).join(", ");
}

function dayPredicate(day) {
  if (!DAY_FORMAT.test(day)) throw new Error(`Not a day: ${day}`);
  return `dt = DATE '${day}'`;
}

function generationLocation(bucket, day, generation) {
  return `s3://${bucket}/${COMPACTED_DATA_PREFIX}dt=${day}/generation=${generation}/`;
}

/**
 * The ORDER BY puts the final stage on one writer, so a day normally becomes one object. More than
 * one object costs extra reads and changes no figure.
 */
export function buildUnloadSql({ columns, bucket, day, generation }) {
  return (
    `UNLOAD (SELECT ${columnList(columns)} FROM ${RAW_TABLE} WHERE ${dayPredicate(day)} ORDER BY event_ts, event_id) ` +
    `TO '${generationLocation(bucket, day, generation)}' WITH (format = 'PARQUET', compression = 'SNAPPY')`
  );
}

/** checksum() ignores row order and counts a repeated row each time, so equal values mean equal rows. */
export function buildVerifySql({ columns, day, generation }) {
  const measures = `count(*) AS row_count, to_hex(checksum(ROW(${columnList(columns)}))) AS row_checksum`;
  return (
    `SELECT 'raw' AS source, ${measures} FROM ${RAW_TABLE} WHERE ${dayPredicate(day)} ` +
    `UNION ALL ` +
    `SELECT 'compacted' AS source, ${measures} FROM ${COMPACTED_TABLE} WHERE ${dayPredicate(day)} AND generation = ${generation}`
  );
}

/**
 * The read view for a set of compacted days. The predicates are constants, so Athena lists only the
 * partitions each branch can match. Each generation has its own branch for the same reason.
 *
 * @param {{columns: string[], compactedDays: Record<string, {generation: number}>}} params
 * @returns {string}
 */
export function buildViewSql({ columns, compactedDays }) {
  const selected = `${columnList(columns)}, dt`;
  const days = Object.keys(compactedDays);
  const branches = [`SELECT ${selected} FROM ${RAW_TABLE} WHERE NOT (${dayRangePredicate(days)})`];
  const generations = [...new Set(days.map((day) => compactedDays[day].generation))].sort((a, b) => a - b);
  for (const generation of generations) {
    const generationDays = days.filter((day) => compactedDays[day].generation === generation);
    branches.push(`SELECT ${selected} FROM ${COMPACTED_TABLE} WHERE generation = ${generation} AND (${dayRangePredicate(generationDays)})`);
  }
  return `CREATE OR REPLACE VIEW ${READ_VIEW} AS ${branches.join(" UNION ALL ")}`;
}

/**
 * @param {{source: string, row_count: string, row_checksum: string|null}[]} rows
 * @returns {{rowCount: number, rowChecksum: string}}
 */
export function assertCopyMatches(rows) {
  const raw = rows.find((row) => row.source === "raw");
  const compacted = rows.find((row) => row.source === "compacted");
  if (!raw || !compacted) throw new Error("The verification query did not return both sources");
  if (Number(raw.row_count) === 0) throw new Error("The raw day holds no rows");
  if (raw.row_count !== compacted.row_count || raw.row_checksum !== compacted.row_checksum) {
    throw new Error(
      `The copy differs from the raw day: ${raw.row_count} raw rows, ${compacted.row_count} compacted rows, ` +
        `checksums ${raw.row_checksum} and ${compacted.row_checksum}`,
    );
  }
  return { rowCount: Number(raw.row_count), rowChecksum: raw.row_checksum };
}

async function listAll(input) {
  const contents = [];
  const commonPrefixes = [];
  let ContinuationToken;
  do {
    const page = await getS3Client().send(new ListObjectsV2Command({ ...input, ContinuationToken }));
    contents.push(...(page.Contents ?? []));
    commonPrefixes.push(...(page.CommonPrefixes ?? []).map(({ Prefix }) => Prefix));
    ContinuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (ContinuationToken);
  return { contents, commonPrefixes };
}

async function listRawDays(bucket) {
  const { commonPrefixes } = await listAll({ Bucket: bucket, Prefix: RAW_PREFIX, Delimiter: "/" });
  return commonPrefixes.flatMap((prefix) => {
    const match = prefix.match(/\/dt=(\d{4}-\d{2}-\d{2})\/$/);
    return match ? [match[1]] : [];
  });
}

async function rawFingerprint(bucket, day) {
  const { contents } = await listAll({ Bucket: bucket, Prefix: `${RAW_PREFIX}dt=${day}/` });
  return { rawObjects: contents.length, rawFingerprint: fingerprintObjects(contents) };
}

async function nextGeneration(bucket, day) {
  const { commonPrefixes } = await listAll({ Bucket: bucket, Prefix: `${COMPACTED_DATA_PREFIX}dt=${day}/`, Delimiter: "/" });
  const used = commonPrefixes.map((prefix) => Number(prefix.match(/\/generation=(\d+)\/$/)?.[1] ?? 0));
  const generation = Math.max(0, ...used) + 1;
  if (generation > MAX_GENERATION) throw new Error(`${day} has used all ${MAX_GENERATION} generations`);
  return generation;
}

async function readState(bucket) {
  try {
    const { Body, ETag } = await getS3Client().send(new GetObjectCommand({ Bucket: bucket, Key: STATE_KEY }));
    return { compactedDays: JSON.parse(await Body.transformToString()).compactedDays, etag: ETag };
  } catch (error) {
    if (error.name === "NoSuchKey") return { compactedDays: {}, etag: null };
    throw error;
  }
}

// The condition stops a second run that overlaps this one from replacing its record.
async function writeState(bucket, compactedDays, etag) {
  const { ETag } = await getS3Client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: STATE_KEY,
      Body: JSON.stringify({ compactedDays }, null, 2),
      ContentType: "application/json",
      ...(etag ? { IfMatch: etag } : { IfNoneMatch: "*" }),
    }),
  );
  return ETag;
}

async function readColumns(database) {
  const { Table } = await getGlueClient().send(new GetTableCommand({ DatabaseName: database, Name: RAW_TABLE }));
  return Table.StorageDescriptor.Columns.map(({ Name }) => Name);
}

// UNLOAD and DDL statements return no result set, so this waits for the state and reads nothing.
async function runStatement({ workGroup, database, sql }) {
  const client = getAthenaClient();
  const { QueryExecutionId } = await client.send(
    new StartQueryExecutionCommand({ QueryString: sql, QueryExecutionContext: { Database: database }, WorkGroup: workGroup }),
  );
  await pollUntilTerminal(client, QueryExecutionId);
}

async function compactDay({ bucket, workGroup, database, columns, day }) {
  const before = await rawFingerprint(bucket, day);
  const generation = await nextGeneration(bucket, day);

  await runStatement({ workGroup, database, sql: buildUnloadSql({ columns, bucket, day, generation }) });
  const verification = await runAthenaQuery({ workGroup, database, sql: buildVerifySql({ columns, day, generation }) });
  const { rowCount, rowChecksum } = assertCopyMatches(toObjects(verification));

  const after = await rawFingerprint(bucket, day);
  if (after.rawFingerprint !== before.rawFingerprint) throw new Error(`${day} changed during compaction`);

  return { generation, ...before, rowCount, rowChecksum };
}

export async function handler() {
  const bucket = process.env.ANALYTICS_LAKE_BUCKET_NAME;
  const workGroup = process.env.ATHENA_WORK_GROUP_NAME;
  const database = process.env.GLUE_DATABASE_NAME;
  if (!bucket || !workGroup || !database) {
    throw new Error("ANALYTICS_LAKE_BUCKET_NAME, ATHENA_WORK_GROUP_NAME and GLUE_DATABASE_NAME are required");
  }

  const state = await readState(bucket);
  const compactedDays = { ...state.compactedDays };
  let etag = state.etag;
  const columns = await readColumns(database);
  const rawDays = await listRawDays(bucket);
  const days = selectDays({ rawDays, compactedDays, closedThrough: newestClosedDay(new Date()) });

  const compacted = [];
  const failed = [];
  for (const day of days) {
    const recorded = compactedDays[day];
    if (recorded && (await rawFingerprint(bucket, day)).rawFingerprint === recorded.rawFingerprint) continue;
    try {
      compactedDays[day] = await compactDay({ bucket, workGroup, database, columns, day });
      compacted.push(day);
    } catch (error) {
      logger.error({ message: "A day was not compacted", day, error: error.message });
      failed.push(day);
      // The recorded copy no longer holds every raw row, so the day goes back to the raw objects.
      if (!recorded) continue;
      delete compactedDays[day];
    }
    etag = await writeState(bucket, compactedDays, etag);
  }

  // Runs on each pass, so a run that stopped after the state write, or a deploy that set the view
  // back to raw objects, recovers here.
  if (Object.keys(compactedDays).length > 0) {
    await runStatement({ workGroup, database, sql: buildViewSql({ columns, compactedDays }) });
  }

  logger.info({ message: "Activity events compacted", compacted, failed, compactedDays: Object.keys(compactedDays).length });
  if (failed.length > 0) throw new Error(`${failed.length} days were not compacted: ${failed.join(", ")}`);
  return { compacted, compactedDays: Object.keys(compactedDays).length };
}
