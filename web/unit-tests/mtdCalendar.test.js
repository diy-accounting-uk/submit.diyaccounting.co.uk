// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
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

  test("both wide tables stack their rows on a phone and label every cell", () => {
    const html = readFileSync(PAGE_PATH, "utf8");
    const css = readFileSync(path.join(process.cwd(), "web/public/submit.css"), "utf8");
    expect(css).toMatch(/@media \(max-width: 600px\)[\s\S]*\.stacked-table td\[data-label\]::before/);
    for (const id of ["business-types", "availability"]) {
      const section = html.slice(html.indexOf(`id="${id}"`)).split("</table>")[0];
      expect(section).toContain('class="deadline-table stacked-table');
      const cells = section.match(/<td[^>]*>/g);
      expect(cells.length).toBeGreaterThan(0);
      for (const c of cells) expect(c).toContain("data-label=");
    }
  });

  test("every availability cell carries the state class of its first word", () => {
    const html = readFileSync(PAGE_PATH, "utf8");
    const section = html.slice(html.indexOf('id="availability"')).split("</table>")[0];
    const cells = [...section.matchAll(/<td class="(avail-[a-z-]+)" data-label="[^"]+">\s*([a-z ]+?)(?: <span|\s*<\/td>)/g)];
    const stateCells = section.match(/<td[^>]*data-label="(?!Docs and video")[^"]*"[^>]*>/g);
    expect(cells.length).toBeGreaterThan(0);
    expect(cells.length).toBe(stateCells.length);
    for (const [, cls, text] of cells) {
      expect(["production", "sandbox", "preview", "not offered"]).toContain(text);
      expect(cls).toBe(`avail-${text.replace(" ", "-")}`);
    }
  });
});
