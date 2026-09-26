// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Claims one of a fixed pool of ci deployment names so deploy.yml's `names` job can hand a
// branch deploy a host already registered with HMRC, Companies House and Cognito. Runs on plain Node with no
// npm dependencies, shelling out to the `aws` CLI already on the runner and already
// credentialed by the job's own role-assumption steps, matching wait-for-ci-deploys.mjs and
// cancel-superseded-push-deploy.mjs: those two scripts are dependency-free so they need no
// `npm ci` step before them, and the `names` job that calls this action has none either.
//
// Each slot's claim record lives at /submit/ci/slots/<slot> as
// {"ref": "<github.ref>", "runId": "<id>", "claimedAt": "<ISO>"}. A slot is free when its
// parameter is absent, when its ref is this run's own (a redeploy wins its slot back), when its
// claim has outlived this deployment's own self-destruct delay plus one hour - by then the
// deployment that held it is gone even if none of its release paths (deploy.yml's own
// release-ci-slot job, destroy-ci.yml, or selfDestruct.js) ran - or when the claim's own run has
// finished and the slot is not the environment's current last-known-good deployment. That last
// rule covers a run that reaches release-ci-slot.mjs but is left in place because it was the
// last-known-good deployment at the time: once last-known-good later moves to another slot, this
// one's finished claim no longer has to wait out the staleness window. release-ci-slot.mjs
// releases a deploy.yml run's own claim as soon as that run ends, pass or fail, unless it is
// still last-known-good, so the staleness rule remains the backstop for a run that never reaches
// its own release job at all, not the everyday path.
//
// No compare-and-swap exists for a plain SSM String parameter, so the create-only path (a
// currently absent slot) is the only atomic claim here: `put-parameter` with no --overwrite
// fails outright if another run wins the same race first. Reclaiming an existing record (same
// ref, or stale) instead reads then writes, the same optimistic pattern app/lib/alarmSilence.js
// already uses for its own SSM marker - a real but narrow race between two runs targeting the
// same stale or same-ref slot in the same instant, accepted rather than adding a locking layer
// this repo has no other precedent for.

import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";

import { claimIsActive, fetchRunStatus } from "./slot-claim-active.mjs";

const PARAMETER_PATH_PREFIX = "/submit/ci/slots/";
const LAST_KNOWN_GOOD_PARAMETER = "/submit/ci/last-known-good-deployment";

export function slotNames(prefix, count) {
  return Array.from({ length: count }, (_, i) => `${prefix}${i + 1}`);
}

export function parameterName(slot) {
  return `${PARAMETER_PATH_PREFIX}${slot}`;
}

// runFinished carries the third state a raw run status collapses into: true (the run has
// finished), false (still queued or in progress) or null (its status could not be determined).
// Only a definite true frees the slot early, and only when the slot is not last-known-good -
// null and false are both held, matching claimIsActive's own "unknown means still spoken for".
export function isSlotFree(record, { ref, nowMs, staleAfterMs, slot, runFinished, lastKnownGood }) {
  if (!record) return true;
  if (record.ref === ref) return true;
  const claimedAtMs = Date.parse(record.claimedAt);
  if (Number.isNaN(claimedAtMs)) return true;
  if (nowMs - claimedAtMs > staleAfterMs) return true;
  return runFinished === true && slot !== lastKnownGood;
}

export function describeSlot(slot, record) {
  if (!record) return `${slot}: free`;
  return `${slot}: held by ${record.ref} (run ${record.runId}, claimed ${record.claimedAt})`;
}

// The action resolves the CLI to an absolute path before this script runs, so the spawn never
// searches PATH for it.
function runAws(args) {
  const awsCli = process.env.CLAIM_CI_SLOT_AWS_CLI;
  if (!awsCli || !awsCli.startsWith("/")) {
    throw new Error("CLAIM_CI_SLOT_AWS_CLI must be the absolute path of the aws CLI");
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

function getLastKnownGoodDeployment(region) {
  const result = runAws(["ssm", "get-parameter", "--name", LAST_KNOWN_GOOD_PARAMETER, "--region", region, "--output", "json"]);
  if (result.status !== 0) {
    if (/ParameterNotFound/.test(result.stderr || "")) return null;
    throw new Error(`aws ssm get-parameter ${LAST_KNOWN_GOOD_PARAMETER} failed: ${result.stderr || result.error?.message}`);
  }
  const parsed = JSON.parse(result.stdout);
  return parsed.Parameter.Value;
}

// A failure here must not free a slot whose run is genuinely still going, so any error (a rate
// limit, a network blip) resolves to null - "unknown", which isSlotFree treats the same as
// "still running" - and is logged rather than thrown, so one slot's lookup trouble doesn't stop
// the claim loop from trying the others.
async function resolveRunFinished(repository, runId, token) {
  try {
    const status = await fetchRunStatus(repository, runId, token);
    return !claimIsActive(status);
  } catch (error) {
    console.error(`Could not read run ${runId}'s status (${error.message}); treating its slot claim as still active`);
    return null;
  }
}

function tryClaimAbsentSlot(region, slot, value) {
  const result = runAws(["ssm", "put-parameter", "--name", parameterName(slot), "--type", "String", "--value", value, "--region", region]);
  return result.status === 0;
}

function claimExistingSlot(region, slot, value) {
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

const sleep = (seconds) => new Promise((resolve) => setTimeout(resolve, seconds * 1000));

// Deploy.yml anchors the slot deployment's self-destruct window to this claim's own timestamp
// rather than to the stack's CloudFormation CreationTime, because a reclaimed slot's stack can
// carry over a previous, unrelated ref's creation time.
function writeClaimOutputs(slot, claimedAt) {
  appendFileSync(process.env.GITHUB_OUTPUT, `DEPLOYMENT_NAME=${slot}\nCLAIMED_AT=${claimedAt}\n`);
}

async function main() {
  const ref = process.env.CLAIM_CI_SLOT_GITHUB_REF;
  const runId = process.env.CLAIM_CI_SLOT_RUN_ID;
  const delayHours = Number(process.env.CLAIM_CI_SLOT_DELAY_HOURS);
  const slotCount = Number(process.env.CLAIM_CI_SLOT_SLOT_COUNT || 4);
  const slotPrefix = process.env.CLAIM_CI_SLOT_SLOT_PREFIX || "ci-set";
  const pollSeconds = Number(process.env.CLAIM_CI_SLOT_POLL_SECONDS || 60);
  const ceilingSeconds = Number(process.env.CLAIM_CI_SLOT_CEILING_SECONDS || 1800);
  const region = process.env.AWS_REGION || "eu-west-2";
  const repository = process.env.GITHUB_REPOSITORY;
  const token = process.env.CLAIM_CI_SLOT_GITHUB_TOKEN;

  if (!ref || !runId || Number.isNaN(delayHours) || !repository || !token) {
    throw new Error(
      "CLAIM_CI_SLOT_GITHUB_REF, CLAIM_CI_SLOT_RUN_ID, CLAIM_CI_SLOT_DELAY_HOURS, GITHUB_REPOSITORY and CLAIM_CI_SLOT_GITHUB_TOKEN must be set",
    );
  }

  const staleAfterMs = (delayHours + 1) * 60 * 60 * 1000;
  const slots = slotNames(slotPrefix, slotCount);
  const startedAt = Date.now();

  for (;;) {
    const slotRecords = slots.map((slot) => ({ slot, record: getSlotRecord(region, slot) }));
    const lastKnownGood = getLastKnownGoodDeployment(region);
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const value = JSON.stringify({ ref, runId, claimedAt: nowIso });

    const records = [];
    for (const { slot, record } of slotRecords) {
      const runFinished = record && record.ref !== ref ? await resolveRunFinished(repository, record.runId, token) : null;
      records.push({ slot, record, free: isSlotFree(record, { ref, nowMs, staleAfterMs, slot, runFinished, lastKnownGood }) });
    }

    for (const { slot, record, free } of records) {
      if (!free) continue;

      if (record === null) {
        if (tryClaimAbsentSlot(region, slot, value)) {
          console.log(`Claimed free slot ${slot} for ${ref} (run ${runId})`);
          writeClaimOutputs(slot, nowIso);
          return;
        }
        console.log(`${slot} was claimed by another run before this one could take it, trying the next slot`);
        continue;
      }

      claimExistingSlot(region, slot, value);
      console.log(`Reclaimed slot ${slot} for ${ref} (run ${runId}), previously ${describeSlot(slot, record)}`);
      writeClaimOutputs(slot, nowIso);
      return;
    }

    const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);
    if (elapsedSeconds >= ceilingSeconds) {
      const summary = records.map(({ slot, record }) => describeSlot(slot, record)).join("\n");
      throw new Error(`No ci slot freed up in ${Math.floor(ceilingSeconds / 60)} minutes:\n${summary}`);
    }

    console.log(`Every ci slot is held; waiting ${pollSeconds}s before trying again (elapsed ${elapsedSeconds}s):`);
    records.forEach(({ slot, record }) => console.log(describeSlot(slot, record)));
    await sleep(pollSeconds);
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
