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
  loadPages,
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
