// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Waits for a deploy.yml run in progress or queued on main to clear, so a scheduled probe
// doesn't navigate the apex mid-promotion. Runs on plain Node, not gh/jq: one call site is
// probe-test.yml's behaviour-test job, which runs inside the Playwright container, where gh and
// jq are absent (see wait-for-ci-deploys.mjs, which takes the same approach for the same reason).

const MAX_WAIT_SECONDS = 40 * 60;
const POLL_SECONDS = 60;

const token = process.env.GH_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;
const apiBase = process.env.GITHUB_API_URL || "https://api.github.com";

// A run whose next job waits on an environment's protection rules reports the status
// "waiting", and one just created reports "requested" or "pending": none of those is
// "in_progress" or "queued", so the count reads every recent run and keeps the ones that
// have not completed.
async function countRuns(status) {
  const response = await fetch(
    `${apiBase}/repos/${repository}/actions/workflows/deploy.yml/runs?branch=main&per_page=20`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );
  if (!response.ok) {
    throw new Error(`GitHub API answered ${response.status}: ${await response.text()}`);
  }
  const body = await response.json();
  const runs = body.workflow_runs ?? [];
  if (status === "in_progress") return runs.filter((run) => run.status === "in_progress").length;
  return runs.filter((run) => run.status !== "completed" && run.status !== "in_progress").length;
}

const sleep = (seconds) => new Promise((resolve) => setTimeout(resolve, seconds * 1000));

async function main() {
  if (!token || !repository) {
    throw new Error("GH_TOKEN and GITHUB_REPOSITORY must be set");
  }
  let waited = 0;
  for (;;) {
    const [inProgress, queued] = await Promise.all([countRuns("in_progress"), countRuns("queued")]);
    if (inProgress === 0 && queued === 0) {
      console.log("No deploy.yml run in progress or queued on main, continuing.");
      return;
    }
    if (waited >= MAX_WAIT_SECONDS) {
      console.log(
        `::warning::Waited ${MAX_WAIT_SECONDS}s for deploy.yml on main to finish (in_progress=${inProgress}, queued=${queued}); giving up and continuing anyway.`,
      );
      return;
    }
    console.log(
      `deploy.yml is running on main (in_progress=${inProgress}, queued=${queued}); waiting ${POLL_SECONDS}s (${waited}/${MAX_WAIT_SECONDS}s so far)...`,
    );
    await sleep(POLL_SECONDS);
    waited += POLL_SECONDS;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
