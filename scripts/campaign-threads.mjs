#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability DEV-58 Search community threads for the campaign skill
// - **Use when:** /campaign needs the last seven days of questions from UK Business Forums.
// - **Does:** campaign-threads.mjs reads the UK Business Forums RSS feed and keeps the threads from the last days it is given. It reads only: it never posts, comments, votes or messages. It sends a site User-Agent, waits for the rate-limit headers, and reports a forum that answers with a browser challenge as skipped, with no retry.
// - **Run:** `node scripts/campaign-threads.mjs --days 7`; `--fixture scripts/fixtures/campaign-threads` reads a recorded feed
// - **Entry:** `scripts/campaign-threads.mjs:searchThreads`
// - **Files:** scripts/campaign-threads.mjs, scripts/fixtures/campaign-threads/ukbf-forum.rss, app/unit-tests/scripts/campaignThreads.test.js, .claude/skills/campaign/SKILL.md
// - **Keywords:** campaign threads, uk business forums, rss, thread discovery, read only, rate limit
// - **Related:** DEV-57
// @end-capability

// scripts/campaign-threads.mjs
//
//   node scripts/campaign-threads.mjs [--days 7] [--out file.json]
//   node scripts/campaign-threads.mjs --fixture scripts/fixtures/campaign-threads

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const UKBF_FEED_URL = "https://www.ukbusinessforums.co.uk/forums/index.rss";

export const SITE_USER_AGENT = "server:diyaccounting-campaign:1.0 (+https://submit.diyaccounting.co.uk)";
const MIN_GAP_MS = 1100;

export function parseArgs(argv) {
  const args = { days: 7, fixture: null, out: null };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === "--days") args.days = Number(value);
    else if (flag === "--fixture") args.fixture = value;
    else if (flag === "--out") args.out = value;
    else continue;
    i++;
  }
  if (!Number.isFinite(args.days) || args.days <= 0) throw new Error("--days must be a positive number");
  return args;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** One request at a time; waits for the reset when the server reports no requests left. */
export function createPoliteFetch({ fetchImpl = fetch, sleepImpl = sleep, minGapMs = MIN_GAP_MS } = {}) {
  let last = 0;
  return async function politeFetch(url, options = {}) {
    const wait = last + minGapMs - Date.now();
    if (wait > 0) await sleepImpl(wait);
    const response = await fetchImpl(url, { ...options, headers: options.headers });
    last = Date.now();
    const remaining = Number(response.headers.get("x-ratelimit-remaining"));
    const reset = Number(response.headers.get("x-ratelimit-reset"));
    if (response.headers.get("x-ratelimit-remaining") !== null && remaining < 2 && reset > 0) {
      await sleepImpl(reset * 1000);
    }
    return response;
  };
}

function decodeXml(text) {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, "&");
}

function tag(item, name) {
  const match = item.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return match ? decodeXml(match[1]).trim() : "";
}

export function threadsFromRss(xml, { sinceEpoch }) {
  if (!/<rss[\s>]/.test(xml)) return null;
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
    .map(([, item]) => {
      const published = new Date(tag(item, "pubDate"));
      return {
        place: "uk business forums",
        id: `ukbf:${tag(item, "guid") || tag(item, "link")}`,
        title: tag(item, "title"),
        url: tag(item, "link"),
        created: Number.isNaN(published.getTime()) ? null : published.toISOString(),
        comments: 0,
        excerpt: tag(item, "description")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 300),
      };
    })
    .filter((thread) => thread.created && Date.parse(thread.created) / 1000 >= sinceEpoch);
}

function dedupe(threads) {
  const seen = new Map();
  for (const thread of threads) if (!seen.has(thread.id)) seen.set(thread.id, thread);
  return [...seen.values()].sort((a, b) => b.created.localeCompare(a.created));
}

/**
 * Reads forum threads from the last `days` days. `forumFeed()` returns the feed body, so tests run on
 * a recorded feed. Returns { threads, skipped } where skipped names a source that could not be read.
 */
export async function searchThreads({ days, forumFeed, now = Date.now() }) {
  const sinceEpoch = now / 1000 - days * 86400;
  const skipped = [];
  const feed = await forumFeed();
  const threads = feed === null ? null : threadsFromRss(feed, { sinceEpoch });
  if (threads === null) skipped.push("uk business forums: the feed answered a browser challenge or not a feed; not retried");
  return { threads: dedupe(threads ?? []), skipped };
}

function fixtureSources(dir) {
  return { forumFeed: async () => readFileSync(join(dir, "ukbf-forum.rss"), "utf8") };
}

export function liveSources({ politeFetch = createPoliteFetch() } = {}) {
  return {
    forumFeed: async () => {
      const response = await politeFetch(UKBF_FEED_URL, { headers: { "User-Agent": SITE_USER_AGENT, "Accept": "application/rss+xml" } });
      return response.ok ? response.text() : null;
    },
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sources = args.fixture ? fixtureSources(args.fixture) : liveSources();
  const result = await searchThreads({ ...args, ...sources });
  const json = JSON.stringify(result, null, 2);
  if (args.out) writeFileSync(args.out, json);
  else console.log(json);
  console.error(`${result.threads.length} threads in the last ${args.days} days; ${result.skipped.length} source(s) skipped`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
