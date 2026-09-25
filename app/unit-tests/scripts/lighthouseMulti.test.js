// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect } from "vitest";
import {
  parseSitemapPaths,
  findDriftingPaths,
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

  test("findDriftingPaths names sitemap paths the config does not cover", () => {
    expect(findDriftingPaths(["/", "/about.html", "/new-page.html"], ["/", "/about.html"])).toEqual(["/new-page.html"]);
  });

  test("findDriftingPaths returns an empty array when the config covers every sitemap path", () => {
    expect(findDriftingPaths(["/", "/about.html"], ["/", "/about.html", "/extra.html"])).toEqual([]);
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
