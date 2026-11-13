// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  bundlePriceText,
  filingPagePath,
  filingPagesToWrite,
  isProductionOnProd,
  loadCatalog,
  loadManifest,
  loadArticles,
  loadComparisons,
  loadTools,
  loadPages,
  renderArticlePages,
  renderComparisonPages,
  comparisonTools,
  yearPence,
  renderFilingPages,
} from "../../scripts/build-filing-pages.mjs";
import { loadSources } from "../../scripts/tax-sources.mjs";

const catalog = loadCatalog();
const pages = loadPages();
const written = filingPagesToWrite(pages, catalog);
const read = (path) => readFileSync(path, "utf8");

describe("filing pages", () => {
  test("each committed page equals what the build script renders", async () => {
    const rendered = await renderFilingPages();
    expect([...rendered.keys()].sort()).toEqual(written.map((page) => page.file).sort());
    for (const [file, html] of rendered) expect(read(join("web/public", file))).toBe(html);
  });

  test("the five filings that are production on prod have a page", () => {
    expect(written.map((page) => page.file).sort()).toEqual([
      "confirmation-statement.html",
      "dormant-company-accounts.html",
      "micro-entity-accounts.html",
      "small-company-accounts.html",
      "vat-return-from-a-spreadsheet.html",
    ]);
  });

  test("a filing that is sandbox or preview on prod gets no page", () => {
    for (const activity of ["self-employed", "file-company-tax-return", "vat-assist-check", "file-psc-verification-statement"]) {
      expect(isProductionOnProd(catalog, activity), activity).toBe(false);
    }
    const income = { file: "income-tax.html", activity: "self-employed" };
    expect(filingPagesToWrite([income], catalog)).toEqual([]);
  });

  test("the due date of each page quotes its source file with the source link", () => {
    const sources = loadSources();
    for (const page of written) {
      const source = sources.find((candidate) => candidate.name === page.deadline.source);
      const html = read(filingPagePath(page));
      expect(html, page.file).toContain(source.url);
      expect(html, page.file).toContain(source.quote.replace(/’/g, "’"));
    }
  });

  test("the price of each page is the catalogue price of its bundle", () => {
    const vat = catalog.bundles.find((bundle) => bundle.id === "resident-vat");
    const ltd = catalog.bundles.find((bundle) => bundle.id === "resident-ltd");
    expect(bundlePriceText(vat)).toBe("£9.99 a year or £0.99 a month");
    expect(read("web/public/vat-return-from-a-spreadsheet.html")).toContain(bundlePriceText(vat));
    expect(read("web/public/micro-entity-accounts.html")).toContain(bundlePriceText(ltd));
    expect(read("web/public/confirmation-statement.html")).toContain("£61.35");
  });

  test("the VAT page offers the free day pass and the accounts pages do not", () => {
    expect(read("web/public/vat-return-from-a-spreadsheet.html")).toContain("gives you 3 submissions");
    expect(read("web/public/micro-entity-accounts.html")).not.toContain("gives you 3 submissions");
  });

  test("each page has one h1, a canonical link, a title and a description, and every screenshot file exists", () => {
    const manifest = loadManifest();
    for (const page of written) {
      const html = read(filingPagePath(page));
      expect(html.match(/<h1>/g), page.file).toHaveLength(1);
      expect(html).toContain(`<h1>${page.heading}</h1>`);
      expect(html).toContain(`<link rel="canonical" href="https://submit.diyaccounting.co.uk/${page.file}" />`);
      expect(html).toContain(`<title>${page.title}</title>`);
      for (const [, src] of html.matchAll(/ src="(videos\/[^"]+)"/g)) expect(existsSync(join("web/public", src)), src).toBe(true);
      expect(manifest.videos.some((video) => video.id === page.video)).toBe(true);
    }
  });

  test("every page is in the sitemap and linked from the home page, the footer and the spreadsheets page", () => {
    const sitemap = read("web/public/sitemap.xml");
    const home = read("web/public/index.html");
    const chrome = read("web/public/widgets/page-chrome.js");
    const spreadsheets = read("web/public/spreadsheets.html");
    for (const page of written) {
      expect(sitemap, page.file).toContain(`<loc>https://submit.diyaccounting.co.uk/${page.file}</loc>`);
      expect(home, page.file).toContain(`href="${page.file}"`);
      expect(chrome, page.file).toContain(`target: "${page.file}"`);
      expect(spreadsheets, page.file).toContain(`href="${page.file}"`);
    }
  });
});

describe("article pages", () => {
  const articles = loadArticles();
  const sources = loadSources();

  test("each committed article page equals what the build script renders", async () => {
    const rendered = await renderArticlePages();
    expect([...rendered.keys()]).toEqual(articles.map((article) => article.file));
    for (const [file, html] of rendered) expect(read(join("web/public", file))).toBe(html);
  });

  test("each article has one h1, a canonical link, an og title, the card tag and links the calendar and a filing page", () => {
    const filingFiles = written.map((page) => page.file);
    for (const article of articles) {
      const html = read(join("web/public", article.file));
      expect(html.match(/<h1>/g), article.file).toHaveLength(1);
      expect(html).toContain(`<link rel="canonical" href="https://submit.diyaccounting.co.uk/${article.file}" />`);
      expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />');
      expect(html).toContain('href="mtd-calendar.html"');
      expect(
        filingFiles.some((file) => html.includes(`href="${file}"`)),
        article.file,
      ).toBe(true);
    }
  });

  test("each source an article names exists, and its page shows the quote and the link", () => {
    for (const article of articles) {
      const html = read(join("web/public", article.file)).replace(/\s+/g, " ");
      for (const name of article.section.flatMap((section) => section.sources ?? [])) {
        const source = sources.find((candidate) => candidate.name === name);
        expect(source, name).toBeDefined();
        expect(html, name).toContain(source.url);
        if (!source.table) expect(html, name).toContain(source.quote);
      }
    }
  });

  test("an article that names a filing that is not production says its filing awaits HMRC recognition", () => {
    for (const article of articles) {
      const html = read(join("web/public", article.file));
      for (const section of article.section) {
        for (const { activity } of section.status ?? []) {
          if (!isProductionOnProd(catalog, activity)) expect(html, activity).toContain("awaits HMRC recognition");
        }
      }
    }
  });

  test("each article is in the sitemap, in the lighthouse configuration and linked from the calendar", () => {
    const sitemap = read("web/public/sitemap.xml");
    const lighthouse = read("lighthouse.config.json");
    const calendar = read("web/public/mtd-calendar.html");
    for (const article of articles) {
      expect(sitemap, article.file).toContain(`<loc>https://submit.diyaccounting.co.uk/${article.file}</loc>`);
      expect(lighthouse, article.file).toContain(`"path": "/${article.file}"`);
      expect(calendar, article.file).toContain(`href="${article.file}"`);
    }
  });
});

describe("comparison pages", () => {
  const comparisons = loadComparisons();
  const tools = loadTools();

  test("each committed comparison page equals what the build script renders", async () => {
    const rendered = await renderComparisonPages();
    expect([...rendered.keys()]).toEqual(comparisons.map((comparison) => comparison.file));
    for (const [file, html] of rendered) expect(read(join("web/public", file))).toBe(html);
  });

  test("each tool that is not ours has a price in its own words, a price page, a date and a list", () => {
    for (const tool of tools.filter((candidate) => !candidate.ours)) {
      expect(tool.price_text, tool.name).toBeTruthy();
      expect(tool.price_url, tool.name).toMatch(/^https:\/\//);
      expect(tool.price_read, tool.name).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isInteger(tool.price_pence), tool.name).toBe(true);
      expect(["year", "month", "filing"], tool.name).toContain(tool.price_period);
      expect(tool.lists, tool.name).toBeTruthy();
    }
  });

  test("our row carries no typed price and takes the catalogue's default price", () => {
    for (const comparison of comparisons) {
      const ours = tools.find((tool) => tool.compares === comparison.compares && tool.ours);
      expect(ours.price_pence).toBeUndefined();
      const bundle = catalog.bundles.find((candidate) => candidate.id === ours.bundle);
      const row = comparisonTools(comparison, tools, catalog).find((tool) => tool.ours);
      expect(row.price_text).toBe(bundlePriceText(bundle).split(" or ")[0]);
      expect(row.price_pence).toBe(999);
    }
  });

  test("each table lists five to twelve other tools, sorted by the price for one year", () => {
    for (const comparison of comparisons) {
      const rows = comparisonTools(comparison, tools, catalog);
      const vendors = rows.filter((row) => !row.ours);
      expect(vendors.length).toBeGreaterThanOrEqual(5);
      expect(vendors.length).toBeLessThanOrEqual(12);
      const years = rows.map((row) => yearPence(row, comparison.filings_per_year));
      expect(years).toEqual([...years].sort((a, b) => a - b));
      const html = read(join("web/public", comparison.file));
      const table = html.slice(html.indexOf("<tbody>"));
      const order = rows.map((row) => table.indexOf(`>${row.name}</a>`));
      expect(order).toEqual([...order].sort((a, b) => a - b));
      expect(order.every((position) => position >= 0)).toBe(true);
    }
  });

  test("a monthly price counts twelve times and a price for each filing counts the filings of a year", () => {
    expect(yearPence({ name: "a", price_pence: 500, price_period: "month" }, 4)).toBe(6000);
    expect(yearPence({ name: "a", price_pence: 500, price_period: "filing" }, 4)).toBe(2000);
    expect(() => yearPence({ name: "a", price_pence: 1, price_period: "week" }, 4)).toThrow(/unknown price_period/);
  });

  test("each page names its source list, shows every price page link and marks our row", () => {
    for (const comparison of comparisons) {
      const html = read(join("web/public", comparison.file));
      expect(html.match(/<h1>/g), comparison.file).toHaveLength(1);
      expect(html).toContain(comparison.list_url);
      expect(html).toContain("<strong>(our own product)</strong>");
      expect(html).toContain('<div class="table-scroll">');
      expect(html).toContain("The vendor's own page is the authority");
      for (const tool of tools.filter((candidate) => candidate.compares === comparison.compares && !candidate.ours)) {
        expect(html, tool.name).toContain(`href="${tool.price_url}"`);
        expect(html, tool.name).toContain(tool.price_text);
      }
    }
  });

  test("each comparison is in the sitemap, in the lighthouse configuration and linked from a filing page", () => {
    const sitemap = read("web/public/sitemap.xml");
    const lighthouse = read("lighthouse.config.json");
    for (const comparison of comparisons) {
      expect(sitemap, comparison.file).toContain(`<loc>https://submit.diyaccounting.co.uk/${comparison.file}</loc>`);
      expect(lighthouse, comparison.file).toContain(`"path": "/${comparison.file}"`);
      const linkedFrom = pages.filter((page) => page.compared_in === comparison.file);
      expect(linkedFrom.length, comparison.file).toBeGreaterThan(0);
      for (const page of linkedFrom) expect(read(join("web/public", page.file)), page.file).toContain(`href="${comparison.file}"`);
    }
  });
});
