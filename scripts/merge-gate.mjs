#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/merge-gate.mjs
//
// Three checks a PR must clear before it is fit to auto-merge, on top of
// verify-commit-signatures.yml's verified-signature check:
//
//   P2 (full authorship): every commit's GitHub-resolved author and committer login
//   is the repository owner, and the PR head is not a fork.
//
//   P4 (no borrowed authority): a PR whose body carries a closing keyword for an
//   issue raised by someone other than the owner never qualifies, because that
//   issue has no owner authorisation behind it.
//
//   P10 (shape rules): a minimum delay between opening and merging, a non-empty
//   body, a diff-size ceiling above which a human reviews regardless of the
//   checks, exactly one commit author email, and a cap on merges per rolling 24
//   hours. The values below are this script's own conservative choice, printed
//   in every report so they are visible to challenge.
//
// Fails closed throughout: a commit with no resolved login, an issue this cannot
// read, a PR whose numbers cannot be computed all count as a failure, never as a
// pass by default.
//
// The open-to-merge delay can only be judged at the moment of merging, not at a
// pull_request event, where a Markdown-only PR would otherwise read as failing
// the instant it opens and stay that way until something re-triggers the check.
// Pass --at-merge to enforce the delay; without it, the delay is printed as
// information only.
//
// Every PR gets the full report, but only a Markdown-only PR's failures make
// this exit non-zero. A code PR's failures are printed and left green, so this
// gate can build a run history before anything widens to enforce on code.
//
// Usage:
//   node scripts/merge-gate.mjs --repo diy-accounting-uk/submit.diyaccounting.co.uk --pr-number 402
//   node scripts/merge-gate.mjs --repo diy-accounting-uk/submit.diyaccounting.co.uk --pr-number 402 --at-merge

import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

export const OWNER_LOGIN = "antonycc";

export const MIN_OPEN_TO_MERGE_MS = 10 * 60 * 1000; // 10 minutes: the flagged incident merged in 17 seconds.
export const MIN_BODY_LENGTH = 20; // A body must say more than nothing; this is a floor, not a style check.
export const MAX_FILES_CHANGED = 25;
export const MAX_CHANGED_LINES = 800; // additions + deletions combined.
export const MAX_MERGES_PER_ROLLING_DAY = 6;

const CLOSING_KEYWORD_PATTERN = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s*#(\d+)/gi;

function shortSha(sha) {
  return typeof sha === "string" ? sha.slice(0, 8) : "(unknown)";
}

/**
 * Every issue number a PR body closes via a GitHub closing keyword
 * (close/closes/closed, fix/fixes/fixed, resolve/resolves/resolved). Order
 * is the order the numbers first appear; duplicates are removed.
 */
export function extractClosingIssueNumbers(body) {
  const numbers = [];
  const seen = new Set();
  for (const match of (body ?? "").matchAll(CLOSING_KEYWORD_PATTERN)) {
    const number = Number(match[1]);
    if (!seen.has(number)) {
      seen.add(number);
      numbers.push(number);
    }
  }
  return numbers;
}

/**
 * P2, full authorship: every commit's GitHub-resolved author and committer
 * login must be the owner, and the PR head must not sit in a fork. A commit
 * GitHub could not resolve to any account (`author: null`) fails exactly
 * like one resolved to somebody else — there is no third case that passes.
 */
export function checkAuthorship({ commits, prHead, ownerLogin = OWNER_LOGIN }) {
  const failures = [];

  if (!prHead?.repo || prHead.repo.fork) {
    failures.push(`the PR head repository is a fork or unresolvable (${prHead?.repo?.full_name ?? "no head repository"})`);
  }

  for (const commit of commits ?? []) {
    const authorLogin = commit.author?.login;
    const committerLogin = commit.committer?.login;
    if (authorLogin !== ownerLogin) {
      failures.push(`commit ${shortSha(commit.sha)}'s author resolves to ${authorLogin ?? "no GitHub account"}, not ${ownerLogin}`);
    }
    if (committerLogin !== ownerLogin) {
      failures.push(`commit ${shortSha(commit.sha)}'s committer resolves to ${committerLogin ?? "no GitHub account"}, not ${ownerLogin}`);
    }
  }

  return { passed: failures.length === 0, failures };
}

/**
 * P4: a PR closing an issue raised by anyone other than the owner never
 * auto-merges. `issuesByNumber` is keyed by the issue numbers
 * extractClosingIssueNumbers found; a number with no entry (the issue could
 * not be read) fails closed rather than being skipped.
 */
export function checkLinkedIssueAuthorship({ body, issuesByNumber, ownerLogin = OWNER_LOGIN }) {
  const closingNumbers = extractClosingIssueNumbers(body);
  const failures = [];

  for (const number of closingNumbers) {
    const issue = issuesByNumber?.[number];
    if (!issue) {
      failures.push(`issue #${number} is named as closed but could not be read to confirm its author`);
      continue;
    }
    const authorLogin = issue.user?.login;
    if (authorLogin !== ownerLogin) {
      failures.push(`issue #${number} was raised by ${authorLogin ?? "an unknown user"}, not ${ownerLogin} (P4)`);
    }
  }

  return { passed: failures.length === 0, closingNumbers, failures };
}

/**
 * P10's five shape rules. Each of `additions`, `deletions` and
 * `filesChanged` is the PR's own totals (not summed from a paginated file
 * list, which the caller would otherwise have to get right every time).
 * `commitAuthorEmails` is the git-level `commit.author.email` off each
 * commit, distinct from the GitHub login checkAuthorship resolves.
 * `recentMergeTimestamps` is every merge time in the repository's history
 * that could fall inside the last 24 hours; only entries actually inside
 * the window count towards the cap.
 *
 * The open-to-merge delay is judged only when `atMerge` is true: at any
 * earlier moment (a PR just opened, a pull_request event re-running the
 * check) the PR has not had the chance to clear it yet, so the delay is
 * carried in `notes` instead of `failures`.
 */
export function checkShapeRules({
  createdAt,
  now = new Date(),
  body,
  filesChanged,
  additions,
  deletions,
  commitAuthorEmails,
  recentMergeTimestamps,
  atMerge = false,
}) {
  const failures = [];
  const notes = [];
  const nowMs = now.getTime();

  const openMs = nowMs - new Date(createdAt).getTime();
  const openSeconds = Math.max(0, Math.round(openMs / 1000));
  const delayMet = Number.isFinite(openMs) && openMs >= MIN_OPEN_TO_MERGE_MS;
  if (atMerge) {
    if (!delayMet) {
      failures.push(`only ${openSeconds}s since the PR opened; the minimum open-to-merge delay is ${MIN_OPEN_TO_MERGE_MS / 1000}s`);
    }
  } else {
    notes.push(
      `${openSeconds}s since the PR opened so far; the ${MIN_OPEN_TO_MERGE_MS / 1000}s open-to-merge delay is a merge-time rule, checked by /auto-merge`,
    );
  }

  if ((body ?? "").trim().length < MIN_BODY_LENGTH) {
    failures.push(
      `the PR body is ${(body ?? "").trim().length} characters, short of the ${MIN_BODY_LENGTH}-character floor for naming what changed`,
    );
  }

  const totalChangedLines = (additions ?? 0) + (deletions ?? 0);
  if ((filesChanged ?? 0) > MAX_FILES_CHANGED || totalChangedLines > MAX_CHANGED_LINES) {
    failures.push(
      `the diff is ${filesChanged ?? 0} files and ${totalChangedLines} changed lines, above the ceiling of ${MAX_FILES_CHANGED} files or ${MAX_CHANGED_LINES} lines; a human reviews this regardless of the checks`,
    );
  }

  const distinctEmails = new Set((commitAuthorEmails ?? []).filter(Boolean));
  if (distinctEmails.size > 1) {
    failures.push(
      `commits carry ${distinctEmails.size} different author emails (${[...distinctEmails].sort().join(", ")}); exactly one is required`,
    );
  } else if (distinctEmails.size === 0) {
    failures.push("no commit carried a resolvable author email");
  }

  const mergesInWindow = (recentMergeTimestamps ?? []).filter((timestamp) => {
    const mergedMs = new Date(timestamp).getTime();
    return Number.isFinite(mergedMs) && nowMs - mergedMs < 24 * 60 * 60 * 1000 && mergedMs <= nowMs;
  }).length;
  if (mergesInWindow >= MAX_MERGES_PER_ROLLING_DAY) {
    failures.push(`${mergesInWindow} PRs already merged in the last 24 hours, at the cap of ${MAX_MERGES_PER_ROLLING_DAY}`);
  }

  return { passed: failures.length === 0, failures, notes };
}

/** True when every changed path is a Markdown file — this gate's enforced scope. */
export function isMarkdownOnly(changedPaths) {
  return Array.isArray(changedPaths) && changedPaths.length > 0 && changedPaths.every((path) => /\.md$/i.test(path));
}

/**
 * Combines the three checks into one verdict. `enforced` is true only for a
 * Markdown-only PR: its failures block (this run exits non-zero), while a
 * code PR's failures are reported only, so the gate builds a run history
 * before anything widens to enforce on code.
 */
export function evaluateMergeGate({
  commits,
  prHead,
  body,
  issuesByNumber,
  createdAt,
  now,
  filesChanged,
  additions,
  deletions,
  commitAuthorEmails,
  recentMergeTimestamps,
  changedPaths,
  ownerLogin = OWNER_LOGIN,
  atMerge = false,
}) {
  const authorship = checkAuthorship({ commits, prHead, ownerLogin });
  const linkedIssue = checkLinkedIssueAuthorship({ body, issuesByNumber, ownerLogin });
  const shape = checkShapeRules({
    createdAt,
    now,
    body,
    filesChanged,
    additions,
    deletions,
    commitAuthorEmails,
    recentMergeTimestamps,
    atMerge,
  });

  const passed = authorship.passed && linkedIssue.passed && shape.passed;
  const enforced = isMarkdownOnly(changedPaths);

  return {
    passed,
    enforced,
    blocked: enforced && !passed,
    atMerge,
    authorship,
    linkedIssue,
    shape,
  };
}

export function formatReport(result) {
  const lines = [];
  lines.push(`# Merge gate report`);
  lines.push("");
  lines.push(
    result.enforced
      ? "Scope: Markdown-only PR — failures below **block** this run."
      : "Scope: code PR — failures below are reported, not enforced.",
  );
  lines.push("");

  const section = (title, check) => {
    lines.push(`## ${title}: ${check.passed ? "pass" : "fail"}`);
    for (const failure of check.failures) {
      lines.push(`- ${failure}`);
    }
    for (const note of check.notes ?? []) {
      lines.push(`- info: ${note}`);
    }
    if (check.passed && (check.notes ?? []).length === 0) {
      lines.push("- no issues found");
    }
    lines.push("");
  };

  section("P2 full authorship", result.authorship);
  section("P4 linked-issue authorship", result.linkedIssue);
  section("P10 shape rules", result.shape);

  lines.push(
    `Thresholds: ${MIN_OPEN_TO_MERGE_MS / 1000}s minimum open-to-merge delay, ${MIN_BODY_LENGTH}-character minimum body, ` +
      `${MAX_FILES_CHANGED} files / ${MAX_CHANGED_LINES} changed lines ceiling, one author email, ${MAX_MERGES_PER_ROLLING_DAY} merges per rolling 24 hours.`,
  );

  return lines.join("\n");
}

export function parseArgs(argv) {
  const opts = { repo: undefined, prNumber: undefined, atMerge: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--repo":
        opts.repo = argv[++i];
        break;
      case "--pr-number":
        opts.prNumber = argv[++i];
        break;
      case "--at-merge":
        opts.atMerge = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return opts;
}

function ghApiJson(path) {
  return JSON.parse(execFileSync("gh", ["api", path, "--paginate"], { encoding: "utf8", maxBuffer: 1024 * 1024 * 64 }));
}

function ghApiJsonSingle(path) {
  return JSON.parse(execFileSync("gh", ["api", path], { encoding: "utf8", maxBuffer: 1024 * 1024 * 64 }));
}

/**
 * Gathers every input evaluateMergeGate needs, straight from the GitHub API.
 * Injectable so tests never call `gh`. An issue read that fails (deleted,
 * no access) resolves to `undefined` in `issuesByNumber` rather than
 * throwing, which is what makes checkLinkedIssueAuthorship's fail-closed
 * behaviour reachable from real data.
 */
export async function gatherInputs({ repo, prNumber }, { fetchJson = ghApiJsonSingle, fetchPaginated = ghApiJson } = {}) {
  const pr = fetchJson(`repos/${repo}/pulls/${prNumber}`);
  const commits = fetchPaginated(`repos/${repo}/pulls/${prNumber}/commits`);
  const changedFiles = fetchPaginated(`repos/${repo}/pulls/${prNumber}/files`);
  const changedPaths = changedFiles.map((file) => file.filename);

  const closingNumbers = extractClosingIssueNumbers(pr.body);
  const issuesByNumber = {};
  for (const number of closingNumbers) {
    try {
      issuesByNumber[number] = fetchJson(`repos/${repo}/issues/${number}`);
    } catch {
      issuesByNumber[number] = undefined;
    }
  }

  const recentClosedPulls = fetchJson(`repos/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=50`);
  const recentMergeTimestamps = (Array.isArray(recentClosedPulls) ? recentClosedPulls : [])
    .filter((candidate) => candidate.merged_at && candidate.number !== pr.number)
    .map((candidate) => candidate.merged_at);

  return {
    commits,
    prHead: pr.head,
    body: pr.body,
    issuesByNumber,
    createdAt: pr.created_at,
    filesChanged: pr.changed_files,
    additions: pr.additions,
    deletions: pr.deletions,
    commitAuthorEmails: commits.map((commit) => commit.commit?.author?.email),
    recentMergeTimestamps,
    changedPaths,
  };
}

export async function main(argv, { gather = gatherInputs } = {}) {
  const opts = parseArgs(argv);
  if (!opts.repo || !opts.prNumber) {
    console.log("merge-gate: no --repo or --pr-number was given");
    return { passed: false, enforced: true, blocked: true };
  }

  const inputs = await gather({ repo: opts.repo, prNumber: opts.prNumber });
  const result = evaluateMergeGate({ ...inputs, atMerge: opts.atMerge });
  const report = formatReport(result);
  console.log(report);

  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    const { appendFileSync } = await import("node:fs");
    appendFileSync(summaryPath, report + "\n");
  }

  return result;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2))
    .then((result) => {
      process.exitCode = result.blocked ? 1 : 0;
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
