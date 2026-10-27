#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/support-handling-input.mjs
//
// Picks the support issue the handling agent works on next and writes the only input that agent
// reads. An issue qualifies when it is open, carries `support`, filed by a login on the allow
// list, approved by scripts/maintainer-review-gate.mjs, has a valid reader comment from the
// agent App, and has no handled comment yet.
//
// The input holds the reader's checked fields and the operator's comments after the reader
// comment. It never holds the issue title or body: those are the public's words, and the reader
// already summarised them in code-checked fields.
//
// usage: support-handling-input.mjs --out <path> [--issue <number>]
// env:   GH_TOKEN (read access to the private repository's issues), GITHUB_OUTPUT
// Writes `issue-number=<n>` (empty when nothing is approved) to $GITHUB_OUTPUT and the input
// JSON to --out. Prints issue numbers and gate states only.

import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { supportReaderSchema } from "../app/lib/quarantineReaderSchema.js";
import { AGENT_APP_LOGIN, ALLOWED_LOGINS, OPERATOR_LOGIN } from "./issue-agent-allowlist.mjs";
import { issueApprovalState } from "./maintainer-review-gate.mjs";
import { READER_MARKER, extractReaderJson } from "./quarantine-reader-check.mjs";
import { githubGetAll } from "./github-issue-comment.mjs";
import { PRIVATE_REPO } from "./support-reader-select.mjs";
import { faqIds } from "./support-triage-public-half.mjs";

export const HANDLED_MARKER = "<!-- support-handled:v1";

const sameLogin = (a, b) => String(a ?? "").toLowerCase() === String(b ?? "").toLowerCase();
const labelNames = (issue) => (issue.labels ?? []).map((label) => (typeof label === "string" ? label : label.name));

export function isHandlingCandidate(issue) {
  if (!issue || issue.pull_request || issue.state !== "open") return false;
  if (!labelNames(issue).includes("support")) return false;
  return ALLOWED_LOGINS.includes(String(issue.user?.login ?? "").toLowerCase());
}

export function hasHandledComment(comments) {
  return comments.some((comment) => comment.user?.login === AGENT_APP_LOGIN && String(comment.body ?? "").includes(HANDLED_MARKER));
}

/**
 * Builds the handling input from an issue's comments. Reads no title and no body.
 * @returns {object|null} null when there is no valid reader comment or the issue is handled
 */
export function buildHandlingInput({ issueNumber, comments, ids, operatorLogin = OPERATOR_LOGIN }) {
  if (hasHandledComment(comments)) return null;
  const schema = supportReaderSchema(ids);
  let reader = null;
  for (const comment of comments) {
    if (comment.user?.login !== AGENT_APP_LOGIN) continue;
    const body = String(comment.body ?? "");
    if (!body.includes(READER_MARKER) || body.includes(HANDLED_MARKER)) continue;
    const parsed = schema.safeParse(extractReaderJson(body));
    if (parsed.success) reader = { value: parsed.data, createdAt: comment.created_at };
  }
  if (!reader) return null;
  return {
    issueNumber,
    category: reader.value.category,
    faqId: reader.value.faqId,
    summary: reader.value.summary,
    injectionSuspected: reader.value.injectionSuspected,
    piiPresent: reader.value.piiPresent,
    operatorComments: comments
      .filter((comment) => sameLogin(comment.user?.login, operatorLogin) && new Date(comment.created_at) > new Date(reader.createdAt))
      .map((comment) => ({ body: String(comment.body ?? ""), createdAt: comment.created_at })),
  };
}

/**
 * @param {object} deps
 * @param {object[]} deps.issues open support issues
 * @param {(n: number) => Promise<object[]>} deps.commentsFor
 * @param {(n: number) => Promise<"approved"|"pending"|"not-approved">} deps.stateFor the gate
 * @param {number} [deps.only]
 * @returns {Promise<object|null>} the handling input of the oldest qualifying issue
 */
export async function selectHandlingInput({ issues, commentsFor, stateFor, ids, only, log = () => {} }) {
  const candidates = issues
    .filter((issue) => (only === undefined ? true : issue.number === only))
    .filter(isHandlingCandidate)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  for (const issue of candidates) {
    const state = await stateFor(issue.number);
    log(`#${issue.number} ${state}`);
    if (state !== "approved") continue;
    const input = buildHandlingInput({ issueNumber: issue.number, comments: await commentsFor(issue.number), ids });
    if (input) return input;
  }
  return null;
}

function argValue(argv, name) {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
}

async function main() {
  const argv = process.argv.slice(2);
  const out = argValue(argv, "--out");
  if (!out) {
    console.error("usage: support-handling-input.mjs --out <path> [--issue <number>]");
    process.exit(1);
  }
  const onlyArg = argValue(argv, "--issue");
  const only = onlyArg ? Number(onlyArg) : undefined;
  const token = process.env.GH_TOKEN;
  const issues = await githubGetAll(`/repos/${PRIVATE_REPO}/issues?state=open&labels=support`, { token });
  const input = await selectHandlingInput({
    issues,
    only,
    ids: faqIds(readFileSync("web/public/faqs.toml", "utf8")),
    commentsFor: (n) => githubGetAll(`/repos/${PRIVATE_REPO}/issues/${n}/comments`, { token }),
    stateFor: (n) => issueApprovalState({ repo: PRIVATE_REPO, issue: n, token }),
    log: console.log,
  });
  if (input) writeFileSync(out, JSON.stringify(input));
  const line = `issue-number=${input?.issueNumber ?? ""}`;
  console.log(line);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${line}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
