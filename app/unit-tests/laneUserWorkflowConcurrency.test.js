// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// laneUserWorkflowConcurrency.test.js -- each behaviour-test lane keeps one durable Cognito user
// per environment, and every workflow job that runs scripts/ensure-cognito-test-user.js purges
// that user's bundles, rotates its password and re-enrols its TOTP device before testing. Two
// such jobs on the same user at once (a deploy's probe and a scheduled probe, say) leave the
// first one without its bundle mid-test: its view of a return it has just submitted comes back
// 403. This test parses every workflow and checks that each job rotating a lane user declares a
// job-level concurrency group named for that environment and lane, without cancel-in-progress,
// so same-user jobs queue instead of overlapping.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");
const WORKFLOWS_DIR = resolve(ROOT, ".github", "workflows");

const ENVIRONMENT_EXPRESSION = "${{ needs.names.outputs.environment-name }}";

// One shell argument: a `${{ ... }}` expression or a bare word, optionally quoted.
const ARGUMENT = String.raw`['"]?(\$\{\{[^}]*\}\}|[^'"\s]+)['"]?`;
const ROTATION = new RegExp(String.raw`ensure-cognito-test-user\.js['"]?\s+${ARGUMENT}\s+${ARGUMENT}`);

// The `<env> <lane>` arguments of every ensure-cognito-test-user.js invocation in a workflow,
// with the line each sits on.
function laneUserRotations(workflowText) {
  const rotations = [];
  workflowText.split("\n").forEach((line, index) => {
    if (line.trim().startsWith("#")) return;
    const match = line.match(ROTATION);
    if (match) rotations.push({ line: index, environment: match[1], lane: match[2] });
  });
  return rotations;
}

// The text of the job (a two-space-indented `<id>:` block under `jobs:`) containing a line.
function enclosingJob(workflowText, lineIndex) {
  const lines = workflowText.split("\n");
  let start = lineIndex;
  while (start > 0 && !/^ {2}[A-Za-z0-9_-]+:\s*$/.test(lines[start])) start -= 1;
  let end = lineIndex + 1;
  while (end < lines.length && !/^ {2}[A-Za-z0-9_-]+:\s*$/.test(lines[end])) end += 1;
  return { id: lines[start].trim().slice(0, -1), text: lines.slice(start, end).join("\n") };
}

// The `group` and `cancel-in-progress` of a job's concurrency block, if it has one.
function jobConcurrency(jobText) {
  const block = jobText.match(/\n {4}concurrency:\n((?: {6}.*\n?)+)/);
  if (!block) return null;
  const group = block[1].match(/^ {6}group:\s*(.+?)\s*$/m);
  const cancel = block[1].match(/^ {6}cancel-in-progress:\s*(\S+)/m);
  return { group: group?.[1] ?? null, cancelInProgress: cancel?.[1] ?? null };
}

describe("workflow jobs that rotate a lane's durable Cognito user", () => {
  const workflowFiles = readdirSync(WORKFLOWS_DIR).filter((name) => name.endsWith(".yml"));

  it("exist, so the check below is exercising real jobs", () => {
    const rotatingWorkflows = workflowFiles.filter(
      (name) => laneUserRotations(readFileSync(resolve(WORKFLOWS_DIR, name), "utf8")).length > 0,
    );
    expect(rotatingWorkflows).toContain("probe-test.yml");
  });

  it("each queue on a job-level concurrency group named for the environment and lane", () => {
    const offenders = [];
    for (const name of workflowFiles) {
      const workflowText = readFileSync(resolve(WORKFLOWS_DIR, name), "utf8");
      for (const rotation of laneUserRotations(workflowText)) {
        const job = enclosingJob(workflowText, rotation.line);
        const concurrency = jobConcurrency(job.text);
        const expectedGroup = `behaviour-test-user-${rotation.environment}-${rotation.lane}`;
        if (rotation.environment !== ENVIRONMENT_EXPRESSION) {
          offenders.push(`${name} job ${job.id}: rotates a user for ${rotation.environment}, expected ${ENVIRONMENT_EXPRESSION}`);
        }
        if (!concurrency) {
          offenders.push(`${name} job ${job.id}: no job-level concurrency block`);
        } else {
          if (concurrency.group !== expectedGroup) {
            offenders.push(`${name} job ${job.id}: concurrency.group is ${concurrency.group}, expected ${expectedGroup}`);
          }
          if (concurrency.cancelInProgress !== "false") {
            offenders.push(`${name} job ${job.id}: cancel-in-progress must be false so a queued job waits rather than cancels`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
