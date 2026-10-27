#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/alarm-escalation-input.mjs
//
// Writes the only input the Sonnet escalation reads about the first pass. The first-pass
// result is untrusted (the agent read log lines that outside traffic can write), so the
// escalation never sees it. It sees the quarantine reader's checked fields from the private
// mirror issue, and the operator's comments after the reader's comment.
//
// The reader comment must come from the agent App, carry the reader marker and pass the alarm
// schema again here. The script fails when there is none.
//
// usage: alarm-escalation-input.mjs --repo <owner/name> --issue <public issue number> --out <path>
// env:   GH_TOKEN (read access to the private repository's issues)
// Prints nothing from the comments.

import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { alarmReaderSchema } from "../app/lib/quarantineReaderSchema.js";
import { AGENT_APP_LOGIN, OPERATOR_LOGIN } from "./issue-agent-allowlist.mjs";
import { READER_MARKER, extractReaderJson } from "./quarantine-reader-check.mjs";
import { assertIssueNumber, assertRepo, githubGetAll } from "./github-issue-comment.mjs";
import { PRIVATE_REPO } from "./support-reader-select.mjs";

const sameLogin = (a, b) => String(a ?? "").toLowerCase() === String(b ?? "").toLowerCase();

export function mirrorMarker(repo, issueNumber) {
  return `alarm-triage-mirror: ${repo}#${issueNumber}`;
}

/** The mirror issue whose body holds the marker as a whole line. */
export function findMirrorIssue(issues, marker) {
  return (
    issues.find((issue) =>
      String(issue.body ?? "")
        .split("\n")
        .includes(marker),
    ) ?? null
  );
}

/**
 * @returns {object|null} null when the mirror holds no valid reader comment
 */
export function buildEscalationInput({ comments, families, operatorLogin = OPERATOR_LOGIN }) {
  const schema = alarmReaderSchema(families);
  let reader = null;
  for (const comment of comments) {
    if (comment.user?.login !== AGENT_APP_LOGIN) continue;
    const body = String(comment.body ?? "");
    if (!body.includes(READER_MARKER)) continue;
    const parsed = schema.safeParse(extractReaderJson(body));
    if (parsed.success) reader = { value: parsed.data, createdAt: comment.created_at };
  }
  if (!reader) return null;
  return {
    stillBroken: reader.value.stillBroken,
    remedyFamily: reader.value.remedyFamily,
    summary: reader.value.summary,
    injectionSuspected: reader.value.injectionSuspected,
    piiPresent: reader.value.piiPresent,
    operatorComments: comments
      .filter((comment) => sameLogin(comment.user?.login, operatorLogin) && new Date(comment.created_at) > new Date(reader.createdAt))
      .map((comment) => ({ body: String(comment.body ?? ""), createdAt: comment.created_at })),
  };
}

function argValue(argv, name) {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
}

async function main() {
  const argv = process.argv.slice(2);
  const repo = argValue(argv, "--repo");
  const issue = argValue(argv, "--issue");
  const out = argValue(argv, "--out");
  if (!repo || !issue || !out) {
    console.error("usage: alarm-escalation-input.mjs --repo <owner/name> --issue <number> --out <path>");
    process.exit(1);
  }
  assertRepo(repo);
  const token = process.env.GH_TOKEN;
  const mirrors = await githubGetAll(`/repos/${PRIVATE_REPO}/issues?labels=alarm-mirror&state=all`, { token });
  const mirror = findMirrorIssue(mirrors, mirrorMarker(repo, assertIssueNumber(issue)));
  if (!mirror) throw new Error("no mirror issue for this alarm");
  const comments = await githubGetAll(`/repos/${PRIVATE_REPO}/issues/${mirror.number}/comments`, { token });
  const families = new Set(JSON.parse(readFileSync("app/data/alarm-remedies.json", "utf8")).map((row) => row.family));
  const input = buildEscalationInput({ comments, families });
  if (!input) throw new Error("the mirror issue holds no valid reader comment");
  writeFileSync(out, JSON.stringify(input));
  console.log("escalation input written");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
