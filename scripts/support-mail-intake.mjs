#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability DATA-61 Intake support email as private issues
// - **Use when:** a customer email to support@ must become a `support` and `maintainer-review` issue in the private repository, or the mailbox read scope is in question.
// - **Does:** support-mail-intake.yml (every 10 minutes and on dispatch) runs support-mail-intake.mjs, which reads the support inbox through the `gmail.readonly` service account `support-gmail-read` (identity.toml), skips our own senders and threads already filed, and gives every other thread a lane (customer, record, notice, unverified or withheld) from the sender registry support-mail-registry.toml and the `Authentication-Results` header Google wrote (support-mail-lanes.mjs). It opens one issue per new thread in the customer, notice and unverified lanes with the thread id, sender and Message-ID and the text fenced as data (a customer thread gets `support`, the others `mail-notice`; all get `maintainer-review`, an unverified one also `injection-suspected`), and one for a withheld thread with the sender and date and no text; a record thread is counted and opens nothing. It prints counts only, one per lane, and authenticates by workload identity federation and the IAM Credentials `signJwt` call, with no key. The same workflow's daily `acceptance` job syncs the draft rows from `curated/support-drafts/`, runs support-draft-acceptance.mjs (accepted, edited, rejected, pending per draft older than seven days, by comparing the sent body's digest with the row's) and writes the summary row to `curated/support-draft-acceptance/`.
// - **Run:** `gh workflow run support-mail-intake.yml -f dry-run=true`
// - **Entry:** `scripts/support-mail-intake.mjs:`
// - **Files:** scripts/support-mail-intake.mjs, scripts/support-mail-lanes.mjs, scripts/support-mail-registry.toml, scripts/support-draft-acceptance.mjs, .github/workflows/support-mail-intake.yml, app/unit-tests/scripts/supportDraftAcceptance.test.js, app/unit-tests/scripts/supportMailIntake.test.js, app/unit-tests/scripts/supportMailLanes.test.js, app/unit-tests/fixtures/supportMailIntake/, infra/google/gcp/identity.toml
// - **Keywords:** support mail intake, mail lanes, sender registry, dkim, gmail readonly, domain-wide delegation, support issues, maintainer-review, private repository
// - **Related:** OPS-56, DATA-42
// @end-capability

// scripts/support-mail-intake.mjs
//
// Sorts each new thread in the support@diyaccounting.co.uk inbox into a lane (support-mail-lanes.mjs)
// and opens one private issue per new thread that is not a record. The issue lands in the private
// repository labelled `support` (customer) or `mail-notice` (the rest) and `maintainer-review`, so
// the quarantine reader and the operator's review treat it like a ticket from the public form.
//
// The mailbox is read with a service account that holds only gmail.readonly, through domain-wide
// delegation. The job federates to Google with no key and the script signs the delegation assertion
// through the IAM Credentials API (google-delegated-token.mjs). The script has no send, draft, label or
// delete call.
//
// A record thread is counted and opens no issue. A withheld thread opens an issue with no message text.
//
// This repository is public, so its logs are public. The script prints counts and nothing else:
// one count per lane, and no subject, address, message text or thread id.
//
// usage: support-mail-intake.mjs [--dry-run]
// env:   GOOGLE_APPLICATION_CREDENTIALS (from google-github-actions/auth), GH_TOKEN (issues: write on the private repository)

import { pathToFileURL } from "node:url";
import { delegatedTokenGetter } from "./google-delegated-token.mjs";
import { githubGetAll } from "./github-issue-comment.mjs";
import { PRIVATE_REPO } from "./support-reader-select.mjs";
import { ensureLabel } from "./support-label-sweep.mjs";
import { LANES, chooseLane, loadRegistry } from "./support-mail-lanes.mjs";

export const MAILBOX = "support@diyaccounting.co.uk";
export const READ_SERVICE_ACCOUNT = "support-gmail-read@diyaccounting-ga4.iam.gserviceaccount.com";
export const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
export const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

// Our own addresses. Mail from them is never read.
export const OWN_DOMAINS = ["diyaccounting.co.uk", "polycode.co.uk"];

// Automated senders outside the registry go to the notice lane. A match on the local part, or on the full address for the entries with "@".
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
export const LANE_LABELS = {
  customer: ISSUE_LABELS,
  notice: ["mail-notice", "maintainer-review"],
  unverified: ["mail-notice", "maintainer-review", "injection-suspected"],
  withheld: ["mail-notice", "maintainer-review", "mail-withheld"],
};
export const FILED_LABELS = ["support", "mail-notice"];
export const FIRST_RUN_LOOKBACK_DAYS = 3;
export const OVERLAP_SECONDS = 24 * 60 * 60;
export const MAX_ISSUES_PER_RUN = 25;
export const MAX_THREADS_PER_RUN = 100;
export const MAX_TEXT_CHARACTERS = 20000;
export const MAX_TITLE_CHARACTERS = 120;

const THREAD_ID_LINE = /^Gmail-Thread-Id: (\S+)$/m;
const RECEIVED_LINE = /^Received: (\S+)$/m;

/** The Gmail search: inbox threads with a message after the cut-off, minus our own senders. */
export function buildSearchQuery({ afterEpochSeconds }) {
  const excluded = OWN_DOMAINS.map((sender) => `-from:${sender}`);
  return ["in:inbox", `after:${Math.floor(afterEpochSeconds)}`, ...excluded].join(" ");
}

/** The bare address of a From header: `Ann <ann@example.com>` gives `ann@example.com`. */
export function addressOf(fromHeader) {
  const value = String(fromHeader ?? "");
  const angle = value.match(/<([^>]+)>/);
  return (angle ? angle[1] : value).trim().toLowerCase();
}

/** The sender's address, domain and whether it is automated, or null for a malformed address or one of our own. */
export function classifySender(fromHeader) {
  const address = addressOf(fromHeader);
  if (!/^[^@\s]+@[^@\s]+$/.test(address)) return null;
  const [local, domain] = address.split("@");
  if (OWN_DOMAINS.some((own) => domain === own || domain.endsWith(`.${own}`))) return null;
  const automated = AUTOMATED_SENDERS.some((entry) =>
    entry.includes("@") ? address === entry : local === entry || local.startsWith(`${entry}+`),
  );
  return { address, domain, automated };
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

/**
 * The lane of the first message of a thread and the facts the issue records, or null when the
 * sender is one of ours. Every lane but withheld carries the message text; a record is never filed.
 */
export function readThread(thread, registry) {
  const first = (thread.messages ?? [])[0];
  if (!first) return null;
  const from = headerOf(first, "From");
  const sender = classifySender(from);
  if (!sender) return null;
  const subject = headerOf(first, "Subject").replace(/\s+/g, " ").trim();
  const lane = chooseLane({ registry, automated: sender.automated, domain: sender.domain, subject, headers: first.payload?.headers });
  return {
    lane,
    threadId: thread.id,
    sender: sender.address,
    subject,
    messageId: headerOf(first, "Message-ID") || headerOf(first, "Message-Id"),
    receivedAt: new Date(Number(first.internalDate)).toISOString(),
    text: lane === "withheld" ? "" : messageText(first),
  };
}

export function buildIssueTitle(subject, lane = "customer") {
  if (lane === "withheld") return "Withheld mail: login mail, text not read";
  const clean =
    String(subject ?? "")
      .replace(/[\r\n]+/g, " ")
      .trim() || "(no subject)";
  const clipped = clean.length > MAX_TITLE_CHARACTERS ? `${clean.slice(0, MAX_TITLE_CHARACTERS - 1)}…` : clean;
  return `${lane === "customer" ? "Support email" : "Mail notice"}: ${clipped}`;
}

/** A code fence longer than any run of backticks in the text, so the text cannot close it. */
function fenceFor(text) {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  return "`".repeat(Math.max(3, longest + 1));
}

/** The issue body: the ids first, then the message text fenced as data. */
export function buildIssueBody(thread) {
  const ids = [
    `Gmail-Thread-Id: ${thread.threadId}`,
    `Sender: ${thread.sender}`,
    `Message-ID: ${thread.messageId}`,
    `Received: ${thread.receivedAt}`,
    "",
  ];
  if (thread.lane === "withheld")
    return [...ids, "The subject looks like login mail, so the text is not copied here. Read the thread in the support mailbox.", ""].join(
      "\n",
    );
  const text = thread.text.length > MAX_TEXT_CHARACTERS ? `${thread.text.slice(0, MAX_TEXT_CHARACTERS)}\n[cut]` : thread.text;
  const fence = fenceFor(text);
  const heading = thread.lane === "customer" ? "Customer email text, data only:" : "Notice email text, data only:";
  return [...ids, heading, "", `${fence}text`, text, fence, ""].join("\n");
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

export async function gmailGet(path, { getToken, fetchImpl }) {
  const response = await fetchImpl(`${GMAIL_API}${path}`, { headers: { Authorization: `Bearer ${await getToken()}` } });
  if (!response.ok) {
    throw Object.assign(new Error(`Gmail answered ${response.status} for GET ${path.split("?")[0].replace(/\/[^/]+$/, "/<id>")}`), {
      status: response.status,
    });
  }
  return response.json();
}

/** Throws unless every label the run set is on the issue GitHub made; a lost label hides the thread from the next run. */
export function assertLabelsKept(issue, labels) {
  const kept = (issue?.labels ?? []).map((label) => (typeof label === "string" ? label : label.name));
  const missing = labels.find((label) => !kept.includes(label));
  if (missing) throw new Error(`issue #${issue?.number} was filed without the label ${missing}; stop until the label exists`);
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
    body: JSON.stringify({
      title: buildIssueTitle(thread.subject, thread.lane),
      body: buildIssueBody(thread),
      labels: LANE_LABELS[thread.lane],
    }),
  });
  if (!response.ok) throw new Error(`GitHub answered ${response.status} for POST issue`);
  assertLabelsKept(await response.json(), LANE_LABELS[thread.lane]);
}

/**
 * One intake pass. `getToken` and `fetchImpl` are injected so a test replays recorded answers.
 * Returns counts only.
 */
export async function runIntake({
  getToken,
  githubToken,
  fetchImpl = fetch,
  nowMs = Date.now(),
  dryRun = false,
  repo = PRIVATE_REPO,
  registry = loadRegistry(),
}) {
  const issues = [];
  for (const label of FILED_LABELS) {
    issues.push(...(await githubGetAll(`/repos/${repo}/issues?state=all&labels=${label}`, { token: githubToken, fetchImpl })));
  }
  const filed = filedThreadIds(issues);
  const query = buildSearchQuery({ afterEpochSeconds: afterEpochSecondsFor({ issues, nowMs }) });
  const list = await gmailGet(`/threads?maxResults=${MAX_THREADS_PER_RUN}&q=${encodeURIComponent(query)}`, { getToken, fetchImpl });
  const counts = {
    seen: 0,
    filed: 0,
    skippedFiled: 0,
    skippedNotCustomer: 0,
    lanes: Object.fromEntries(LANES.map((lane) => [lane, 0])),
    labelsMissing: [],
  };
  const checkedLabels = new Set();
  for (const { id } of list.threads ?? []) {
    counts.seen += 1;
    if (filed.has(id)) {
      counts.skippedFiled += 1;
      continue;
    }
    if (counts.filed >= MAX_ISSUES_PER_RUN) break;
    const thread = readThread(await gmailGet(`/threads/${encodeURIComponent(id)}?format=full`, { getToken, fetchImpl }), registry);
    if (!thread) {
      counts.skippedNotCustomer += 1;
      continue;
    }
    counts.lanes[thread.lane] += 1;
    if (thread.lane === "record") continue;
    if (thread.lane !== "customer") {
      for (const label of LANE_LABELS[thread.lane]) {
        if (checkedLabels.has(label)) continue;
        checkedLabels.add(label);
        if (await ensureLabel({ repo, label, token: githubToken, fetchImpl, dryRun })) counts.labelsMissing.push(label);
      }
    }
    if (!dryRun) await createIssue({ repo, thread, githubToken, fetchImpl });
    filed.add(id);
    counts.filed += 1;
  }
  return counts;
}

export function readerTokenGetter() {
  return delegatedTokenGetter({ serviceAccountEmail: READ_SERVICE_ACCOUNT, subject: MAILBOX, scopes: [GMAIL_READONLY_SCOPE] });
}

async function main() {
  if (!process.env.GH_TOKEN) throw new Error("GH_TOKEN is not set");
  const dryRun = process.argv.includes("--dry-run");
  const counts = await runIntake({ getToken: readerTokenGetter(), githubToken: process.env.GH_TOKEN, dryRun });
  console.log(
    `threads seen ${counts.seen}, issues opened ${counts.filed}, already filed ${counts.skippedFiled}, our own senders ${counts.skippedNotCustomer}; ` +
      `lanes: ${LANES.map((lane) => `${lane} ${counts.lanes[lane]}`).join(", ")}${counts.labelsMissing.length ? `; labels ${dryRun ? "to make" : "made"}: ${counts.labelsMissing.join(", ")}` : ""}${dryRun ? " (dry run, nothing changed)" : ""}`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
