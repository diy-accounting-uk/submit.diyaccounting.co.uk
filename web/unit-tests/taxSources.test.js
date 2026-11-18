// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MAX_SOURCE_AGE_DAYS,
  loadSources,
  sourcesOlderThan,
  sourceQuoteHtml,
  sourcesQuoteHtml,
  pageTitle,
  normaliseText,
  quoteAppearsIn,
} from "../../scripts/tax-sources.mjs";
import { allFactIds } from "../../scripts/build-mtd-calendar.mjs";
import { RATES_FACT_IDS } from "../../scripts/rates-fact-ids.mjs";
import { allRatesFactIds } from "../../scripts/build-rates-page.mjs";
import { articleFactIds } from "../../scripts/build-filing-pages.mjs";

const sources = loadSources();
const DAY_MS = 24 * 60 * 60 * 1000;
const pageFactIds = () => [...allFactIds(), ...allRatesFactIds(), ...articleFactIds()];

describe("tax sources", () => {
  test("every fact on the MTD calendar has a source file listing its id", () => {
    const listed = new Set(sources.flatMap((s) => s.facts));
    const unsourced = allFactIds().filter((id) => !listed.has(id));
    expect(unsourced).toEqual([]);
  });

  test("every source file lists only facts some page shows", () => {
    const shown = new Set(pageFactIds());
    const orphaned = sources.flatMap((s) => s.facts.filter((id) => !shown.has(id)).map((id) => `${s.name}: ${id}`));
    expect(orphaned).toEqual([]);
  });

  test("every source is a gov.uk page with a title, a quote and an ISO retrieval date", () => {
    for (const s of sources) {
      expect(s.url, s.name).toMatch(/^https:\/\/www\.gov\.uk\//);
      expect(s.title.length, s.name).toBeGreaterThan(5);
      expect(s.title, s.name).not.toMatch(/GOV\.UK$/);
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

  test("sourcesOlderThan lists a source only when it is older than the limit", () => {
    const now = Date.parse("2026-11-30T00:00:00Z");
    const list = [
      { name: "new", retrieved: "2026-11-23" },
      { name: "edge", retrieved: "2026-11-07" },
      { name: "old", retrieved: "2026-11-06" },
    ];
    expect(sourcesOlderThan(list, 23, now).map((s) => s.name)).toEqual(["old"]);
    expect(sourcesOlderThan(list, 7, now).map((s) => s.name)).toEqual(["edge", "old"]);
  });

  test("the weekly check warns a week before the limit", () => {
    const workflow = readFileSync(join(import.meta.dirname, "..", "..", ".github", "workflows", "tax-sources-check.yml"), "utf8");
    expect(workflow).toContain(`--max-age-days ${MAX_SOURCE_AGE_DAYS - 7}`);
  });

  test("the rates fact ids are unique", () => {
    expect(new Set(RATES_FACT_IDS).size).toBe(RATES_FACT_IDS.length);
  });

  test("the rates page shows exactly the rates fact ids", () => {
    expect([...allRatesFactIds()].sort()).toEqual([...RATES_FACT_IDS].sort());
  });
});

describe("tax source helpers", () => {
  test("normaliseText strips tags, entities and space before punctuation", () => {
    expect(normaliseText("<p>Rate&nbsp;is &pound;5 <b>now</b> .</p><script>x()</script>")).toBe("Rate is £5 now.");
  });

  test("quoteAppearsIn ignores whitespace and markup differences", () => {
    expect(quoteAppearsIn("the rate is 20%", "<td>the  rate\nis <em>20%</em></td>")).toBe(true);
    expect(quoteAppearsIn("the rate is 25%", "<td>the rate is 20%</td>")).toBe(false);
  });

  test("sourceQuoteHtml escapes the quote and prints one link in words with the check date", () => {
    const html = sourceQuoteHtml({ url: "https://www.gov.uk/a?b=1&c=2", title: "Rates & more", retrieved: "2026-09-30", quote: "A < b." });
    expect(html).toContain("<p>A &lt; b.</p>");
    expect(html).toContain(
      '<a href="https://www.gov.uk/a?b=1&amp;c=2" rel="noopener">GOV.UK, Rates &amp; more</a> (checked 30 September 2026)',
    );
    expect(html).toContain("Source: <a");
    expect(html).not.toContain("Retrieved");
  });

  test("sourceQuoteHtml prints a table source as a link line without its words", () => {
    const html = sourceQuoteHtml({
      url: "https://www.gov.uk/a",
      title: "Rates",
      retrieved: "2026-09-30",
      quote: "Period Rate A 1 B 2",
      table: true,
    });
    expect(html).toContain("source-citation");
    expect(html).toContain(">GOV.UK, Rates</a> (checked 30 September 2026)");
    expect(html).not.toContain("Period Rate");
    expect(html).not.toContain("<p>");
  });

  test("sourceQuoteHtml throws for a source with no title", () => {
    expect(() => sourceQuoteHtml({ name: "x", url: "https://www.gov.uk/a", retrieved: "2026-09-30", quote: "The rate is 20%." })).toThrow(
      /no title/,
    );
  });

  test("sourcesQuoteHtml prints a page cited by several sources once, with each quote", () => {
    const a = { url: "https://www.gov.uk/a", title: "Rates", retrieved: "2026-09-30", quote: "The rate is 20%." };
    const b = { ...a, retrieved: "2026-10-02", quote: "The limit is £5." };
    const table = { ...a, quote: "Rate A 1", table: true };
    const html = sourcesQuoteHtml([a, b, table, a]);
    expect(html.match(/<footer>/g)).toHaveLength(1);
    expect(html).toContain("<p>The rate is 20%.</p><p>The limit is £5.</p>");
    expect(html).not.toContain("Rate A 1");
    expect(html).toContain("(checked 2 October 2026)");
  });

  test("pageTitle reads the title of a gov.uk page without the site suffix, entities or padding", () => {
    expect(pageTitle("<title>\n  Filing your company&#39;s confirmation statement - GOV.UK\n</title>")).toBe(
      "Filing your company's confirmation statement",
    );
    expect(pageTitle("<p>no title</p>")).toBeNull();
  });

  test("a quote that is not a table starts with a capital letter", () => {
    const bad = sources.filter((s) => !s.table && !/^[A-Z]/.test(s.quote)).map((s) => s.name);
    expect(bad).toEqual([]);
  });
});
