#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/maintainer-review-gate.mjs
//
// The rule that lets an agent handle a support ticket. A ticket waits behind the
// `maintainer-review` label. The operator approves it by removing the label. An agent run
// starts only when all of these hold:
//
//   1. the label is not on the issue now, and
//   2. the last `maintainer-review` event on the issue timeline is `unlabeled`, and
//   3. the actor of that event is the operator login.
//
// A bot or an agent that removes the label fails check 3. An issue that never carried the label
// fails check 2. The CLI exits non-zero unless the state is `approved`.
//
// usage: maintainer-review-gate.mjs --repo <owner/name> --issue <number>
// env:   GH_TOKEN (read access to the repository's issues), GITHUB_OUTPUT
// Prints and writes `state=approved|pending|not-approved`.

import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { OPERATOR_LOGIN } from "./issue-agent-allowlist.mjs";
import { assertIssueNumber, assertRepo, githubGet, githubGetAll } from "./github-issue-comment.mjs";

export const REVIEW_LABEL = "maintainer-review";

const sameLogin = (a, b) => String(a ?? "").toLowerCase() === String(b ?? "").toLowerCase();

/**
 * @param {object} input
 * @param {string[]} input.labels label names on the issue now
 * @param {{event: string, label?: {name: string}, actor?: {login: string}}[]} input.events the issue timeline, oldest first
 * @param {string} input.operatorLogin
 * @returns {"approved"|"pending"|"not-approved"}
 */
export function approvalState({ labels, events, operatorLogin }) {
  if (labels.includes(REVIEW_LABEL)) return "pending";
  const reviewEvents = events.filter(
    (entry) => (entry.event === "labeled" || entry.event === "unlabeled") && entry.label?.name === REVIEW_LABEL,
  );
  const last = reviewEvents[reviewEvents.length - 1];
  if (!last || last.event !== "unlabeled") return "not-approved";
  return sameLogin(last.actor?.login, operatorLogin) ? "approved" : "not-approved";
}

export async function issueApprovalState({ repo, issue, token, fetchImpl = fetch }) {
  assertRepo(repo);
  const number = assertIssueNumber(issue);
  const record = await githubGet(`/repos/${repo}/issues/${number}`, { token, fetchImpl });
  const events = await githubGetAll(`/repos/${repo}/issues/${number}/events`, { token, fetchImpl });
  const labels = (record.labels ?? []).map((label) => (typeof label === "string" ? label : label.name));
  return approvalState({ labels, events, operatorLogin: OPERATOR_LOGIN });
}

function argValue(argv, name) {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
}

async function main() {
  const argv = process.argv.slice(2);
  const repo = argValue(argv, "--repo");
  const issue = argValue(argv, "--issue");
  if (!repo || !issue) {
    console.error("usage: maintainer-review-gate.mjs --repo <owner/name> --issue <number>");
    process.exit(1);
  }
  const state = await issueApprovalState({ repo, issue, token: process.env.GH_TOKEN });
  console.log(`state=${state}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `state=${state}\n`);
  if (state !== "approved") process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
