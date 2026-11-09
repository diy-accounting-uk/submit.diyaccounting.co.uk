// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/campaignThreads.test.js

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  searchThreads,
  parseArgs,
  createPoliteFetch,
  liveSources,
  SITE_USER_AGENT,
  UKBF_FEED_URL,
  threadsFromRss,
} from "../../../scripts/campaign-threads.mjs";

const fixtureDir = "scripts/fixtures/campaign-threads";
const forumFeed = readFileSync(`${fixtureDir}/ukbf-forum.rss`, "utf8");
const now = Date.parse("2026-11-04T00:00:00Z");

describe("campaign-threads", () => {
  it("keeps only the forum threads from the last 7 days", async () => {
    const result = await searchThreads({ days: 7, forumFeed: async () => forumFeed, now });
    expect(result.skipped).toEqual([]);
    expect(result.threads.map((t) => t.title)).toEqual(["MTD for VAT & spreadsheets"]);
    expect(result.threads[0].excerpt).toBe("Can I keep using Excel for my VAT return?");
  });

  it("skips the forum when it answers a challenge page instead of the feed", async () => {
    const result = await searchThreads({ days: 7, forumFeed: async () => "<!DOCTYPE html><title>Checking your browser</title>", now });
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]).toContain("uk business forums");
    expect(result.threads).toEqual([]);
  });

  it("skips the forum when the feed request fails", async () => {
    const result = await searchThreads({ days: 7, forumFeed: async () => null, now });
    expect(result.skipped).toHaveLength(1);
  });

  it("returns null for text that is not an RSS feed", () => {
    expect(threadsFromRss("<html></html>", { sinceEpoch: 0 })).toBeNull();
  });

  it("parses days and the fixture directory", () => {
    expect(parseArgs(["--days", "3", "--fixture", "dir"])).toMatchObject({ days: 3, fixture: "dir" });
    expect(() => parseArgs(["--days", "0"])).toThrow(/positive/);
  });

  it("passes request headers through and makes one request at a time", async () => {
    const seen = [];
    const sleeps = [];
    const politeFetch = createPoliteFetch({
      fetchImpl: async (url, options) => {
        seen.push(options);
        return { headers: new Headers() };
      },
      sleepImpl: async (ms) => sleeps.push(ms),
      minGapMs: 50,
    });
    await politeFetch("https://example.test/a", { headers: { "User-Agent": "x" } });
    await politeFetch("https://example.test/b");
    expect(seen[0].headers["User-Agent"]).toBe("x");
    expect(sleeps.length).toBeGreaterThan(0);
  });

  it("waits for the reset when the server reports no requests left", async () => {
    const sleeps = [];
    const politeFetch = createPoliteFetch({
      fetchImpl: async () => ({ headers: new Headers({ "x-ratelimit-remaining": "0", "x-ratelimit-reset": "30" }) }),
      sleepImpl: async (ms) => sleeps.push(ms),
      minGapMs: 0,
    });
    await politeFetch("https://example.test/a");
    expect(sleeps).toContain(30000);
  });

  it("sends the site User-Agent on the forum call", async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ url: String(url), userAgent: options.headers["User-Agent"] });
      return { ok: true, headers: new Headers(), text: async () => forumFeed };
    };
    const sources = liveSources({ politeFetch: createPoliteFetch({ fetchImpl, sleepImpl: async () => {}, minGapMs: 0 }) });
    await sources.forumFeed();
    expect(calls).toEqual([{ url: UKBF_FEED_URL, userAgent: SITE_USER_AGENT }]);
  });
});
