#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability DEV-58 Search community threads for the campaign skill
// - **Use when:** /campaign needs the last seven days of questions from the subreddits it names and from UK Business Forums.
// - **Does:** campaign-threads.mjs reads Reddit search results for each subreddit and query through the Reddit API with an app-only token, and the UK Business Forums RSS feed. It reads only: it never posts, comments, votes or messages. The Reddit client id, secret and username come from the Secrets Manager secret prod/submit/reddit-campaign-app and the script stops with a clear message when it is absent. Requests run one at a time, wait for the rate-limit headers, and send a Reddit User-Agent that names the app and its Reddit username on Reddit calls and a site User-Agent on the forum call. A forum that answers with a browser challenge instead of the feed is reported as skipped and is not retried.
// - **Run:** `AWS_PROFILE=diya-submit-prod node scripts/campaign-threads.mjs --days 7`; `--fixture scripts/fixtures/campaign-threads` reads recorded responses with no credentials
// - **Entry:** `scripts/campaign-threads.mjs:searchThreads`
// - **Files:** scripts/campaign-threads.mjs, scripts/fixtures/campaign-threads/reddit-search.json, scripts/fixtures/campaign-threads/ukbf-forum.rss, app/unit-tests/scripts/campaignThreads.test.js, .claude/skills/campaign/SKILL.md
// - **Keywords:** campaign threads, reddit search, smallbusinessuk, uk business forums, rss, thread discovery, read only, rate limit
// - **Related:** DEV-57
// @end-capability

// scripts/campaign-threads.mjs
//
//   node scripts/campaign-threads.mjs [--days 7] [--subreddits a,b] [--queries "x,y"] [--out file.json]
//   node scripts/campaign-threads.mjs --fixture scripts/fixtures/campaign-threads

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const REDDIT_SECRET_ID = "prod/submit/reddit-campaign-app";
export const DEFAULT_SUBREDDITS = ["smallbusinessuk"];
export const DEFAULT_QUERIES = [
  "VAT return spreadsheet",
  "making tax digital VAT software",
  "bridging software",
  "file accounts without an accountant",
  "confirmation statement",
];
export const UKBF_FEED_URL = "https://www.ukbusinessforums.co.uk/forums/index.rss";

export const SITE_USER_AGENT = "server:diyaccounting-campaign:1.0 (+https://submit.diyaccounting.co.uk)";
const MIN_GAP_MS = 1100;

export class MissingRedditSecretError extends Error {
  constructor(secretId, cause) {
    super(
      `Reddit app credentials not found in Secrets Manager secret "${secretId}". Register the Reddit script app, then store {"clientId","clientSecret","username"} in that secret.`,
    );
    this.name = "MissingRedditSecretError";
    this.cause = cause;
  }
}

export function parseArgs(argv) {
  const args = { days: 7, subreddits: DEFAULT_SUBREDDITS, queries: DEFAULT_QUERIES, fixture: null, out: null };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === "--days") args.days = Number(value);
    else if (flag === "--subreddits")
      args.subreddits = value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    else if (flag === "--queries")
      args.queries = value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    else if (flag === "--fixture") args.fixture = value;
    else if (flag === "--out") args.out = value;
    else continue;
    i++;
  }
  if (!Number.isFinite(args.days) || args.days <= 0) throw new Error("--days must be a positive number");
  return args;
}

/** The Reddit User-Agent: platform:app ID:version (by /u/username). */
export function redditUserAgent(username) {
  return `server:diyaccounting-campaign:1.0 (by /u/${username})`;
}

/** Reads {clientId, clientSecret, username} from Secrets Manager; a missing secret raises MissingRedditSecretError. */
export async function readRedditSecret(secretId = REDDIT_SECRET_ID, send = sendToSecretsManager) {
  let response;
  try {
    response = await send(secretId);
  } catch (error) {
    if (error.name === "ResourceNotFoundException") throw new MissingRedditSecretError(secretId, error);
    throw error;
  }
  const parsed = JSON.parse(response.SecretString || "{}");
  if (!parsed.clientId || !parsed.clientSecret || !parsed.username) throw new MissingRedditSecretError(secretId);
  return parsed;
}

async function sendToSecretsManager(secretId) {
  const { SecretsManagerClient, GetSecretValueCommand } = await import("@aws-sdk/client-secrets-manager");
  const client = new SecretsManagerClient({ region: process.env.AWS_REGION || "eu-west-2" });
  return client.send(new GetSecretValueCommand({ SecretId: secretId }));
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

async function redditToken(politeFetch, { clientId, clientSecret, username }) {
  const response = await politeFetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      "User-Agent": redditUserAgent(username),
      "Authorization": `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!response.ok) throw new Error(`Reddit token request answered ${response.status}`);
  const body = await response.json();
  if (!body.access_token) throw new Error("Reddit token response has no access_token");
  return body.access_token;
}

export function threadsFromRedditListing(listing, { subreddit, sinceEpoch }) {
  const children = listing?.data?.children ?? [];
  return children
    .map((child) => child.data)
    .filter((post) => post && post.created_utc >= sinceEpoch)
    .map((post) => ({
      place: `reddit r/${subreddit}`,
      id: `reddit:${post.id}`,
      title: post.title,
      url: `https://www.reddit.com${post.permalink}`,
      created: new Date(post.created_utc * 1000).toISOString(),
      comments: post.num_comments ?? 0,
      excerpt: String(post.selftext || "").slice(0, 300),
    }));
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
 * Reads threads from the last `days` days. Sources are injectable so tests run on recorded
 * responses: `redditListing(subreddit, query)` returns a Reddit listing, `forumFeed()` returns the
 * feed body. Returns { threads, skipped } where skipped names a source that could not be read.
 */
export async function searchThreads({ days, subreddits, queries, redditListing, forumFeed, now = Date.now() }) {
  const sinceEpoch = now / 1000 - days * 86400;
  const threads = [];
  const skipped = [];
  for (const subreddit of subreddits) {
    for (const query of queries) {
      const listing = await redditListing(subreddit, query);
      threads.push(...threadsFromRedditListing(listing, { subreddit, sinceEpoch }));
    }
  }
  const feed = await forumFeed();
  const forumThreads = feed === null ? null : threadsFromRss(feed, { sinceEpoch });
  if (forumThreads === null) skipped.push("uk business forums: the feed answered a browser challenge or not a feed; not retried");
  else threads.push(...forumThreads);
  return { threads: dedupe(threads), skipped };
}

function fixtureSources(dir) {
  return {
    redditListing: async () => JSON.parse(readFileSync(join(dir, "reddit-search.json"), "utf8")),
    forumFeed: async () => readFileSync(join(dir, "ukbf-forum.rss"), "utf8"),
  };
}

export async function liveSources({ politeFetch = createPoliteFetch(), secretReader = readRedditSecret } = {}) {
  const credentials = await secretReader();
  const userAgent = redditUserAgent(credentials.username);
  const token = await redditToken(politeFetch, credentials);
  return {
    redditListing: async (subreddit, query) => {
      const params = new URLSearchParams({ q: query, restrict_sr: "1", sort: "new", t: "week", limit: "25", raw_json: "1" });
      const response = await politeFetch(`https://oauth.reddit.com/r/${encodeURIComponent(subreddit)}/search?${params}`, {
        headers: { "User-Agent": userAgent, "Authorization": `Bearer ${token}` },
      });
      if (!response.ok) throw new Error(`Reddit search r/${subreddit} answered ${response.status}`);
      return response.json();
    },
    forumFeed: async () => {
      const response = await politeFetch(UKBF_FEED_URL, { headers: { "User-Agent": SITE_USER_AGENT, "Accept": "application/rss+xml" } });
      return response.ok ? response.text() : null;
    },
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let sources;
  try {
    sources = args.fixture ? fixtureSources(args.fixture) : await liveSources();
  } catch (error) {
    if (error instanceof MissingRedditSecretError) {
      console.error(error.message);
      process.exit(2);
    }
    throw error;
  }
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
