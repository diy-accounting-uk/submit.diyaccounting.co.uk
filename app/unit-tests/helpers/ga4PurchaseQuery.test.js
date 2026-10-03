// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/helpers/ga4PurchaseQuery.test.js

import { describe, test, expect } from "vitest";
import { exportedTransactionWindow, dailyExportLagMs } from "../../../behaviour-tests/helpers/ga4PurchaseQuery.js";

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
    expect(after.createdBeforeMs).toBe(utc("2026-10-02T00:00:00Z"));
    const before = exportedTransactionWindow({
      nowMs: utc("2026-10-03T02:00:00Z"),
      lookbackDays: 4,
      exportFirstWholeDayStartMs: exportStart,
    });
    expect(before.createdBeforeMs).toBe(utc("2026-10-01T00:00:00Z"));
  });

  test("lower bound is the start of the oldest day the query reads", () => {
    const window = exportedTransactionWindow({
      nowMs: utc("2026-10-03T12:00:00Z"),
      lookbackDays: 4,
      exportFirstWholeDayStartMs: exportStart,
    });
    expect(window.createdAfterMs).toBe(utc("2026-09-29T00:00:00Z"));
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
