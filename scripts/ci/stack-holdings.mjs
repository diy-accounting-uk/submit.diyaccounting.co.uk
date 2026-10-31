#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/ci/stack-holdings.mjs
//
// Says which of the stack jobs that select-jobs advised to skip may really skip on this deploy.
// The advice compares this commit with the head of the last green deploy.yml run of the branch,
// so a skip is safe only when the stacks of this deployment still hold what that green run left
// in them. A ci slot (ci-set1, ci-set2) passes from branch to branch, so a stack that exists can
// belong to another branch; existence alone is not enough.
//
// A stack job may skip when all of these hold:
//   - the green run's head is the commit the advice compared from;
//   - the green run deployed to this same deployment name (read from the names of its own
//     reusable stack jobs, "... / deploy <name>-app-<Stack>");
//   - every stack of the job stands in CREATE_COMPLETE or UPDATE_COMPLETE;
//   - no stack of the job was created or updated after the green run ended, so the last real
//     change to it came from that run or from a run whose own content the green run kept.
// Anything unknown (no green run, an API error, a missing stack) holds nothing, so every stack
// job runs.
//
// Usage (deploy.yml's stack-holdings job):
//   node scripts/ci/stack-holdings.mjs --advised-json '<json>' --deployment-name <name> \
//     --compared-from <sha> --repo <owner/name> --branch <ref name>
// Prints the JSON list of stack job ids that may skip, and writes a table to the step summary.

import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";

export const STACK_JOB_STACKS = {
  "deploy-auth": [{ stack: "AuthStack", region: "eu-west-2" }],
  "deploy-hmrc": [{ stack: "HmrcStack", region: "eu-west-2" }],
  "deploy-hmrc-itsa": [{ stack: "HmrcItsaStack", region: "eu-west-2" }],
  "deploy-hmrc-itsa-property": [{ stack: "HmrcItsaPropertyStack", region: "eu-west-2" }],
  "deploy-companies-house": [{ stack: "CompaniesHouseStack", region: "eu-west-2" }],
  "deploy-account": [{ stack: "AccountStack", region: "eu-west-2" }],
  "deploy-billing": [{ stack: "BillingStack", region: "eu-west-2" }],
  "deploy-diya-gl": [{ stack: "DiyaGlStack", region: "eu-west-2" }],
  "deploy-api": [
    { stack: "ApiStack", region: "eu-west-2" },
    { stack: "ApiRoutesStack", region: "eu-west-2" },
  ],
  "deploy-edge": [{ stack: "EdgeStack", region: "us-east-1" }],
  "deploy-ops": [{ stack: "OpsStack", region: "eu-west-2" }],
};

export const STACK_REGIONS = [...new Set(Object.values(STACK_JOB_STACKS).flatMap((stacks) => stacks.map((s) => s.region)))];

const HELD_STATUSES = new Set(["CREATE_COMPLETE", "UPDATE_COMPLETE"]);
const INNER_DEPLOY_JOB = / \/ deploy (.+)-app-[A-Za-z]+Stack$/;

// The one deployment name a run's successful reusable stack jobs deployed to, or "" when there
// is none or more than one.
export function deploymentNameOfRun(jobs) {
  const names = new Set();
  for (const job of jobs || []) {
    if (job.conclusion !== "success") continue;
    const match = INNER_DEPLOY_JOB.exec(job.name || "");
    if (match) names.add(match[1]);
  }
  return names.size === 1 ? [...names][0] : "";
}

function lastChangeMs(summary) {
  return Math.max(Date.parse(summary.CreationTime || "") || 0, Date.parse(summary.LastUpdatedTime || "") || 0);
}

// advised: the stack job ids select-jobs advised to skip. greenRun: { headSha, deploymentName,
// completedAt } of the last green run, or null. stacksByRegion: { region: [StackSummary] } from
// list-stacks. Returns { skip, reasons } where reasons names why each advised job runs or skips.
export function heldStackJobs({ advised, deploymentName, comparedFrom, greenRun, stacksByRegion }) {
  const candidates = (advised || []).filter((id) => STACK_JOB_STACKS[id]);
  const reasons = {};
  const skip = [];
  const refuseAll = (reason) => {
    for (const id of candidates) reasons[id] = reason;
    return { skip, reasons };
  };
  if (candidates.length === 0) return { skip, reasons };
  if (!deploymentName) return refuseAll("no deployment name");
  if (!comparedFrom) return refuseAll("the advice compared from main, not from a green run of this branch");
  if (!greenRun) return refuseAll(`no green run with head ${comparedFrom}`);
  if (greenRun.headSha !== comparedFrom) return refuseAll(`the green run's head ${greenRun.headSha} is not ${comparedFrom}`);
  if (greenRun.deploymentName !== deploymentName) {
    return refuseAll(`the green run deployed to "${greenRun.deploymentName}", not "${deploymentName}"`);
  }
  const completedAtMs = Date.parse(greenRun.completedAt || "");
  if (!completedAtMs) return refuseAll("the green run has no end time");

  for (const id of candidates) {
    let reason = "";
    for (const { stack, region } of STACK_JOB_STACKS[id]) {
      const stackName = `${deploymentName}-app-${stack}`;
      const summary = (stacksByRegion[region] || []).find((s) => s.StackName === stackName);
      if (!summary || !HELD_STATUSES.has(summary.StackStatus)) {
        reason = `${stackName} does not stand complete in ${region}`;
        break;
      }
      if (lastChangeMs(summary) > completedAtMs) {
        reason = `${stackName} changed after the green run ended`;
        break;
      }
    }
    if (reason) {
      reasons[id] = reason;
    } else {
      reasons[id] = "held since the green run";
      skip.push(id);
    }
  }
  return { skip, reasons };
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.slice(0, 3).join(" ")} failed: ${(result.stderr || "").trim()}`);
  }
  return result.stdout;
}

// runGh(command, args) returns a command's stdout; the tests pass a stand-in for gh.
export function readGreenRun({ repo, branch, comparedFrom }, runGh = run) {
  if (!comparedFrom) return null;
  const runs = JSON.parse(
    runGh("gh", [
      "api",
      `repos/${repo}/actions/workflows/deploy.yml/runs?branch=${encodeURIComponent(branch)}&status=success&per_page=20`,
      "--jq",
      "[.workflow_runs[] | {id, headSha: .head_sha, completedAt: .updated_at}]",
    ]),
  );
  const green = runs.find((r) => r.headSha === comparedFrom);
  if (!green) return null;
  const jobs = runGh("gh", [
    "api",
    "--paginate",
    `repos/${repo}/actions/runs/${green.id}/jobs?per_page=100`,
    "--jq",
    ".jobs[] | {name, conclusion}",
  ])
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  return { ...green, deploymentName: deploymentNameOfRun(jobs) };
}

function readStacks(region, deploymentName) {
  return JSON.parse(
    run("aws", [
      "cloudformation",
      "list-stacks",
      "--region",
      region,
      "--stack-status-filter",
      "CREATE_COMPLETE",
      "UPDATE_COMPLETE",
      "--query",
      `StackSummaries[?starts_with(StackName, '${deploymentName}-app-')]`,
      "--output",
      "json",
    ]) || "[]",
  );
}

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i += 2) opts[argv[i].replace(/^--/, "")] = argv[i + 1];
  return opts;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  let advised = [];
  try {
    advised = JSON.parse(opts["advised-json"] || "[]");
  } catch {
    advised = [];
  }
  const deploymentName = opts["deployment-name"] || "";
  const comparedFrom = opts["compared-from"] || "";
  const needsRead = advised.some((id) => STACK_JOB_STACKS[id]) && deploymentName && comparedFrom;
  const greenRun = needsRead ? readGreenRun({ repo: opts.repo, branch: opts.branch, comparedFrom }) : null;
  const stacksByRegion = {};
  if (needsRead && greenRun) {
    for (const region of STACK_REGIONS) stacksByRegion[region] = readStacks(region, deploymentName);
  }
  const { skip, reasons } = heldStackJobs({ advised, deploymentName, comparedFrom, greenRun, stacksByRegion });
  if (process.env.GITHUB_STEP_SUMMARY) {
    const rows = Object.entries(reasons).map(([id, reason]) => `| \`${id}\` | ${skip.includes(id) ? "skips" : "runs"} | ${reason} |`);
    const table =
      rows.length > 0 ? ["| Stack job | Here | Why |", "| --- | --- | --- |", ...rows].join("\n") : "No stack job was advised to skip.";
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Stack holdings of ${deploymentName}\n\n${table}\n`);
  }
  process.stdout.write(JSON.stringify(skip));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
