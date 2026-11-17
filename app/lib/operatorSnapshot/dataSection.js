// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/operatorSnapshot/dataSection.js

// The snapshot's `data` section: how much each DynamoDB table, S3 bucket and diya-gl book store
// holds, now and 90, 30, 7 and 1 days ago, with each table's default TTL and a customer, test
// and synthetic split where the lake holds the table.
//
// Table counts come from DescribeTable and never from a Scan. DescribeTable lags about six hours,
// and DynamoDB keeps no history, so each run writes one small JSON per day to the lake and reads
// the earlier days back. A day with no file shows no figure, never 0. Bucket totals and their
// history come from the CloudWatch S3 NumberOfObjects metric. The actor split comes from one
// Athena query a day, kept in that day's history file for the hourly runs that follow. The same
// query gives each diya-gl book owner's class, so the store's objects, books and book versions
// split the same way. A table's items that the lake has no change record of (written before the
// lake began, or items the lake leaves out) are the table's count less the lake's items, so the
// classes and that remainder add up to the count.

const DATA_HISTORY_OFFSETS = [90, 30, 7, 1];

// The tables whose change records the lake holds, by table-name suffix: the source to read, the
// columns that form an item's key, the column that names the item's owner account, a condition
// that proves a test row, and, for a table whose deletes the lake does not keep, the condition for
// an item that still exists. A source with no hash alias view is read through hash_aliases here,
// so one item keeps one key across a salt rotation.
const DATA_LAKE_TABLES = {
  "receipts": { source: "aliased_dynamo_receipts", keys: ["hashed_sub", "receipt_id"], owner: "hashed_sub" },
  "bundles": { source: "aliased_dynamo_bundles", keys: ["hashed_sub", "bundle_id"], owner: "hashed_sub" },
  "subscriptions": { source: "aliased_dynamo_subscriptions", keys: ["subscription_id"], owner: "hashed_sub" },
  "passes": { source: "aliased_dynamo_passes", keys: ["pass_id"], owner: "issued_by", testRow: "pass_type_id LIKE '%-test-pass'" },
  "commissions": {
    source: "aliased_dynamo_commissions",
    keys: ["referrer_hash", "line_id"],
    owner: "redeemer_hash",
    actor: "CAST(NULL AS varchar)",
    testRow: "livemode = false",
  },
  // The lake keeps a call record after its ttl deletes it, so an item exists until its ttl, or
  // 90 days after it started for a record from before the ttl reached the lake.
  "integration-calls": {
    source: "dynamo_calls",
    keys: ["call_id"],
    owner: null,
    testRow: "target = 'test'",
    exists: "coalesce(from_unixtime(ttl), started_at + INTERVAL '90' DAY) > current_timestamp",
  },
  "hmrc-api-requests": { source: "dynamo_hmrc_api_requests", alias: true, keys: ["hashed_sub", "request_record_id"], owner: "hashed_sub" },
  "practice-clients": { source: "dynamo_practice_clients", alias: true, keys: ["hashed_sub", "client_id"], owner: "hashed_sub" },
  "activity-charges": { source: "dynamo_activity_charges", alias: true, keys: ["hashed_sub", "charge_hash"], owner: "hashed_sub" },
  "mcp-sessions": {
    source: "dynamo_mcp_sessions",
    alias: true,
    keys: ["session_hash"],
    owner: "hashed_sub",
    actor: "CAST(NULL AS varchar)",
    exists: "from_unixtime(ttl) > current_timestamp",
  },
};

const DATA_ACTOR_CLASSES = ["customer", "test", "synthetic", "other", "unknown"];

const emptySplit = () => Object.fromEntries(DATA_ACTOR_CLASSES.map((name) => [name, 0]));

// A diya-gl owner is the hash of a subject, so it holds letters, digits, "_" and "-" only; the
// pattern keeps anything else out of the query text. The query names at most this many owners.
const OWNER_PATTERN = /^[A-Za-z0-9_-]+$/;
const OWNER_QUERY_LIMIT = 2000;

// The activity actor classes folded into the three the dashboard shows. An operator or the
// system is `other`; an empty actor is `unknown` and is never counted as a customer.
const ACTOR_CLASS_BY_ACTOR = {
  "customer": "customer",
  "test-user": "test",
  "probe": "synthetic",
  "synthetic": "synthetic",
  "operator": "other",
  "system": "other",
};

export function actorClassOf(actor) {
  if (actor === null || actor === undefined || actor === "") return "unknown";
  return ACTOR_CLASS_BY_ACTOR[actor] || "other";
}

/**
 * The SQL expression that folds an actor column into the same classes as `actorClassOf`.
 *
 * @param {string} column
 * @returns {string}
 */
export function actorClassSql(column) {
  const branches = Object.entries(ACTOR_CLASS_BY_ACTOR).map(([actor, name]) => `WHEN ${column} = '${actor}' THEN '${name}'`);
  return `CASE WHEN ${column} IS NULL OR ${column} = '' THEN 'unknown' ${branches.join(" ")} ELSE 'other' END`;
}

/**
 * The class of one item from its own actor, its owner account's class (v_account_class) and the
 * proof of a test row. Any evidence of a test user, then a probe, then an operator wins over a
 * customer, the order v_account_class uses for an account. An item written by the system or another writer
 * with no owner class reads other; an item with no evidence at all reads unknown.
 *
 * @param {{actor: string, accountClass: string, testRow: string}} columns
 * @returns {string}
 */
export function itemClassSql({ actor, accountClass, testRow }) {
  return (
    `CASE WHEN ${testRow} THEN 'test'\n` +
    `     WHEN ${actor} = 'test-user' OR ${accountClass} = 'test' THEN 'test'\n` +
    `     WHEN ${actor} IN ('probe', 'synthetic') OR ${accountClass} = 'synthetic' THEN 'synthetic'\n` +
    `     WHEN ${actor} = 'operator' OR ${accountClass} = 'other' THEN 'other'\n` +
    `     WHEN ${actor} = 'customer' OR ${accountClass} = 'customer' THEN 'customer'\n` +
    `     WHEN ${actor} <> '' THEN 'other'\n` +
    `     ELSE 'unknown' END`
  );
}

// The newest change of an item. change_ts is in whole seconds, so the stream's sequence number
// breaks a tie; a record from before the sequence number reached the lake falls back to the order
// a tie can only have when one change is a delete: a delete comes after a modify.
const NEWEST_ORDER = `change_ts DESC, lpad(coalesce(change_seq, ''), 40, '0') DESC, CASE change_type WHEN 'REMOVE' THEN 0 WHEN 'MODIFY' THEN 1 ELSE 2 END`;

function itemsSql(kind, { source, alias, keys, owner, actor = "actor", testRow = "false", exists = "true" }) {
  const from = alias
    ? `(SELECT t.*, coalesce(a.current_hash, t.hashed_sub) AS owner_hash FROM ${source} t LEFT JOIN hash_aliases a ON a.old_hash = t.hashed_sub)`
    : source;
  const ownerColumn = alias ? "owner_hash" : owner || "CAST(NULL AS varchar)";
  const partition = keys.map((key) => (alias && key === "hashed_sub" ? "owner_hash" : key)).join(", ");
  return (
    `  SELECT '${kind}' AS kind, ${ownerColumn} AS owner, ${actor} AS actor, coalesce(${testRow}, false) AS test_row, change_type,\n` +
    `         coalesce(${exists}, false) AS item_exists,\n` +
    `         row_number() OVER (PARTITION BY ${partition} ORDER BY ${NEWEST_ORDER}) AS newest\n` +
    `  FROM   ${from}`
  );
}

/**
 * One query: for each lake table, the items that exist now (the newest change of each key is not
 * a REMOVE), counted by the class of each item. With diya-gl owners, the same query gives each
 * owner's class.
 *
 * @param {string[]} [owners]
 * @returns {string}
 */
export function buildActorSplitSql(owners = []) {
  const parts = Object.entries(DATA_LAKE_TABLES).map(([kind, table]) => itemsSql(kind, table));
  const classSql = itemClassSql({ actor: "i.actor", accountClass: "c.actor_class", testRow: "i.test_row" });
  const tableSql =
    `SELECT i.kind, ${classSql} AS actor_class, cast(count(*) AS double) AS items\n` +
    `FROM (\n${parts.join("\n  UNION ALL\n")}\n) i\n` +
    `LEFT JOIN v_account_class c ON c.hashed_sub = i.owner\n` +
    `WHERE i.newest = 1 AND i.change_type <> 'REMOVE' AND i.item_exists\nGROUP BY 1, 2`;
  const safeOwners = owners.filter((owner) => OWNER_PATTERN.test(owner)).slice(0, OWNER_QUERY_LIMIT);
  if (safeOwners.length === 0) return `${tableSql}\nORDER BY 1, 2`;
  // An owner's hash may be from an earlier salt; hash_aliases maps it to the account's current hash.
  const ownerValues = safeOwners.map((owner) => "('" + owner + "')").join(", ");
  const ownerSql =
    `SELECT 'owner:' || o.owner AS kind, coalesce(c.actor_class, 'unknown') AS actor_class, cast(1 AS double) AS items\n` +
    `FROM   (VALUES ${ownerValues}) AS o(owner)\n` +
    `LEFT JOIN hash_aliases al ON al.old_hash = o.owner\n` +
    `LEFT JOIN v_account_class c ON c.hashed_sub = coalesce(al.current_hash, o.owner)`;
  return `SELECT kind, actor_class, items\nFROM (\n${tableSql}\nUNION ALL\n${ownerSql}\n)\nORDER BY 1, 2`;
}

const classOrUnknown = (name) => (DATA_ACTOR_CLASSES.includes(name) ? name : "unknown");

/**
 * The split of each kind's rows into customer, test, synthetic, other and unknown. Every lake
 * table has a split, all zero when the lake holds none of its items.
 *
 * @param {Array<{kind: string, actor_class: string, items: string|number}>} rows
 * @returns {Record<string, Record<string, number>>}
 */
export function shapeActorSplit(rows) {
  const split = Object.fromEntries(Object.keys(DATA_LAKE_TABLES).map((kind) => [kind, emptySplit()]));
  rows.forEach((row) => {
    if (!DATA_LAKE_TABLES[row.kind]) return;
    split[row.kind][classOrUnknown(row.actor_class)] += Number(row.items);
  });
  return split;
}

/**
 * The class of each diya-gl owner from the owner rows of the split query. An owner with no
 * record that names its class reads unknown.
 *
 * @param {Array<{kind: string, actor_class: string, items: string|number}>} rows
 * @returns {Record<string, string>}
 */
export function shapeOwnerClasses(rows) {
  const classes = {};
  rows.forEach((row) => {
    if (typeof row.kind !== "string" || !row.kind.startsWith("owner:")) return;
    classes[row.kind.slice("owner:".length)] = classOrUnknown(row.actor_class);
  });
  return classes;
}

/**
 * The diya-gl store's objects, books and book versions by the class of each owner. An owner with
 * no class counts as unknown.
 *
 * @param {Record<string, {books: number, versions: number, objects: number}>} owners
 * @param {Record<string, string>} ownerClasses
 * @returns {{objects: Record<string, number>, books: Record<string, number>, versions: Record<string, number>}}
 */
export function shapeDiyaGlSplit(owners, ownerClasses) {
  const split = { objects: emptySplit(), books: emptySplit(), versions: emptySplit() };
  Object.entries(owners).forEach(([owner, counts]) => {
    const name = DATA_ACTOR_CLASSES.includes(ownerClasses[owner]) ? ownerClasses[owner] : "unknown";
    Object.keys(split).forEach((field) => {
      split[field][name] += counts[field];
    });
  });
  return split;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const isoDay = (date) => date.toISOString().slice(0, 10);

export const dayBefore = (now, days) => isoDay(new Date(now.getTime() - days * DAY_MS));

export const historyKey = (envName, day) => `snapshots/${envName}/data-history/${day}.json`;

const numberOrNull = (value) => (typeof value === "number" && Number.isFinite(value) ? value : null);

// "bundles" from "prod-env-bundles"; the label of a bucket from its name.
const tableLabel = (tableName, envName) => tableName.replace(new RegExp(`^${envName}-env-`), "");

function bucketLabel(bucketName, envName) {
  return bucketName.replace(new RegExp(`^${envName}-env-`), "").replace(/-\d{12}$/, "");
}

// The listing and the daily S3 metric can differ (the metric lags, and the listing may stop at its
// limit), so an object the metric counts and the listing did not reach reads unknown.
function splitToFigure(split, objectsToday) {
  const listed = DATA_ACTOR_CLASSES.reduce((total, name) => total + split[name], 0);
  const missing = objectsToday !== null && objectsToday > listed ? objectsToday - listed : 0;
  return { ...split, unknown: split.unknown + missing };
}

// The table's items that the lake holds no change record of: the count less the lake's items, or
// 0 when the count lags behind the lake.
function withNotInLake(split, itemsToday) {
  const inLake = DATA_ACTOR_CLASSES.reduce((total, name) => total + split[name], 0);
  return { ...split, notInLake: itemsToday !== null && itemsToday > inLake ? itemsToday - inLake : 0 };
}

const kindOfTable = (label) => Object.keys(DATA_LAKE_TABLES).find((kind) => label === kind) || null;

// { today, d1, d7, d30, d90 } of one figure, each a number or null.
function figuresAcross(todayValue, histories, read) {
  const figures = { today: numberOrNull(todayValue) };
  DATA_HISTORY_OFFSETS.forEach((days) => {
    const day = histories[days];
    figures[`d${days}`] = day ? numberOrNull(read(day)) : null;
  });
  return figures;
}

/**
 * The section from what the run read.
 *
 * @param {object} params
 * @param {string} params.envName
 * @param {Date} params.now
 * @param {Array<{name: string, items: number|null, ttl: {enabled: boolean, attribute: string|null}|null}>} params.tables
 * @param {Record<string, Record<string, number>>|null} params.actorSplit
 * @param {Array<{name: string, objects: number|null, history: Record<string, number|null>}>} params.buckets
 * @param {{books: number, versions: number, truncated: boolean}|null} params.books
 * @param {Record<number, object|null>} params.histories - the history file of each offset, or null
 * @returns {object}
 */
export function shapeDataSection({
  envName,
  now,
  tables,
  actorSplit,
  diyaGlSplit = null,
  diyaGlBucketName = null,
  buckets,
  books,
  histories,
}) {
  const tableRows = tables.map((table) => {
    const label = tableLabel(table.name, envName);
    const kind = kindOfTable(label);
    const items = figuresAcross(table.items, histories, (day) => day.tables?.[label]);
    return {
      name: label,
      items,
      ttl: table.ttl,
      split: kind && actorSplit && actorSplit[kind] ? withNotInLake(actorSplit[kind], items.today) : null,
    };
  });

  const bucketRows = buckets.map((bucket) => {
    const name = bucketLabel(bucket.name, envName);
    const objects = {
      today: numberOrNull(bucket.objects),
      ...Object.fromEntries(DATA_HISTORY_OFFSETS.map((days) => [`d${days}`, numberOrNull(bucket.history[days])])),
    };
    const isDiyaGl = diyaGlSplit !== null && bucket.name === diyaGlBucketName;
    return {
      name,
      group: name.startsWith("analytics-") ? "analytics" : "customer",
      objects,
      split: isDiyaGl ? splitToFigure(diyaGlSplit.objects, objects.today) : null,
    };
  });

  const bookRows = books
    ? [
        {
          type: "Books",
          count: figuresAcross(books.books, histories, (day) => day.books?.books),
          split: diyaGlSplit ? diyaGlSplit.books : null,
        },
        {
          type: "Book versions",
          count: figuresAcross(books.versions, histories, (day) => day.books?.versions),
          split: diyaGlSplit ? diyaGlSplit.versions : null,
        },
      ]
    : [];

  const sum = (rows, pick, key) => {
    const values = rows.map((row) => pick(row)[key]);
    return values.some((value) => value === null) || values.length === 0 ? null : values.reduce((a, b) => a + b, 0);
  };
  const points = ["d90", "d30", "d7", "d1", "today"];
  const dayOfPoint = (point) => (point === "today" ? isoDay(now) : dayBefore(now, Number(point.slice(1))));
  const series = [
    { id: "dynamodb", label: "DynamoDB items", values: points.map((key) => sum(tableRows, (row) => row.items, key)) },
    { id: "s3", label: "S3 objects", values: points.map((key) => sum(bucketRows, (row) => row.objects, key)) },
    { id: "books", label: "diya-gl books", values: points.map((key) => (bookRows[0] ? bookRows[0].count[key] : null)) },
  ];

  return {
    generatedAt: now.toISOString(),
    tables: tableRows,
    buckets: bucketRows,
    books: bookRows,
    booksTruncated: Boolean(books && books.truncated),
    actorSplitDay: actorSplit ? isoDay(now) : null,
    chart: {
      id: "data-totals",
      title: "Stored data, total count",
      unit: "count",
      standalone: true,
      marks: true,
      note: "One line for each repository type, at 90, 30, 7 and 1 days ago and today, spaced evenly. A day with no stored figure leaves a gap.",
      days: points.map(dayOfPoint),
      modes: [{ id: "total", label: "Total", series }],
    },
  };
}

/**
 * Builds the section. Every effect arrives through `io`, so the section is testable without AWS.
 *
 * @param {object} params
 * @param {string} params.envName
 * @param {Date} [params.now]
 * @param {string[]} params.tableNames
 * @param {string[]} params.bucketNames
 * @param {string|null} [params.diyaGlBucketName] - the one bucket of customer content, split by owner
 * @param {object} params.io
 * @param {(tableName: string) => Promise<number|null>} params.io.describeItemCount
 * @param {(tableName: string) => Promise<{enabled: boolean, attribute: string|null}|null>} params.io.describeTtl
 * @param {(key: string) => Promise<object|null>} params.io.readHistory
 * @param {(key: string, value: object) => Promise<void>} params.io.writeHistory
 * @param {(sql: string) => Promise<Array<object>>} params.io.runAthena
 * @param {(bucketNames: string[], days: number) => Promise<Record<string, Record<string, number>>>} params.io.bucketObjectCounts - per bucket, object count by ISO day
 * @param {() => Promise<{books: number, versions: number, truncated: boolean, owners?: Record<string, {books: number, versions: number, objects: number}>}|null>} params.io.countBooks
 */
export async function buildDataSection({ envName, now = new Date(), tableNames, bucketNames, diyaGlBucketName = null, io }) {
  const today = isoDay(now);
  const todayFile = await io.readHistory(historyKey(envName, today));

  const tables = await Promise.all(
    tableNames.map(async (name) => ({ name, items: await io.describeItemCount(name), ttl: await io.describeTtl(name) })),
  );

  const books = await io.countBooks();
  const owners = books?.owners ?? {};

  // The Athena query runs for the first snapshot of the day only; later runs reuse its result. An
  // owner that first appears later in the day reads unknown until the next day's query.
  let actorSplit = todayFile?.actorSplit ?? null;
  let ownerClasses = todayFile?.ownerClasses ?? null;
  if (!actorSplit || (books && !ownerClasses)) {
    const rows = await io.runAthena(buildActorSplitSql(Object.keys(owners)));
    actorSplit = shapeActorSplit(rows);
    ownerClasses = books ? shapeOwnerClasses(rows) : null;
  }
  const diyaGlSplit = books ? shapeDiyaGlSplit(owners, ownerClasses || {}) : null;

  const counts = bucketNames.length > 0 ? await io.bucketObjectCounts(bucketNames, DATA_HISTORY_OFFSETS[0] + 1) : {};
  const buckets = bucketNames.map((name) => {
    const byDay = counts[name] || {};
    return {
      name,
      objects: byDay[today] ?? lastValue(byDay),
      history: Object.fromEntries(DATA_HISTORY_OFFSETS.map((days) => [days, byDay[dayBefore(now, days)] ?? null])),
    };
  });

  const histories = {};
  await Promise.all(
    DATA_HISTORY_OFFSETS.map(async (days) => {
      histories[days] = await io.readHistory(historyKey(envName, dayBefore(now, days)));
    }),
  );

  await io.writeHistory(historyKey(envName, today), {
    date: today,
    writtenAt: now.toISOString(),
    tables: Object.fromEntries(
      tables.filter((table) => table.items !== null).map((table) => [tableLabel(table.name, envName), table.items]),
    ),
    books: books ? { books: books.books, versions: books.versions } : null,
    actorSplit,
    ownerClasses,
    diyaGlSplit,
  });

  return shapeDataSection({ envName, now, tables, actorSplit, diyaGlSplit, diyaGlBucketName, buckets, books, histories });
}

// The newest day's count when today's has not been written yet; null when there is none.
function lastValue(byDay) {
  const days = Object.keys(byDay).sort();
  return days.length > 0 ? byDay[days[days.length - 1]] : null;
}
