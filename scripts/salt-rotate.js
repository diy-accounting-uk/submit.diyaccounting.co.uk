#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability OPS-169 Rotate the user sub hash salt and re-key every store
// - **Use when:** the user-sub-hash-salt must change, or items written late under an earlier salt version must move to the current one.
// - **Does:** salt-rotate.js adds a new salt version and makes it current in two waits that cover the Lambda salt cache. It moves every hash-keyed item in every table of scripts/salt-rotation-tables.json and every diya-gl object to the new hash, updates the canary, and writes the lake's hash aliases. Every step is resumable and idempotent, and it prints counts only.
// - **Run:** `gh workflow run salt-rotate.yml -f environment-name=<ci|prod> -f mode=<plan|rotate|sweep>`
// - **Entry:** `scripts/salt-rotate.js:runRotation`
// - **Files:** .github/workflows/salt-rotate.yml, scripts/salt-rotate.js, scripts/salt-rotation-tables.json, app/unit-tests/scripts/saltRotate.test.js, infra/test/java/co/uk/diyaccounting/submit/stacks/SaltRotationTablesTest.java, infra/main/resources/analytics/views/aliased_dynamo_bundles.sql, infra/main/resources/analytics/views/aliased_dynamo_commissions.sql, infra/main/resources/analytics/views/aliased_dynamo_passes.sql, infra/main/resources/analytics/views/aliased_dynamo_receipts.sql, infra/main/resources/analytics/views/aliased_dynamo_subscriptions.sql, infra/main/resources/analytics/views/aliased_stripe_charges.sql, infra/main/resources/analytics/views/aliased_stripe_subscriptions.sql, infra/main/java/co/uk/diyaccounting/submit/stacks/analytics/HashAliasTable.java, app/unit-tests/data/saltRotationWindow.test.js
// - **Keywords:** salt rotation, re-key, hashed sub, hash aliases, salt sweep, repeatable rotation, cutover
// - **Related:** OPS-44, OPS-16, DATA-04
// @end-capability

// scripts/salt-rotate.js
//
// A rotation has three registry states, held in the salt secret itself under "rotation":
//
//   staged    The new version is in the registry but is not current. After one salt cache TTL
//             every Lambda knows both versions, so a container that still treats the old version
//             as current reads the new hash as a previous version.
//   cutover   The new version is current. After one more salt cache TTL no Lambda writes under
//             the old hash, and the re-key starts.
//   (cleared) Every known item has moved.
//
// A stop at any point leaves a state that the next run resumes. The hash of a Cognito sub cannot
// be reversed, so the list of users comes from Cognito. A hash with no Cognito user stays where it
// is, and every earlier version stays in the registry so that data keeps its meaning.
//
// A sweep repeats the re-key alone. A Stripe checkout opened before the cutover names the old hash
// for up to 24 hours, so a sweep runs a day after a rotation.
//
// This log is public: nothing here prints a salt, a hash, a sub or an email.
//
// Usage:
//   ENVIRONMENT_NAME=ci COGNITO_USER_POOL_ID=<id> node scripts/salt-rotate.js [--mode plan|rotate|sweep]

import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";
import { GetCommand, PutCommand, QueryCommand, ScanCommand, TransactWriteCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { generatePassphrase } from "../app/lib/passphrase.js";
import { SALT_CACHE_TTL_MS } from "../app/services/subHasher.js";

const MANIFEST_PATH = join(dirname(fileURLToPath(import.meta.url)), "salt-rotation-tables.json");
const HASH_PATTERN = /\b[0-9a-f]{64}\b/g;
const SALT_SECRET_SUFFIX = "submit/user-sub-hash-salt";
const CANARY_INPUT = "salt-canary-verification-string";
const ALIASES_KEY = "curated/hash-aliases/hash_aliases.json.gz";
const PASSPHRASE_WORDS = 8;
const TABLE_CONCURRENCY = 8;
const ATHENA_POLL_MS = 2000;
const ATHENA_TIMEOUT_MS = 5 * 60 * 1000;
const LAKE_HASHES_QUERY = `SELECT hashed_sub FROM activity_events WHERE hashed_sub IS NOT NULL
UNION SELECT hashed_sub FROM dynamo_bundles WHERE hashed_sub IS NOT NULL
UNION SELECT hashed_sub FROM dynamo_receipts WHERE hashed_sub IS NOT NULL
UNION SELECT hashed_sub FROM dynamo_subscriptions WHERE hashed_sub IS NOT NULL`;

export const CACHE_WAIT_MS = SALT_CACHE_TTL_MS + 60 * 1000;

export function parseArgs(argv) {
  const opts = { mode: "plan" };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--mode") opts.mode = argv[++i];
    else throw new Error(`Unknown argument "${argv[i]}"`);
  }
  if (!["plan", "rotate", "sweep"].includes(opts.mode)) throw new Error(`Unknown mode "${opts.mode}"`);
  return opts;
}

export function loadManifest() {
  return JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
}

export function hashValue(salt, value) {
  return crypto.createHmac("sha256", salt).update(value).digest("hex");
}

/** The label one past the highest "v<n>" in the registry. */
export function nextVersionLabel(registry) {
  const numbers = Object.keys(registry.versions).map((version) => Number(version.replace(/^v/, "")));
  return `v${Math.max(0, ...numbers.filter(Number.isInteger)) + 1}`;
}

export function stageRegistry(registry, version, salt, now) {
  return {
    ...registry,
    versions: { ...registry.versions, [version]: salt },
    rotation: { from: registry.current, to: version, state: "staged", at: now },
  };
}

export function cutOverRegistry(registry, now) {
  return { ...registry, current: registry.rotation.to, rotation: { ...registry.rotation, state: "cutover", at: now } };
}

export function clearRotation(registry) {
  const cleared = { ...registry };
  delete cleared.rotation;
  return cleared;
}

function previousVersions(registry) {
  return Object.keys(registry.versions).filter((version) => version !== registry.current);
}

/**
 * The old-to-current hash of every user, for both identifiers a user's data is keyed by: the
 * Cognito sub, and the normalised email behind the family affiliate marker.
 *
 * @returns {{identities: {oldHashes: {version: string, hash: string}[], currentHash: string}[], hashMap: Map<string,string>, currentHashes: Set<string>}}
 */
export function buildIdentityMap(registry, users) {
  const currentSalt = registry.versions[registry.current];
  const hashMap = new Map();
  const currentHashes = new Set();
  const identities = [];

  const addValue = (value) => {
    const currentHash = hashValue(currentSalt, value);
    currentHashes.add(currentHash);
    const oldHashes = previousVersions(registry).map((version) => ({ version, hash: hashValue(registry.versions[version], value) }));
    for (const { hash } of oldHashes) hashMap.set(hash, currentHash);
    return { oldHashes, currentHash };
  };

  for (const { sub, email } of users) {
    identities.push(addValue(sub));
    if (email) addValue(email.trim().toLowerCase());
  }
  return { identities, hashMap, currentHashes };
}

/** Replaces every known old hash inside a string, and counts the hashes that no user maps. */
export function rewriteHashes(text, { hashMap, currentHashes }) {
  let unmapped = 0;
  const rewritten = text.replace(HASH_PATTERN, (hash) => {
    if (hashMap.has(hash)) return hashMap.get(hash);
    if (!currentHashes.has(hash)) unmapped += 1;
    return hash;
  });
  return { rewritten, unmapped };
}

/**
 * Works out what one row of a row table needs.
 *
 * @returns {{key: object, newKey: object, keyChanged: boolean, attributeChanges: object, unmapped: number}}
 */
export function planRow(row, table, identityMap) {
  const key = { [table.partitionKey]: row[table.partitionKey] };
  if (table.sortKey) key[table.sortKey] = row[table.sortKey];

  let unmapped = 0;
  const rewrite = (value) => {
    const result = rewriteHashes(value, identityMap);
    unmapped += result.unmapped;
    return result.rewritten;
  };

  const newKey = Object.fromEntries(Object.entries(key).map(([name, value]) => [name, rewrite(value)]));
  const attributeChanges = {};
  for (const name of table.attributes) {
    if (typeof row[name] !== "string") continue;
    const rewritten = rewrite(row[name]);
    if (rewritten !== row[name]) attributeChanges[name] = rewritten;
  }
  const keyChanged = Object.keys(key).some((name) => key[name] !== newKey[name]);
  return { key, newKey, keyChanged, attributeChanges, unmapped };
}

function isConditionFailure(error) {
  return error?.name === "ConditionalCheckFailedException";
}

function isPutConflict(error) {
  return error?.name === "TransactionCanceledException" && error.CancellationReasons?.[0]?.Code === "ConditionalCheckFailed";
}

/**
 * Moves one item to a new key: put the new item, delete the old, in one transaction.
 *
 * The old item first takes a "to:<version>" mark, and the new item carries "from:<version>". The
 * stream consumer reads both marks and leaves the move out of the lake, because the lake's views
 * count inserts and a re-key adds no business event. The mark also returns the latest image, so
 * the put carries any write made since the read.
 *
 * An item that already exists at the new key wins attribute by attribute, and the old item fills
 * the gaps. An item that has gone from the old key has already moved, so a re-run is a no-op.
 *
 * @returns {Promise<"moved"|"merged"|"gone">}
 */
export async function moveItem(context, { tableName, partitionKey, oldKey, newKey, rewriteAttributes, fromVersion, toVersion }) {
  const { doc } = context;
  let latest;
  try {
    const marked = await doc.send(
      new UpdateCommand({
        TableName: tableName,
        Key: oldKey,
        UpdateExpression: "SET saltRotation = :mark",
        ConditionExpression: "attribute_exists(#pk)",
        ExpressionAttributeNames: { "#pk": partitionKey },
        ExpressionAttributeValues: { ":mark": `to:${toVersion}` },
        ReturnValues: "ALL_NEW",
      }),
    );
    latest = marked.Attributes;
  } catch (error) {
    if (isConditionFailure(error)) return "gone";
    throw error;
  }

  const newItem = { ...latest, ...rewriteAttributes(latest), ...newKey, saltVersion: toVersion, saltRotation: `from:${fromVersion}` };
  const deleteOld = { Delete: { TableName: tableName, Key: oldKey } };
  try {
    await doc.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: tableName,
              Item: newItem,
              ConditionExpression: `attribute_not_exists(#pk)`,
              ExpressionAttributeNames: { "#pk": partitionKey },
            },
          },
          deleteOld,
        ],
      }),
    );
    return "moved";
  } catch (error) {
    if (!isPutConflict(error)) throw error;
  }

  const existing = await doc.send(new GetCommand({ TableName: tableName, Key: newKey, ConsistentRead: true }));
  const merged = { ...newItem, ...existing.Item, saltVersion: toVersion, saltRotation: `from:${fromVersion}` };
  await doc.send(new TransactWriteCommand({ TransactItems: [{ Put: { TableName: tableName, Item: merged } }, deleteOld] }));
  return "merged";
}

async function queryPartition(context, tableName, hashedSub) {
  const items = [];
  let startKey;
  do {
    const page = await context.doc.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "hashedSub = :hashedSub",
        ExpressionAttributeValues: { ":hashedSub": hashedSub },
        ConsistentRead: true,
        ExclusiveStartKey: startKey,
      }),
    );
    items.push(...(page.Items ?? []));
    startKey = page.LastEvaluatedKey;
  } while (startKey);
  return items;
}

async function countPartition(context, tableName, hashedSub) {
  let count = 0;
  let startKey;
  do {
    const page = await context.doc.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "hashedSub = :hashedSub",
        ExpressionAttributeValues: { ":hashedSub": hashedSub },
        Select: "COUNT",
        ExclusiveStartKey: startKey,
      }),
    );
    count += page.Count ?? 0;
    startKey = page.LastEvaluatedKey;
  } while (startKey);
  return count;
}

/**
 * Reads every row of a row table, keys and hash attributes only. These three tables hold a hash
 * inside a key or an attribute that no index reaches, so no list of users can address the rows.
 */
async function readRows(context, tableName, table) {
  const names = [table.partitionKey, ...(table.sortKey ? [table.sortKey] : []), ...table.attributes, "stripeCustomerId"];
  const expressionNames = Object.fromEntries(names.map((name, index) => [`#a${index}`, name]));
  const rows = [];
  let startKey;
  do {
    const page = await context.doc.send(
      new ScanCommand({
        TableName: tableName,
        ProjectionExpression: Object.keys(expressionNames).join(", "),
        ExpressionAttributeNames: expressionNames,
        ConsistentRead: true,
        ExclusiveStartKey: startKey,
      }),
    );
    rows.push(...(page.Items ?? []));
    startKey = page.LastEvaluatedKey;
  } while (startKey);
  return rows;
}

async function mapLimit(values, limit, worker) {
  const queue = [...values];
  const runners = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length > 0) await worker(queue.shift());
  });
  await Promise.all(runners);
}

function tally(report, table, outcome, amount = 1) {
  report[table] ??= {};
  report[table][outcome] = (report[table][outcome] ?? 0) + amount;
}

async function rekeyPartitions(context, manifest, identity, registry, report) {
  await mapLimit(manifest.partitionTables, TABLE_CONCURRENCY, async ({ table, sortKey }) => {
    const tableName = `${context.envName}-env-${table}`;
    for (const { version, hash } of identity.oldHashes) {
      for (const item of await queryPartition(context, tableName, hash)) {
        const outcome = await moveItem(context, {
          tableName,
          partitionKey: "hashedSub",
          oldKey: { hashedSub: hash, [sortKey]: item[sortKey] },
          newKey: { hashedSub: identity.currentHash, [sortKey]: item[sortKey] },
          rewriteAttributes: () => ({}),
          fromVersion: version,
          toVersion: registry.current,
        });
        tally(report, table, outcome);
      }
    }
  });
}

async function rekeyRowTable(context, table, identityMap, registry, report) {
  const tableName = `${context.envName}-env-${table.table}`;
  for (const row of await readRows(context, tableName, table)) {
    const plan = planRow(row, table, identityMap);
    if (plan.unmapped > 0) tally(report, table.table, "unmapped");
    if (plan.keyChanged) {
      const outcome = await moveItem(context, {
        tableName,
        partitionKey: table.partitionKey,
        oldKey: plan.key,
        newKey: plan.newKey,
        rewriteAttributes: (latest) => planRow(latest, table, identityMap).attributeChanges,
        fromVersion: registry.rotation?.from ?? "earlier",
        toVersion: registry.current,
      });
      tally(report, table.table, outcome);
    } else if (Object.keys(plan.attributeChanges).length > 0) {
      await updateRowAttributes(context, tableName, plan, row, registry);
      tally(report, table.table, "updated");
    }
  }
}

async function updateRowAttributes(context, tableName, plan, row, registry) {
  const entries = Object.entries(plan.attributeChanges);
  const names = Object.fromEntries(entries.map(([name], index) => [`#a${index}`, name]));
  const values = { ":mark": `from:${registry.rotation?.from ?? "earlier"}`, ":version": registry.current };
  entries.forEach(([name, value], index) => {
    values[`:new${index}`] = value;
    values[`:old${index}`] = row[name];
  });
  try {
    await context.doc.send(
      new UpdateCommand({
        TableName: tableName,
        Key: plan.key,
        UpdateExpression: `SET ${entries.map((_, index) => `#a${index} = :new${index}`).join(", ")}, saltRotation = :mark, saltVersion = :version`,
        ConditionExpression: entries.map((_, index) => `#a${index} = :old${index}`).join(" AND "),
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
      }),
    );
  } catch (error) {
    if (!isConditionFailure(error)) throw error;
  }
}

async function listObjects(context, prefix) {
  const { ListObjectsV2Command } = await import("@aws-sdk/client-s3");
  const objects = [];
  let token;
  do {
    const page = await context.s3.send(new ListObjectsV2Command({ Bucket: context.booksBucket, Prefix: prefix, ContinuationToken: token }));
    objects.push(...(page.Contents ?? []));
    token = page.NextContinuationToken;
  } while (token);
  return objects;
}

async function headEtag(context, key) {
  const { HeadObjectCommand } = await import("@aws-sdk/client-s3");
  try {
    return (await context.s3.send(new HeadObjectCommand({ Bucket: context.booksBucket, Key: key }))).ETag;
  } catch (error) {
    if (error.name === "NotFound" || error.name === "NoSuchKey") return null;
    throw error;
  }
}

/**
 * Moves one user's diya-gl objects to the new prefix. metadata.json goes last, because a reader
 * finds a book by its metadata. Nothing is deleted until its copy is proven by ETag, and an object
 * that differs at the new key stays at the old key and is counted.
 */
async function rekeyBooks(context, identity, report) {
  const { CopyObjectCommand, DeleteObjectsCommand } = await import("@aws-sdk/client-s3");
  for (const { hash } of identity.oldHashes) {
    const prefix = `users/${hash}/`;
    const objects = (await listObjects(context, prefix)).sort(
      (a, b) => a.Key.endsWith("metadata.json") - b.Key.endsWith("metadata.json") || a.Key.localeCompare(b.Key),
    );
    const moved = [];
    for (const { Key, ETag } of objects) {
      const destination = `users/${identity.currentHash}/${Key.slice(prefix.length)}`;
      const existing = await headEtag(context, destination);
      if (existing && existing !== ETag) {
        tally(report, "diya-gl", "conflict");
        continue;
      }
      if (!existing) {
        const copied = await context.s3.send(
          new CopyObjectCommand({ Bucket: context.booksBucket, CopySource: `${context.booksBucket}/${Key}`, Key: destination }),
        );
        if (copied.CopyObjectResult?.ETag !== ETag) throw new Error("A diya-gl copy failed its ETag check");
      }
      moved.push({ Key });
      tally(report, "diya-gl", "moved");
    }
    if (moved.length > 0) {
      await context.s3.send(new DeleteObjectsCommand({ Bucket: context.booksBucket, Delete: { Objects: moved } }));
    }
  }
}

async function writeCanary(context, registry) {
  await context.doc.send(
    new PutCommand({
      TableName: `${context.envName}-env-bundles`,
      Item: {
        hashedSub: "system#canary",
        bundleId: "salt-health-check",
        expectedHash: hashValue(registry.versions[registry.current], CANARY_INPUT),
        canaryInput: CANARY_INPUT,
        saltVersion: registry.current,
        updatedAt: context.now(),
      },
    }),
  );
}

async function canaryIsGreen(context, registry) {
  const { Item } = await context.doc.send(
    new GetCommand({
      TableName: `${context.envName}-env-bundles`,
      Key: { hashedSub: "system#canary", bundleId: "salt-health-check" },
      ConsistentRead: true,
    }),
  );
  return Item?.expectedHash === hashValue(registry.versions[registry.current], CANARY_INPUT);
}

/**
 * The lake's rows keep the hash they were written with, so every view reads them through this
 * map: each earlier hash of a user, a pass id or a Stripe customer to its current hash. Rows of a
 * deleted account stay in the map through the aliases of the last rotation.
 *
 * @param {{registry: object, users: object[], passRows: object[], subscriptionRows: object[], previousAliases: object[]}} sources
 * @returns {{old_hash: string, current_hash: string}[]}
 */
export function buildAliases({ registry, users, passRows, subscriptionRows, previousAliases }) {
  const currentSalt = registry.versions[registry.current];
  const aliases = new Map();
  const add = (oldHash, currentHash) => {
    if (oldHash !== currentHash) aliases.set(oldHash, currentHash);
  };

  const userHashes = users.map(({ sub }) => ({ sub, currentHash: hashValue(currentSalt, sub) }));
  for (const version of previousVersions(registry)) {
    const salt = registry.versions[version];
    const toVersionHash = new Map(userHashes.map(({ sub, currentHash }) => [currentHash, hashValue(salt, sub)]));

    for (const { sub, currentHash } of userHashes) add(hashValue(salt, sub), currentHash);
    for (const { pk } of passRows) {
      if (!/^(pass|redemption)#/.test(pk)) continue;
      const pkUnderVersion = pk.replace(HASH_PATTERN, (hash) => toVersionHash.get(hash) ?? hash);
      add(hashValue(salt, pkUnderVersion), hashValue(currentSalt, pk));
    }
    for (const { stripeCustomerId } of subscriptionRows) {
      if (stripeCustomerId) add(hashValue(salt, stripeCustomerId), hashValue(currentSalt, stripeCustomerId));
    }
  }

  for (const { old_hash: oldHash, current_hash: currentHash } of previousAliases) {
    if (!aliases.has(oldHash)) add(oldHash, aliases.get(currentHash) ?? currentHash);
  }
  return [...aliases].map(([oldHash, currentHash]) => ({ old_hash: oldHash, current_hash: currentHash }));
}

async function readPreviousAliases(context) {
  const { GetObjectCommand } = await import("@aws-sdk/client-s3");
  try {
    const response = await context.s3.send(new GetObjectCommand({ Bucket: context.lakeBucket, Key: ALIASES_KEY }));
    const body = gunzipSync(Buffer.from(await response.Body.transformToByteArray())).toString("utf-8");
    return body
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error.name === "NoSuchKey") return [];
    throw error;
  }
}

async function writeAliases(context, manifest, registry, users) {
  const { PutObjectCommand } = await import("@aws-sdk/client-s3");
  const rowTable = (name) => manifest.rowTables.find(({ table }) => table === name);
  const aliases = buildAliases({
    registry,
    users,
    passRows: await readRows(context, `${context.envName}-env-passes`, rowTable("passes")),
    subscriptionRows: await readRows(context, `${context.envName}-env-subscriptions`, rowTable("subscriptions")),
    previousAliases: await readPreviousAliases(context),
  });
  await context.s3.send(
    new PutObjectCommand({
      Bucket: context.lakeBucket,
      Key: ALIASES_KEY,
      Body: gzipSync(aliases.map((alias) => JSON.stringify(alias)).join("\n") + "\n"),
      ContentType: "application/json",
      ContentEncoding: "gzip",
    }),
  );
  return aliases.length;
}

/** Per-table item counts by salt version for every known user, and the diya-gl object counts. */
export async function countByVersion(context, manifest, registry, identityMap) {
  const counts = {};
  await mapLimit(manifest.partitionTables, TABLE_CONCURRENCY, async ({ table }) => {
    const tableName = `${context.envName}-env-${table}`;
    counts[table] = { current: 0, earlier: 0 };
    for (const identity of identityMap.identities) {
      counts[table].current += await countPartition(context, tableName, identity.currentHash);
      for (const { hash } of identity.oldHashes) counts[table].earlier += await countPartition(context, tableName, hash);
    }
  });
  counts["diya-gl"] = { current: 0, earlier: 0 };
  for (const identity of identityMap.identities) {
    counts["diya-gl"].current += (await listObjects(context, `users/${identity.currentHash}/`)).length;
    for (const { hash } of identity.oldHashes) counts["diya-gl"].earlier += (await listObjects(context, `users/${hash}/`)).length;
  }
  for (const table of manifest.rowTables) {
    counts[table.table] = { current: 0, earlier: 0, unmapped: 0 };
    for (const row of await readRows(context, `${context.envName}-env-${table.table}`, table)) {
      const plan = planRow(row, table, identityMap);
      const needsChange = plan.keyChanged || Object.keys(plan.attributeChanges).length > 0;
      counts[table.table][needsChange ? "earlier" : "current"] += 1;
      if (plan.unmapped > 0) counts[table.table].unmapped += 1;
    }
  }
  return counts;
}

function printCounts(context, title, counts) {
  context.log(title);
  for (const [table, count] of Object.entries(counts)) {
    if (Object.values(count).some(Boolean)) context.log(`  ${table}: ${JSON.stringify(count)}`);
  }
}

/** The number of hashes in the lake that no Cognito user maps to. Those rows stay where they are. */
async function countLakeHashesWithNoUser(context, identityMap) {
  const lakeHashes = await context.readLakeHashes();
  const known = (hash) => identityMap.hashMap.has(hash) || identityMap.currentHashes.has(hash);
  return lakeHashes.filter((hash) => !known(hash)).length;
}

async function waitForCaches(context, rotation) {
  const remaining = Date.parse(rotation.at) + CACHE_WAIT_MS - Date.parse(context.now());
  if (remaining > 0) {
    context.log(`Waiting ${Math.ceil(remaining / 1000)}s for every Lambda salt cache to refresh`);
    await context.sleep(remaining);
  }
}

/** Advances the registry to the cutover state, from wherever an earlier run stopped. */
async function advanceRegistry(context, startRegistry) {
  let registry = startRegistry;
  if (!registry.rotation) {
    const version = nextVersionLabel(registry);
    registry = stageRegistry(registry, version, generatePassphrase(PASSPHRASE_WORDS), context.now());
    await context.writeRegistry(registry);
    context.log(`Staged ${version}. Current stays ${registry.current}`);
  }
  if (registry.rotation.state === "staged") {
    await waitForCaches(context, registry.rotation);
    registry = cutOverRegistry(registry, context.now());
    await context.writeRegistry(registry);
    context.log(`Cut over. Current is ${registry.current}`);
  }
  await waitForCaches(context, registry.rotation);
  return registry;
}

/**
 * Runs one plan, rotation or sweep.
 *
 * @param {object} context - doc, s3, envName, booksBucket, lakeBucket, listUsers, readRegistry,
 *   writeRegistry, readLakeHashes, now, sleep, log
 * @param {{mode: "plan"|"rotate"|"sweep"}} options
 * @returns {Promise<{before: object, after: object|null, report: object}>}
 */
export async function runRotation(context, { mode }) {
  const manifest = loadManifest();
  let registry = await context.readRegistry();
  const users = await context.listUsers();
  if (users.length === 0) throw new Error("Cognito returned no users, so no hash can be mapped");

  context.log(`Environment: ${context.envName}`);
  context.log(`Mode: ${mode}`);
  context.log(`Current version: ${registry.current}`);
  context.log(`Versions: [${Object.keys(registry.versions).join(", ")}]`);
  context.log(`Rotation in flight: ${registry.rotation ? `${registry.rotation.to} ${registry.rotation.state}` : "none"}`);
  context.log(`Cognito users: ${users.length}`);

  const beforeMap = buildIdentityMap(registry, users);
  const before = await countByVersion(context, manifest, registry, beforeMap);
  printCounts(context, "Items by version before this run:", before);
  context.log(`Lake hashes with no Cognito user: ${await countLakeHashesWithNoUser(context, beforeMap)}`);

  if (mode === "plan") {
    context.log("Plan only. No write made.");
    return { before, after: null, report: {} };
  }
  if (mode === "sweep" && registry.rotation) throw new Error("A rotation is in flight. Resume it with --mode rotate");
  if (mode === "rotate") registry = await advanceRegistry(context, registry);

  const identityMap = buildIdentityMap(registry, users);
  const report = {};
  for (const identity of identityMap.identities) {
    await rekeyPartitions(context, manifest, identity, registry, report);
    await rekeyBooks(context, identity, report);
  }
  for (const table of manifest.rowTables) await rekeyRowTable(context, table, identityMap, registry, report);
  printCounts(context, "Re-key outcome:", report);

  await writeCanary(context, registry);
  context.log(`Lake aliases written: ${await writeAliases(context, manifest, registry, users)}`);

  const after = await countByVersion(context, manifest, registry, identityMap);
  printCounts(context, "Items by version after this run:", after);

  const left = Object.entries(after).filter(([table, { earlier }]) => earlier > 0 && !(table === "diya-gl" && report["diya-gl"]?.conflict));
  if (left.length > 0) throw new Error(`Items remain under an earlier version in: ${left.map(([table]) => table).join(", ")}`);
  if (!(await canaryIsGreen(context, registry))) throw new Error("The salt canary does not match the current version");
  context.log("Salt canary: green");

  if (registry.rotation) {
    await context.writeRegistry(clearRotation(registry));
    context.log(`Rotation complete. Current is ${registry.current}`);
    context.log("Next: set SUBMIT_COMPANY_BOOK_OWNER_PREFIX on prod to the new owner hash and run deploy-environment.yml, because the book keys carry the hash");
    context.log("Next: run a sweep after 24 hours. Then run scripts/backup-salts.sh and print a new card");
  }
  return { before, after, report };
}

async function createContext(envName) {
  const { DynamoDBClient } = await import("@aws-sdk/client-dynamodb");
  const { DynamoDBDocumentClient } = await import("@aws-sdk/lib-dynamodb");
  const { S3Client } = await import("@aws-sdk/client-s3");
  const { STSClient, GetCallerIdentityCommand } = await import("@aws-sdk/client-sts");
  const { SecretsManagerClient, GetSecretValueCommand, UpdateSecretCommand, TagResourceCommand } =
    await import("@aws-sdk/client-secrets-manager");
  const { CognitoIdentityProviderClient, ListUsersCommand } = await import("@aws-sdk/client-cognito-identity-provider");
  const { AthenaClient, StartQueryExecutionCommand, GetQueryExecutionCommand, GetQueryResultsCommand } =
    await import("@aws-sdk/client-athena");

  const region = process.env.AWS_REGION || "eu-west-2";
  const userPoolId = process.env.COGNITO_USER_POOL_ID;
  if (!userPoolId) throw new Error("COGNITO_USER_POOL_ID is required");

  const { Account: account } = await new STSClient({ region }).send(new GetCallerIdentityCommand({}));
  const secrets = new SecretsManagerClient({ region });
  const cognito = new CognitoIdentityProviderClient({ region });
  const athena = new AthenaClient({ region });
  const secretName = `${envName}/${SALT_SECRET_SUFFIX}`;

  return {
    envName,
    doc: DynamoDBDocumentClient.from(new DynamoDBClient({ region }), { marshallOptions: { removeUndefinedValues: true } }),
    s3: new S3Client({ region }),
    booksBucket: `${envName}-env-diya-gl-${account}`,
    lakeBucket: `${envName}-env-analytics-lake-${account}`,
    now: () => new Date().toISOString(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    log: (line) => console.log(line),

    async readRegistry() {
      const { SecretString } = await secrets.send(new GetSecretValueCommand({ SecretId: secretName }));
      return JSON.parse(SecretString);
    },

    async writeRegistry(registry) {
      await secrets.send(new UpdateSecretCommand({ SecretId: secretName, SecretString: JSON.stringify(registry) }));
      await secrets.send(
        new TagResourceCommand({ SecretId: secretName, Tags: [{ Key: "rotated-at", Value: new Date().toISOString().slice(0, 10) }] }),
      );
    },

    async listUsers() {
      const users = [];
      let token;
      do {
        const page = await cognito.send(
          new ListUsersCommand({ UserPoolId: userPoolId, AttributesToGet: ["sub", "email"], PaginationToken: token }),
        );
        for (const { Attributes } of page.Users ?? []) {
          const value = (name) => Attributes?.find((attribute) => attribute.Name === name)?.Value;
          if (value("sub")) users.push({ sub: value("sub"), email: value("email") });
        }
        token = page.PaginationToken;
      } while (token);
      return users;
    },

    async readLakeHashes() {
      const { QueryExecutionId } = await athena.send(
        new StartQueryExecutionCommand({
          QueryString: LAKE_HASHES_QUERY,
          WorkGroup: `${envName}-env-analytics`,
          QueryExecutionContext: { Database: `${envName}_env_analytics` },
        }),
      );
      const deadline = Date.now() + ATHENA_TIMEOUT_MS;
      for (;;) {
        const { QueryExecution } = await athena.send(new GetQueryExecutionCommand({ QueryExecutionId }));
        const state = QueryExecution?.Status?.State;
        if (state === "SUCCEEDED") break;
        if (state === "FAILED" || state === "CANCELLED") throw new Error(`The lake query ${state}`);
        if (Date.now() > deadline) throw new Error("The lake query timed out");
        await new Promise((resolve) => setTimeout(resolve, ATHENA_POLL_MS));
      }
      const hashes = [];
      let token;
      do {
        const page = await athena.send(new GetQueryResultsCommand({ QueryExecutionId, NextToken: token }));
        hashes.push(...(page.ResultSet?.Rows ?? []).map((row) => row.Data?.[0]?.VarCharValue));
        token = page.NextToken;
      } while (token);
      return hashes.slice(1);
    },
  };
}

export async function main(argv = process.argv.slice(2)) {
  const { mode } = parseArgs(argv);
  const envName = process.env.ENVIRONMENT_NAME;
  if (!envName) throw new Error("ENVIRONMENT_NAME is required (e.g., 'ci' or 'prod')");
  await runRotation(await createContext(envName), { mode });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
