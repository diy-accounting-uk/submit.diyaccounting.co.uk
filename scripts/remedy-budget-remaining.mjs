#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/remedy-budget-remaining.mjs
//
// Counts how many remedy actions an alarm family has already spent today,
// so alarm-triage.yml can stop dispatching a workflow or marking a draft PR
// ready once the family's own budgetPerDay (app/data/alarm-remedies.json)
// is used up. A `remedy:*` label only lands on an issue at the moment
// alarm-triage.yml actually acted on it (see that workflow's "Act on the
// remedy the triage named" step), so counting those label-added events is
// counting actions taken, not alarms raised.
//
// Fails closed in spirit, not in code: a family with no remedy:* label
// events in the last 24 hours gets its full budgetPerDay back, never more.
//
// Usage:
//   node scripts/remedy-budget-remaining.mjs --family prod-env-activity-stack-health --budget 2 --repo owner/name

import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { alarmFamilyKey } from "../app/lib/alarmName.js";

const ISSUE_TITLE_PREFIX = "[ALARM] ";
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * alarm-triage.yml titles every issue `buildIssueTitle(familyKey)`
 * (app/functions/ops/alarmToGithubIssue.js), so stripping the fixed prefix
 * and re-running alarmFamilyKey recovers the family whether the title
 * already carries a family key or a raw, still-deployment-scoped alarm
 * name — alarmFamilyKey is idempotent on an already-collapsed key.
 */
export function alarmNameFromIssueTitle(title) {
  const text = title || "";
  return text.startsWith(ISSUE_TITLE_PREFIX) ? text.slice(ISSUE_TITLE_PREFIX.length) : text;
}

export function issueFamily(issueTitle) {
  return alarmFamilyKey(alarmNameFromIssueTitle(issueTitle));
}

/**
 * The only budget-relevant fact about an issue: every `remedy:*` label ever
 * added to it, inside the trailing 24-hour window. A label removed later
 * still counts here — only "unlabeled" events are excluded, never
 * un-counted "labeled" ones — because the budget tracks actions taken, and
 * an action already taken does not stop having happened when the label is
 * tidied away afterwards.
 */
export function remedyLabelEventsInWindow(row, now) {
  const windowStart = now.getTime() - DAY_MS;
  return (row.labelEvents ?? []).filter((event) => {
    if (event.event !== "labeled") return false;
    if (typeof event.label?.name !== "string" || !event.label.name.startsWith("remedy:")) return false;
    const at = Date.parse(event.created_at);
    return Number.isFinite(at) && at >= windowStart && at <= now.getTime();
  });
}

/**
 * rows: one entry per candidate issue, `{ title, labelEvents }`, where
 * labelEvents is that issue's GitHub timeline entries (event, label.name,
 * created_at). Rows whose title resolves to a different family are ignored,
 * so a caller may pass every alarm issue without pre-filtering and still
 * get the right count.
 */
export function remainingBudget({ rows, family, now, budgetPerDay }) {
  const nowDate = now instanceof Date ? now : new Date(now);
  let count = 0;
  for (const row of rows ?? []) {
    if (issueFamily(row.title) !== family) continue;
    count += remedyLabelEventsInWindow(row, nowDate).length;
  }
  return budgetPerDay - count;
}

export function parseArgs(argv) {
  const opts = { family: undefined, budget: undefined, repo: undefined };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--family":
        opts.family = argv[++i];
        break;
      case "--budget":
        opts.budget = argv[++i];
        break;
      case "--repo":
        opts.repo = argv[++i];
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!opts.family) throw new Error("--family is required");
  if (opts.budget === undefined) throw new Error("--budget is required");
  return opts;
}

function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8", maxBuffer: 1024 * 1024 * 16 });
}

export function resolveRepo(explicit) {
  if (explicit) return explicit;
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;
  return gh(["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"]).trim();
}

function fetchAlarmIssues(repo) {
  const out = gh([
    "issue",
    "list",
    "--repo",
    repo,
    "--label",
    "alarm",
    "--state",
    "all",
    "--limit",
    "200",
    "--json",
    "number,title,labels,createdAt,updatedAt",
  ]);
  return JSON.parse(out);
}

function fetchLabelEvents(repo, issueNumber) {
  const out = gh(["api", `repos/${repo}/issues/${issueNumber}/timeline`, "--paginate"]);
  const events = JSON.parse(out);
  return events.filter((event) => event.event === "labeled" || event.event === "unlabeled");
}

/**
 * Fetches only the candidate issues (title resolves to the target family)
 * before spending an API call on any issue's timeline, so a repository with
 * many unrelated alarm families costs one `issue list` call plus one
 * `timeline` call per issue that is actually this family's own.
 */
export function collectRows(repo, family) {
  const issues = fetchAlarmIssues(repo);
  const candidates = issues.filter((issue) => issueFamily(issue.title) === family);
  return candidates.map((issue) => ({
    title: issue.title,
    labelEvents: fetchLabelEvents(repo, issue.number),
  }));
}

export async function main(argv) {
  const opts = parseArgs(argv);
  const repo = resolveRepo(opts.repo);
  const rows = collectRows(repo, opts.family);
  const remaining = remainingBudget({ rows, family: opts.family, now: new Date(), budgetPerDay: Number(opts.budget) });
  console.log(remaining);
  return remaining;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
