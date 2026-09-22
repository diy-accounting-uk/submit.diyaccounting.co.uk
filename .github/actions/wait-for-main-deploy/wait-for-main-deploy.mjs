// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Waits for a deploy.yml run on main to clear the window where it could move the shared ci apex
// alias, so a probe doesn't navigate the apex mid-promotion. Runs on plain Node, not gh/jq: one
// call site is probe-test.yml's behaviour-test job, which runs inside the Playwright container,
// where gh and jq are absent (see wait-for-ci-deploys.mjs, which takes the same approach for the
// same reason).
//
// A deploy.yml run only moves the apex in its 'set origins' job, and only moves it back in
// 'roll back apex to previous deployment' (which runs solely when set-origins succeeded and the
// prod web-test that follows failed). Everything else in the run — the prod probe suites,
// recording the last-known-good deployment, destroying the previous prod set — cannot touch the
// apex, so a run past 'set origins' with no rollback in flight no longer gates even while the
// run itself is still in_progress. Gating on the whole run's completion instead (as this used
// to) meant a branch's probes sat out the ~45-minute prod half of every main deploy for no
// reason, and a same-branch retry inside the 40-minute ceiling would give up and continue anyway.
//
// max-wait-minutes controls how long this waits before giving up. The params job (which runs
// before any concurrency group is taken) uses the default 40 minutes. The behaviour-test job
// takes a per-suite concurrency lock before it can reach this step, so it passes 0: a single
// check with no sleep, so the lock is never held waiting on a run this job cannot itself
// unblock (a scheduled probe and a deploy's own probe of the same suite share that lock, and a
// deploy's own probe is often what needs to reach 'set origins' next).

import { appendFileSync } from "node:fs";

const DEFAULT_MAX_WAIT_MINUTES = 40;
const POLL_SECONDS = 60;

const SET_ORIGINS_JOB_NAME = "set origins";
const ROLLBACK_JOB_NAME = "roll back apex to previous deployment";

const token = process.env.GH_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;
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

// A run's status is "in_progress" once any job has started; before that it reports "queued",
// "waiting" (on an environment's protection rules) or "requested"/"pending" (just created).
function isUnfinished(run) {
  return run.status !== "completed";
}

function jobNamed(jobs, name) {
  return (jobs || []).find((job) => job.name === name);
}

// Pure so it can be unit-tested without a network call. `jobs` is the run's jobs list (empty or
// absent for a run that has not started any job yet).
export function runStillGatesProbes(run, jobs) {
  if (run.status !== "in_progress") {
    // Not yet started: it will run 'set origins' at some point, so it still gates.
    return { gates: true, reason: `run is ${run.status}, has not started 'set origins' yet` };
  }
  const setOrigins = jobNamed(jobs, SET_ORIGINS_JOB_NAME);
  if (!setOrigins) {
    return { gates: true, reason: `job '${SET_ORIGINS_JOB_NAME}' has not started` };
  }
  if (setOrigins.status !== "completed") {
    return { gates: true, reason: `job '${SET_ORIGINS_JOB_NAME}' is ${setOrigins.status}` };
  }
  const rollback = jobNamed(jobs, ROLLBACK_JOB_NAME);
  if (rollback && rollback.status !== "completed") {
    return { gates: true, reason: `job '${ROLLBACK_JOB_NAME}' is ${rollback.status}` };
  }
  return {
    gates: false,
    reason: `job '${SET_ORIGINS_JOB_NAME}' completed on run ${run.id}; not gating`,
  };
}

async function listRunsOnMain() {
  const body = await github(`/actions/workflows/deploy.yml/runs?branch=main&per_page=20`);
  return (body.workflow_runs ?? []).filter(isUnfinished);
}

async function jobsForRun(runId) {
  const body = await github(`/actions/runs/${runId}/jobs?per_page=100`);
  return body.jobs ?? [];
}

// Each gating entry carries the run id (for naming the deploy run in a caller's summary) and a
// human-readable reason.
async function gatingRuns() {
  const runs = await listRunsOnMain();
  const gating = [];
  for (const run of runs) {
    const jobs = run.status === "in_progress" ? await jobsForRun(run.id) : [];
    const { gates, reason } = runStillGatesProbes(run, jobs);
    if (gates) {
      gating.push({ id: run.id, message: `run ${run.id} (${run.status}): ${reason}` });
    } else {
      console.log(reason);
    }
  }
  return gating;
}

const sleep = (seconds) => new Promise((resolve) => setTimeout(resolve, seconds * 1000));

// Pure so it can be unit-tested without a network call or a real sleep. Returns whether the
// caller should stop polling now, and, if so, whether it stopped because a run is still gating
// (maxWaitSeconds reached with gatingCount > 0) rather than because nothing gates any more.
// maxWaitSeconds of 0 stops after the first check: waitedSeconds (0) >= maxWaitSeconds (0) is
// already true, so a gating result gives up immediately instead of sleeping.
export function decidePollOutcome(gatingCount, waitedSeconds, maxWaitSeconds) {
  if (gatingCount === 0) {
    return { stop: true, deployInProgress: false };
  }
  if (waitedSeconds >= maxWaitSeconds) {
    return { stop: true, deployInProgress: true };
  }
  return { stop: false, deployInProgress: true };
}

function setOutput(name, value) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath) {
    appendFileSync(outputPath, `${name}=${value}\n`);
  }
}

async function main() {
  if (!token || !repository) {
    throw new Error("GH_TOKEN and GITHUB_REPOSITORY must be set");
  }
  const maxWaitMinutes = Number(process.env.MAX_WAIT_MINUTES ?? DEFAULT_MAX_WAIT_MINUTES);
  const maxWaitSeconds = maxWaitMinutes * 60;
  let waited = 0;
  for (;;) {
    const gating = await gatingRuns();
    const outcome = decidePollOutcome(gating.length, waited, maxWaitSeconds);
    if (outcome.stop) {
      if (!outcome.deployInProgress) {
        console.log("No deploy.yml run on main is gating the apex, continuing.");
      } else {
        console.log(
          `::warning::Waited ${waited}s (max ${maxWaitSeconds}s) for deploy.yml on main to clear the apex-move window; giving up and continuing anyway. Still gating: ${gating.map((g) => g.message).join("; ")}`,
        );
      }
      setOutput("deploy-in-progress", outcome.deployInProgress ? "true" : "false");
      setOutput("gating-run-ids", gating.map((g) => g.id).join(","));
      return;
    }
    console.log(
      `deploy.yml on main could still move the apex; waiting ${POLL_SECONDS}s (${waited}/${maxWaitSeconds}s so far). Still gating: ${gating.map((g) => g.message).join("; ")}`,
    );
    await sleep(POLL_SECONDS);
    waited += POLL_SECONDS;
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
