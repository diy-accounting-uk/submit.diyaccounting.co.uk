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
//   3. the actor of that event is the operator login, and
//   4. neither `injection-suspected` nor `rejected` is on the issue now, and
//   5. the last `injection-suspected` event, if there is one, is an `unlabeled` by the operator.
//
// A bot or an agent that removes a label fails check 3 or 5. An issue that never carried
// `maintainer-review` fails check 2. `rejected` stops the issue for good until the operator
// removes it, and removing it puts `maintainer-review` back (scripts/support-label-sweep.mjs), so
// the issue waits for approval again. The CLI exits non-zero unless the state is `approved`.
//
// usage: maintainer-review-gate.mjs --repo <owner/name> --issue <number>
// env:   GH_TOKEN (read access to the repository's issues), GITHUB_OUTPUT
// Prints and writes `state=approved|pending|not-approved|rejected`.

import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { OPERATOR_LOGIN } from "./issue-agent-allowlist.mjs";
import { assertIssueNumber, assertRepo, githubGet, githubGetAll } from "./github-issue-comment.mjs";

export const REVIEW_LABEL = "maintainer-review";
export const INJECTION_LABEL = "injection-suspected";
export const REJECTED_LABEL = "rejected";

const sameLogin = (a, b) => String(a ?? "").toLowerCase() === String(b ?? "").toLowerCase();

/**
 * @param {object} input
 * @param {string[]} input.labels label names on the issue now
 * @param {{event: string, label?: {name: string}, actor?: {login: string}}[]} input.events the issue timeline, oldest first
 * @param {string} input.operatorLogin
 * @returns {"approved"|"pending"|"not-approved"|"rejected"}
 */
export function approvalState({ labels, events, operatorLogin }) {
  if (labels.includes(REJECTED_LABEL)) return "rejected";
  if (labels.includes(INJECTION_LABEL) || labels.includes(REVIEW_LABEL)) return "pending";
  const labelEvents = (name) =>
    events.filter((entry) => (entry.event === "labeled" || entry.event === "unlabeled") && entry.label?.name === name);
  const last = (list) => list[list.length - 1];
  const lastReview = last(labelEvents(REVIEW_LABEL));
  const lastRejected = last(labelEvents(REJECTED_LABEL));
  // The operator removed `rejected` and the sweep has not put `maintainer-review` back yet.
  if (lastRejected && events.indexOf(lastRejected) > events.indexOf(lastReview)) return "pending";
  const lastInjection = last(labelEvents(INJECTION_LABEL));
  if (lastInjection && !(lastInjection.event === "unlabeled" && sameLogin(lastInjection.actor?.login, operatorLogin))) {
    return "not-approved";
  }
  if (!lastReview || lastReview.event !== "unlabeled") return "not-approved";
  return sameLogin(lastReview.actor?.login, operatorLogin) ? "approved" : "not-approved";
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
