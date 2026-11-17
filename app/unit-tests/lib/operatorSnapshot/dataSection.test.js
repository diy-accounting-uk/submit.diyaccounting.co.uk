// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, vi } from "vitest";
import {
  actorClassOf,
  buildActorSplitSql,
  buildDataSection,
  dayBefore,
  historyKey,
  shapeActorSplit,
  shapeDiyaGlSplit,
  shapeOwnerClasses,
} from "@app/lib/operatorSnapshot/dataSection.js";

const now = new Date("2026-11-07T10:00:00Z");

function makeIo(overrides = {}) {
  const files = new Map();
  return {
    files,
    describeItemCount: vi.fn(async (name) => ({ "prod-env-bundles": 120, "prod-env-receipts": 40 })[name] ?? null),
    describeTtl: vi.fn(async (name) =>
      name === "prod-env-bundles" ? { enabled: true, attribute: "ttl" } : { enabled: false, attribute: null },
    ),
    readHistory: vi.fn(async (key) => files.get(key) ?? null),
    writeHistory: vi.fn(async (key, value) => void files.set(key, value)),
    runAthena: vi.fn(async () => [
      { kind: "bundles", actor_class: "customer", items: "90" },
      { kind: "bundles", actor_class: "test", items: "20" },
      { kind: "bundles", actor_class: "unknown", items: "10" },
    ]),
    bucketObjectCounts: vi.fn(async () => ({ "prod-env-analytics-lake-972912397388": { "2026-11-06": 5000, "2026-10-08": 4000 } })),
    countBooks: vi.fn(async () => ({ books: 3, versions: 5, truncated: false })),
    ...overrides,
  };
}

const run = (io) =>
  buildDataSection({
    envName: "prod",
    now,
    tableNames: ["prod-env-bundles", "prod-env-receipts"],
    bucketNames: ["prod-env-analytics-lake-972912397388"],
    io,
  });

describe("dataSection", () => {
  test("an empty actor is unknown and never a customer", () => {
    expect(actorClassOf("")).toBe("unknown");
    expect(actorClassOf(null)).toBe("unknown");
    expect(actorClassOf("customer")).toBe("customer");
    expect(actorClassOf("test-user")).toBe("test");
    expect(actorClassOf("probe")).toBe("synthetic");
    expect(actorClassOf("synthetic")).toBe("synthetic");
    expect(actorClassOf("operator")).toBe("other");
  });

  test("the split query counts the newest change of each key unless it is a removal", () => {
    const sql = buildActorSplitSql();
    expect(sql).toContain("FROM   aliased_dynamo_bundles");
    expect(sql).toContain("PARTITION BY hashed_sub, bundle_id ORDER BY change_ts DESC, lpad(coalesce(change_seq, ''), 40, '0') DESC");
    expect(sql).toContain("CASE change_type WHEN 'REMOVE' THEN 0 WHEN 'MODIFY' THEN 1 ELSE 2 END");
    expect(sql).toContain("i.newest = 1 AND i.change_type <> 'REMOVE' AND i.item_exists");
  });

  test("the split query reads every lake table, aliases each hash and classes an item by its owner", () => {
    const sql = buildActorSplitSql();
    [
      "aliased_dynamo_receipts",
      "aliased_dynamo_subscriptions",
      "aliased_dynamo_passes",
      "aliased_dynamo_commissions",
      "dynamo_calls",
    ].forEach((source) => expect(sql).toContain(`FROM   ${source}`));
    ["dynamo_hmrc_api_requests", "dynamo_practice_clients", "dynamo_activity_charges", "dynamo_mcp_sessions"].forEach((source) =>
      expect(sql).toContain(`FROM ${source} t LEFT JOIN hash_aliases a ON a.old_hash = t.hashed_sub`),
    );
    expect(sql).toContain("LEFT JOIN v_account_class c ON c.hashed_sub = i.owner");
    expect(sql).toContain("pass_type_id LIKE '%-test-pass'");
    expect(sql).toContain("coalesce(target = 'test', false) AS test_row");
    expect(sql).toContain("coalesce(from_unixtime(ttl), started_at + INTERVAL '90' DAY) > current_timestamp");
    expect(sql).not.toContain("dynamo_bundle_capacity");
  });

  test("the split adds each row into its class and gives every lake table a split", () => {
    const split = shapeActorSplit([
      { kind: "bundles", actor_class: "customer", items: "5" },
      { kind: "bundles", actor_class: "unknown", items: "2" },
      { kind: "bundles", actor_class: "synthetic", items: "1" },
      { kind: "bundles", actor_class: "odd", items: "1" },
      { kind: "elsewhere", actor_class: "customer", items: "9" },
    ]);
    expect(split.bundles).toEqual({ customer: 5, test: 0, synthetic: 1, other: 0, unknown: 3 });
    expect(split["integration-calls"]).toEqual({ customer: 0, test: 0, synthetic: 0, other: 0, unknown: 0 });
    expect(Object.keys(split)).toEqual([
      "receipts",
      "bundles",
      "subscriptions",
      "passes",
      "commissions",
      "integration-calls",
      "hmrc-api-requests",
      "practice-clients",
      "activity-charges",
      "mcp-sessions",
    ]);
    expect(split.elsewhere).toBeUndefined();
  });

  test("the split query names each owner and reads its class from the account classes", () => {
    const sql = buildActorSplitSql(["ownerA", "owner-B", "bad'owner"]);
    expect(sql).toContain("(VALUES ('ownerA'), ('owner-B')) AS o(owner)");
    expect(sql).not.toContain("bad'owner");
    expect(sql).toContain("LEFT JOIN v_account_class c ON c.hashed_sub = coalesce(al.current_hash, o.owner)");
    expect(buildActorSplitSql([])).toBe(buildActorSplitSql());
  });

  test("an owner reads the class the account classes give it, and one with none is unknown", () => {
    const classes = shapeOwnerClasses([
      { kind: "owner:a", actor_class: "customer", items: "1" },
      { kind: "owner:b", actor_class: "test", items: "1" },
      { kind: "owner:c", actor_class: "other", items: "1" },
      { kind: "owner:d", actor_class: "unknown", items: "1" },
      { kind: "bundles", actor_class: "customer", items: "9" },
    ]);
    expect(classes).toEqual({ a: "customer", b: "test", c: "other", d: "unknown" });
    const split = shapeDiyaGlSplit(
      {
        a: { books: 1, versions: 2, objects: 3 },
        b: { books: 1, versions: 1, objects: 2 },
        z: { books: 1, versions: 0, objects: 1 },
      },
      classes,
    );
    expect(split.books).toEqual({ customer: 1, test: 1, synthetic: 0, other: 0, unknown: 1 });
    expect(split.objects).toEqual({ customer: 3, test: 2, synthetic: 0, other: 0, unknown: 1 });
  });

  test("diya-gl objects, books and versions split by owner class and add up to their figures", async () => {
    const io = makeIo({
      runAthena: vi.fn(async () => [
        { kind: "owner:a", actor_class: "customer", items: "1" },
        { kind: "owner:b", actor_class: "test", items: "1" },
      ]),
      bucketObjectCounts: vi.fn(async () => ({ "prod-env-diya-gl-972912397388": { "2026-11-07": 9 } })),
      countBooks: vi.fn(async () => ({
        books: 2,
        versions: 3,
        truncated: false,
        owners: {
          a: { books: 1, versions: 1, objects: 2 },
          b: { books: 1, versions: 2, objects: 3 },
          z: { books: 0, versions: 0, objects: 1 },
        },
      })),
    });
    const section = await buildDataSection({
      envName: "prod",
      now,
      tableNames: [],
      bucketNames: ["prod-env-diya-gl-972912397388", "prod-env-analytics-lake-972912397388"],
      diyaGlBucketName: "prod-env-diya-gl-972912397388",
      io,
    });
    const sum = (split) => Object.values(split).reduce((a, b) => a + b, 0);
    const [diyaGl, lake] = section.buckets;
    expect(diyaGl.group).toBe("customer");
    expect(lake.group).toBe("analytics");
    expect(lake.split).toBeNull();
    // The listing holds 6 objects and the metric 9: the 3 the listing did not reach read unknown.
    expect(diyaGl.split).toEqual({ customer: 2, test: 3, synthetic: 0, other: 0, unknown: 4 });
    expect(sum(diyaGl.split)).toBe(diyaGl.objects.today);
    expect(section.books[0].split).toEqual({ customer: 1, test: 1, synthetic: 0, other: 0, unknown: 0 });
    expect(sum(section.books[1].split)).toBe(section.books[1].count.today);
    const written = io.files.get(historyKey("prod", "2026-11-07"));
    expect(written.ownerClasses).toEqual({ a: "customer", b: "test" });
    expect(written.diyaGlSplit.versions.test).toBe(2);
    expect(io.runAthena).toHaveBeenCalledTimes(1);
    expect(io.runAthena.mock.calls[0][0]).toContain("VALUES ('a'), ('b'), ('z')");
  });

  test("a day with no history file shows no figure, never 0", async () => {
    const io = makeIo();
    io.files.set(historyKey("prod", dayBefore(now, 7)), { tables: { bundles: 100 }, books: { books: 2, versions: 2 } });
    const section = await run(io);
    const bundles = section.tables.find((table) => table.name === "bundles");
    expect(bundles.items).toEqual({ today: 120, d1: null, d7: 100, d30: null, d90: null });
    expect(section.books[0].count).toEqual({ today: 3, d1: null, d7: 2, d30: null, d90: null });
  });

  test("a lake table's classes and the items not in the lake add up to the table's count", async () => {
    const section = await run(
      makeIo({
        describeItemCount: vi.fn(
          async (name) => ({ "prod-env-bundles": 125, "prod-env-receipts": 40, "prod-env-security-state": 6 })[name],
        ),
      }),
    );
    const bundles = section.tables.find((table) => table.name === "bundles");
    expect(bundles.split).toEqual({ customer: 90, test: 20, synthetic: 0, other: 0, unknown: 10, notInLake: 5 });
    const receipts = section.tables.find((table) => table.name === "receipts");
    expect(receipts.split).toEqual({ customer: 0, test: 0, synthetic: 0, other: 0, unknown: 0, notInLake: 40 });
    expect(bundles.ttl).toEqual({ enabled: true, attribute: "ttl" });
  });

  test("a table the lake does not hold carries no split, and a count behind the lake leaves nothing outside it", async () => {
    const section = await buildDataSection({
      envName: "prod",
      now,
      tableNames: ["prod-env-bundles", "prod-env-security-state"],
      bucketNames: [],
      io: makeIo({ describeItemCount: vi.fn(async (name) => ({ "prod-env-bundles": 100, "prod-env-security-state": 6 })[name]) }),
    });
    expect(section.tables.find((table) => table.name === "security-state").split).toBeNull();
    expect(section.tables.find((table) => table.name === "bundles").split.notInLake).toBe(0);
  });

  test("a run writes today's counts and the split, and a later run that day does not query Athena again", async () => {
    const io = makeIo();
    await run(io);
    const written = io.files.get(historyKey("prod", "2026-11-07"));
    expect(written.tables).toEqual({ bundles: 120, receipts: 40 });
    expect(written.actorSplit.bundles.customer).toBe(90);
    expect(io.runAthena).toHaveBeenCalledTimes(1);
    await run(io);
    expect(io.runAthena).toHaveBeenCalledTimes(1);
  });

  test("bucket history reads each offset's day from the metric, and an absent day has no figure", async () => {
    const section = await run(makeIo());
    expect(section.buckets[0].name).toBe("analytics-lake");
    expect(section.buckets[0].objects).toEqual({ today: 5000, d90: null, d30: 4000, d7: null, d1: 5000 });
  });

  test("the chart draws one total line for each repository type and null where a total is not known", async () => {
    const section = await run(makeIo());
    const [series] = section.chart.modes.map((mode) => Object.fromEntries(mode.series.map((line) => [line.id, line.values])));
    expect(section.chart.days).toEqual(["2026-08-09", "2026-10-08", "2026-10-31", "2026-11-06", "2026-11-07"]);
    expect(series.dynamodb).toEqual([null, null, null, null, 160]);
    expect(series.s3).toEqual([null, 4000, null, 5000, 5000]);
    expect(series.books).toEqual([null, null, null, null, 3]);
  });

  test("a failed book count leaves the book rows out and the rest published", async () => {
    const section = await run(makeIo({ countBooks: vi.fn(async () => null) }));
    expect(section.books).toEqual([]);
    expect(section.tables).toHaveLength(2);
  });
});
