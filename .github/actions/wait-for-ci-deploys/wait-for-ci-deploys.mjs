// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Waits until every deploy.yml, deploy-app.yml, destroy-ci.yml and video-capture.yml run on a
// non-main branch that was created before this run has finished. Runs on plain Node so it works
// on a runner and inside the Playwright container alike, where gh and jq are absent.

const WORKFLOWS = ["deploy.yml", "deploy-app.yml", "destroy-ci.yml", "video-capture.yml"];
const UNFINISHED = new Set(["in_progress", "queued", "pending", "waiting", "requested"]);

const token = process.env.GH_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;
const currentRunId = process.env.CURRENT_RUN_ID;
const pollSeconds = Number(process.env.WAIT_FOR_CI_DEPLOYS_POLL_SECONDS || 60);
const ceilingSeconds = Number(process.env.WAIT_FOR_CI_DEPLOYS_CEILING_SECONDS || 5400);
const apiBase = process.env.GITHUB_API_URL || "https://api.github.com";

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

async function listOlderUnfinishedRuns(currentCreatedAt) {
  const older = [];
  for (const workflow of WORKFLOWS) {
    const page = await github(`/actions/workflows/${workflow}/runs?per_page=100`);
    older.push(...olderUnfinishedRuns(page.workflow_runs || [], currentCreatedAt, currentRunId));
  }
  return older;
}

const sleep = (seconds) => new Promise((resolve) => setTimeout(resolve, seconds * 1000));

async function main() {
  if (!token || !repository || !currentRunId) {
    throw new Error("GH_TOKEN, GITHUB_REPOSITORY and CURRENT_RUN_ID must be set");
  }
  const currentRun = await github(`/actions/runs/${currentRunId}`);
  const currentCreatedAt = currentRun.created_at;
  console.log(`This run (id ${currentRunId}) was created at ${currentCreatedAt}.`);
  console.log("Waiting for any ci deploy run created earlier than that to finish first.");

  const startedAt = Date.now();
  for (;;) {
    const older = await listOlderUnfinishedRuns(currentCreatedAt);
    if (older.length === 0) {
      console.log("No older ci deploy runs left in progress or queued. Proceeding.");
      return;
    }
    const elapsed = Math.floor((Date.now() - startedAt) / 1000);
    if (elapsed >= ceilingSeconds) {
      console.log(
        `::error::Waited ${Math.floor(ceilingSeconds / 60)} minutes for older ci deploy runs to finish; still running or queued:`,
      );
      older.forEach((line) => console.log(line));
      process.exit(1);
    }
    console.log(`Still waiting on older ci deploy runs (elapsed ${elapsed}s):`);
    older.forEach((line) => console.log(line));
    await sleep(pollSeconds);
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
