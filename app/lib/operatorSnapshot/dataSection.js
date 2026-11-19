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
//
// The section also draws the stored-data graph: one point a day for 90 days, from every history
// file of the window and the daily S3 metrics, in six tabs (by platform, by application, reads and
// writes, transactional, observability, CI/CD). Each history file also keeps each table's bytes
// and the log groups' stored bytes, which no metric holds.

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
// system is `other`; an empty actor, and the `unknown` that a view writes for a record with no
// actor, is `unknown` and is never counted as a customer.
const ACTOR_CLASS_BY_ACTOR = {
  "customer": "customer",
  "test-user": "test",
  "probe": "synthetic",
  "synthetic": "synthetic",
  "operator": "other",
  "system": "other",
  "unknown": "unknown",
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
export const NEWEST_ORDER = `change_ts DESC, lpad(coalesce(change_seq, ''), 40, '0') DESC, CASE change_type WHEN 'REMOVE' THEN 0 WHEN 'MODIFY' THEN 1 ELSE 2 END`;

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
const HOUR_MS = 60 * 60 * 1000;

// The stored-data graph has one point a day over the days of the other graphs, and its reads and
// writes tab one point an hour over their hours.
export const DATA_CHART_DAYS = 90;
export const DATA_CHART_HOURS = 336;

const isoDay = (date) => date.toISOString().slice(0, 10);

export const dayBefore = (now, days) => isoDay(new Date(now.getTime() - days * DAY_MS));

export const historyKey = (envName, day) => `snapshots/${envName}/data-history/${day}.json`;

/** The graph's days, oldest first, ending today. */
export function dataChartDays(now) {
  return Array.from({ length: DATA_CHART_DAYS }, (_, index) => dayBefore(now, DATA_CHART_DAYS - 1 - index));
}

/** The graph's hours, oldest first, ending on the hour that holds `now`, as keys like `2026-11-07T10:00:00Z`. */
export function dataChartHours(now) {
  const end = Math.floor(now.getTime() / HOUR_MS) * HOUR_MS;
  return Array.from(
    { length: DATA_CHART_HOURS },
    (_, index) => new Date(end - (DATA_CHART_HOURS - 1 - index) * HOUR_MS).toISOString().slice(0, 13) + ":00:00Z",
  );
}

// The days whose history files a run reads: each day before today, back to 90 days ago.
const historyDays = (now) => Array.from({ length: DATA_HISTORY_OFFSETS[0] }, (_, index) => dayBefore(now, index + 1));

const numberOrNull = (value) => (typeof value === "number" && Number.isFinite(value) ? value : null);

const add = (a, b) => a + b;

// "bundles" from "prod-env-bundles"; the label of a bucket from its name.
const tableLabel = (tableName, envName) => tableName.replace(new RegExp(`^${envName}-env-`), "");

function bucketLabel(bucketName, envName) {
  return bucketName.replace(new RegExp(`^${envName}-env-`), "").replace(/-\d{12}$/, "");
}

// The application each table belongs to, by label. Every other table is the submit app's.
const TABLE_APPLICATION = { "security-state": "security", "trusted-events": "operations", "alarm-issue-locks": "operations" };

// The names the graph's lines give a table or bucket whose label does not read as a name.
const SOURCE_TITLES = { "hmrc-api-requests": "HMRC API requests" };

const TRANSACTIONAL_TABLES = ["receipts", "bundles", "subscriptions", "passes", "commissions"];
const OBSERVABILITY_TABLES = ["integration-calls", "hmrc-api-requests"];

/**
 * What a bucket outside the Data tab holds for the CI/CD tab: "deployment" for the CDK asset
 * buckets and the buckets of one deployment, "test-reports" for a canary's artefacts, or null
 * for a bucket of neither kind.
 *
 * @param {string} bucketName
 * @param {string} envName
 * @returns {"deployment"|"test-reports"|null}
 */
export function artefactKindOf(bucketName, envName) {
  if (bucketName.includes("canaryartifacts")) return "test-reports";
  if (bucketName.startsWith("cdk-hnb659fds-assets-")) return "deployment";
  if (new RegExp(`^${envName}-(?!env-)[a-z0-9]+-app-`).test(bucketName)) return "deployment";
  return null;
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
function figuresAcross(todayValue, histories, now, read) {
  const figures = { today: numberOrNull(todayValue) };
  DATA_HISTORY_OFFSETS.forEach((days) => {
    const day = histories[dayBefore(now, days)];
    figures[`d${days}`] = day ? numberOrNull(read(day)) : null;
  });
  return figures;
}

// A bucket's figure on a day from its daily metric. The metric arrives a day or two late, so its
// newest figure stands for the days after it; an earlier day with no figure has none.
function metricOn(byDay, day) {
  if (byDay[day] !== undefined) return numberOrNull(byDay[day]);
  const newest = Object.keys(byDay).sort().at(-1);
  return newest !== undefined && day > newest ? numberOrNull(byDay[newest]) : null;
}

// A count split into customer, test and synthetic, and the rest (other, unknown, and the items the
// lake holds no record of). A class never takes more than the count leaves, so the three add up to
// the count. With no split for the day, no class has a figure.
function classShares(count, split) {
  if (count === null) return null;
  if (!split) return { customer: null, synthetic: null, rest: null };
  const customer = Math.min(split.customer || 0, count);
  const synthetic = Math.min((split.test || 0) + (split.synthetic || 0), count - customer);
  return { customer, synthetic, rest: count - customer - synthetic };
}

const CLASS_LINES = [
  ["customer", "customer", "that customers' accounts hold"],
  ["synthetic", "test and synthetic", "that test users and probes wrote"],
  ["rest", "other and unknown", "of operators and the system, with no known actor, or with no record in the lake"],
];

// The lines of one tab from its sources. A source is { id, label, description, at(point) } and,
// where the actor is known, splitAt(point). A source with a split on any point draws a customer, a
// test and synthetic, and an other and unknown line, which add up to its figure on each point
// with a split. The "All" line adds the sources, and has no figure on a point where one of them
// has none. A line with no figure above 0 is left out, and a source with no figure at all is left
// out of the "All" line too.
function seriesOfSources(sources, points) {
  const kept = sources
    .map((source) => ({ source, values: points.map((point) => source.at(point)) }))
    .filter(({ values }) => values.some((value) => value !== null));
  if (kept.length === 0) return [];
  const lines = kept.flatMap(({ source, values }) => {
    const shares = source.splitAt ? points.map((point, index) => classShares(values[index], source.splitAt(point))) : null;
    if (!shares || shares.every((share) => share === null || share.customer === null)) {
      return [{ id: source.id, label: source.label, description: source.description, values }];
    }
    return CLASS_LINES.map(([key, phrase, meaning]) => ({
      id: `${source.id}@${key}`,
      label: `${source.label}, ${phrase}`,
      description: `${source.description} Only the part ${meaning}.`,
      values: shares.map((share) => (share === null ? null : share[key])),
    }));
  });
  const total = {
    id: "all",
    label: "All",
    description: "The lines of this tab added together. A point where one of them has no figure has none.",
    isTotal: true,
    values: points.map((_, index) =>
      kept.some(({ values }) => values[index] === null) ? null : kept.map(({ values }) => values[index]).reduce(add, 0),
    ),
  };
  return [total, ...lines.filter((line) => line.values.some((value) => value !== null && value !== 0))];
}

// The sum of the figures that are known, or null when none is.
function sumOfKnown(values) {
  const known = values.filter((value) => value !== null);
  return known.length === 0 ? null : known.reduce(add, 0);
}

// The sum of every figure, or null when one is not known.
function sumOfAll(values) {
  return values.length === 0 || values.some((value) => value === null) ? null : values.reduce(add, 0);
}

/**
 * The stored-data graph: one tab for each way to cut what the environment stores, one point a day.
 * Each day's DynamoDB figures come from that day's history file (today's from this run), so a day
 * with no file leaves a gap; S3 figures come from the daily CloudWatch metrics.
 */
function storedDataChart({ now, tableRows, buckets, artefactBuckets, histories, todayFrame, capacity, diyaGlBucketName }) {
  const today = isoDay(now);
  const days = dataChartDays(now);
  const hours = dataChartHours(now);
  const frameOf = (day) => (day === today ? todayFrame : histories[day] || null);
  const labels = tableRows.map((row) => row.name);
  const itemsOf = (label) => (day) => numberOrNull(frameOf(day)?.tables?.[label]);
  const itemsOfTables = (names) => (day) => (frameOf(day) ? sumOfKnown(names.map((label) => itemsOf(label)(day))) : null);
  const splitOf = (kind) => (day) => frameOf(day)?.actorSplit?.[kind] ?? null;
  const tableTitle = (label) => SOURCE_TITLES[label] || label.charAt(0).toUpperCase() + label.slice(1).replace(/-/g, " ");

  const diyaGl = buckets.find((bucket) => bucket.name === diyaGlBucketName) || null;
  const analytics = buckets.filter((bucket) => bucket !== diyaGl);
  const objectsOf = (list) => (day) => sumOfAll(list.map((bucket) => metricOn(bucket.objectsByDay, day)));
  const bytesOf = (bucket) => (day) => metricOn(bucket.bytesByDay, day);

  const applicationTables = (application) => labels.filter((label) => (TABLE_APPLICATION[label] || "submit") === application);
  const platform = [
    { id: "dynamodb", label: "DynamoDB items", description: "Items in every table of the Data tab.", at: itemsOfTables(labels) },
    {
      id: "s3",
      label: "S3 objects",
      description: "Objects in the analytics lake and results buckets.",
      at: objectsOf(analytics),
    },
    { id: "diya-gl", label: "diya-gl objects", description: "Objects in the diya-gl book bucket.", at: objectsOf(diyaGl ? [diyaGl] : []) },
  ];

  const application = [
    {
      id: "submit",
      label: "Submit app",
      description: "Items in the submit app's tables: receipts, bundles, passes, call records and the rest.",
      at: itemsOfTables(applicationTables("submit")),
    },
    { id: "diya-gl", label: "diya-gl", description: "Objects in the diya-gl book bucket.", at: objectsOf(diyaGl ? [diyaGl] : []) },
    { id: "analytics", label: "Analytics", description: "Objects in the analytics lake and results buckets.", at: objectsOf(analytics) },
    {
      id: "security",
      label: "Security",
      description: "Items in the security state table.",
      at: itemsOfTables(applicationTables("security")),
    },
    {
      id: "operations",
      label: "Operations",
      description: "Items in the trusted event ledger and the alarm issue locks.",
      at: itemsOfTables(applicationTables("operations")),
    },
  ];

  const unitsOf = (grain, direction) => (point) => {
    const byTable = capacity?.[grain];
    if (!byTable) return null;
    return Object.values(byTable)
      .map((table) => table?.[direction]?.[point] ?? 0)
      .reduce(add, 0);
  };
  const readsAndWrites = (grain) => [
    {
      id: "dynamodb-read",
      label: "DynamoDB read units",
      description: "Read capacity units that the Data tab's tables consumed.",
      at: unitsOf(grain, "read"),
    },
    {
      id: "dynamodb-write",
      label: "DynamoDB write units",
      description: "Write capacity units that the Data tab's tables consumed.",
      at: unitsOf(grain, "write"),
    },
  ];

  const transactional = [
    ...TRANSACTIONAL_TABLES.filter((label) => labels.includes(label)).map((label) => ({
      id: label,
      label: tableTitle(label),
      description: `Items in the ${label} table.`,
      at: itemsOf(label),
      splitAt: splitOf(label),
    })),
    {
      id: "books",
      label: "diya-gl books",
      description: "Books in the diya-gl store.",
      at: (day) => numberOrNull(frameOf(day)?.books?.books),
      splitAt: (day) => frameOf(day)?.diyaGlSplit?.books ?? null,
    },
  ];

  const observability = [
    ...analytics.map((bucket) => ({
      id: bucket.label,
      label: tableTitle(bucket.label),
      description: `Bytes stored in the ${bucket.label} bucket.`,
      at: bytesOf(bucket),
    })),
    ...OBSERVABILITY_TABLES.filter((label) => labels.includes(label)).map((label) => ({
      id: label,
      label: tableTitle(label),
      description: `Bytes stored in the ${label} table.`,
      at: (day) => numberOrNull(frameOf(day)?.tableBytes?.[label]),
    })),
    {
      id: "log-groups",
      label: "Log groups",
      description: "Bytes stored in every CloudWatch log group of the account.",
      at: (day) => numberOrNull(frameOf(day)?.logGroupBytes),
    },
  ];

  const lakeKinds = labels.filter((label) => kindOfTable(label));
  const testItems = (day) => {
    const shares = lakeKinds.map((kind) => classShares(itemsOf(kind)(day), splitOf(kind)(day)));
    return sumOfKnown(shares.map((share) => (share === null ? null : share.synthetic)));
  };
  const artefactsOf = (kind) => (day) =>
    sumOfKnown(artefactBuckets.filter((bucket) => bucket.kind === kind).map((bucket) => metricOn(bucket.objectsByDay, day)));
  const cicd = [
    {
      id: "test-items",
      label: "Test and synthetic items",
      description: "Items in the lake's tables that test users and probes wrote.",
      at: testItems,
    },
    {
      id: "test-books",
      label: "Test and synthetic diya-gl objects",
      description: "Objects in the diya-gl bucket that test users and probes own.",
      at: (day) => {
        const split = frameOf(day)?.diyaGlSplit?.objects;
        return split ? (split.test || 0) + (split.synthetic || 0) : null;
      },
    },
    {
      id: "deployment-artefacts",
      label: "Deployment artefacts",
      description: "Objects in the CDK asset buckets and in each deployment's own buckets.",
      at: artefactsOf("deployment"),
    },
    {
      id: "test-reports",
      label: "Test reports",
      description: "Objects in the canaries' artefact buckets.",
      at: artefactsOf("test-reports"),
    },
  ];

  const hourlyReadsAndWrites = seriesOfSources(readsAndWrites("hourly"), hours);
  const modes = [
    { id: "platform", label: "By platform", series: seriesOfSources(platform, days) },
    { id: "application", label: "By application", series: seriesOfSources(application, days) },
    {
      id: "reads-and-writes",
      label: "Reads and writes",
      series: seriesOfSources(readsAndWrites("daily"), days),
      ...(hourlyReadsAndWrites.length > 0 ? { hourly: { series: hourlyReadsAndWrites } } : {}),
    },
    { id: "transactional", label: "Transactional", series: seriesOfSources(transactional, days) },
    { id: "observability", label: "Observability", unit: "bytes", series: seriesOfSources(observability, days) },
    { id: "cicd", label: "CI/CD", series: seriesOfSources(cicd, days) },
  ];

  return {
    id: "data-totals",
    title: "Stored data",
    unit: "count",
    standalone: true,
    rangeSwitch: true,
    note:
      "One point a UTC day. DynamoDB figures come from the day's history file, so a day with no file leaves a gap. " +
      "S3 figures come from CloudWatch a day or two late, and the newest one stands for the days after it. " +
      "Transactional starts with only its customer lines shown, and its class lines start on the first day with an actor split.",
    days,
    hours,
    modes: modes.filter((mode) => mode.series.length > 0),
  };
}

/**
 * The section from what the run read.
 *
 * @param {object} params
 * @param {string} params.envName
 * @param {Date} params.now
 * @param {Array<{name: string, items: number|null, bytes?: number|null, ttl: {enabled: boolean, attribute: string|null}|null}>} params.tables
 * @param {Record<string, Record<string, number>>|null} params.actorSplit
 * @param {Array<{name: string, objectsByDay: Record<string, number>, bytesByDay?: Record<string, number>}>} params.buckets
 * @param {Array<{name: string, kind: string, objectsByDay: Record<string, number>}>} [params.artefactBuckets]
 * @param {{books: number, versions: number, truncated: boolean}|null} params.books
 * @param {Record<string, object|null>} params.histories - the history file of each day before today, or null
 * @param {number|null} [params.logGroupBytes]
 * @param {{daily: object, hourly: object}|null} [params.capacity] - consumed units by table, then read or write, then point
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
  artefactBuckets = [],
  books,
  histories,
  logGroupBytes = null,
  capacity = null,
}) {
  const today = isoDay(now);
  const tableRows = tables.map((table) => {
    const label = tableLabel(table.name, envName);
    const kind = kindOfTable(label);
    const items = figuresAcross(table.items, histories, now, (day) => day.tables?.[label]);
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
      today: metricOn(bucket.objectsByDay, today),
      ...Object.fromEntries(DATA_HISTORY_OFFSETS.map((days) => [`d${days}`, numberOrNull(bucket.objectsByDay[dayBefore(now, days)])])),
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
          count: figuresAcross(books.books, histories, now, (day) => day.books?.books),
          split: diyaGlSplit ? diyaGlSplit.books : null,
        },
        {
          type: "Book versions",
          count: figuresAcross(books.versions, histories, now, (day) => day.books?.versions),
          split: diyaGlSplit ? diyaGlSplit.versions : null,
        },
      ]
    : [];

  const todayFrame = historyFile({ envName, now, tables, books, actorSplit, diyaGlSplit, logGroupBytes });

  return {
    generatedAt: now.toISOString(),
    tables: tableRows,
    buckets: bucketRows,
    books: bookRows,
    booksTruncated: Boolean(books && books.truncated),
    actorSplitDay: actorSplit ? today : null,
    chart: storedDataChart({
      now,
      tableRows,
      buckets: buckets.map((bucket) => ({ ...bucket, label: bucketLabel(bucket.name, envName), bytesByDay: bucket.bytesByDay || {} })),
      artefactBuckets,
      histories,
      todayFrame,
      capacity,
      diyaGlBucketName,
    }),
  };
}

// What one day's history file holds: the day's counts, sizes and splits, read back on later days.
function historyFile({ envName, now, tables, books, actorSplit, diyaGlSplit, logGroupBytes, ownerClasses = null }) {
  const known = (field) =>
    Object.fromEntries(
      tables.filter((table) => numberOrNull(table[field]) !== null).map((table) => [tableLabel(table.name, envName), table[field]]),
    );
  return {
    date: isoDay(now),
    writtenAt: now.toISOString(),
    tables: known("items"),
    tableBytes: known("bytes"),
    books: books ? { books: books.books, versions: books.versions } : null,
    logGroupBytes: numberOrNull(logGroupBytes),
    actorSplit,
    ownerClasses,
    diyaGlSplit,
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
 * @param {(tableName: string) => Promise<{items: number|null, bytes: number|null}>} params.io.describeTable
 * @param {(tableName: string) => Promise<{enabled: boolean, attribute: string|null}|null>} params.io.describeTtl
 * @param {(key: string) => Promise<object|null>} params.io.readHistory
 * @param {(key: string, value: object) => Promise<void>} params.io.writeHistory
 * @param {(sql: string) => Promise<Array<object>>} params.io.runAthena
 * @param {(bucketNames: string[], days: number) => Promise<Record<string, Record<string, number>>>} params.io.bucketObjectCounts - per bucket, object count by ISO day
 * @param {(bucketNames: string[], days: number) => Promise<Record<string, Record<string, number>>>} params.io.bucketBytes - per bucket, bytes stored by ISO day
 * @param {() => Promise<string[]>} params.io.listBucketNames
 * @param {(tableNames: string[], grain: "daily"|"hourly", count: number) => Promise<Record<string, {read: Record<string, number>, write: Record<string, number>}>|null>} params.io.consumedCapacity
 * @param {() => Promise<number|null>} params.io.logGroupBytes
 * @param {() => Promise<{books: number, versions: number, truncated: boolean, owners?: Record<string, {books: number, versions: number, objects: number}>}|null>} params.io.countBooks
 */
export async function buildDataSection({ envName, now = new Date(), tableNames, bucketNames, diyaGlBucketName = null, io }) {
  const today = isoDay(now);
  const todayFile = await io.readHistory(historyKey(envName, today));

  const tables = await Promise.all(
    tableNames.map(async (name) => ({ name, ...(await io.describeTable(name)), ttl: await io.describeTtl(name) })),
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

  const metricDays = DATA_HISTORY_OFFSETS[0] + 1;
  const [counts, sizes, allBucketNames, daily, hourly, logGroupBytes] = await Promise.all([
    bucketNames.length > 0 ? io.bucketObjectCounts(bucketNames, metricDays) : {},
    bucketNames.length > 0 ? io.bucketBytes(bucketNames, metricDays) : {},
    io.listBucketNames(),
    io.consumedCapacity(tableNames, "daily", DATA_CHART_DAYS),
    io.consumedCapacity(tableNames, "hourly", DATA_CHART_HOURS),
    io.logGroupBytes(),
  ]);
  const buckets = bucketNames.map((name) => ({ name, objectsByDay: counts[name] || {}, bytesByDay: sizes[name] || {} }));

  const artefactNames = allBucketNames.filter((name) => !bucketNames.includes(name) && artefactKindOf(name, envName));
  const artefactCounts = artefactNames.length > 0 ? await io.bucketObjectCounts(artefactNames, metricDays) : {};
  const artefactBuckets = artefactNames.map((name) => ({
    name,
    kind: artefactKindOf(name, envName),
    objectsByDay: artefactCounts[name] || {},
  }));

  const histories = Object.fromEntries(
    await Promise.all(historyDays(now).map(async (day) => [day, await io.readHistory(historyKey(envName, day))])),
  );

  await io.writeHistory(
    historyKey(envName, today),
    historyFile({ envName, now, tables, books, actorSplit, diyaGlSplit, logGroupBytes, ownerClasses }),
  );

  return shapeDataSection({
    envName,
    now,
    tables,
    actorSplit,
    diyaGlSplit,
    diyaGlBucketName,
    buckets,
    artefactBuckets,
    books,
    histories,
    logGroupBytes,
    capacity: daily || hourly ? { daily, hourly } : null,
  });
}
