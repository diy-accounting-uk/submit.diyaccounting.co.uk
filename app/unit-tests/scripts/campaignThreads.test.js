// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/campaignThreads.test.js

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  searchThreads,
  parseArgs,
  createPoliteFetch,
  readRedditSecret,
  redditUserAgent,
  SITE_USER_AGENT,
  UKBF_FEED_URL,
  MissingRedditSecretError,
  threadsFromRss,
  DEFAULT_SUBREDDITS,
} from "../../../scripts/campaign-threads.mjs";

const fixtureDir = "scripts/fixtures/campaign-threads";
const redditListing = JSON.parse(readFileSync(`${fixtureDir}/reddit-search.json`, "utf8"));
const forumFeed = readFileSync(`${fixtureDir}/ukbf-forum.rss`, "utf8");
const now = Date.parse("2026-11-04T00:00:00Z");

describe("campaign-threads", () => {
  it("keeps threads from the last 7 days across Reddit and the forum, newest first", async () => {
    const result = await searchThreads({
      days: 7,
      subreddits: ["smallbusinessuk"],
      queries: ["vat"],
      redditListing: async () => redditListing,
      forumFeed: async () => forumFeed,
      now,
    });
    expect(result.skipped).toEqual([]);
    expect(result.threads.map((t) => t.title)).toEqual([
      "MTD for VAT & spreadsheets",
      "Cheapest way to send a VAT return from a spreadsheet?",
      "Confirmation statement without an accountant",
    ]);
    expect(result.threads[1].url).toBe(
      "https://www.reddit.com/r/smallbusinessuk/comments/1abc01/cheapest_way_to_send_a_vat_return_from_a/",
    );
    expect(result.threads[0].excerpt).toBe("Can I keep using Excel for my VAT return?");
  });

  it("lists a thread once when two queries return it", async () => {
    const result = await searchThreads({
      days: 7,
      subreddits: ["smallbusinessuk"],
      queries: ["a", "b"],
      redditListing: async () => redditListing,
      forumFeed: async () => forumFeed,
      now,
    });
    expect(result.threads.filter((t) => t.id === "reddit:1abc01")).toHaveLength(1);
  });

  it("skips the forum when it answers a challenge page instead of the feed", async () => {
    const result = await searchThreads({
      days: 7,
      subreddits: ["smallbusinessuk"],
      queries: ["vat"],
      redditListing: async () => redditListing,
      forumFeed: async () => "<!DOCTYPE html><title>Checking your browser</title>",
      now,
    });
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]).toContain("uk business forums");
    expect(result.threads).toHaveLength(2);
  });

  it("skips the forum when the feed request fails", async () => {
    const result = await searchThreads({
      days: 7,
      subreddits: [],
      queries: [],
      redditListing: async () => redditListing,
      forumFeed: async () => null,
      now,
    });
    expect(result.skipped).toHaveLength(1);
  });

  it("returns null for text that is not an RSS feed", () => {
    expect(threadsFromRss("<html></html>", { sinceEpoch: 0 })).toBeNull();
  });

  it("parses days, subreddits and the fixture directory", () => {
    expect(parseArgs([]).subreddits).toEqual(DEFAULT_SUBREDDITS);
    const args = parseArgs(["--days", "3", "--subreddits", "a, b", "--fixture", "dir"]);
    expect(args).toMatchObject({ days: 3, subreddits: ["a", "b"], fixture: "dir" });
    expect(() => parseArgs(["--days", "0"])).toThrow(/positive/);
  });

  it("builds the Reddit User-Agent from the username", () => {
    expect(redditUserAgent("diya_user")).toBe("server:diyaccounting-campaign:1.0 (by /u/diya_user)");
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

  it("fails with a clear message when the Reddit secret is absent", async () => {
    const absent = async () => {
      throw Object.assign(new Error("not found"), { name: "ResourceNotFoundException" });
    };
    await expect(readRedditSecret("prod/submit/reddit-campaign-app", absent)).rejects.toThrow(MissingRedditSecretError);
    await expect(readRedditSecret("prod/submit/reddit-campaign-app", absent)).rejects.toThrow(
      /Secrets Manager secret "prod\/submit\/reddit-campaign-app"/,
    );
  });

  it("fails with the same message when the secret lacks the client id or secret", async () => {
    const empty = async () => ({ SecretString: JSON.stringify({ clientId: "x" }) });
    await expect(readRedditSecret("s", empty)).rejects.toThrow(MissingRedditSecretError);
  });

  it("raises MissingRedditSecretError when the secret has no username and names all three fields", async () => {
    const noUsername = async () => ({ SecretString: JSON.stringify({ clientId: "id", clientSecret: "sec" }) });
    await expect(readRedditSecret("s", noUsername)).rejects.toThrow(MissingRedditSecretError);
    await expect(readRedditSecret("s", noUsername)).rejects.toThrow(/\{"clientId","clientSecret","username"\}/);
  });

  it("returns the credentials when the secret holds all three fields", async () => {
    const ok = async () => ({ SecretString: JSON.stringify({ clientId: "id", clientSecret: "sec", username: "diya_user" }) });
    await expect(readRedditSecret("s", ok)).resolves.toEqual({ clientId: "id", clientSecret: "sec", username: "diya_user" });
  });

  it("sends the Reddit User-Agent on Reddit calls and the site User-Agent on the forum call", async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ url: String(url), userAgent: options.headers["User-Agent"] });
      const body = String(url).includes("access_token") ? { access_token: "t" } : redditListing;
      return {
        ok: true,
        headers: new Headers(),
        json: async () => body,
        text: async () => forumFeed,
      };
    };
    const { liveSources } = await import("../../../scripts/campaign-threads.mjs");
    const sources = await liveSources({
      politeFetch: createPoliteFetch({ fetchImpl, sleepImpl: async () => {}, minGapMs: 0 }),
      secretReader: async () => ({ clientId: "id", clientSecret: "sec", username: "diya_user" }),
    });
    await sources.redditListing("smallbusinessuk", "vat");
    await sources.forumFeed();
    const redditUa = "server:diyaccounting-campaign:1.0 (by /u/diya_user)";
    expect(calls.filter((c) => c.url.includes("reddit.com")).map((c) => c.userAgent)).toEqual([redditUa, redditUa]);
    expect(calls.find((c) => c.url === UKBF_FEED_URL).userAgent).toBe(SITE_USER_AGENT);
    expect(SITE_USER_AGENT).toBe("server:diyaccounting-campaign:1.0 (+https://submit.diyaccounting.co.uk)");
  });
});
