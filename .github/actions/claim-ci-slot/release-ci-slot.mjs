// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Releases the ci slot claim a deploy.yml run made in claim-ci-slot.mjs, at the end of that same
// run regardless of how it ended, so a failed or cancelled deploy no longer sits on its slot for
// claim-ci-slot.mjs's whole staleness window (self-destruct delay plus one hour) before another
// branch can claim it. Runs on plain Node with no npm dependencies, matching claim-ci-slot.mjs
// and slot-for-ref.mjs.
//
// Only the run that still owns the claim releases it: a record naming a different run means
// another run has since reclaimed or redeployed the slot, and deleting it here would release a
// claim that is not this run's to release. Deciding whether a slot is safe to release AT ALL
// (only a name inside the ci-set pool; never the environment's current last-known-good
// deployment) is the caller's job, same as claim-ci-slot.mjs leaves "when to invoke this" to the
// workflow that calls it - deploy.yml checks both before running this script.

import { spawnSync } from "node:child_process";

const PARAMETER_PATH_PREFIX = "/submit/ci/slots/";

export function parameterName(slot) {
  return `${PARAMETER_PATH_PREFIX}${slot}`;
}

// True when this run's own claim is still the one on record for the slot - nothing has reclaimed
// or redeployed it since. False for an absent record (nothing to release) and for a record
// naming a different run (not this run's claim to release).
export function shouldReleaseSlot(record, runId) {
  if (!record) return false;
  return record.runId === runId;
}

// The caller resolves the CLI to an absolute path before this script runs, so the spawn never
// searches PATH for it, matching claim-ci-slot.mjs's runAws.
function runAws(args) {
  const awsCli = process.env.RELEASE_CI_SLOT_AWS_CLI;
  if (!awsCli || !awsCli.startsWith("/")) {
    throw new Error("RELEASE_CI_SLOT_AWS_CLI must be the absolute path of the aws CLI");
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

function deleteSlotParameter(region, slot) {
  const result = runAws(["ssm", "delete-parameter", "--name", parameterName(slot), "--region", region]);
  if (result.status !== 0) {
    throw new Error(`aws ssm delete-parameter ${parameterName(slot)} failed: ${result.stderr || result.error?.message}`);
  }
}

function main() {
  const slot = process.env.RELEASE_CI_SLOT_DEPLOYMENT_NAME;
  const runId = process.env.RELEASE_CI_SLOT_RUN_ID;
  const region = process.env.AWS_REGION || "eu-west-2";

  if (!slot || !runId) {
    throw new Error("RELEASE_CI_SLOT_DEPLOYMENT_NAME and RELEASE_CI_SLOT_RUN_ID must be set");
  }

  const record = getSlotRecord(region, slot);
  if (!shouldReleaseSlot(record, runId)) {
    if (record) {
      console.log(`${slot} is now held by run ${record.runId}, not this run (${runId}); leaving it`);
    } else {
      console.log(`${slot} has no claim to release`);
    }
    return;
  }

  deleteSlotParameter(region, slot);
  console.log(`Released slot ${slot} (was held by run ${runId})`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
