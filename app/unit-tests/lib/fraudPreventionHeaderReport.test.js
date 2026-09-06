// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/unit-tests/lib/fraudPreventionHeaderReport.test.js

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import { parseFraudPreventionHeaderReport } from "../../lib/fraudPreventionHeaderReport.js";

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "fraudPreventionHeaderReport");

function readFixture(name) {
  return readFileSync(path.join(fixturesDir, name), "utf8");
}

describe("parseFraudPreventionHeaderReport", () => {
  it("reports no action needed when the headers are correct", () => {
    const result = parseFraudPreventionHeaderReport(readFixture("ok.txt"));

    expect(result).toEqual({
      month: "July 2026",
      trafficCount: null,
      advisories: [],
      errors: [],
      needsAction: false,
    });
  });

  it("flags needsAction when the month has advisories to review", () => {
    const result = parseFraudPreventionHeaderReport(readFixture("advisories.txt"));

    expect(result.month).toBe("April 2026");
    expect(result.trafficCount).toBeNull();
    expect(result.advisories).toHaveLength(1);
    expect(result.errors).toEqual([]);
    expect(result.needsAction).toBe(true);
  });

  it("flags needsAction and a zero traffic count when the application sent no requests", () => {
    const result = parseFraudPreventionHeaderReport(readFixture("zero-traffic.txt"));

    expect(result.month).toBe("June 2026");
    expect(result.trafficCount).toBe(0);
    expect(result.advisories).toEqual([]);
    expect(result.errors).toEqual([]);
    expect(result.needsAction).toBe(true);
  });

  it("throws when the text carries no recognisable report month", () => {
    expect(() => parseFraudPreventionHeaderReport("This is not a fraud prevention header report.")).toThrow(
      /could not find a report month/,
    );
  });

  it("throws on empty input", () => {
    expect(() => parseFraudPreventionHeaderReport("")).toThrow(/email text is required/);
  });
});
