#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/support-reader-select.mjs
//
// Picks the one issue the quarantine reader reads next: open, labelled `support` and
// `maintainer-review`, filed by a login on the allow list, with no reader comment from the agent
// App yet. The oldest comes first. It reads no title and no body, and it prints only the number.
//
// With `--kind notice` it picks a mail notice instead: labelled `mail-notice` and
// `maintainer-review`, never `mail-withheld` (that issue holds no message text), never
// `trusted-event`, with the same author, comment and `rejected` rules.
//
// With `--issue <number> --reread` it reads that one issue again: open, labelled `support` (or
// `mail-notice` for a notice), not labelled `rejected`, filed by an allowed login, with or
// without `maintainer-review` and with or without an earlier reader comment.
//
// usage: support-reader-select.mjs [--kind support|notice] [--issue <number> [--reread]]
// env:   GH_TOKEN (read access to the private repository's issues), GITHUB_OUTPUT
// Writes `issue-number=<n>` (empty when there is nothing to read) to $GITHUB_OUTPUT.

import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { AGENT_APP_LOGIN, ALLOWED_LOGINS } from "./issue-agent-allowlist.mjs";
import { READER_MARKER } from "./quarantine-reader-check.mjs";
import { githubGet, githubGetAll } from "./github-issue-comment.mjs";

export const PRIVATE_REPO = "diy-accounting-uk/private.diyaccounting.co.uk";

const labelNames = (issue) => (issue.labels ?? []).map((label) => (typeof label === "string" ? label : label.name));

export const READER_KINDS = ["support", "notice"];

// The label that marks an issue for each kind, and the labels that keep an issue out of it.
const KIND_LABEL = { support: "support", notice: "mail-notice" };
const KIND_EXCLUDED = { support: ["rejected"], notice: ["rejected", "mail-withheld", "trusted-event"] };

const fromAllowedLogin = (issue) => ALLOWED_LOGINS.includes(String(issue.user?.login ?? "").toLowerCase());

export function isReaderCandidate(issue, kind = "support") {
  if (!issue || issue.pull_request || issue.state !== "open") return false;
  const labels = labelNames(issue);
  if (!labels.includes(KIND_LABEL[kind]) || !labels.includes("maintainer-review")) return false;
  if (KIND_EXCLUDED[kind].some((label) => labels.includes(label))) return false;
  return fromAllowedLogin(issue);
}

export function isRereadCandidate(issue, kind = "support") {
  if (!issue || issue.pull_request || issue.state !== "open") return false;
  const labels = labelNames(issue);
  if (!labels.includes(KIND_LABEL[kind])) return false;
  if (KIND_EXCLUDED[kind].some((label) => labels.includes(label))) return false;
  return fromAllowedLogin(issue);
}

export function parseReaderArgs(argv) {
  const kindIndex = argv.indexOf("--kind");
  const kind = kindIndex === -1 ? "support" : argv[kindIndex + 1];
  if (!READER_KINDS.includes(kind)) throw new Error("--kind must be support or notice");
  const index = argv.indexOf("--issue");
  const only = index !== -1 && argv[index + 1] ? Number(argv[index + 1]) : undefined;
  const reread = argv.includes("--reread");
  if (reread && only === undefined) throw new Error("--reread needs --issue <number>");
  return { kind, only, reread };
}

export function hasReaderComment(comments) {
  return comments.some((comment) => comment.user?.login === AGENT_APP_LOGIN && String(comment.body ?? "").includes(READER_MARKER));
}

/**
 * @param {object[]} issues open issues, any order
 * @param {(number: number) => Promise<object[]>} commentsFor
 * @param {number} [only] restrict to this issue number (the dispatch input)
 * @param {"support"|"notice"} [kind]
 * @returns {Promise<number|null>}
 */
export async function selectIssueToRead({ issues, commentsFor, only, kind = "support" }) {
  const candidates = issues
    .filter((issue) => (only === undefined ? true : issue.number === only))
    .filter((issue) => isReaderCandidate(issue, kind))
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  for (const issue of candidates) {
    if (!hasReaderComment(await commentsFor(issue.number))) return issue.number;
  }
  return null;
}

/**
 * @param {object} issue the one issue fetched for the dispatch input
 * @param {number} only the dispatch input
 * @returns {number|null}
 */
export function selectIssueToReread({ issue, only, kind = "support" }) {
  return issue?.number === only && isRereadCandidate(issue, kind) ? only : null;
}

async function main() {
  const { kind, only, reread } = parseReaderArgs(process.argv.slice(2));
  const token = process.env.GH_TOKEN;
  let number;
  if (reread) {
    const issue = await githubGet(`/repos/${PRIVATE_REPO}/issues/${only}`, { token });
    number = selectIssueToReread({ issue, only, kind });
  } else {
    const issues = await githubGetAll(`/repos/${PRIVATE_REPO}/issues?state=open&labels=${KIND_LABEL[kind]},maintainer-review`, {
      token,
    });
    number = await selectIssueToRead({
      issues,
      only,
      kind,
      commentsFor: (n) => githubGetAll(`/repos/${PRIVATE_REPO}/issues/${n}/comments`, { token }),
    });
  }
  const line = `issue-number=${number ?? ""}`;
  console.log(line);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${line}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
