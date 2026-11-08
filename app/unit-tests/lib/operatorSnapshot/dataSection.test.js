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
      { kind: "bundles", actor: "customer", items: "90" },
      { kind: "bundles", actor: "test-user", items: "20" },
      { kind: "bundles", actor: "", items: "10" },
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
    expect(actorClassOf("operator")).toBe("other");
  });

  test("the split query counts the newest change of each key unless it is a removal", () => {
    const sql = buildActorSplitSql();
    expect(sql).toContain("FROM   dynamo_bundles");
    expect(sql).toContain("PARTITION BY hashed_sub, bundle_id ORDER BY change_ts DESC");
    expect(sql).toContain("newest = 1 AND change_type <> 'REMOVE'");
    expect(sql).not.toMatch(/dynamo_calls|dynamo_commissions/);
  });

  test("the split adds each actor into its class and keeps the unknown count apart", () => {
    const split = shapeActorSplit([
      { kind: "bundles", actor: "customer", items: "5" },
      { kind: "bundles", actor: "", items: "2" },
      { kind: "bundles", actor: "probe", items: "1" },
      { kind: "elsewhere", actor: "customer", items: "9" },
    ]);
    expect(split).toEqual({ bundles: { customer: 5, test: 0, synthetic: 1, other: 0, unknown: 2 } });
  });

  test("a day with no history file shows no figure, never 0", async () => {
    const io = makeIo();
    io.files.set(historyKey("prod", dayBefore(now, 7)), { tables: { bundles: 100 }, books: { books: 2, versions: 2 } });
    const section = await run(io);
    const bundles = section.tables.find((table) => table.name === "bundles");
    expect(bundles.items).toEqual({ today: 120, d1: null, d7: 100, d30: null, d90: null });
    expect(section.books[0].count).toEqual({ today: 3, d1: null, d7: 2, d30: null, d90: null });
  });

  test("a table with a lake split carries it, and one without carries none", async () => {
    const section = await run(makeIo());
    expect(section.tables.find((table) => table.name === "bundles").split).toEqual({
      customer: 90,
      test: 20,
      synthetic: 0,
      other: 0,
      unknown: 10,
    });
    expect(section.tables.find((table) => table.name === "receipts").split).toBeNull();
    expect(section.tables.find((table) => table.name === "bundles").ttl).toEqual({ enabled: true, attribute: "ttl" });
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
