// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/searchconsoleReport.test.js

import { describe, test, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

import {
  parseArgs,
  analyticsDateRange,
  buildAnalyticsRequest,
  shapeAnalyticsRows,
  parseSitemapLocs,
  shapeInspection,
  inspectionFailure,
  limitToQuota,
  summariseInspections,
  renderPropertyReport,
  INSPECTION_DAILY_QUOTA,
} from "../../../infra/google/searchconsole/searchconsole-report.js";

const fixture = (name, asText = false) => {
  const text = fs.readFileSync(path.join(import.meta.dirname, "..", "fixtures", "searchconsole", name), "utf-8");
  return asText ? text : JSON.parse(text);
};

describe("parseArgs", () => {
  test("defaults to 90 days, the daily quota and stdout tables", () => {
    expect(parseArgs([])).toEqual({ days: 90, maxInspections: INSPECTION_DAILY_QUOTA, json: false, out: null });
  });
  test("reads every flag", () => {
    expect(parseArgs(["--days", "28", "--max-inspections", "50", "--json", "--out", "target/r.json"])).toEqual({
      days: 28,
      maxInspections: 50,
      json: true,
      out: "target/r.json",
    });
  });
  test("rejects a bad count and an unknown argument", () => {
    expect(() => parseArgs(["--days", "0"])).toThrow(/positive/);
    expect(() => parseArgs(["--days"])).toThrow(/positive/);
    expect(() => parseArgs(["--out"])).toThrow(/needs a path/);
    expect(() => parseArgs(["--nope"])).toThrow(/Unknown argument/);
  });
});

describe("analyticsDateRange", () => {
  test("ends three days before today and spans the requested days inclusive", () => {
    expect(analyticsDateRange(new Date("2026-11-04T10:00:00Z"), 90)).toEqual({ startDate: "2026-08-04", endDate: "2026-11-01" });
  });
  test("one day is a single date", () => {
    expect(analyticsDateRange(new Date("2026-11-04T10:00:00Z"), 1)).toEqual({ startDate: "2026-11-01", endDate: "2026-11-01" });
  });
});

describe("buildAnalyticsRequest", () => {
  test("asks for the top 50 rows of one dimension over the range", () => {
    expect(buildAnalyticsRequest("page", { startDate: "a", endDate: "b" })).toEqual({
      startDate: "a",
      endDate: "b",
      dimensions: ["page"],
      rowLimit: 50,
      dataState: "final",
    });
  });
});

describe("shapeAnalyticsRows", () => {
  test("rounds CTR to a percent and position to one decimal", () => {
    expect(shapeAnalyticsRows(fixture("search-analytics-queries.json").rows)).toEqual([
      { key: "making tax digital software", clicks: 12, impressions: 340, ctrPercent: 3.5, position: 8.2 },
      { key: "free vat return software", clicks: 3, impressions: 120, ctrPercent: 2.5, position: 14 },
    ]);
  });
  test("an empty answer is an empty list", () => {
    expect(shapeAnalyticsRows(undefined)).toEqual([]);
  });
});

describe("parseSitemapLocs", () => {
  test("lists each loc and decodes ampersands", () => {
    expect(parseSitemapLocs(fixture("sitemap.xml", true))).toEqual([
      "https://submit.diyaccounting.co.uk/",
      "https://submit.diyaccounting.co.uk/guide.html",
      "https://submit.diyaccounting.co.uk/search?a=1&b=2",
      "https://submit.diyaccounting.co.uk/guide.html",
    ]);
  });
});

describe("shapeInspection", () => {
  test("an indexed page matches its canonical", () => {
    expect(shapeInspection("https://submit.diyaccounting.co.uk/guide.html", fixture("url-inspection-indexed.json"))).toMatchObject({
      verdict: "PASS",
      coverageState: "Submitted and indexed",
      lastCrawlTime: "2026-10-30T04:12:09Z",
      canonicalMatches: true,
    });
  });
  test("a page whose canonical differs is flagged", () => {
    const shaped = shapeInspection("https://diyaccounting.co.uk/", fixture("url-inspection-canonical-differs.json"));
    expect(shaped.canonicalMatches).toBe(false);
    expect(shaped.googleCanonical).toBe("https://diyaccounting.co.uk/");
  });
  test("a page unknown to Google has no canonical comparison", () => {
    expect(shapeInspection("https://x.example/", fixture("url-inspection-unknown.json"))).toMatchObject({
      coverageState: "URL is unknown to Google",
      lastCrawlTime: null,
      canonicalMatches: null,
    });
  });
  test("an empty answer is UNKNOWN", () => {
    expect(shapeInspection("https://x.example/", {}).verdict).toBe("UNKNOWN");
  });
});

describe("inspectionFailure", () => {
  test("keeps the URL and the reason", () => {
    expect(inspectionFailure("https://x.example/", 429)).toMatchObject({
      url: "https://x.example/",
      verdict: "ERROR",
      coverageState: "429",
    });
  });
});

describe("limitToQuota", () => {
  test("drops duplicates and cuts to the quota", () => {
    expect(limitToQuota(["a", "b", "a", "c"], 2)).toEqual({ inspect: ["a", "b"], skipped: 1 });
  });
  test("keeps everything under the quota", () => {
    expect(limitToQuota(["a", "b"])).toEqual({ inspect: ["a", "b"], skipped: 0 });
  });
});

describe("summariseInspections", () => {
  const inspections = [
    shapeInspection("https://submit.diyaccounting.co.uk/guide.html", fixture("url-inspection-indexed.json")),
    shapeInspection("https://diyaccounting.co.uk/", fixture("url-inspection-canonical-differs.json")),
    shapeInspection("https://x.example/", fixture("url-inspection-unknown.json")),
  ];
  test("counts verdicts and coverage states and lists canonical mismatches", () => {
    const summary = summariseInspections(inspections);
    expect(summary.total).toBe(3);
    expect(summary.byVerdict).toEqual({ PASS: 1, NEUTRAL: 2 });
    expect(summary.byCoverageState["Submitted and indexed"]).toBe(1);
    expect(summary.canonicalMismatches).toEqual([
      { url: "https://diyaccounting.co.uk/", google: "https://diyaccounting.co.uk/", declared: "https://www.diyaccounting.co.uk/" },
    ]);
  });
});

describe("renderPropertyReport", () => {
  test("prints the range, both tables, the inspection counts and each mismatch", () => {
    const inspections = [shapeInspection("https://diyaccounting.co.uk/", fixture("url-inspection-canonical-differs.json"))];
    const lines = renderPropertyReport({
      siteUrl: "sc-domain:diyaccounting.co.uk",
      range: { startDate: "2026-08-04", endDate: "2026-11-01" },
      queries: shapeAnalyticsRows(fixture("search-analytics-queries.json").rows),
      pages: [],
      inspections,
      inspectionSummary: summariseInspections(inspections),
      inspectionSkipped: 0,
    });
    const text = lines.join("\n");
    expect(text).toContain("## sc-domain:diyaccounting.co.uk (2026-08-04 to 2026-11-01)");
    expect(text).toContain("12\t340\t3.5\t8.2\tmaking tax digital software");
    expect(text).toContain("Top pages");
    expect(text).toContain("(no data)");
    expect(text).toContain("URL inspection: 1 URLs inspected, 0 skipped over the quota");
    expect(text).toContain("canonical differs: https://diyaccounting.co.uk/");
  });
});
