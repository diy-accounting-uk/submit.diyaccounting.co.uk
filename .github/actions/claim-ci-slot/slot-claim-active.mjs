// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Tells destroy-ci.yml's sweep whether a candidate slot's claim record still names a workflow
// run that is in progress or queued, so the sweep skips a set a deploy is using right now instead
// of destroying it out from under that deploy. A redeploy of the same branch reclaims its slot
// (claim-ci-slot.mjs) without necessarily changing the deployment's stack CreationTime, which is
// all the sweep's own age check reads - so a set can pass that check while a live run is still
// mid-deploy against it. Runs on plain Node with no npm dependencies, matching the other scripts
// in this action.
//
// Any failure to read the slot record or the run's status is treated as an active claim: the cost
// of an unnecessary sweep skip is a set surviving one extra pass, the cost of a wrong "not active"
// is the stacks-deleted-mid-deploy failure this script exists to prevent.

import { spawnSync } from "node:child_process";

const PARAMETER_PATH_PREFIX = "/submit/ci/slots/";

// Matches wait-for-ci-deploys.mjs's own UNFINISHED set: a run can sit in any of these states
// before GitHub marks it completed, and every one of them means the slot is still spoken for.
const UNFINISHED_RUN_STATUSES = new Set(["in_progress", "queued", "pending", "waiting", "requested"]);

export function parameterName(slot) {
  return `${PARAMETER_PATH_PREFIX}${slot}`;
}

export function claimIsActive(runStatus) {
  return UNFINISHED_RUN_STATUSES.has(runStatus);
}

// The caller resolves the CLI to an absolute path before this script runs, so the spawn never
// searches PATH for it, matching claim-ci-slot.mjs's runAws.
function runAws(args) {
  const awsCli = process.env.ACTIVE_CLAIM_AWS_CLI;
  if (!awsCli || !awsCli.startsWith("/")) {
    throw new Error("ACTIVE_CLAIM_AWS_CLI must be the absolute path of the aws CLI");
  }
  return spawnSync(awsCli, args, { encoding: "utf8" });
}

function getSlotRecord(region, slot) {
  const result = runAws(["ssm", "get-parameter", "--name", parameterName(slot), "--region", region, "--output", "json"]);
  if (result.status !== 0) {
    if (/ParameterNotFound/.test(result.stderr || "")) return null;
    throw new Error(`aws ssm get-parameter ${parameterName(slot)} failed: ${result.stderr || result.error?.message}`);
  }
  const parsed = JSON.parse(result.stdout);
  return JSON.parse(parsed.Parameter.Value);
}

async function fetchRunStatus(repository, runId, token) {
  const response = await fetch(`https://api.github.com/repos/${repository}/actions/runs/${runId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`GitHub API /actions/runs/${runId} answered ${response.status}: ${await response.text()}`);
  }
  const run = await response.json();
  return run.status;
}

async function checkSlot(slot, region, repository, token) {
  const record = getSlotRecord(region, slot);
  if (!record) {
    console.error(`${slot}: no claim record, nothing to protect`);
    return false;
  }
  const runStatus = await fetchRunStatus(repository, record.runId, token);
  const active = claimIsActive(runStatus);
  if (active) {
    console.error(`[${slot}] stays: claimed by run ${record.runId} (${runStatus})`);
  } else {
    console.error(`${slot}: claim by run ${record.runId} is ${runStatus || "not found"}, not active`);
  }
  return active;
}

// Prints exactly one line, "true" or "false", to stdout for the caller to capture; every log
// line goes to stderr so it never lands inside that captured value. Always exits 0: a destroy
// step that can't tell whether a claim is active must still get an answer, and the answer it
// gets on any error is "true" (see the file comment for why).
async function main() {
  const slot = process.env.ACTIVE_CLAIM_SLOT;
  const region = process.env.AWS_REGION || "eu-west-2";
  const repository = process.env.GITHUB_REPOSITORY;
  const token = process.env.GH_TOKEN;

  try {
    if (!slot || !repository || !token) {
      throw new Error("ACTIVE_CLAIM_SLOT, GITHUB_REPOSITORY and GH_TOKEN must be set");
    }
    const active = await checkSlot(slot, region, repository, token);
    console.log(active ? "true" : "false");
  } catch (error) {
    console.error(`${slot || "(unknown slot)"}: could not determine claim status (${error.message}), treating it as active`);
    console.log("true");
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main();
}
