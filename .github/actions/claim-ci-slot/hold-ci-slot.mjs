// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Holds a ci slot for the duration of destroy-ci.yml's own destroy job, closing the gap between
// that job deciding to tear a slot down and the stack deletion itself: everything in between
// (waiting for older deploys, assuming roles, building the Maven jar) can take long enough for a
// new deploy.yml run to see the slot as free and claim it, deploy into it, and then have its
// stacks deleted out from under it - the failure this script exists to prevent. Runs on plain
// Node with no npm dependencies, matching the other scripts in this action.
//
// Holding works the same way claiming does: write this destroy run's own claim record, {ref:
// HELD_BY_DESTROY_REF, runId, claimedAt}, over the slot's current record. claim-ci-slot.mjs
// already refuses to hand out a slot whose record names a run that is still in progress or
// queued, so once this write lands, any deploy.yml claim attempt against this slot sees this
// destroy run as the active holder and moves on to another slot (or waits) instead.
//
// The record is written only when it is safe to: absent, naming the exact ref this destroy run
// is retiring (the ordinary case - that ref's own deploy has already finished, which is how the
// branch came to be deleted), or naming a run that has itself finished. A record naming a
// still-active run is left alone and the destroy is skipped, because tearing down a slot a live
// deploy is using is exactly the bug this script exists to prevent, not something to force past.

import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";

import { claimIsActive, fetchRunStatus } from "./slot-claim-active.mjs";

const PARAMETER_PATH_PREFIX = "/submit/ci/slots/";
const HELD_BY_DESTROY_REF = "destroy-ci";

export function parameterName(slot) {
  return `${PARAMETER_PATH_PREFIX}${slot}`;
}

// Safe to hold when there is no existing claim, when the claim names the ref this destroy run is
// retiring, or when the claim's own run has finished. Any other record - most importantly one
// naming a run that is still in progress or queued - is not safe to overwrite: some other deploy
// is using the slot right now.
export function isSlotSafeToHold(record, { deletedRef, runFinished }) {
  if (!record) return true;
  if (deletedRef && record.ref === deletedRef) return true;
  return runFinished === true;
}

// The action resolves the CLI to an absolute path before this script runs, so the spawn never
// searches PATH for it, matching claim-ci-slot.mjs's runAws.
function runAws(args) {
  const awsCli = process.env.HOLD_CI_SLOT_AWS_CLI;
  if (!awsCli || !awsCli.startsWith("/")) {
    throw new Error("HOLD_CI_SLOT_AWS_CLI must be the absolute path of the aws CLI");
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

function tryHoldAbsentSlot(region, slot, value) {
  const result = runAws(["ssm", "put-parameter", "--name", parameterName(slot), "--type", "String", "--value", value, "--region", region]);
  return result.status === 0;
}

function holdExistingSlot(region, slot, value) {
  const result = runAws([
    "ssm",
    "put-parameter",
    "--name",
    parameterName(slot),
    "--type",
    "String",
    "--value",
    value,
    "--overwrite",
    "--region",
    region,
  ]);
  if (result.status !== 0) {
    throw new Error(`aws ssm put-parameter ${parameterName(slot)} failed: ${result.stderr || result.error?.message}`);
  }
}

// A failure here must not let a hold proceed against a slot whose run is genuinely still going,
// so any error (a rate limit, a network blip) resolves to null - "unknown", which
// isSlotSafeToHold treats the same as "still running", matching claim-ci-slot.mjs's own
// resolveRunFinished.
async function resolveRunFinished(repository, runId, token) {
  try {
    const status = await fetchRunStatus(repository, runId, token);
    return !claimIsActive(status);
  } catch (error) {
    console.error(`Could not read run ${runId}'s status (${error.message}); treating its slot claim as still active`);
    return null;
  }
}

function writeHeldOutput(held) {
  appendFileSync(process.env.GITHUB_OUTPUT, `held=${held}\n`);
}

async function main() {
  const slot = process.env.HOLD_CI_SLOT_SLOT;
  const runId = process.env.HOLD_CI_SLOT_RUN_ID;
  const deletedRef = process.env.HOLD_CI_SLOT_DELETED_REF || null;
  const region = process.env.AWS_REGION || "eu-west-2";
  const repository = process.env.GITHUB_REPOSITORY;
  const token = process.env.HOLD_CI_SLOT_GITHUB_TOKEN;

  if (!slot || !runId || !repository || !token) {
    throw new Error("HOLD_CI_SLOT_SLOT, HOLD_CI_SLOT_RUN_ID, GITHUB_REPOSITORY and HOLD_CI_SLOT_GITHUB_TOKEN must be set");
  }

  if (!/^ci-set[0-9]+$/.test(slot)) {
    console.log(`${slot} holds no ci slot, nothing to hold`);
    writeHeldOutput("skip");
    return;
  }

  const record = getSlotRecord(region, slot);
  const runFinished = record ? await resolveRunFinished(repository, record.runId, token) : null;

  if (!isSlotSafeToHold(record, { deletedRef, runFinished })) {
    console.error(`Not holding ${slot}: its claim names run ${record.runId}, which is still active`);
    writeHeldOutput("false");
    return;
  }

  const value = JSON.stringify({ ref: HELD_BY_DESTROY_REF, runId, claimedAt: new Date().toISOString() });

  if (record === null) {
    if (!tryHoldAbsentSlot(region, slot, value)) {
      console.error(`${slot} was claimed by another run before this destroy could hold it`);
      writeHeldOutput("false");
      return;
    }
  } else {
    holdExistingSlot(region, slot, value);
  }

  console.log(`Held ${slot} for this destroy (run ${runId})`);
  writeHeldOutput("true");
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
