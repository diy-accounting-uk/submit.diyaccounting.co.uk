#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/check-workflow-permissions.mjs
//
// A `uses: ./.github/workflows/<file>.yml` call site grants the called workflow a
// `permissions:` block. If any job inside the called workflow declares its own
// `permissions:` override that asks for a scope or level the caller does not grant,
// GitHub refuses the whole run at startup, before any job runs and with no per-job
// log. A job in probe-test.yml once gained `issues: write` with no caller job granting
// it, and every deploy.yml call site failed to start. actionlint does not check this.
//
// This script re-derives that startup check statically. It does not use a YAML
// parser: this repo's convention (see scripts/check-commit-identities.sh) is to stay
// free of one for structured-enough files, and GitHub Actions workflow files are
// regular enough — two-space indents, no flow-style mappings — for a line-based
// reader to track "which job am I in" and "what key is this" correctly.
//
// What this deliberately does NOT flag: a called workflow's own top-level
// `permissions:` block, for a job that does not override it. GitHub does not check
// that block against the caller when the workflow runs via `workflow_call`; it is
// only the default token scope for a *standalone* trigger (workflow_dispatch, push,
// schedule) on the same file. A job with no override simply receives whatever the
// caller job grants, whatever that is. deploy-cdk-stack.yml is the live proof: its
// top-level `permissions:` names `pull-requests: read`, no job overrides it, and
// none of its ~18 call sites in deploy.yml or deploy-environment.yml grant
// `pull-requests` at all — those runs complete successfully. Only an explicit
// job-level `permissions:` override inside the called workflow is a real request
// that can exceed the caller's grant.

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname, basename } from "node:path";

const LEVEL_RANK = { none: 0, read: 1, write: 2 };

/**
 * Splits a workflow file's raw text into lines annotated with their indentation
 * depth (count of leading spaces), skipping blank lines and full-line comments.
 * Trailing comments on a content line are left in place — none of the keys this
 * reader looks for (`permissions`, `uses`, `on`, `jobs`, `workflow_call`, scope
 * names) ever carry a trailing `#` in this repo's workflows.
 */
function readLines(text) {
  return text.split("\n").map((raw, index) => {
    const stripped = raw.replace(/\r$/, "");
    const trimmed = stripped.trim();
    const indent = stripped.length - stripped.trimStart().length;
    const isComment = trimmed.startsWith("#");
    const isBlank = trimmed === "";
    return { lineNumber: index + 1, indent, text: trimmed, isBlank, isComment };
  });
}

/**
 * Reads a `permissions:` block starting at `startIndex` (the line holding the
 * `permissions:` key itself, at `keyIndent`). Handles both the inline shorthand
 * (`permissions: write-all` / `permissions: read-all`) and the block form (scope:
 * level pairs indented one step further). Returns `{ value, nextIndex }` where
 * `value` is either the string `"write-all"` / `"read-all"` or a `Map<scope, level>`,
 * and `nextIndex` is the index of the first line after the block.
 */
function readPermissionsBlock(lines, startIndex, keyIndent) {
  const inlineMatch = lines[startIndex].text.match(/^permissions:\s*(\S+)\s*$/);
  if (inlineMatch) {
    return { value: inlineMatch[1], nextIndex: startIndex + 1 };
  }
  const entries = new Map();
  let i = startIndex + 1;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line.isBlank || line.isComment) continue;
    if (line.indent <= keyIndent) break;
    const entryMatch = line.text.match(/^([a-zA-Z-]+):\s*(read|write|none)\s*$/);
    if (entryMatch) {
      entries.set(entryMatch[1], entryMatch[2]);
    }
  }
  return { value: entries, nextIndex: i };
}

/**
 * Parses one workflow file into the shape this check needs: whether it declares
 * `on: workflow_call`, its workflow-level `permissions:` default (or `null` if
 * absent), and per job: its `permissions:` override (or `null`) and every local
 * `uses: ./.github/workflows/<file>.yml` call it makes.
 */
export function parseWorkflow(text) {
  const lines = readLines(text);
  let hasWorkflowCall = false;
  let workflowPermissions = null;
  const jobs = {};

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.isBlank || line.isComment || line.indent !== 0) continue;

    const topKeyMatch = line.text.match(/^([a-zA-Z_-]+):/);
    if (!topKeyMatch) continue;
    const topKey = topKeyMatch[1];

    if (topKey === "on") {
      // 'on:' is either inline ("on: push") or a block whose sub-keys sit one
      // indent step in. Scan that block (or the inline value) for workflow_call.
      if (/^on:\s*\S/.test(line.text)) {
        if (/\bworkflow_call\b/.test(line.text)) hasWorkflowCall = true;
        continue;
      }
      for (let j = i + 1; j < lines.length; j++) {
        const sub = lines[j];
        if (sub.isBlank || sub.isComment) continue;
        if (sub.indent === 0) break;
        if (sub.indent === 2 && /^workflow_call:/.test(sub.text)) {
          hasWorkflowCall = true;
        }
      }
      continue;
    }

    if (topKey === "permissions") {
      const { value } = readPermissionsBlock(lines, i, 0);
      workflowPermissions = value;
      continue;
    }

    if (topKey === "jobs") {
      for (let j = i + 1; j < lines.length; j++) {
        const jobLine = lines[j];
        if (jobLine.isBlank || jobLine.isComment) continue;
        if (jobLine.indent === 0) break;
        if (jobLine.indent !== 2) continue;
        const jobMatch = jobLine.text.match(/^([A-Za-z0-9_.-]+):\s*$/);
        if (!jobMatch) continue;
        const jobId = jobMatch[1];
        const job = { permissions: null, usesCalls: [] };
        jobs[jobId] = job;

        for (let k = j + 1; k < lines.length; k++) {
          const propLine = lines[k];
          if (propLine.isBlank || propLine.isComment) continue;
          if (propLine.indent <= 2) break; // next job, or end of jobs block
          if (propLine.indent !== 4) continue; // ignore anything nested deeper (with:, steps:, run: content, ...)

          const usesMatch = propLine.text.match(/^uses:\s*(\S+)/);
          if (usesMatch) {
            job.usesCalls.push({ target: usesMatch[1].replace(/^['"]|['"]$/g, ""), lineNumber: propLine.lineNumber });
            continue;
          }
          const permMatch = propLine.text.match(/^permissions:/);
          if (permMatch) {
            const { value } = readPermissionsBlock(lines, k, 4);
            job.permissions = value;
          }
        }
      }
      continue;
    }
  }

  return { hasWorkflowCall, workflowPermissions, jobs };
}

/** Resolves the granted level for one scope out of a permissions value. */
function levelFor(permissionsValue, scope) {
  if (permissionsValue === "write-all") return "write";
  if (permissionsValue === "read-all") return "read";
  if (permissionsValue instanceof Map) return permissionsValue.get(scope) || "none";
  return "none";
}

/**
 * A caller job's effective grant: its own `permissions:` override, else its
 * workflow's top-level default, else GitHub's default — which this check treats,
 * per its brief, as "contents: read" only.
 */
function effectiveCallerPermissions(job, workflow) {
  if (job.permissions !== null) return job.permissions;
  if (workflow.workflowPermissions !== null) return workflow.workflowPermissions;
  return new Map([["contents", "read"]]);
}

/**
 * Walks every workflow, finds every local `uses: ./.github/workflows/<file>.yml`
 * call site, and for each job in the called workflow that carries its own
 * `permissions:` override, checks that override against the caller's effective
 * grant. Returns one finding per (scope) shortfall.
 */
export function findViolations(workflowsByFile) {
  const findings = [];

  for (const [callerFile, callerWorkflow] of Object.entries(workflowsByFile)) {
    for (const [callerJobId, callerJob] of Object.entries(callerWorkflow.jobs)) {
      for (const call of callerJob.usesCalls) {
        const calledFile = basename(call.target);
        const calledWorkflow = workflowsByFile[calledFile];
        if (!calledWorkflow || !calledWorkflow.hasWorkflowCall) continue; // not a local reusable workflow this check can see

        const callerEffective = effectiveCallerPermissions(callerJob, callerWorkflow);

        for (const [calledJobId, calledJob] of Object.entries(calledWorkflow.jobs)) {
          if (calledJob.permissions === null) continue; // no override: inherits the caller's grant, always satisfied

          const neededScopes =
            calledJob.permissions instanceof Map
              ? calledJob.permissions
              : new Map(
                  [
                    "actions",
                    "attestations",
                    "checks",
                    "contents",
                    "deployments",
                    "discussions",
                    "id-token",
                    "issues",
                    "packages",
                    "pages",
                    "pull-requests",
                    "repository-projects",
                    "security-events",
                    "statuses",
                  ].map((scope) => [scope, levelFor(calledJob.permissions, scope)]),
                );

          for (const [scope, neededLevel] of neededScopes) {
            const grantedLevel = levelFor(callerEffective, scope);
            if (LEVEL_RANK[grantedLevel] < LEVEL_RANK[neededLevel]) {
              findings.push({
                callerFile,
                callerJobId,
                calledFile,
                calledJobId,
                scope,
                neededLevel,
                grantedLevel,
                lineNumber: call.lineNumber,
              });
            }
          }
        }
      }
    }
  }

  return findings;
}

function formatFinding(f) {
  return (
    `${f.callerFile}:${f.callerJobId} (line ${f.lineNumber}) calls ${f.calledFile}:${f.calledJobId}, ` +
    `which needs '${f.scope}: ${f.neededLevel}' but the caller only grants '${f.scope}: ${f.grantedLevel}'`
  );
}

export function loadWorkflows(workflowsDir) {
  const workflowsByFile = {};
  for (const file of readdirSync(workflowsDir)) {
    if (!file.endsWith(".yml") && !file.endsWith(".yaml")) continue;
    const text = readFileSync(join(workflowsDir, file), "utf8");
    workflowsByFile[file] = parseWorkflow(text);
  }
  return workflowsByFile;
}

export function run(workflowsDir) {
  const workflowsByFile = loadWorkflows(workflowsDir);
  const findings = findViolations(workflowsByFile);
  if (findings.length === 0) {
    console.log("check-workflow-permissions: no nested-permission violations found.");
    return 0;
  }
  console.log(`check-workflow-permissions: ${findings.length} nested-permission violation(s):`);
  for (const finding of findings) {
    console.log(`  ${formatFinding(finding)}`);
  }
  return 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const workflowsDir = process.argv[2] || join(dirname(fileURLToPath(import.meta.url)), "..", ".github", "workflows");
  process.exitCode = run(workflowsDir);
}
