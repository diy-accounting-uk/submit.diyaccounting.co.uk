// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Coordinates scripts/toggle-cognito-native-auth.js across every workflow that calls it, so one
// workflow's disable step never turns an environment's Cognito native auth off while another
// workflow (or another matrix leg of the same workflow) still needs it on. deploy.yml's own
// "enable native auth" and "disable native auth" jobs bracket every web-test job that reuses the
// same setting, and a scheduled probe-test.yml run toggles the same setting independently; issues
// #372 and #377 were that deploy.yml's disable ran while a scheduled probe-test.yml run was still
// mid-test, because neither workflow knew about the other's use of the setting.
//
// Each environment's holders live at /submit/<environment-name>/native-auth-holders as a JSON
// list of {id, runId, workflow, since}. Enable adds this call's own holder, then always calls the
// underlying toggle script's enable (idempotent, so a holder that arrives to find native auth
// already on costs nothing). Disable removes this call's own holder and only calls the underlying
// toggle script's disable once the list is empty; while any other holder remains, native auth
// stays on and this call's job still succeeds; whichever holder is the last to release drains the
// list to empty and performs the real disable.
//
// A holder is dropped as stale, on every enable or disable call, once its run has finished (read
// through the GitHub API, matching claim-ci-slot.mjs's own run-status check) or once it is older
// than stale-after-hours - a backstop for a holder whose run never reaches its own release step at
// all (a cancelled run, a runner that dies outright).
//
// SSM has no compare-and-swap for a plain String parameter (see claim-ci-slot.mjs's own comment),
// so a write here is read-modify-write with a read-back verification: after writing, this reads
// the parameter again and retries the whole read-modify-write if another writer's update landed
// in between, rather than trusting the write blindly.

import { spawnSync } from "node:child_process";
import { randomInt } from "node:crypto";

import { SSMClient, GetParameterCommand, PutParameterCommand } from "@aws-sdk/client-ssm";

import { fetchRunStatus, claimIsActive } from "../claim-ci-slot/slot-claim-active.mjs";

const MAX_WRITE_ATTEMPTS = 5;
const WRITE_RETRY_BASE_DELAY_MS = 300;

export function holdersParameterName(environmentName) {
  return `/submit/${environmentName}/native-auth-holders`;
}

// Pure so it can be unit-tested without a network call or a real clock. runFinished carries the
// three-state result a raw run status collapses into: true (the run has finished), false (still
// queued or in progress) or null (its status could not be determined) - only a definite true, or
// the age bound, drops the holder; null and false are both held, matching claim-ci-slot.mjs's own
// "unknown means still active".
export function isHolderStale(holder, { nowMs, staleAfterMs, runFinished }) {
  const sinceMs = Date.parse(holder.since);
  if (Number.isNaN(sinceMs)) return true;
  if (nowMs - sinceMs > staleAfterMs) return true;
  return runFinished === true;
}

export function addHolder(holders, holder) {
  if (holders.some((existing) => existing.id === holder.id)) return holders;
  return [...holders, holder];
}

export function removeHolder(holders, id) {
  return holders.filter((holder) => holder.id !== id);
}

// A failure to read a holder's run status must not free it while that run could still be using
// native auth, so any error (rate limit, network blip) resolves to null - "unknown", which
// isHolderStale treats the same as "still active" - and is logged rather than thrown, matching
// claim-ci-slot.mjs's resolveRunFinished.
async function resolveRunFinished(repository, runId, token) {
  try {
    const status = await fetchRunStatus(repository, runId, token);
    return !claimIsActive(status);
  } catch (error) {
    console.error(`Could not read run ${runId}'s status (${error.message}); treating its native-auth hold as still active`);
    return null;
  }
}

// Not unit-tested directly (it calls the GitHub API through resolveRunFinished below); the pure
// decision it delegates to, isHolderStale, carries its own tests for the age-bound and
// unparseable-timestamp cases, matching wait-for-main-deploy.mjs's split between the pure gating
// decision and the network calls that feed it.
async function dropStaleHolders(holders, { repository, token, staleAfterMs, nowMs }) {
  const runFinishedByRunId = new Map();
  const kept = [];
  for (const holder of holders) {
    if (!runFinishedByRunId.has(holder.runId)) {
      runFinishedByRunId.set(holder.runId, await resolveRunFinished(repository, holder.runId, token));
    }
    const runFinished = runFinishedByRunId.get(holder.runId);
    if (isHolderStale(holder, { nowMs, staleAfterMs, runFinished })) {
      console.log(`Dropping stale native-auth hold ${holder.id} (run ${holder.runId}, held since ${holder.since})`);
    } else {
      kept.push(holder);
    }
  }
  return kept;
}

async function readHolders(ssmClient, parameterName) {
  try {
    const result = await ssmClient.send(new GetParameterCommand({ Name: parameterName }));
    return JSON.parse(result.Parameter?.Value ?? "[]");
  } catch (error) {
    if (error.name === "ParameterNotFound") return [];
    throw error;
  }
}

async function writeHolders(ssmClient, parameterName, holders) {
  await ssmClient.send(
    new PutParameterCommand({ Name: parameterName, Type: "String", Overwrite: true, Value: JSON.stringify(holders) }),
  );
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Reads the current holders, asks computeNext for the list this call wants to write, writes it,
// then reads back to check nothing else landed a write in between. Retries the whole cycle on a
// mismatch rather than trusting the write, since SSM gives no compare-and-swap to lean on instead.
async function updateHoldersWithRetry(ssmClient, parameterName, computeNext) {
  let lastObserved = null;
  for (let attempt = 1; attempt <= MAX_WRITE_ATTEMPTS; attempt++) {
    const current = await readHolders(ssmClient, parameterName);
    const next = await computeNext(current);
    await writeHolders(ssmClient, parameterName, next);
    const verify = await readHolders(ssmClient, parameterName);
    if (JSON.stringify(verify) === JSON.stringify(next)) return next;
    lastObserved = verify;
    const delayMs = WRITE_RETRY_BASE_DELAY_MS * attempt + randomInt(WRITE_RETRY_BASE_DELAY_MS);
    console.log(`${parameterName} changed under this write (attempt ${attempt}/${MAX_WRITE_ATTEMPTS}), retrying in ${delayMs}ms`);
    await sleep(delayMs);
  }
  throw new Error(`Could not update ${parameterName} after ${MAX_WRITE_ATTEMPTS} attempts; last observed value: ${JSON.stringify(lastObserved)}`);
}

function runToggleScript(action, environmentName, client) {
  const args = ["scripts/toggle-cognito-native-auth.js", action, environmentName];
  if (client && client !== "both") args.push("--client", client);
  const result = spawnSync(process.execPath, args, { stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`toggle-cognito-native-auth.js ${action} ${environmentName} exited ${result.status}`);
  }
}

export async function main() {
  const mode = process.env.HOLD_NATIVE_AUTH_MODE;
  const environmentName = process.env.HOLD_NATIVE_AUTH_ENVIRONMENT_NAME;
  const client = process.env.HOLD_NATIVE_AUTH_CLIENT || "both";
  const holderId = process.env.HOLD_NATIVE_AUTH_HOLDER_ID;
  const runId = process.env.HOLD_NATIVE_AUTH_RUN_ID;
  const workflow = process.env.HOLD_NATIVE_AUTH_WORKFLOW || "";
  const token = process.env.HOLD_NATIVE_AUTH_GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  const staleAfterHours = Number(process.env.HOLD_NATIVE_AUTH_STALE_AFTER_HOURS || 4);

  if (!mode || !["enable", "disable"].includes(mode)) {
    throw new Error("HOLD_NATIVE_AUTH_MODE must be 'enable' or 'disable'");
  }
  if (!environmentName || !holderId || !runId || !token || !repository) {
    throw new Error(
      "HOLD_NATIVE_AUTH_ENVIRONMENT_NAME, HOLD_NATIVE_AUTH_HOLDER_ID, HOLD_NATIVE_AUTH_RUN_ID, HOLD_NATIVE_AUTH_GITHUB_TOKEN and GITHUB_REPOSITORY must be set",
    );
  }

  const parameterName = holdersParameterName(environmentName);
  const ssmClient = new SSMClient({});
  const staleAfterMs = staleAfterHours * 60 * 60 * 1000;

  if (mode === "enable") {
    const holders = await updateHoldersWithRetry(ssmClient, parameterName, async (current) => {
      const nowMs = Date.now();
      const stale = await dropStaleHolders(current, { repository, token, staleAfterMs, nowMs });
      return addHolder(stale, { id: holderId, runId, workflow, since: new Date(nowMs).toISOString() });
    });
    console.log(`native-auth-holders for ${environmentName}: ${holders.map((holder) => holder.id).join(", ")}`);
    runToggleScript("enable", environmentName, client);
    return;
  }

  const holders = await updateHoldersWithRetry(ssmClient, parameterName, async (current) => {
    const nowMs = Date.now();
    const withoutSelf = removeHolder(current, holderId);
    return dropStaleHolders(withoutSelf, { repository, token, staleAfterMs, nowMs });
  });

  if (holders.length === 0) {
    runToggleScript("disable", environmentName, client);
  } else {
    console.log(`Not disabling native auth on ${environmentName}: still held by ${holders.map((holder) => holder.id).join(", ")}`);
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
