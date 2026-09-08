// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/functions/analytics/operatorEffortPull.js
//
// Nightly job that pulls one UTC day of GitHub Actions runs (by trigger and actor), repo-wide
// issue timeline events (by actor) and commits (by author) through the REST API, using the
// issue-bot token, and writes them as newline-delimited JSON under the lake's
// curated/operator/ prefixes. Backs v_operator_interventions_daily, the operator-effort
// objective's headline view.
//
// A commit's author account is the operator's own GitHub login whether a Claude Code session
// wrote it or not, so "who wrote this" is read from the commit message's own co-author
// trailer, not from author identity: has_claude_coauthor is true only when the message carries
// a "Co-Authored-By: Claude" line.

import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { createLogger } from "../../lib/logger.js";

const logger = createLogger({ source: "app/functions/analytics/operatorEffortPull.js" });

const CLAUDE_COAUTHOR_RE = /Co-Authored-By:\s*Claude/i;

let cachedSmClient = null;
let cachedS3Client = null;
let cachedGitHubToken = null;

function getSmClient() {
  if (!cachedSmClient) {
    cachedSmClient = new SecretsManagerClient({ region: process.env.AWS_REGION || "eu-west-2" });
  }
  return cachedSmClient;
}

function getS3Client() {
  if (!cachedS3Client) {
    cachedS3Client = new S3Client({ region: process.env.AWS_REGION || "eu-west-2" });
  }
  return cachedS3Client;
}

async function resolveGitHubToken() {
  if (cachedGitHubToken) return cachedGitHubToken;

  const arn = process.env.GITHUB_TOKEN_SECRET_ARN;
  if (!arn) throw new Error("GITHUB_TOKEN_SECRET_ARN environment variable is required");

  const result = await getSmClient().send(new GetSecretValueCommand({ SecretId: arn }));
  if (!result.SecretString) throw new Error(`Secret ${arn} exists but has no SecretString value`);

  cachedGitHubToken = result.SecretString;
  return cachedGitHubToken;
}

function githubHeaders(token) {
  return {
    "Authorization": `Bearer ${token}`,
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

/**
 * Yesterday's date in UTC, as "YYYY-MM-DD". The default pull target: a run that fires just
 * after midnight pulls the day that just ended.
 *
 * @returns {string}
 */
export function defaultTargetDate() {
  const now = new Date();
  const yesterday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
  return yesterday.toISOString().slice(0, 10);
}

/**
 * The day after `dateStr`, as "YYYY-MM-DD".
 *
 * @param {string} dateStr
 * @returns {string}
 */
export function nextDay(dateStr) {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

/**
 * Follow a GitHub REST API list endpoint's `Link: rel="next"` header to exhaustion. `fetchPage`
 * is called once per page with the page's URL, and must return `{items, nextUrl}`.
 *
 * @param {(url: string) => Promise<{items: object[], nextUrl: string|null}>} fetchPage
 * @param {string} firstUrl
 * @returns {Promise<object[]>}
 */
export async function fetchAllPages(fetchPage, firstUrl) {
  const results = [];
  let url = firstUrl;
  while (url) {
    const { items, nextUrl } = await fetchPage(url);
    results.push(...items);
    url = nextUrl;
  }
  return results;
}

/**
 * Parse the `next` URL, if any, out of a fetch Response's `Link` header.
 *
 * @param {Response} response
 * @returns {string|null}
 */
export function parseNextLink(response) {
  const link = response.headers.get("link");
  if (!link) return null;
  const match = link.split(",").find((part) => part.includes('rel="next"'));
  if (!match) return null;
  const urlMatch = match.match(/<([^>]+)>/);
  return urlMatch ? urlMatch[1] : null;
}

async function getJsonPage(url, token) {
  const response = await fetch(url, { headers: githubHeaders(token) });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitHub API error fetching ${url}: ${response.status} ${errorText}`);
  }
  return { body: await response.json(), nextUrl: parseNextLink(response) };
}

/**
 * Pull one UTC day's workflow runs (paginated, 100 per page) and project each to the row shape
 * `github_workflow_runs` carries.
 *
 * @param {{githubRepo: string, token: string, dateStr: string}} params
 * @returns {Promise<object[]>}
 */
export async function pullWorkflowRuns({ githubRepo, token, dateStr }) {
  const createdRange = `${dateStr}..${nextDay(dateStr)}`;
  const firstUrl = `https://api.github.com/repos/${githubRepo}/actions/runs?created=${encodeURIComponent(createdRange)}&per_page=100`;

  const runs = await fetchAllPages(async (url) => {
    const { body, nextUrl } = await getJsonPage(url, token);
    return { items: body.workflow_runs ?? [], nextUrl };
  }, firstUrl);

  return runs.map((run) => ({
    run_id: String(run.id),
    workflow_name: run.name ?? null,
    event: run.event ?? null,
    actor: run.actor?.login ?? null,
    status: run.status ?? null,
    conclusion: run.conclusion ?? null,
    created_at: run.created_at ?? null,
    updated_at: run.updated_at ?? null,
    html_url: run.html_url ?? null,
  }));
}

/**
 * Pull repo-wide issue timeline events, newest first, stopping once an event's timestamp falls
 * before the target day. This endpoint carries no date filter of its own, so paging stops as
 * soon as a page's events are entirely before the window rather than fetching the whole
 * project's history every night.
 *
 * @param {{githubRepo: string, token: string, dateStr: string, operatorLogin: string}} params
 * @returns {Promise<object[]>}
 */
export async function pullIssueEvents({ githubRepo, token, dateStr, operatorLogin }) {
  const dayStart = new Date(`${dateStr}T00:00:00Z`).getTime();
  const dayEnd = new Date(`${nextDay(dateStr)}T00:00:00Z`).getTime();

  const events = [];
  let url = `https://api.github.com/repos/${githubRepo}/issues/events?per_page=100`;
  while (url) {
    const { body, nextUrl } = await getJsonPage(url, token);
    const page = body ?? [];
    if (page.length === 0) break;

    let sawOlder = false;
    for (const event of page) {
      const createdAt = new Date(event.created_at).getTime();
      if (createdAt >= dayStart && createdAt < dayEnd) {
        events.push(event);
      } else if (createdAt < dayStart) {
        sawOlder = true;
      }
    }
    if (sawOlder) break;
    url = nextUrl;
  }

  return events.map((event) => ({
    issue_number: event.issue?.number ?? null,
    event_type: event.event ?? null,
    actor: event.actor?.login ?? null,
    is_operator: event.actor?.login === operatorLogin,
    created_at: event.created_at ?? null,
  }));
}

/**
 * Pull one UTC day's commits on the default branch and flag each for a Claude Code
 * co-author trailer in its message.
 *
 * @param {{githubRepo: string, token: string, dateStr: string}} params
 * @returns {Promise<object[]>}
 */
export async function pullCommits({ githubRepo, token, dateStr }) {
  const since = `${dateStr}T00:00:00Z`;
  const until = `${nextDay(dateStr)}T00:00:00Z`;
  const firstUrl = `https://api.github.com/repos/${githubRepo}/commits?since=${since}&until=${until}&per_page=100`;

  const commits = await fetchAllPages(async (url) => {
    const { body, nextUrl } = await getJsonPage(url, token);
    return { items: body ?? [], nextUrl };
  }, firstUrl);

  return commits.map((commit) => ({
    sha: commit.sha,
    author: commit.commit?.author?.name ?? commit.author?.login ?? null,
    authored_at: commit.commit?.author?.date ?? null,
    has_claude_coauthor: CLAUDE_COAUTHOR_RE.test(commit.commit?.message ?? ""),
  }));
}

/**
 * Newline-delimited JSON, one object per line. An empty list still produces a valid (empty)
 * body rather than being skipped, matching stripeReconcile.js's toNdjsonGzip: a quiet day's
 * object always exists, so a downstream `SELECT count(*)` for it returns zero, not
 * "table missing".
 *
 * @param {object[]} records
 * @returns {string}
 */
export function toNdjson(records) {
  return records.map((record) => JSON.stringify(record)).join("\n") + (records.length ? "\n" : "");
}

function objectKey(prefix, dateStr, fileName) {
  return `curated/operator/${prefix}/dt=${dateStr}/${fileName}`;
}

async function putEntityObject(s3Client, bucket, prefix, dateStr, fileName, records) {
  const key = objectKey(prefix, dateStr, fileName);
  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: toNdjson(records),
      ContentType: "application/json",
    }),
  );
  return key;
}

/**
 * Pull one UTC day of GitHub Actions runs, issue events and commits into the lake.
 *
 * @param {{date?: string}} [event] - an explicit `date` ("YYYY-MM-DD") overrides yesterday,
 *   matching every other job in the nightly chain.
 * @returns {Promise<{date: string, keys: object, counts: object}>}
 */
export async function handler(event = {}) {
  const targetDate = event.date ?? defaultTargetDate();
  const githubRepo = process.env.GITHUB_REPO;
  const operatorLogin = process.env.OPERATOR_GITHUB_LOGIN || "antonycc";
  const bucket = process.env.ANALYTICS_LAKE_BUCKET_NAME;
  if (!githubRepo) throw new Error("GITHUB_REPO environment variable is required");
  if (!bucket) throw new Error("ANALYTICS_LAKE_BUCKET_NAME environment variable is required");

  const token = await resolveGitHubToken();

  const workflowRuns = await pullWorkflowRuns({ githubRepo, token, dateStr: targetDate });
  const issueEvents = await pullIssueEvents({ githubRepo, token, dateStr: targetDate, operatorLogin });
  const commits = await pullCommits({ githubRepo, token, dateStr: targetDate });

  const s3Client = getS3Client();
  const keys = {
    workflow_runs: await putEntityObject(s3Client, bucket, "workflow-runs", targetDate, "workflow_runs.json", workflowRuns),
    issue_events: await putEntityObject(s3Client, bucket, "issue-events", targetDate, "issue_events.json", issueEvents),
    commits: await putEntityObject(s3Client, bucket, "commits", targetDate, "commits.json", commits),
  };

  const counts = {
    workflow_runs: workflowRuns.length,
    issue_events: issueEvents.length,
    commits: commits.length,
  };

  logger.info({ message: "Operator effort pull complete", date: targetDate, counts, keys });

  return { date: targetDate, keys, counts };
}
