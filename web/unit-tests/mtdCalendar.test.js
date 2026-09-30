// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { PAGE_PATH, allFactIds, renderMtdCalendar, renderCalendarHtml } from "../../scripts/build-mtd-calendar.mjs";
import { loadSources, formatIsoDate } from "../../scripts/tax-sources.mjs";

const sources = loadSources();
const calendarFactIds = new Set(allFactIds());
const calendarSources = sources.filter((s) => s.facts.some((id) => calendarFactIds.has(id)));

describe("MTD calendar page", () => {
  test("the committed page equals what the build script renders", async () => {
    expect(readFileSync(PAGE_PATH, "utf8")).toBe(await renderMtdCalendar(sources));
  });

  test("the render throws when a fact has no source", () => {
    expect(() => renderCalendarHtml([])).toThrow(/has no source file/);
  });

  test("each fact shows its quote, source link and retrieval date", () => {
    const html = readFileSync(PAGE_PATH, "utf8");
    for (const s of calendarSources) {
      expect(html).toContain(s.url);
      expect(html).toContain(`Retrieved ${formatIsoDate(s.retrieved)}`);
    }
  });

  test("the main nav links to the page", () => {
    const chrome = readFileSync("web/public/widgets/page-chrome.js", "utf8");
    expect(chrome).toContain('{ label: "MTD calendar", target: "mtd-calendar.html" }');
  });
});
