// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseSitemapPaths,
  urlConfigsFromSitemap,
  resolveThresholds,
  slugForPath,
  scoresFromLhr,
  evaluateGates,
} from "../../../scripts/lighthouse-multi.js";

describe("lighthouse-multi", () => {
  test("parseSitemapPaths reads every <loc> pathname in document order", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://submit.diyaccounting.co.uk/</loc></url>
  <url><loc>https://submit.diyaccounting.co.uk/about.html</loc></url>
</urlset>`;
    expect(parseSitemapPaths(xml)).toEqual(["/", "/about.html"]);
  });

  test("urlConfigsFromSitemap carries over a config override for a sitemap path", () => {
    const configuredUrls = [{ path: "/about.html", thresholds: { performance: 67 } }];
    expect(urlConfigsFromSitemap(["/", "/about.html"], configuredUrls)).toEqual([
      { path: "/" },
      { path: "/about.html", thresholds: { performance: 67 } },
    ]);
  });

  test("urlConfigsFromSitemap drops a config entry whose path left the sitemap", () => {
    const configuredUrls = [
      { path: "/", thresholds: { performance: 50 } },
      { path: "/removed.html", thresholds: { performance: 40 } },
    ];
    expect(urlConfigsFromSitemap(["/"], configuredUrls)).toEqual([{ path: "/", thresholds: { performance: 50 } }]);
  });

  test("urlConfigsFromSitemap defaults a sitemap path with no config entry", () => {
    expect(urlConfigsFromSitemap(["/new-page.html"], [])).toEqual([{ path: "/new-page.html" }]);
  });

  test("resolveThresholds merges a URL's overrides onto the defaults", () => {
    const defaults = { performance: 80, accessibility: 95, seo: 95, bestPractices: 95 };
    expect(resolveThresholds(defaults, { thresholds: { performance: 67 } })).toEqual({
      performance: 67,
      accessibility: 95,
      seo: 95,
      bestPractices: 95,
    });
  });

  test("resolveThresholds falls back to the defaults with no override", () => {
    const defaults = { performance: 80, accessibility: 95, seo: 95, bestPractices: 95 };
    expect(resolveThresholds(defaults, {})).toEqual(defaults);
  });

  test("slugForPath turns the sitemap root into 'index' and strips .html", () => {
    expect(slugForPath("/")).toBe("index");
    expect(slugForPath("/about.html")).toBe("about");
    expect(slugForPath("/hmrc/vat/submitVat.html")).toBe("hmrc-vat-submitVat");
  });

  test("scoresFromLhr reads each category score as a 0-100 integer", () => {
    const lhr = {
      categories: {
        "performance": { score: 0.674 },
        "accessibility": { score: 1 },
        "seo": { score: 0.955 },
        "best-practices": { score: 0.92 },
      },
    };
    expect(scoresFromLhr(lhr)).toEqual({ performance: 67, accessibility: 100, seo: 96, bestPractices: 92 });
  });

  test("scoresFromLhr treats a missing category as zero", () => {
    expect(scoresFromLhr({ categories: {} })).toEqual({ performance: 0, accessibility: 0, seo: 0, bestPractices: 0 });
  });

  test("evaluateGates lists every category below its threshold", () => {
    const scores = { performance: 67, accessibility: 100, seo: 100, bestPractices: 92 };
    const thresholds = { performance: 80, accessibility: 95, seo: 95, bestPractices: 95 };
    expect(evaluateGates(scores, thresholds)).toEqual([
      { category: "performance", score: 67, threshold: 80 },
      { category: "bestPractices", score: 92, threshold: 95 },
    ]);
  });

  test("evaluateGates returns an empty array when every category meets its threshold", () => {
    const scores = { performance: 80, accessibility: 95, seo: 95, bestPractices: 95 };
    expect(evaluateGates(scores, scores)).toEqual([]);
  });
});

describe("lighthouse.config.json coverage", () => {
  test("configured paths equal the sitemap paths", () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
    const config = JSON.parse(readFileSync(join(root, "lighthouse.config.json"), "utf8"));
    const sitemapPaths = parseSitemapPaths(readFileSync(join(root, "web/public/sitemap.xml"), "utf8"));
    expect(config.urls.map((url) => url.path).sort()).toEqual([...sitemapPaths].sort());
  });
});
