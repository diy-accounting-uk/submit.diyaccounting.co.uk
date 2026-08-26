// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/unit-tests/lib/obligationFormatter.test.js

import { describe, test, expect } from "vitest";
import {
  formatObligationForDisplay,
  formatObligationsForSelection,
  filterOpenObligations,
  getPeriodKeyFromSelection,
  findObligationByDateRange,
  obligationLookupWindow,
  describeObligationPeriod,
} from "@app/lib/obligationFormatter.js";

describe("obligationFormatter", () => {
  const sampleObligation = {
    start: "2024-01-01",
    end: "2024-03-31",
    due: "2024-05-07",
    status: "O",
    periodKey: "24A1",
    received: null,
  };

  const fulfilledObligation = {
    start: "2023-10-01",
    end: "2023-12-31",
    due: "2024-02-07",
    status: "F",
    periodKey: "23D1",
    received: "2024-01-15",
  };

  describe("formatObligationForDisplay", () => {
    test("formats obligation with hidden period key", () => {
      const result = formatObligationForDisplay(sampleObligation);

      expect(result._periodKey).toBe("24A1");
      expect(result.id).toBe("24A1");
      expect(result.displayName).toContain("Jan");
      expect(result.displayName).toContain("Mar");
      expect(result.displayName).toContain("2024");
      expect(result.startDate).toBe("2024-01-01");
      expect(result.endDate).toBe("2024-03-31");
      expect(result.dueDate).toBe("2024-05-07");
      expect(result.status).toBe("O");
      expect(result.statusDisplay).toBe("Open");
    });

    test("formats fulfilled obligation", () => {
      const result = formatObligationForDisplay(fulfilledObligation);

      expect(result.status).toBe("F");
      expect(result.statusDisplay).toBe("Submitted");
      expect(result.receivedDate).toBe("2024-01-15");
    });

    test("handles missing due date", () => {
      const obligation = { ...sampleObligation, due: null };
      const result = formatObligationForDisplay(obligation);

      expect(result.dueDate).toBeNull();
      expect(result.dueDateFormatted).toBeNull();
    });
  });

  describe("formatObligationsForSelection", () => {
    test("formats and sorts obligations by end date descending", () => {
      const obligations = [fulfilledObligation, sampleObligation];
      const result = formatObligationsForSelection(obligations);

      expect(result).toHaveLength(2);
      // More recent obligation (2024 Q1) should be first
      expect(result[0]._periodKey).toBe("24A1");
      expect(result[1]._periodKey).toBe("23D1");
    });

    test("returns empty array for non-array input", () => {
      expect(formatObligationsForSelection(null)).toEqual([]);
      expect(formatObligationsForSelection(undefined)).toEqual([]);
      expect(formatObligationsForSelection("invalid")).toEqual([]);
    });

    test("handles empty array", () => {
      expect(formatObligationsForSelection([])).toEqual([]);
    });
  });

  describe("filterOpenObligations", () => {
    test("filters to only open obligations", () => {
      const formatted = formatObligationsForSelection([sampleObligation, fulfilledObligation]);
      const result = filterOpenObligations(formatted);

      expect(result).toHaveLength(1);
      expect(result[0]._periodKey).toBe("24A1");
      expect(result[0].status).toBe("O");
    });

    test("returns empty array when no open obligations", () => {
      const formatted = formatObligationsForSelection([fulfilledObligation]);
      const result = filterOpenObligations(formatted);

      expect(result).toHaveLength(0);
    });
  });

  describe("getPeriodKeyFromSelection", () => {
    test("extracts hidden period key", () => {
      const formatted = formatObligationForDisplay(sampleObligation);
      const periodKey = getPeriodKeyFromSelection(formatted);

      expect(periodKey).toBe("24A1");
    });
  });

  describe("findObligationByDateRange", () => {
    const quarters = [
      { periodKey: "26A1", start: "2026-02-01", end: "2026-04-30", status: "O" },
      { periodKey: "26A2", start: "2026-05-01", end: "2026-07-31", status: "O" },
      { periodKey: "25D1", start: "2025-11-01", end: "2026-01-31", status: "F", received: "2026-02-20" },
    ];

    test("matches exact boundaries", () => {
      expect(findObligationByDateRange(quarters, "2026-02-01", "2026-04-30").periodKey).toBe("26A1");
    });

    test("matches when each boundary is a day out", () => {
      expect(findObligationByDateRange(quarters, "2026-02-02", "2026-05-01").periodKey).toBe("26A1");
    });

    test("matches an ISO timestamp against a plain date", () => {
      const timestamped = [{ periodKey: "26A1", start: "2026-02-01T00:00:00Z", end: "2026-04-30T00:00:00Z", status: "O" }];
      expect(findObligationByDateRange(timestamped, "2026-02-01", "2026-04-30").periodKey).toBe("26A1");
    });

    test("returns the fulfilled obligation when that is what the dates point at", () => {
      const match = findObligationByDateRange(quarters, "2025-11-01", "2026-01-31");
      expect(match.periodKey).toBe("25D1");
      expect(match.status).toBe("F");
    });

    test("prefers the open obligation when two are equally close", () => {
      const overlapping = [
        { periodKey: "26F1", start: "2026-02-01", end: "2026-04-30", status: "F", received: "2026-05-11" },
        { periodKey: "26O1", start: "2026-02-01", end: "2026-04-30", status: "O" },
      ];
      expect(findObligationByDateRange(overlapping, "2026-02-01", "2026-04-30").periodKey).toBe("26O1");
    });

    test("does not reach a neighbouring period", () => {
      expect(findObligationByDateRange(quarters, "2026-02-10", "2026-05-10")).toBeNull();
    });

    test("returns null for an empty or unusable obligation list", () => {
      expect(findObligationByDateRange([], "2026-02-01", "2026-04-30")).toBeNull();
      expect(findObligationByDateRange(null, "2026-02-01", "2026-04-30")).toBeNull();
      expect(findObligationByDateRange(quarters, "not-a-date", "2026-04-30")).toBeNull();
      expect(findObligationByDateRange([{ periodKey: "26A1" }], "2026-02-01", "2026-04-30")).toBeNull();
    });
  });

  describe("obligationLookupWindow", () => {
    test("pads the window either side of the requested period", () => {
      const window = obligationLookupWindow("2026-02-01", "2026-04-30", new Date("2026-05-11T00:00:00Z"));
      expect(window).toEqual({ from: "2026-01-25", to: "2026-05-07" });
    });

    test("does not push the end of the window past today for a period that has closed", () => {
      const window = obligationLookupWindow("2026-02-01", "2026-04-30", new Date("2026-05-02T00:00:00Z"));
      expect(window).toEqual({ from: "2026-01-25", to: "2026-05-02" });
    });

    test("keeps a period that has not closed yet inside the window", () => {
      const window = obligationLookupWindow("2026-05-01", "2026-07-31", new Date("2026-07-15T00:00:00Z"));
      expect(window).toEqual({ from: "2026-04-24", to: "2026-08-07" });
    });

    test("passes through dates it cannot read", () => {
      expect(obligationLookupWindow("not-a-date", "2026-04-30")).toEqual({ from: "not-a-date", to: "2026-04-30" });
    });
  });

  describe("describeObligationPeriod", () => {
    test("reads back the period the way a customer entered it", () => {
      expect(describeObligationPeriod({ start: "2026-02-01", end: "2026-04-30" })).toBe("1 Feb 2026 to 30 Apr 2026");
    });
  });
});
