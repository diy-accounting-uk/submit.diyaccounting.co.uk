// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/bingWebmasterReport.test.js
//
// The fixtures in app/unit-tests/fixtures/bing/ were written from the response samples in Bing's
// documentation. No live call was possible, so they show the documented shape, not recorded answers.

import { describe, test, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

import {
  API_BASE,
  KEY_VARIABLE,
  parseArgs,
  buildRequestUrl,
  callBing,
  parseBingDate,
  shapeStatRows,
  shapeTraffic,
  shapeCrawl,
  shapeIssues,
  shapeFeeds,
  shapeSettings,
  shapeUrlInfo,
  shapeSites,
  reportSite,
  renderSiteReport,
  main,
} from "../../../infra/bing/webmaster-report.js";

const fixtureText = (name) => fs.readFileSync(path.join(import.meta.dirname, "..", "fixtures", "bing", name), "utf-8");
const fixture = (name) => JSON.parse(fixtureText(name));
const KEY = "dummy-key";

function respond(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, text: async () => (typeof body === "string" ? body : JSON.stringify(body)) };
}

const BY_METHOD = {
  GetUserSites: "get-user-sites.json",
  GetQueryStats: "get-query-stats.json",
  GetPageStats: "get-page-stats.json",
  GetRankAndTrafficStats: "get-rank-and-traffic-stats.json",
  GetCrawlStats: "get-crawl-stats.json",
  GetCrawlIssues: "get-crawl-issues.json",
  GetFeeds: "get-feeds.json",
  GetCrawlSettings: "get-crawl-settings.json",
  GetUrlInfo: "get-url-info.json",
};

function fixtureFetch() {
  return vi.fn(async (url) => {
    const method = new URL(url).pathname.split("/").pop();
    return respond(fixture(BY_METHOD[method]));
  });
}

describe("parseArgs", () => {
  test("reads sites, url-info, json and out", () => {
    expect(parseArgs(["--site", "https://example.test/", "--url-info", "3", "--json", "--out", "x.json"])).toEqual({
      sites: ["https://example.test/"],
      urlInfo: 3,
      json: true,
      out: "x.json",
    });
  });
  test("rejects an unknown argument and a bad number", () => {
    expect(() => parseArgs(["--nope"])).toThrow("Unknown argument");
    expect(() => parseArgs(["--url-info", "-1"])).toThrow("--url-info");
  });
});

describe("request and response", () => {
  test("the request URL is the JSON endpoint with the parameters and the key", () => {
    const url = new URL(buildRequestUrl("GetQueryStats", { siteUrl: "https://example.test/" }, KEY));
    expect(`${url.origin}${url.pathname}`).toBe(`${API_BASE}/GetQueryStats`);
    expect(url.searchParams.get("siteUrl")).toBe("https://example.test/");
    expect(url.searchParams.get("apikey")).toBe(KEY);
  });

  test("callBing unwraps the d property", async () => {
    const rows = await callBing("GetFeeds", { siteUrl: "x" }, { apiKey: KEY, fetchImpl: async () => respond(fixture("get-feeds.json")) });
    expect(rows).toHaveLength(1);
    expect(rows[0].Url).toBe("http://example.com/sitemap.xml");
  });

  test("an error answer names the method and Bing's message, never the key or the URL", async () => {
    const fetchImpl = async () => respond(fixture("error-invalid-api-key.json"), 400);
    const error = await callBing("GetUserSites", {}, { apiKey: KEY, fetchImpl }).catch((e) => e);
    expect(error.message).toBe("Bing Webmaster API GetUserSites: status 400, InvalidApiKey (error code 3)");
    expect(error.message).not.toContain(KEY);
  });

  test("a network failure and a non-JSON body give messages without the key", async () => {
    const failing = await callBing(
      "GetFeeds",
      {},
      {
        apiKey: KEY,
        fetchImpl: async () => {
          throw new Error(`fetch failed for ${KEY}`);
        },
      },
    ).catch((e) => e);
    expect(failing.message).toBe("Bing Webmaster API GetFeeds: the request failed");
    const html = await callBing("GetFeeds", {}, { apiKey: KEY, fetchImpl: async () => respond("<html>", 200) }).catch((e) => e);
    expect(html.message).toContain("not JSON");
    expect(html.message).not.toContain(KEY);
  });
});

describe("shapes", () => {
  test("parseBingDate reads the documented /Date()/ form", () => {
    expect(parseBingDate("/Date(1316156400000-0700)/")).toBe("2011-09-16");
    expect(parseBingDate("nonsense")).toBeNull();
    expect(parseBingDate(undefined)).toBeNull();
  });

  test("shapeStatRows sums per key, weights the position and sorts by impressions", () => {
    const rows = shapeStatRows(fixture("get-query-stats.json").d);
    expect(rows).toEqual([
      { key: "vat return software", clicks: 4, impressions: 200, ctrPercent: 2, position: 15 },
      { key: "mtd bridging", clicks: 2, impressions: 10, ctrPercent: 20, position: 4 },
    ]);
  });

  test("page rows put the most impressions first", () => {
    expect(shapeStatRows(fixture("get-page-stats.json").d).map((row) => row.key)).toEqual([
      "https://example.test/guide.html",
      "https://example.test/",
    ]);
  });

  test("shapeTraffic is oldest first", () => {
    expect(shapeTraffic(fixture("get-rank-and-traffic-stats.json").d)).toEqual([
      { date: "2011-09-16", clicks: 4, impressions: 60 },
      { date: "2011-09-23", clicks: 15, impressions: 100 },
    ]);
  });

  test("shapeCrawl sums the counters and keeps the dated rows", () => {
    const crawl = shapeCrawl(fixture("get-crawl-stats.json").d);
    expect(crawl.rows).toBe(2);
    expect(crawl.totals.code2xx).toBe(10008);
    expect(crawl.totals.code4xx).toBe(7);
    expect(crawl.totals.blockedByRobotsTxt).toBe(3);
    expect(crawl.latest.map((day) => day.date)).toEqual(["2011-09-16", "2011-09-17"]);
  });

  test("shapeIssues, shapeFeeds, shapeSettings, shapeUrlInfo and shapeSites map the documented fields", () => {
    expect(shapeIssues(fixture("get-crawl-issues.json").d)).toEqual([
      { url: "http://example.com/url1.htm", httpCode: 200, issueFlags: 32, inLinks: 10 },
    ]);
    expect(shapeFeeds(fixture("get-feeds.json").d)[0]).toMatchObject({
      type: "Sitemap",
      status: "Success",
      urlCount: 1023,
      submitted: "2011-09-16",
      lastCrawled: "2011-09-11",
    });
    expect(shapeSettings(fixture("get-crawl-settings.json").d)).toEqual({ ajaxEnabled: true, crawlRate: Array(24).fill(5) });
    expect(shapeUrlInfo("example.com", fixture("get-url-info.json").d)).toMatchObject({
      anchorCount: 50,
      discoveryDate: "2011-09-06",
      lastCrawledDate: "2011-09-16",
    });
    expect(shapeSites(fixture("get-user-sites.json").d)).toEqual([
      { url: "https://example.test/", verified: true },
      { url: "https://other.test/", verified: false },
    ]);
  });

  test("shapes accept empty answers", () => {
    expect(shapeStatRows(undefined)).toEqual([]);
    expect(shapeCrawl(undefined).rows).toBe(0);
    expect(shapeSettings(undefined)).toEqual({ ajaxEnabled: null, crawlRate: null });
  });
});

describe("reportSite and main", () => {
  test("reportSite reads every section and URL information for the top pages", async () => {
    const fetchImpl = fixtureFetch();
    const report = await reportSite("https://example.test/", { apiKey: KEY, fetchImpl }, 1);
    expect(Object.keys(report)).toEqual([
      "siteUrl",
      "queries",
      "pages",
      "traffic",
      "crawl",
      "issues",
      "feeds",
      "settings",
      "urlInfo",
      "errors",
    ]);
    expect(report.errors).toEqual({});
    expect(report.urlInfo).toHaveLength(1);
    expect(report.urlInfo[0].url).toBe("https://example.test/guide.html");
    const methods = fetchImpl.mock.calls.map(([url]) => new URL(url).pathname.split("/").pop());
    expect(methods.every((method) => method.startsWith("Get"))).toBe(true);
  });

  test("a failing method is recorded under errors and the others still read", async () => {
    const fetchImpl = vi.fn(async (url) => {
      const method = new URL(url).pathname.split("/").pop();
      return method === "GetCrawlIssues" ? respond(fixture("error-invalid-api-key.json"), 400) : respond(fixture(BY_METHOD[method]));
    });
    const report = await reportSite("https://example.test/", { apiKey: KEY, fetchImpl }, 0);
    expect(report.issues).toBeNull();
    expect(report.errors.issues).toContain("InvalidApiKey");
    expect(report.feeds).toHaveLength(1);
    expect(renderSiteReport(report).join("\n")).toContain("error in issues");
  });

  test("with no key main names the variable and calls nothing", async () => {
    const fetchImpl = vi.fn();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const previous = process.exitCode;
    const output = await main([], {}, fetchImpl);
    process.exitCode = previous;
    expect(output).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(expect.stringContaining(KEY_VARIABLE));
    error.mockRestore();
  });

  test("main reports the verified sites only and writes the file", async () => {
    const out = path.join(import.meta.dirname, "..", "..", "..", "target", "bing-report-test.json");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const output = await main(["--out", out, "--url-info", "0"], { [KEY_VARIABLE]: KEY }, fixtureFetch());
    log.mockRestore();
    expect(output.reports.map((report) => report.siteUrl)).toEqual(["https://example.test/"]);
    expect(output.sites).toHaveLength(2);
    const written = fs.readFileSync(out, "utf-8");
    expect(JSON.parse(written).reports).toHaveLength(1);
    expect(written).not.toContain(KEY);
    fs.rmSync(out);
  });
});
