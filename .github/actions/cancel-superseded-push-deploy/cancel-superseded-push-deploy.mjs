// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Cancels any push-triggered deploy.yml run of this run's own commit that has not yet started a
// stack job, so a workflow_dispatch run carrying an explicit deployment-name does not deploy the
// same commit twice in parallel. Every stack-deploying job in deploy.yml (deploy-auth,
// deploy-api, deploy-edge, ...) names itself "deploy <something>", so a run counts as having
// started its own deploy once any such job is in_progress or completed; a run still queued or
// only running earlier jobs (test, mvn-package, push-images, ...) is safe to cancel.
//
// Plain Node with fetch, no gh/jq, matching wait-for-ci-deploys.mjs: this runs from the same
// composite-action step shape and should work anywhere that one does.

const CANCELABLE_STATUSES = new Set(["queued", "pending", "waiting", "requested", "in_progress"]);
const STARTED_STACK_JOB_STATUSES = new Set(["in_progress", "completed"]);

const token = process.env.GH_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;
const currentSha = process.env.CURRENT_SHA;
const currentRunId = process.env.CURRENT_RUN_ID;
const apiBase = process.env.GITHUB_API_URL || "https://api.github.com";

async function github(path, options = {}) {
  const response = await fetch(`${apiBase}/repos/${repository}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub API ${path} answered ${response.status}: ${await response.text()}`);
  }
  return response.status === 204 ? null : response.json();
}

export function hasStartedStackJob(jobs) {
  return jobs.some((job) => job.name.startsWith("deploy ") && STARTED_STACK_JOB_STATUSES.has(job.status));
}

export function cancelableSupersededRuns(runs, currentId) {
  return runs.filter((run) => String(run.id) !== String(currentId)).filter((run) => CANCELABLE_STATUSES.has(run.status));
}

async function listPushRunsForSha() {
  const page = await github(`/actions/workflows/deploy.yml/runs?event=push&head_sha=${currentSha}&per_page=20`);
  return page.workflow_runs || [];
}

async function jobsForRun(runId) {
  const page = await github(`/actions/runs/${runId}/jobs?per_page=100`);
  return page.jobs || [];
}

async function main() {
  if (!token || !repository || !currentSha || !currentRunId) {
    throw new Error("GH_TOKEN, GITHUB_REPOSITORY, CURRENT_SHA and CURRENT_RUN_ID must be set");
  }

  const runs = await listPushRunsForSha();
  const candidates = cancelableSupersededRuns(runs, currentRunId);
  if (candidates.length === 0) {
    console.log(`No push-triggered deploy.yml run of ${currentSha} to check.`);
    return;
  }

  for (const run of candidates) {
    const jobs = await jobsForRun(run.id);
    if (hasStartedStackJob(jobs)) {
      console.log(`Leaving run ${run.id} alone: it has already started a stack deploy job.`);
      continue;
    }
    console.log(`Cancelling superseded push-triggered run ${run.id} (status ${run.status}), no stack job started yet.`);
    try {
      await github(`/actions/runs/${run.id}/cancel`, { method: "POST" });
    } catch (error) {
      // The run may have moved on (completed, or already cancelled) between the list and the
      // cancel call; that race is not this script's problem to resolve, only to not crash on.
      console.log(`Could not cancel run ${run.id}, leaving it alone: ${error.message}`);
    }
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
