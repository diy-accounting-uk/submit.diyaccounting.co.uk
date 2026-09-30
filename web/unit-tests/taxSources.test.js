// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect } from "vitest";
import { MAX_SOURCE_AGE_DAYS, loadSources, sourceQuoteHtml, normaliseText, quoteAppearsIn } from "../../scripts/tax-sources.mjs";
import { allFactIds } from "../../scripts/build-mtd-calendar.mjs";
import { RATES_FACT_IDS } from "../../scripts/rates-fact-ids.mjs";
import { allRatesFactIds } from "../../scripts/build-rates-page.mjs";

const sources = loadSources();
const DAY_MS = 24 * 60 * 60 * 1000;
const pageFactIds = () => [...allFactIds(), ...allRatesFactIds()];

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

  test("sourceQuoteHtml escapes the quote and shortens the gov.uk link text", () => {
    const html = sourceQuoteHtml({ url: "https://www.gov.uk/a?b=1&c=2", retrieved: "2026-09-30", quote: "a < b" });
    expect(html).toContain("<p>a &lt; b</p>");
    expect(html).toContain(">gov.uk/a?b=1&amp;c=2</a>");
    expect(html).toContain("Retrieved 30 September 2026");
  });
});
