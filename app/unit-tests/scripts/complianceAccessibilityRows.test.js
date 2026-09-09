// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect } from "vitest";
import {
  rowsFromAxeResults,
  rowsFromPa11yResults,
  buildRows,
  toNdjson,
} from "../../../scripts/compliance-accessibility-rows.js";

describe("compliance-accessibility-rows", () => {
  test("rowsFromAxeResults counts violations and passes per page", () => {
    const rows = rowsFromAxeResults(
      [
        { url: "https://x/a", violations: [{}, {}], passes: [{}, {}, {}] },
        { url: "https://x/b", violations: [], passes: [{}] },
      ],
      "wcag21aa",
    );
    expect(rows).toEqual([
      { page: "https://x/a", violations: 2, passes: 3, standard: "wcag21aa" },
      { page: "https://x/b", violations: 0, passes: 1, standard: "wcag21aa" },
    ]);
  });

  test("rowsFromAxeResults returns an empty array for a missing or malformed result", () => {
    expect(rowsFromAxeResults(null, "wcag21aa")).toEqual([]);
    expect(rowsFromAxeResults(undefined, "wcag21aa")).toEqual([]);
  });

  test("rowsFromPa11yResults counts issues per page and always reports zero passes", () => {
    const rows = rowsFromPa11yResults({
      results: {
        "https://x/a": [{ code: "1" }, { code: "2" }],
        "https://x/b": [],
      },
    });
    expect(rows).toEqual([
      { page: "https://x/a", violations: 2, passes: 0, standard: "wcag2aa" },
      { page: "https://x/b", violations: 0, passes: 0, standard: "wcag2aa" },
    ]);
  });

  test("rowsFromPa11yResults returns an empty array with no results object", () => {
    expect(rowsFromPa11yResults(null)).toEqual([]);
    expect(rowsFromPa11yResults({})).toEqual([]);
  });

  test("buildRows tags each source with its tool and skips a missing result file", () => {
    const rows = buildRows({
      pa11y: { results: { "https://x/a": [{ code: "1" }] } },
      axe: [{ url: "https://x/a", violations: [], passes: [{}] }],
      axeWcag22: null,
    });
    expect(rows).toEqual([
      { tool: "pa11y", page: "https://x/a", violations: 1, passes: 0, standard: "wcag2aa" },
      { tool: "axe", page: "https://x/a", violations: 0, passes: 1, standard: "wcag21aa" },
    ]);
  });

  test("toNdjson renders one JSON object per line and an empty body for no rows", () => {
    expect(toNdjson([])).toBe("");
    expect(toNdjson([{ a: 1 }, { a: 2 }])).toBe('{"a":1}\n{"a":2}\n');
  });
});
