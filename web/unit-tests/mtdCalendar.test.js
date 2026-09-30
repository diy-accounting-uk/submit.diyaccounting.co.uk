// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  PAGE_PATH,
  MAX_SOURCE_AGE_DAYS,
  allFactIds,
  loadSources,
  renderMtdCalendar,
  renderCalendarHtml,
  formatIsoDate,
} from "../../scripts/build-mtd-calendar.mjs";

const sources = loadSources();
const DAY_MS = 24 * 60 * 60 * 1000;

describe("MTD calendar sources", () => {
  test("every fact on the page has a source file listing its id", () => {
    const listed = new Set(sources.flatMap((s) => s.facts));
    const unsourced = allFactIds().filter((id) => !listed.has(id));
    expect(unsourced).toEqual([]);
  });

  test("every source file lists only facts the page shows", () => {
    const shown = new Set(allFactIds());
    const orphaned = sources.flatMap((s) => s.facts.filter((id) => !shown.has(id)).map((id) => `${s.name}: ${id}`));
    expect(orphaned).toEqual([]);
  });

  test("every source is a gov.uk page with a quote and an ISO retrieval date", () => {
    for (const s of sources) {
      expect(s.url, s.name).toMatch(/^https:\/\/www\.gov\.uk\//);
      expect(s.quote.length, s.name).toBeGreaterThan(20);
      expect(s.retrieved, s.name).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(s.facts.length, s.name).toBeGreaterThan(0);
    }
  });

  test(`every source was retrieved within ${MAX_SOURCE_AGE_DAYS} days`, () => {
    const now = Date.now();
    const stale = sources
      .filter((s) => now - Date.parse(`${s.retrieved}T00:00:00Z`) > MAX_SOURCE_AGE_DAYS * DAY_MS)
      .map((s) => `${s.name}: retrieved ${s.retrieved}`);
    expect(stale, "run the tax-sources skill to refresh").toEqual([]);
  });
});

describe("MTD calendar page", () => {
  test("the committed page equals what the build script renders", async () => {
    expect(readFileSync(PAGE_PATH, "utf8")).toBe(await renderMtdCalendar(sources));
  });

  test("the render throws when a fact has no source", () => {
    expect(() => renderCalendarHtml([])).toThrow(/has no source file/);
  });

  test("each fact shows its quote, source link and retrieval date", () => {
    const html = readFileSync(PAGE_PATH, "utf8");
    for (const s of sources) {
      expect(html).toContain(s.url);
      expect(html).toContain(`Retrieved ${formatIsoDate(s.retrieved)}`);
    }
  });

  test("the main nav links to the page", () => {
    const chrome = readFileSync("web/public/widgets/page-chrome.js", "utf8");
    expect(chrome).toContain('{ label: "MTD calendar", target: "mtd-calendar.html" }');
  });
});
