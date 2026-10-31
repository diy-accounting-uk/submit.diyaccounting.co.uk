#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/support-label-sweep.mjs
//
// The two label writes the support workflows make on the private repository, and nothing else.
//
//   label  --repo <owner/name> --issue <n> --label <name>
//       Adds one of the labels below to the issue and creates the label first when the
//       repository has none. support-reader.yml uses it to add `injection-suspected`.
//   sweep  --repo <owner/name>
//       Applies the operator's `rejected` label to open `support` issues and to recently closed
//       ones. An open issue that carries `rejected` is closed as not planned, with no comment and
//       so no reply. An issue whose last `rejected` event is the operator removing it, and that
//       has no later `maintainer-review` event, gets `maintainer-review` back, and is reopened
//       when it is closed. support-triage.yml runs it before it picks an issue.
//
// It prints issue numbers and actions only; it never prints a title, body or comment.
// env: GH_TOKEN (issues write on the private repository)

import { pathToFileURL } from "node:url";
import { OPERATOR_LOGIN } from "./issue-agent-allowlist.mjs";
import { INJECTION_LABEL, REJECTED_LABEL, REVIEW_LABEL } from "./maintainer-review-gate.mjs";
import { assertIssueNumber, assertRepo, githubGetAll } from "./github-issue-comment.mjs";

const API = "https://api.github.com";
const RECENT_CLOSED_DAYS = 7;

export const LABELS = {
  [INJECTION_LABEL]: {
    color: "d93f0b",
    description: "The reader suspects the ticket steers an agent or carries content to run; the operator removes it to allow handling",
  },
  [REVIEW_LABEL]: { color: "fbca04", description: "Waits for the operator to read the ticket; the operator removes it to approve" },
  [REJECTED_LABEL]: {
    color: "b60205",
    description: "The operator rejected the ticket; it closes with no reply; remove the label to bring it back for review",
  },
};

const labelNames = (issue) => (issue.labels ?? []).map((label) => (typeof label === "string" ? label : label.name));
const sameLogin = (a, b) => String(a ?? "").toLowerCase() === String(b ?? "").toLowerCase();

const isSupportIssue = (issue) => issue && !issue.pull_request && labelNames(issue).includes("support");

function labelEvents(events, name) {
  return events.filter((entry) => (entry.event === "labeled" || entry.event === "unlabeled") && entry.label?.name === name);
}

/** True when the operator removed `rejected` and no `maintainer-review` event follows. */
export function needsReviewLabelBack(events, operatorLogin = OPERATOR_LOGIN) {
  const rejected = labelEvents(events, REJECTED_LABEL).at(-1);
  if (!rejected || rejected.event !== "unlabeled" || !sameLogin(rejected.actor?.login, operatorLogin)) return false;
  const review = labelEvents(events, REVIEW_LABEL).at(-1);
  return !review || events.indexOf(review) < events.indexOf(rejected);
}

/**
 * @param {object[]} issues open and recently closed issues
 * @param {(n: number) => Promise<object[]>} eventsFor the issue timeline
 * @returns {Promise<{number: number, action: "close"|"restore"}[]>}
 */
export async function planSweep({ issues, eventsFor, operatorLogin = OPERATOR_LOGIN }) {
  const plan = [];
  for (const issue of issues.filter(isSupportIssue)) {
    const labels = labelNames(issue);
    if (labels.includes(REJECTED_LABEL)) {
      if (issue.state === "open") plan.push({ number: issue.number, action: "close" });
      continue;
    }
    const closedByUs = issue.state === "closed" && issue.state_reason === "not_planned";
    const open = issue.state === "open" && !labels.includes(REVIEW_LABEL);
    if (!closedByUs && !open) continue;
    if (needsReviewLabelBack(await eventsFor(issue.number), operatorLogin)) plan.push({ number: issue.number, action: "restore" });
  }
  return plan;
}

async function write(path, { method, body, token, fetchImpl, allow = [] }) {
  const response = await fetchImpl(`${API}${path}`, {
    method,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "diyaccounting-issue-scripts",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok && !allow.includes(response.status))
    throw new Error(`GitHub answered ${response.status} for ${method} ${path.split("?")[0]}`);
}

export async function addLabel({ repo, issue, label, token, fetchImpl = fetch }) {
  assertRepo(repo);
  const number = assertIssueNumber(issue);
  const spec = LABELS[label];
  if (!spec) throw new Error("the label is not one this script writes");
  // 422 means the label already exists.
  await write(`/repos/${repo}/labels`, { method: "POST", body: { name: label, ...spec }, token, fetchImpl, allow: [422] });
  await write(`/repos/${repo}/issues/${number}/labels`, { method: "POST", body: { labels: [label] }, token, fetchImpl });
}

export async function closeWithoutReply({ repo, issue, token, fetchImpl = fetch }) {
  await write(`/repos/${repo}/issues/${assertIssueNumber(issue)}`, {
    method: "PATCH",
    body: { state: "closed", state_reason: "not_planned" },
    token,
    fetchImpl,
  });
}

export async function restoreForReview({ repo, issue, closed, token, fetchImpl = fetch }) {
  await addLabel({ repo, issue, label: REVIEW_LABEL, token, fetchImpl });
  if (closed)
    await write(`/repos/${repo}/issues/${assertIssueNumber(issue)}`, {
      method: "PATCH",
      body: { state: "open", state_reason: "reopened" },
      token,
      fetchImpl,
    });
}

export async function sweep({ repo, token, fetchImpl = fetch, now = new Date() }) {
  assertRepo(repo);
  const since = new Date(now.getTime() - RECENT_CLOSED_DAYS * 86400000).toISOString();
  const opts = { token, fetchImpl };
  const issues = [
    ...(await githubGetAll(`/repos/${repo}/issues?state=open&labels=support`, opts)),
    ...(await githubGetAll(`/repos/${repo}/issues?state=closed&labels=support&since=${since}`, opts)),
  ];
  const plan = await planSweep({ issues, eventsFor: (n) => githubGetAll(`/repos/${repo}/issues/${n}/events`, opts) });
  for (const { number, action } of plan) {
    if (action === "close") await closeWithoutReply({ repo, issue: number, token, fetchImpl });
    else
      await restoreForReview({ repo, issue: number, closed: issues.find((i) => i.number === number).state === "closed", token, fetchImpl });
    console.log(`#${number} ${action}`);
  }
  return plan;
}

function argValue(argv, name) {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
}

async function main() {
  const argv = process.argv.slice(2);
  const [command] = argv;
  const repo = argValue(argv, "--repo");
  const token = process.env.GH_TOKEN;
  if (command === "label" && repo && argValue(argv, "--issue") && argValue(argv, "--label")) {
    await addLabel({ repo, issue: argValue(argv, "--issue"), label: argValue(argv, "--label"), token });
    console.log(`labelled issue ${assertIssueNumber(argValue(argv, "--issue"))}`);
  } else if (command === "sweep" && repo) {
    const plan = await sweep({ repo, token });
    console.log(`swept: ${plan.length} change(s)`);
  } else {
    console.error("usage: support-label-sweep.mjs label --repo <owner/name> --issue <n> --label <name> | sweep --repo <owner/name>");
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
