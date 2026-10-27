#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/support-reader-select.mjs
//
// Picks the one support issue the quarantine reader reads next: open, labelled `support` and
// `maintainer-review`, filed by a login on the allow list, with no reader comment from the agent
// App yet. The oldest comes first. It reads no title and no body, and it prints only the number.
//
// usage: support-reader-select.mjs [--issue <number>]
// env:   GH_TOKEN (read access to the private repository's issues), GITHUB_OUTPUT
// Writes `issue-number=<n>` (empty when there is nothing to read) to $GITHUB_OUTPUT.

import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { AGENT_APP_LOGIN, ALLOWED_LOGINS } from "./issue-agent-allowlist.mjs";
import { READER_MARKER } from "./quarantine-reader-check.mjs";
import { githubGetAll } from "./github-issue-comment.mjs";

export const PRIVATE_REPO = "diy-accounting-uk/private.diyaccounting.co.uk";

const labelNames = (issue) => (issue.labels ?? []).map((label) => (typeof label === "string" ? label : label.name));

export function isReaderCandidate(issue) {
  if (!issue || issue.pull_request || issue.state !== "open") return false;
  const labels = labelNames(issue);
  if (!labels.includes("support") || !labels.includes("maintainer-review")) return false;
  return ALLOWED_LOGINS.includes(String(issue.user?.login ?? "").toLowerCase());
}

export function hasReaderComment(comments) {
  return comments.some((comment) => comment.user?.login === AGENT_APP_LOGIN && String(comment.body ?? "").includes(READER_MARKER));
}

/**
 * @param {object[]} issues open issues, any order
 * @param {(number: number) => Promise<object[]>} commentsFor
 * @param {number} [only] restrict to this issue number (the dispatch input)
 * @returns {Promise<number|null>}
 */
export async function selectIssueToRead({ issues, commentsFor, only }) {
  const candidates = issues
    .filter((issue) => (only === undefined ? true : issue.number === only))
    .filter(isReaderCandidate)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  for (const issue of candidates) {
    if (!hasReaderComment(await commentsFor(issue.number))) return issue.number;
  }
  return null;
}

async function main() {
  const argv = process.argv.slice(2);
  const index = argv.indexOf("--issue");
  const only = index !== -1 && argv[index + 1] ? Number(argv[index + 1]) : undefined;
  const token = process.env.GH_TOKEN;
  const issues = await githubGetAll(`/repos/${PRIVATE_REPO}/issues?state=open&labels=support,maintainer-review`, { token });
  const number = await selectIssueToRead({
    issues,
    only,
    commentsFor: (n) => githubGetAll(`/repos/${PRIVATE_REPO}/issues/${n}/comments`, { token }),
  });
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
