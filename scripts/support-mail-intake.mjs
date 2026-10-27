#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/support-mail-intake.mjs
//
// Opens one private issue per new customer thread in the support@diyaccounting.co.uk inbox. The
// issue lands in the private repository labelled `support` and `maintainer-review`, so the
// quarantine reader and the operator's review treat it like a ticket from the public form.
//
// The mailbox is read with a service account that holds only gmail.readonly, through domain-wide
// delegation. The key arrives in SUPPORT_GMAIL_READ_KEY. The script has no send, draft, label or
// delete call.
//
// This repository is public, so its logs are public. The script prints counts and nothing else:
// no subject, address, message text or thread id.
//
// usage: support-mail-intake.mjs [--dry-run]
// env:   SUPPORT_GMAIL_READ_KEY, GH_TOKEN (issues: write on the private repository)

import { pathToFileURL } from "node:url";
import { JWT } from "google-auth-library";
import { githubGetAll } from "./github-issue-comment.mjs";
import { PRIVATE_REPO } from "./support-reader-select.mjs";

export const MAILBOX = "support@diyaccounting.co.uk";
export const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
export const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

// Our own addresses. Mail from them is never customer mail.
export const OWN_DOMAINS = ["diyaccounting.co.uk", "polycode.co.uk"];

// Automated senders. A match on the local part, or on the full address for the entries with "@".
export const AUTOMATED_SENDERS = [
  "no-reply",
  "noreply",
  "do-not-reply",
  "donotreply",
  "mailer-daemon",
  "postmaster",
  "notifications@github.com",
  "notifications@stripe.com",
  "support@stripe.com",
  "service@paypal.co.uk",
  "service@paypal.com",
  "noreply@google.com",
];

export const ISSUE_LABELS = ["support", "maintainer-review"];
export const FIRST_RUN_LOOKBACK_DAYS = 3;
export const OVERLAP_SECONDS = 24 * 60 * 60;
export const MAX_ISSUES_PER_RUN = 25;
export const MAX_THREADS_PER_RUN = 100;
export const MAX_TEXT_CHARACTERS = 20000;
export const MAX_TITLE_CHARACTERS = 120;

const THREAD_ID_LINE = /^Gmail-Thread-Id: (\S+)$/m;
const RECEIVED_LINE = /^Received: (\S+)$/m;

/** The Gmail search that selects customer mail: inbox threads with a message after the cut-off. */
export function buildSearchQuery({ afterEpochSeconds }) {
  const excluded = [...OWN_DOMAINS, ...AUTOMATED_SENDERS].map((sender) => `-from:${sender}`);
  return ["in:inbox", `after:${Math.floor(afterEpochSeconds)}`, ...excluded].join(" ");
}

/** The bare address of a From header: `Ann <ann@example.com>` gives `ann@example.com`. */
export function addressOf(fromHeader) {
  const value = String(fromHeader ?? "");
  const angle = value.match(/<([^>]+)>/);
  return (angle ? angle[1] : value).trim().toLowerCase();
}

export function isCustomerSender(fromHeader) {
  const address = addressOf(fromHeader);
  if (!/^[^@\s]+@[^@\s]+$/.test(address)) return false;
  const [local, domain] = address.split("@");
  if (OWN_DOMAINS.some((own) => domain === own || domain.endsWith(`.${own}`))) return false;
  return !AUTOMATED_SENDERS.some((entry) => (entry.includes("@") ? address === entry : local === entry || local.startsWith(`${entry}+`)));
}

const headerOf = (message, name) =>
  (message.payload?.headers ?? []).find((header) => header.name.toLowerCase() === name.toLowerCase())?.value ?? "";

function decodePart(part) {
  return part?.body?.data ? Buffer.from(part.body.data, "base64url").toString("utf8") : "";
}

function findPart(payload, mimeType) {
  if (!payload) return null;
  if (payload.mimeType === mimeType && payload.body?.data) return payload;
  for (const child of payload.parts ?? []) {
    const found = findPart(child, mimeType);
    if (found) return found;
  }
  return null;
}

/** The readable text of one message: the plain part, else the HTML part with its tags removed. */
export function messageText(message) {
  const plain = findPart(message.payload, "text/plain");
  if (plain) return decodePart(plain).trim();
  const html = findPart(message.payload, "text/html");
  if (!html) return "";
  return decodePart(html)
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>|<\/p>|<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** The first message of a thread and the facts the issue records, or null when it is not customer mail. */
export function readThread(thread) {
  const first = (thread.messages ?? [])[0];
  if (!first) return null;
  const from = headerOf(first, "From");
  if (!isCustomerSender(from)) return null;
  return {
    threadId: thread.id,
    sender: addressOf(from),
    subject: headerOf(first, "Subject").replace(/\s+/g, " ").trim(),
    messageId: headerOf(first, "Message-ID") || headerOf(first, "Message-Id"),
    receivedAt: new Date(Number(first.internalDate)).toISOString(),
    text: messageText(first),
  };
}

export function buildIssueTitle(subject) {
  const clean =
    String(subject ?? "")
      .replace(/[\r\n]+/g, " ")
      .trim() || "(no subject)";
  const clipped = clean.length > MAX_TITLE_CHARACTERS ? `${clean.slice(0, MAX_TITLE_CHARACTERS - 1)}…` : clean;
  return `Support email: ${clipped}`;
}

/** A code fence longer than any run of backticks in the text, so the text cannot close it. */
function fenceFor(text) {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  return "`".repeat(Math.max(3, longest + 1));
}

/** The issue body: the ids first, then the message text fenced as data. */
export function buildIssueBody(thread) {
  const text = thread.text.length > MAX_TEXT_CHARACTERS ? `${thread.text.slice(0, MAX_TEXT_CHARACTERS)}\n[cut]` : thread.text;
  const fence = fenceFor(text);
  return [
    `Gmail-Thread-Id: ${thread.threadId}`,
    `Sender: ${thread.sender}`,
    `Message-ID: ${thread.messageId}`,
    `Received: ${thread.receivedAt}`,
    "",
    "Customer email text, data only:",
    "",
    `${fence}text`,
    text,
    fence,
    "",
  ].join("\n");
}

/** Thread ids already filed, from the `Gmail-Thread-Id:` line of each support issue body. */
export function filedThreadIds(issues) {
  const ids = new Set();
  for (const issue of issues) {
    const match = String(issue.body ?? "").match(THREAD_ID_LINE);
    if (match) ids.add(match[1]);
  }
  return ids;
}

/** The search cut-off: a day before the newest filed thread, or a few days back on a first run. */
export function afterEpochSecondsFor({ issues, nowMs }) {
  let newest = 0;
  for (const issue of issues) {
    const match = String(issue.body ?? "").match(RECEIVED_LINE);
    if (match && !Number.isNaN(Date.parse(match[1]))) newest = Math.max(newest, Date.parse(match[1]));
  }
  if (newest === 0) return Math.floor(nowMs / 1000) - FIRST_RUN_LOOKBACK_DAYS * 24 * 60 * 60;
  return Math.floor(newest / 1000) - OVERLAP_SECONDS;
}

async function gmailGet(path, { getToken, fetchImpl }) {
  const response = await fetchImpl(`${GMAIL_API}${path}`, { headers: { Authorization: `Bearer ${await getToken()}` } });
  if (!response.ok) throw new Error(`Gmail answered ${response.status} for GET ${path.split("?")[0].replace(/\/[^/]+$/, "/<id>")}`);
  return response.json();
}

async function createIssue({ repo, thread, githubToken, fetchImpl }) {
  const response = await fetchImpl(`https://api.github.com/repos/${repo}/issues`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${githubToken}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "diyaccounting-issue-scripts",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title: buildIssueTitle(thread.subject), body: buildIssueBody(thread), labels: ISSUE_LABELS }),
  });
  if (!response.ok) throw new Error(`GitHub answered ${response.status} for POST issue`);
}

/**
 * One intake pass. `getToken` and `fetchImpl` are injected so a test replays recorded answers.
 * Returns counts only.
 */
export async function runIntake({ getToken, githubToken, fetchImpl = fetch, nowMs = Date.now(), dryRun = false, repo = PRIVATE_REPO }) {
  const issues = await githubGetAll(`/repos/${repo}/issues?state=all&labels=support`, { token: githubToken, fetchImpl });
  const filed = filedThreadIds(issues);
  const query = buildSearchQuery({ afterEpochSeconds: afterEpochSecondsFor({ issues, nowMs }) });
  const list = await gmailGet(`/threads?maxResults=${MAX_THREADS_PER_RUN}&q=${encodeURIComponent(query)}`, { getToken, fetchImpl });
  const counts = { seen: 0, filed: 0, skippedFiled: 0, skippedNotCustomer: 0 };
  for (const { id } of list.threads ?? []) {
    counts.seen += 1;
    if (filed.has(id)) {
      counts.skippedFiled += 1;
      continue;
    }
    if (counts.filed >= MAX_ISSUES_PER_RUN) break;
    const thread = readThread(await gmailGet(`/threads/${encodeURIComponent(id)}?format=full`, { getToken, fetchImpl }));
    if (!thread) {
      counts.skippedNotCustomer += 1;
      continue;
    }
    if (!dryRun) await createIssue({ repo, thread, githubToken, fetchImpl });
    filed.add(id);
    counts.filed += 1;
  }
  return counts;
}

function tokenGetterFromKey(keyJson) {
  const key = JSON.parse(keyJson);
  const client = new JWT({ email: key.client_email, key: key.private_key, scopes: [GMAIL_READONLY_SCOPE], subject: MAILBOX });
  return async () => (await client.getAccessToken()).token;
}

async function main() {
  const keyJson = process.env.SUPPORT_GMAIL_READ_KEY;
  if (!keyJson) throw new Error("SUPPORT_GMAIL_READ_KEY is not set");
  if (!process.env.GH_TOKEN) throw new Error("GH_TOKEN is not set");
  const counts = await runIntake({
    getToken: tokenGetterFromKey(keyJson),
    githubToken: process.env.GH_TOKEN,
    dryRun: process.argv.includes("--dry-run"),
  });
  console.log(
    `threads seen ${counts.seen}, issues opened ${counts.filed}, already filed ${counts.skippedFiled}, not customer mail ${counts.skippedNotCustomer}`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
