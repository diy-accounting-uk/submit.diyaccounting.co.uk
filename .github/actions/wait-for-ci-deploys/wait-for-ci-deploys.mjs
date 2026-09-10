// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Waits until other in-progress or queued workflow runs that could race this one have finished.
// Polls the GitHub API instead of relying on a concurrency group, because GitHub keeps only the
// latest queued run per group and drops an older one the moment a third run arrives — the exact
// failure this script exists to avoid. Runs on plain Node so it works on a runner and inside the
// Playwright container alike, where gh and jq are absent.
//
// Two callers, two matching rules, chosen by WAIT_FOR_CI_DEPLOYS_MATCH_MODE:
//
//  - 'older' (the default): waits for older runs of deploy.yml/deploy-app.yml/destroy-ci.yml/
//    video-capture.yml on a non-main branch, so concurrent ci branches queue in creation order
//    instead of overlapping on the same CloudFormation stack names. Main is excluded: a prod
//    deploy doesn't share stack names with another branch the way ci ones do.
//  - 'environment': waits for ANY unfinished run of the workflow(s) in
//    WAIT_FOR_CI_DEPLOYS_WORKFLOWS whose resolved environment (main -> prod, else ci) matches
//    WAIT_FOR_CI_DEPLOYS_TARGET_ENVIRONMENT, regardless of which run was created first. Added so
//    deploy.yml can wait for deploy-environment.yml: both are triggered by the same push and can
//    be created in either order a few hundred milliseconds apart, so "older than me" isn't a
//    reliable filter for this pairing the way it is for same-workflow ci branch races.

const DEFAULT_WORKFLOWS = ["deploy.yml", "deploy-app.yml", "destroy-ci.yml", "video-capture.yml"];
const UNFINISHED = new Set(["in_progress", "queued", "pending", "waiting", "requested"]);

const token = process.env.GH_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;
const currentRunId = process.env.CURRENT_RUN_ID;
const pollSeconds = Number(process.env.WAIT_FOR_CI_DEPLOYS_POLL_SECONDS || 60);
const ceilingSeconds = Number(process.env.WAIT_FOR_CI_DEPLOYS_CEILING_SECONDS || 5400);
const apiBase = process.env.GITHUB_API_URL || "https://api.github.com";
const matchMode = process.env.WAIT_FOR_CI_DEPLOYS_MATCH_MODE || "older";
const workflows = (process.env.WAIT_FOR_CI_DEPLOYS_WORKFLOWS || DEFAULT_WORKFLOWS.join(","))
  .split(",")
  .map((workflow) => workflow.trim())
  .filter(Boolean);
const targetEnvironment = process.env.WAIT_FOR_CI_DEPLOYS_TARGET_ENVIRONMENT || "";

async function github(path) {
  const response = await fetch(`${apiBase}/repos/${repository}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub API ${path} answered ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

export function olderUnfinishedRuns(runs, currentCreatedAt, currentId) {
  return runs
    .filter((run) => run.head_branch !== "main")
    .filter((run) => UNFINISHED.has(run.status))
    .filter((run) => String(run.id) !== String(currentId))
    .filter((run) => run.created_at < currentCreatedAt)
    .map((run) => `${run.name}#${run.id} (${run.head_branch}, created ${run.created_at})`);
}

// Same branch-based resolution deploy-environment.yml's own `params` job falls back to when a
// workflow_dispatch doesn't name an explicit environment-name input. A hand-dispatched run that
// overrides the environment on a non-matching branch is a rare manual action this approximation
// misses; it is not a push-triggered race, which is the case this script protects against.
export function environmentResolvedFromBranch(headBranch) {
  return headBranch === "main" ? "prod" : "ci";
}

export function sameEnvironmentUnfinishedRuns(runs, targetEnv, currentId) {
  return runs
    .filter((run) => UNFINISHED.has(run.status))
    .filter((run) => String(run.id) !== String(currentId))
    .filter((run) => environmentResolvedFromBranch(run.head_branch) === targetEnv)
    .map((run) => `${run.name}#${run.id} (${run.head_branch}, created ${run.created_at})`);
}

async function listUnfinishedRuns(currentCreatedAt) {
  const found = [];
  for (const workflow of workflows) {
    const page = await github(`/actions/workflows/${workflow}/runs?per_page=100`);
    const runs = page.workflow_runs || [];
    if (matchMode === "environment") {
      found.push(...sameEnvironmentUnfinishedRuns(runs, targetEnvironment, currentRunId));
    } else {
      found.push(...olderUnfinishedRuns(runs, currentCreatedAt, currentRunId));
    }
  }
  return found;
}

const sleep = (seconds) => new Promise((resolve) => setTimeout(resolve, seconds * 1000));

async function main() {
  if (!token || !repository || !currentRunId) {
    throw new Error("GH_TOKEN, GITHUB_REPOSITORY and CURRENT_RUN_ID must be set");
  }
  if (matchMode === "environment" && !targetEnvironment) {
    throw new Error(
      "WAIT_FOR_CI_DEPLOYS_TARGET_ENVIRONMENT must be set when WAIT_FOR_CI_DEPLOYS_MATCH_MODE=environment",
    );
  }
  const currentRun = await github(`/actions/runs/${currentRunId}`);
  const currentCreatedAt = currentRun.created_at;
  console.log(`This run (id ${currentRunId}) was created at ${currentCreatedAt}.`);
  if (matchMode === "environment") {
    console.log(
      `Waiting for any unfinished ${workflows.join(", ")} run resolved to environment '${targetEnvironment}' to finish first.`,
    );
  } else {
    console.log("Waiting for any ci deploy run created earlier than that to finish first.");
  }

  const startedAt = Date.now();
  for (;;) {
    const found = await listUnfinishedRuns(currentCreatedAt);
    if (found.length === 0) {
      console.log("No matching runs left in progress or queued. Proceeding.");
      return;
    }
    const elapsed = Math.floor((Date.now() - startedAt) / 1000);
    if (elapsed >= ceilingSeconds) {
      console.log(
        `::error::Waited ${Math.floor(ceilingSeconds / 60)} minutes for these runs to finish; still running or queued:`,
      );
      found.forEach((line) => console.log(line));
      process.exit(1);
    }
    console.log(`Still waiting on these runs (elapsed ${elapsed}s):`);
    found.forEach((line) => console.log(line));
    await sleep(pollSeconds);
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
