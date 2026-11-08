#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability OPS-189 Count the mail notices that wait for the operator
// - **Use when:** the operator needs to know that mail notices wait in the private repository, how many, and how soon the nearest deadline falls.
// - **Does:** notice-digest.mjs lists the open private issues labelled `mail-notice` and `maintainer-review`, reads each issue's latest accepted quarantine reader comment for its checked `deadline`, and prints the count and the nearest deadline that is today or later (or none). It reads no title and no body, and prints neither. support-notice-digest.yml runs it once a day and sends the `notice-digest` customer email to the operator when the count is above zero.
// - **Run:** `GH_TOKEN=<token that reads private issues> node scripts/notice-digest.mjs`; `gh workflow run support-notice-digest.yml -f dry-run=true`
// - **Entry:** `scripts/notice-digest.mjs:digestNotices`; `.github/workflows/support-notice-digest.yml`
// - **Files:** scripts/notice-digest.mjs, .github/workflows/support-notice-digest.yml, app/unit-tests/scripts/noticeDigest.test.js, app/unit-tests/supportNoticeDigestWorkflow.test.js, app/lib/customerEmailTemplates.js
// - **Keywords:** notice digest, mail notice, maintainer-review, deadline, daily digest, operator email, private issues
// - **Related:** OPS-142, SITE-27
// @end-capability

// scripts/notice-digest.mjs
//
// usage: notice-digest.mjs
// env:   GH_TOKEN (read access to the private repository's issues), GITHUB_OUTPUT
// Writes `count=<n>` and `nearest-deadline=<YYYY-MM-DD or empty>` to $GITHUB_OUTPUT. The log holds
// the same two values and nothing from any issue.

import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { AGENT_APP_LOGIN } from "./issue-agent-allowlist.mjs";
import { READER_MARKER, extractReaderJson } from "./quarantine-reader-check.mjs";
import { githubGetAll } from "./github-issue-comment.mjs";
import { PRIVATE_REPO } from "./support-reader-select.mjs";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isCalendarDate(text) {
  if (typeof text !== "string" || !DATE_PATTERN.test(text)) return false;
  const parsed = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(text);
}

/**
 * The checked deadline in the issue's latest accepted reader comment, or null.
 * A comment counts when the agent App wrote it, it carries the reader marker, and its json block
 * holds a calendar date as `deadline`.
 * @param {object[]} comments the issue's comments, oldest first
 * @returns {string|null}
 */
export function readerDeadline(comments) {
  for (const comment of [...comments].reverse()) {
    if (comment.user?.login !== AGENT_APP_LOGIN || !String(comment.body ?? "").includes(READER_MARKER)) continue;
    const value = extractReaderJson(comment.body);
    if (value === null) continue;
    return isCalendarDate(value.deadline) ? value.deadline : null;
  }
  return null;
}

/**
 * @param {object[]} issues open issues labelled mail-notice and maintainer-review
 * @param {(number: number) => Promise<object[]>} commentsFor
 * @param {string} today YYYY-MM-DD
 * @returns {Promise<{count: number, nearestDeadline: string|null}>}
 */
export async function digestNotices({ issues, commentsFor, today }) {
  const notices = issues.filter((issue) => !issue.pull_request && issue.state === "open");
  let nearestDeadline = null;
  for (const notice of notices) {
    const deadline = readerDeadline(await commentsFor(notice.number));
    if (deadline && deadline >= today && (nearestDeadline === null || deadline < nearestDeadline)) nearestDeadline = deadline;
  }
  return { count: notices.length, nearestDeadline };
}

async function main() {
  const token = process.env.GH_TOKEN;
  const issues = await githubGetAll(`/repos/${PRIVATE_REPO}/issues?state=open&labels=mail-notice,maintainer-review`, { token });
  const { count, nearestDeadline } = await digestNotices({
    issues,
    today: new Date().toISOString().slice(0, 10),
    commentsFor: (number) => githubGetAll(`/repos/${PRIVATE_REPO}/issues/${number}/comments`, { token }),
  });
  console.log(`notices waiting: ${count}`);
  console.log(`nearest deadline: ${nearestDeadline ?? "none"}`);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `count=${count}\nnearest-deadline=${nearestDeadline ?? ""}\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
