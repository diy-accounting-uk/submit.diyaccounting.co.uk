// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

import {
  OUTPUT_PATH,
  buildHelpIndex,
  guideEntries,
  knowledgeBaseEntries,
  pageEntries,
  summaryOf,
  textOf,
} from "../../../scripts/build-mcp-help-index.mjs";

describe("the hosted connector's help index", () => {
  test("the committed index is what the build makes from the guide, the pages and the diya-gl package today", async () => {
    expect(await buildHelpIndex()).toBe(readFileSync(OUTPUT_PATH, "utf8"));
  });

  test("a guide journey gives its title with its note in brackets, its group, its captions as the summary and its address", () => {
    const html = `
      <section class="guide-group"><h2>VAT</h2>
        <details class="guide-journey" id="vat-from-books">
          <summary>How to fill in a VAT return from a DIYA-GL book<span class="guide-journey-note">sandbox</span></summary>
          <ol><li class="guide-step"><div><h3 class="guide-step-title">Drop your book</h3></div>
            <p class="guide-caption">Drop the DIYA-GL book on the page.</p></li></ol>
        </details>
      </section>`;
    expect(guideEntries(html)).toEqual([
      {
        source: "Submit guide",
        title: "How to fill in a VAT return from a DIYA-GL book (sandbox)",
        section: "VAT",
        summary: "Drop the DIYA-GL book on the page.",
        url: "https://submit.diyaccounting.co.uk/guide.html#vat-from-books",
        text: "VAT Drop your book Drop the DIYA-GL book on the page.",
      },
    ]);
  });

  test("a page gives one entry per heading, addressed by the heading's id when it has one", () => {
    const html = `<title>MTD calendar - DIY Accounting Submit</title><main>
      <h2 id="dates">Dates</h2><p>The dates a return is due.</p><script>ignored()</script>
      <h2>No date yet</h2><p>Some dates are not set.</p></main>`;
    expect(pageEntries(html, "mtd-calendar.html").map(({ title, url, summary }) => ({ title, url, summary }))).toEqual([
      {
        title: "MTD calendar: Dates",
        url: "https://submit.diyaccounting.co.uk/mtd-calendar.html#dates",
        summary: "The dates a return is due.",
      },
      {
        title: "MTD calendar: No date yet",
        url: "https://submit.diyaccounting.co.uk/mtd-calendar.html",
        summary: "Some dates are not set.",
      },
    ]);
  });

  test("a knowledge base article gives its question, description and address on the spreadsheets site", () => {
    const tomlText = `[[article]]
id = "cash-accounting-scheme"
category = "vat"
question = "Cash Accounting Scheme"
description = "How the cash accounting scheme works."
keywords = ["cash accounting"]
priority = 5
`;
    expect(knowledgeBaseEntries(tomlText)).toEqual([
      {
        source: "diya-gl knowledge base",
        title: "Cash Accounting Scheme",
        section: "vat",
        summary: "How the cash accounting scheme works.",
        url: "https://spreadsheets.diyaccounting.co.uk/articles/cash-accounting-scheme.html",
        text: "vat cash accounting",
      },
    ]);
  });

  test("text loses its tags and reads its entities, and a summary keeps whole sentences up to about two lines", () => {
    expect(textOf("<p>Tax &amp; VAT<br>&pound;90,000</p>")).toBe("Tax & VAT £90,000");
    const long = "One sentence here. ".repeat(30).trim();
    const summary = summaryOf(long);
    expect(summary.length).toBeLessThanOrEqual(240);
    expect(summary.endsWith(".")).toBe(true);
  });
});
