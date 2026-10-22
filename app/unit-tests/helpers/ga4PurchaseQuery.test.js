// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/helpers/ga4PurchaseQuery.test.js

import { describe, test, expect } from "vitest";
import {
  exportedTransactionWindow,
  dailyExportLagMs,
  dailyTableSuffixes,
  propertyDayStartMs,
  selectPriorPurchaseSubscription,
} from "../../../behaviour-tests/helpers/ga4PurchaseQuery.js";

const hour = 60 * 60 * 1000;
const day = 24 * hour;
const utc = (iso) => Date.parse(iso);

describe("exportedTransactionWindow", () => {
  const exportStart = utc("2026-09-01T00:00:00Z");

  test("admits only days closed at least the export lag ago", () => {
    const after = exportedTransactionWindow({
      nowMs: utc("2026-10-03T03:18:00Z"),
      lookbackDays: 4,
      exportFirstWholeDayStartMs: exportStart,
    });
    expect(after.createdBeforeMs).toBe(utc("2026-10-01T23:00:00Z"));
    const before = exportedTransactionWindow({
      nowMs: utc("2026-10-02T23:30:00Z"),
      lookbackDays: 4,
      exportFirstWholeDayStartMs: exportStart,
    });
    expect(before.createdBeforeMs).toBe(utc("2026-09-30T23:00:00Z"));
  });

  test("lower bound is the start of the oldest day the query reads", () => {
    const window = exportedTransactionWindow({
      nowMs: utc("2026-10-03T12:00:00Z"),
      lookbackDays: 4,
      exportFirstWholeDayStartMs: exportStart,
    });
    expect(window.createdAfterMs).toBe(utc("2026-09-28T23:00:00Z"));
  });

  test("lower bound is the first whole export day when that is later than the lookback", () => {
    const window = exportedTransactionWindow({
      nowMs: utc("2026-10-03T12:00:00Z"),
      lookbackDays: 4,
      exportFirstWholeDayStartMs: utc("2026-10-01T00:00:00Z"),
    });
    expect(window.createdAfterMs).toBe(utc("2026-10-01T00:00:00Z"));
  });

  test("returns null when no day qualifies or the dataset has no daily table", () => {
    expect(exportedTransactionWindow({ nowMs: utc("2026-10-03T12:00:00Z"), lookbackDays: 4, exportFirstWholeDayStartMs: null })).toBeNull();
    expect(
      exportedTransactionWindow({
        nowMs: utc("2026-10-03T12:00:00Z"),
        lookbackDays: 4,
        exportFirstWholeDayStartMs: utc("2026-10-02T00:00:00Z"),
      }),
    ).toBeNull();
  });

  test("the newest admitted day closed at least the export lag before now, at any time of day", () => {
    for (let hours = 0; hours < 72; hours++) {
      const nowMs = utc("2026-10-01T00:00:00Z") + hours * hour;
      const { createdBeforeMs } = exportedTransactionWindow({ nowMs, lookbackDays: 4, exportFirstWholeDayStartMs: exportStart });
      expect(nowMs - createdBeforeMs).toBeGreaterThanOrEqual(dailyExportLagMs);
      expect(nowMs - createdBeforeMs).toBeLessThan(dailyExportLagMs + day);
    }
  });
});

describe("property time zone days", () => {
  const exportStart = utc("2026-09-01T00:00:00Z");

  test("a subscription at 23:07Z in BST is on the next London day and is outside the window", () => {
    const nowMs = utc("2026-10-22T04:28:00Z");
    const window = exportedTransactionWindow({ nowMs, lookbackDays: 4, exportFirstWholeDayStartMs: exportStart });
    const subscriptionMs = utc("2026-10-20T23:07:02Z");
    expect(window.createdBeforeMs).toBe(utc("2026-10-20T23:00:00Z"));
    expect(subscriptionMs).toBeGreaterThanOrEqual(window.createdBeforeMs);
    expect(window.createdAfterMs).toBe(utc("2026-10-17T23:00:00Z"));
  });

  test("a subscription at 22:59Z in BST is on the earlier London day and is inside the window", () => {
    const window = exportedTransactionWindow({
      nowMs: utc("2026-10-22T04:28:00Z"),
      lookbackDays: 4,
      exportFirstWholeDayStartMs: exportStart,
    });
    expect(utc("2026-10-20T22:59:00Z")).toBeLessThan(window.createdBeforeMs);
  });

  test("in GMT the London day equals the UTC day", () => {
    const window = exportedTransactionWindow({
      nowMs: utc("2026-12-10T12:00:00Z"),
      lookbackDays: 4,
      exportFirstWholeDayStartMs: exportStart,
    });
    expect(window.createdBeforeMs).toBe(utc("2026-12-09T00:00:00Z"));
    expect(window.createdAfterMs).toBe(utc("2026-12-06T00:00:00Z"));
    expect(dailyTableSuffixes(2, utc("2026-12-10T23:30:00Z"))).toEqual(["20261210", "20261209", "20261208"]);
  });

  test("table suffixes count London days, so 23:30Z in BST is already the next day", () => {
    expect(dailyTableSuffixes(1, utc("2026-10-20T23:30:00Z"))).toEqual(["20261021", "20261020"]);
  });

  test("days across the 25 October 2026 clock change start at the right UTC instants", () => {
    expect(propertyDayStartMs(utc("2026-10-24T12:00:00Z"))).toBe(utc("2026-10-23T23:00:00Z"));
    expect(propertyDayStartMs(utc("2026-10-25T12:00:00Z"))).toBe(utc("2026-10-24T23:00:00Z"));
    expect(propertyDayStartMs(utc("2026-10-26T12:00:00Z"))).toBe(utc("2026-10-26T00:00:00Z"));
    const window = exportedTransactionWindow({
      nowMs: utc("2026-10-28T12:00:00Z"),
      lookbackDays: 4,
      exportFirstWholeDayStartMs: exportStart,
    });
    expect(window.createdAfterMs).toBe(utc("2026-10-23T23:00:00Z"));
    expect(window.createdBeforeMs).toBe(utc("2026-10-27T00:00:00Z"));
    expect(dailyTableSuffixes(4, utc("2026-10-28T12:00:00Z"))).toEqual(["20261028", "20261027", "20261026", "20261025", "20261024"]);
  });
});

describe("selectPriorPurchaseSubscription", () => {
  const subscriptions = [
    { id: "sub_prod_newest", created: 300, metadata: { hashedSub: "prod-pool" } },
    { id: "sub_ci_newer", created: 200, metadata: { hashedSub: "ci-pool" } },
    { id: "sub_no_metadata", created: 150 },
    { id: "sub_ci_older", created: 100, metadata: { hashedSub: "ci-pool" } },
  ];

  test("skips subscriptions from another user pool even when newer", () => {
    expect(selectPriorPurchaseSubscription(subscriptions, { hashedSub: "ci-pool" })).toEqual({ id: "sub_ci_newer", createdMs: 200_000 });
  });

  test("returns null when no subscription is from the user pool", () => {
    expect(selectPriorPurchaseSubscription(subscriptions, { hashedSub: "other-pool" })).toBeNull();
  });
});
