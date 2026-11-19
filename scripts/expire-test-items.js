#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability OPS-217 Expire the test items a table already holds
// - **Use when:** receipts, bundles, subscriptions or passes hold items that a test user or a probe wrote before those items got a short ttl, and they must go.
// - **Does:** expire-test-items.js reads from the lake the keys whose newest change is not a REMOVE and whose own actor is test-user or probe, with the newest-change order of buildActorSplitSql and the hash stored on the item. A pass key is found by a Query on issuedBy-index, because the lake holds the pass key hashed. --scan, valid only with --table passes, takes the pass keys from a paginated Scan of <env>-env-passes instead (filter begins_with(pk, 'pass#') AND actor IN ('test-user', 'probe'), projection pk and actor only), which reaches the test passes that have no issuedBy. The Scan fires the <env>-env-dynamodb-customer-table-scan alarm (prod-env-dynamodb-customer-table-scan in prod); the operator approved it as an exception. Without --scan it never sends a Scan. A dry run prints the count and five keys. --apply sets the two-day ttl on each key with UpdateItem and a condition that the stored actor is still test-user or probe.
// - **Run:** `AWS_PROFILE=diya-submit-ci node scripts/expire-test-items.js --environment ci --table receipts`; add `--apply` to write; `--table passes --scan` takes the pass keys from a Scan
// - **Entry:** `scripts/expire-test-items.js:runExpireTestItems`; `scripts/expire-test-items.js:buildTestKeysSql`
// - **Files:** scripts/expire-test-items.js, app/unit-tests/scripts/expireTestItems.test.js
// - **Keywords:** test items, synthetic items, expire, ttl, short retention, lake keys, passes scan, conditional update, test-user, probe
// - **Related:** OPS-196, DATA-18
// @end-capability

// scripts/expire-test-items.js
//
// The keys come from the lake, or for passes with --scan from a Scan of the passes table that reads
// only pk and actor. Each lake key is the one the item stores: the query
// reads the raw dynamo_* source, so a hash is the hash the item was written with and not its
// hash_aliases alias. A key whose item a salt rotation moved has no item under that hash, so its
// conditional update fails and nothing is written.
//
// The condition on each UpdateItem is that the item's own actor attribute is still test-user or
// probe. An item with no actor, or any other actor, keeps its ttl.
//
// The output shows keys (hashed subs, subscription ids, pass codes), so it goes to the operator's
// terminal only, never to a job log.
//
// Usage:
//   node scripts/expire-test-items.js --environment <ci|prod> --table <receipts|bundles|subscriptions|passes> [--apply]
//   node scripts/expire-test-items.js --environment <ci|prod> --table passes --scan [--apply]

import { fileURLToPath } from "node:url";
import { AthenaClient, GetQueryExecutionCommand, GetQueryResultsCommand, StartQueryExecutionCommand } from "@aws-sdk/client-athena";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { NEWEST_ORDER } from "../app/lib/operatorSnapshot/dataSection.js";
import { isTestActor, testRecordRetention } from "../app/lib/recordRetention.js";
import { mapLimit } from "./salt-rotate.js";

const REGION = "eu-west-2";
const ENVIRONMENTS = ["ci", "prod"];
const TEST_ACTORS = ["test-user", "probe"];
const SAMPLE_SIZE = 5;
const WRITE_CONCURRENCY = 8;
const SCAN_PAGE_LIMIT = 500;
const SCAN_TABLE = "passes";
const QUERY_POLL_MS = 2000;
const QUERY_TIMEOUT_MS = 10 * 60 * 1000;
const PASS_PK_PREFIX = "pass#";
const SUBSCRIPTION_PK_PREFIX = "stripe#";

/**
 * Each table's lake source, the lake columns that identify an item, and how a lake row becomes the
 * item's DynamoDB key. A pass row has no key of its own in the lake: `findKeys` resolves it.
 */
export const TABLES = {
  receipts: {
    source: "dynamo_receipts",
    partition: ["hashed_sub", "receipt_id"],
    columns: ["hashed_sub", "receipt_id"],
    keyOf: (row) => ({ hashedSub: row.hashed_sub, receiptId: row.receipt_id }),
  },
  bundles: {
    source: "dynamo_bundles",
    partition: ["hashed_sub", "bundle_id"],
    columns: ["hashed_sub", "bundle_id"],
    keyOf: (row) => ({ hashedSub: row.hashed_sub, bundleId: row.bundle_id }),
  },
  subscriptions: {
    source: "dynamo_subscriptions",
    partition: ["subscription_id"],
    columns: ["subscription_id"],
    keyOf: (row) => ({ pk: `${SUBSCRIPTION_PK_PREFIX}${row.subscription_id}` }),
  },
  passes: {
    source: "dynamo_passes",
    partition: ["pass_id"],
    columns: ["pass_id", "issued_by", "created_at"],
    keyOf: null,
  },
};

export function parseArgs(argv) {
  const opts = { apply: false, scan: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--apply") opts.apply = true;
    else if (arg === "--scan") opts.scan = true;
    else if (arg === "--environment") opts.environment = argv[++i];
    else if (arg === "--table") opts.table = argv[++i];
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!ENVIRONMENTS.includes(opts.environment)) throw new Error(`--environment must be one of ${ENVIRONMENTS.join(", ")}`);
  if (!TABLES[opts.table]) throw new Error(`--table must be one of ${Object.keys(TABLES).join(", ")}`);
  if (opts.scan && opts.table !== SCAN_TABLE) throw new Error(`--scan is valid only with --table ${SCAN_TABLE}`);
  return opts;
}

/**
 * The lake query: the newest change of each item, kept when it is not a REMOVE and the item's own
 * actor is test-user or probe.
 *
 * @param {string} table
 * @returns {string}
 */
export function buildTestKeysSql(table) {
  const { source, partition, columns } = TABLES[table];
  const actors = TEST_ACTORS.map((actor) => `'${actor}'`).join(", ");
  return (
    `SELECT ${columns.join(", ")}\n` +
    `FROM (\n` +
    `  SELECT ${columns.join(", ")}, actor, change_type,\n` +
    `         row_number() OVER (PARTITION BY ${partition.join(", ")} ORDER BY ${NEWEST_ORDER}) AS newest\n` +
    `  FROM   ${source}\n` +
    `) i\n` +
    `WHERE i.newest = 1 AND i.change_type <> 'REMOVE' AND i.actor IN (${actors})\n` +
    `ORDER BY ${partition.join(", ")}`
  );
}

export async function runAthena(athena, sql, environment, { pollMs = QUERY_POLL_MS } = {}) {
  const started = await athena.send(
    new StartQueryExecutionCommand({
      QueryString: sql,
      WorkGroup: `${environment}-env-analytics`,
      QueryExecutionContext: { Database: `${environment}_env_analytics` },
    }),
  );
  const id = started.QueryExecutionId;
  const deadline = Date.now() + QUERY_TIMEOUT_MS;
  for (;;) {
    const status = await athena.send(new GetQueryExecutionCommand({ QueryExecutionId: id }));
    const state = status.QueryExecution?.Status?.State;
    if (state === "SUCCEEDED") break;
    if (state === "FAILED" || state === "CANCELLED") {
      throw new Error(`athena query ${state}: ${status.QueryExecution?.Status?.StateChangeReason ?? ""}`);
    }
    if (Date.now() > deadline) throw new Error("athena query timed out");
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  const rows = [];
  let nextToken;
  do {
    const page = await athena.send(new GetQueryResultsCommand({ QueryExecutionId: id, NextToken: nextToken }));
    rows.push(...(page.ResultSet?.Rows ?? []));
    nextToken = page.NextToken;
  } while (nextToken);
  if (rows.length === 0) return [];
  const header = rows[0].Data.map((d) => d.VarCharValue);
  return rows.slice(1).map((row) => Object.fromEntries(row.Data.map((d, i) => [header[i], d.VarCharValue ?? null])));
}

const tableName = (environment, table) => `${environment}-env-${table}`;

/**
 * The pass items that a lake row names: a Query on issuedBy-index for the row's issuer and creation
 * time, kept when the item is a pass whose own actor is test-user or probe.
 */
async function passKeysOf(dynamo, name, row) {
  if (!row.issued_by || !row.created_at) return [];
  const keys = [];
  let lastKey;
  do {
    const page = await dynamo.send(
      new QueryCommand({
        TableName: name,
        IndexName: "issuedBy-index",
        KeyConditionExpression: "issuedBy = :issuedBy AND createdAt = :createdAt",
        ExpressionAttributeValues: { ":issuedBy": row.issued_by, ":createdAt": row.created_at },
        ExclusiveStartKey: lastKey,
      }),
    );
    for (const item of page.Items ?? []) {
      if (typeof item.pk === "string" && item.pk.startsWith(PASS_PK_PREFIX) && isTestActor(item.actor)) keys.push({ pk: item.pk });
    }
    lastKey = page.LastEvaluatedKey;
  } while (lastKey);
  return keys;
}

/**
 * The DynamoDB keys of the lake rows, and the count of rows that name no item key.
 *
 * @returns {Promise<{keys: object[], unresolved: number}>}
 */
export async function findKeys({ dynamo, environment, table, rows }) {
  const { keyOf } = TABLES[table];
  if (keyOf) return { keys: rows.map(keyOf), unresolved: 0 };
  const name = tableName(environment, table);
  const found = new Map();
  let unresolved = 0;
  await mapLimit(rows, WRITE_CONCURRENCY, async (row) => {
    const keys = await passKeysOf(dynamo, name, row);
    if (keys.length === 0) unresolved += 1;
    keys.forEach((key) => found.set(key.pk, key));
  });
  return { keys: [...found.values()], unresolved };
}

/**
 * The test pass keys from a paginated Scan of the passes table. Only pk and actor are read, and
 * the filter keeps a pass# item whose own actor is test-user or probe.
 *
 * @returns {Promise<{keys: object[], scanned: number}>}
 */
export async function scanPassKeys(dynamo, name, { pageLimit = SCAN_PAGE_LIMIT } = {}) {
  const keys = [];
  let scanned = 0;
  let lastKey;
  do {
    const page = await dynamo.send(
      new ScanCommand({
        TableName: name,
        FilterExpression: "begins_with(pk, :pass) AND #actor IN (:testUser, :probe)",
        ProjectionExpression: "pk, #actor",
        ExpressionAttributeNames: { "#actor": "actor" },
        ExpressionAttributeValues: { ":pass": PASS_PK_PREFIX, ":testUser": "test-user", ":probe": "probe" },
        Limit: pageLimit,
        ExclusiveStartKey: lastKey,
      }),
    );
    scanned += page.ScannedCount ?? 0;
    for (const item of page.Items ?? []) keys.push({ pk: item.pk });
    lastKey = page.LastEvaluatedKey;
  } while (lastKey);
  return { keys, scanned };
}

/**
 * Set the short ttl on one item when its stored actor is still test-user or probe.
 *
 * @returns {Promise<boolean>} false when the condition failed: the item is gone or no longer a test item
 */
export async function expireItem(dynamo, name, key, now) {
  const { ttl, ttl_datestamp } = testRecordRetention(now);
  try {
    await dynamo.send(
      new UpdateCommand({
        TableName: name,
        Key: key,
        UpdateExpression: "SET #ttl = :ttl, #ttlDatestamp = :ttlDatestamp",
        ConditionExpression: "#actor IN (:testUser, :probe)",
        ExpressionAttributeNames: { "#ttl": "ttl", "#ttlDatestamp": "ttl_datestamp", "#actor": "actor" },
        ExpressionAttributeValues: { ":ttl": ttl, ":ttlDatestamp": ttl_datestamp, ":testUser": "test-user", ":probe": "probe" },
      }),
    );
    return true;
  } catch (error) {
    if (error?.name === "ConditionalCheckFailedException") return false;
    throw error;
  }
}

/**
 * Read the test keys of one table from the lake, or with scan the test pass keys from a Scan, and
 * with apply set the short ttl on each.
 *
 * @returns {Promise<{table: string, lakeRows: number|null, scanned: number|null, keys: number, unresolved: number, sample: object[], updated: number, skipped: number}>}
 */
export async function runExpireTestItems({ environment, table, apply, scan = false, athena, dynamo, now = new Date(), log = console.log }) {
  if (scan && table !== SCAN_TABLE) throw new Error(`--scan is valid only with --table ${SCAN_TABLE}`);
  const name = tableName(environment, table);
  let keys;
  let unresolved = 0;
  let lakeRows = null;
  let scanned = null;
  if (scan) {
    ({ keys, scanned } = await scanPassKeys(dynamo, name));
    log(`${name}: Scan read ${scanned} items, ${keys.length} test pass keys`);
  } else {
    const rows = await runAthena(athena, buildTestKeysSql(table), environment);
    lakeRows = rows.length;
    ({ keys, unresolved } = await findKeys({ dynamo, environment, table, rows }));
    log(`${name}: ${rows.length} lake rows, ${keys.length} keys${unresolved ? `, ${unresolved} rows with no pass key found` : ""}`);
  }
  const sample = keys.slice(0, SAMPLE_SIZE);
  sample.forEach((key) => log(`  ${JSON.stringify(key)}`));
  const result = { table: name, lakeRows, scanned, keys: keys.length, unresolved, sample, updated: 0, skipped: 0 };
  if (!apply) {
    log("Dry run: nothing written. Add --apply to set the short ttl on these keys.");
    return result;
  }
  await mapLimit(keys, WRITE_CONCURRENCY, async (key) => {
    if (await expireItem(dynamo, name, key, now)) result.updated += 1;
    else result.skipped += 1;
  });
  log(`${name}: ttl set on ${result.updated}; ${result.skipped} left alone (item gone or actor changed)`);
  return result;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const athena = new AthenaClient({ region: REGION });
  const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));
  await runExpireTestItems({ ...opts, athena, dynamo });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
