#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability OPS-148 Stop a stack deploy when one resource stalls with no physical id
// - **Use when:** a `deploy-cdk-stack.yml` job sits in `cdk deploy` for an hour with one resource CREATE_IN_PROGRESS and the log shows nothing.
// - **Does:** polls `aws cloudformation list-stack-resources` every 60 s while `cdk deploy` runs. When one resource has been CREATE_IN_PROGRESS or UPDATE_IN_PROGRESS with no PhysicalResourceId for 15 minutes and no resource changed state in that time, it prints the resource and its type to the log and the step summary and stops the deploy process group, so the job fails with the resource named.
// - **Run:** `node scripts/ci/stack-stall-watchdog.mjs --stack <name> --regions "eu-west-2 us-east-1" --kill-group <pid> --marker <file>`
// - **Entry:** `scripts/ci/stack-stall-watchdog.mjs`; `.github/workflows/deploy-cdk-stack.yml`
// - **Files:** scripts/ci/stack-stall-watchdog.mjs, app/unit-tests/scripts/stackStallWatchdog.test.js, .github/workflows/deploy-cdk-stack.yml
// - **Keywords:** stall, watchdog, CREATE_IN_PROGRESS, PhysicalResourceId, cdk deploy, ExpiredToken, alarm stall
// - **Related:** OPS-124
// @end-capability

import { spawnSync } from "node:child_process";
import { appendFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const POLL_INTERVAL_MS = 60 * 1000;
export const STALL_THRESHOLD_MS = 15 * 60 * 1000;

const IN_PROGRESS = new Set(["CREATE_IN_PROGRESS", "UPDATE_IN_PROGRESS"]);

/** The resources that have started and have no physical id yet. */
export function unidentifiedInProgress(resources) {
  return resources.filter((r) => IN_PROGRESS.has(r.ResourceStatus) && !r.PhysicalResourceId);
}

/** One string that changes whenever any resource changes status or gains a physical id. */
export function stateSignature(resources) {
  return resources
    .map((r) => `${r.LogicalResourceId}|${r.ResourceStatus}|${r.PhysicalResourceId ? "id" : "-"}`)
    .sort()
    .join("\n");
}

/**
 * Pure decision step. `previous` is the value this function returned last time (or undefined).
 * Returns { signature, since, stalled } where `stalled` lists the resources that have been
 * unidentified and in progress, with no other resource changing state, for the threshold.
 */
export function observe(previous, resources, nowMs, thresholdMs = STALL_THRESHOLD_MS) {
  const signature = stateSignature(resources);
  const candidates = unidentifiedInProgress(resources);
  if (!previous || previous.signature !== signature || candidates.length === 0) {
    return { signature, since: nowMs, stalled: [] };
  }
  const stalled = nowMs - previous.since >= thresholdMs ? candidates : [];
  return { signature, since: previous.since, stalled };
}

export function describeStall(stackName, region, stalled, minutes) {
  return stalled.map(
    (r) =>
      `Stack ${stackName} (${region}): ${r.LogicalResourceId} (${r.ResourceType}) has been ${r.ResourceStatus} with no physical id for ${minutes} minutes and no other resource changed state.`,
  );
}

function listResources(stackName, region) {
  const result = spawnSync(
    "aws",
    ["cloudformation", "list-stack-resources", "--region", region, "--stack-name", stackName, "--output", "json"],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  if (result.status !== 0) return undefined;
  try {
    return JSON.parse(result.stdout).StackResourceSummaries ?? [];
  } catch {
    return undefined;
  }
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) args[argv[i].replace(/^--/, "")] = argv[i + 1];
  return args;
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const stackName = args.stack;
  const regions = (args.regions ?? "eu-west-2").split(/\s+/).filter(Boolean);
  const killGroup = Number(args["kill-group"]);
  const marker = args.marker;
  const intervalMs = Number(args["interval-ms"] ?? POLL_INTERVAL_MS);
  const thresholdMs = Number(args["threshold-ms"] ?? STALL_THRESHOLD_MS);
  if (!stackName || !marker || !killGroup) {
    console.error("Usage: stack-stall-watchdog.mjs --stack <name> --regions <list> --kill-group <pid> --marker <file>");
    process.exit(2);
  }
  const previous = {};
  for (;;) {
    sleep(intervalMs);
    for (const region of regions) {
      const resources = listResources(stackName, region);
      if (!resources) continue;
      const seen = observe(previous[region], resources, Date.now(), thresholdMs);
      previous[region] = seen;
      if (seen.stalled.length === 0) continue;
      const lines = describeStall(stackName, region, seen.stalled, Math.round(thresholdMs / 60000));
      for (const line of lines) console.error(`::error::${line}`);
      writeFileSync(marker, lines.join("\n") + "\n");
      if (process.env.GITHUB_STEP_SUMMARY) {
        appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Stack stall\n\n${lines.map((l) => `- ${l}`).join("\n")}\n`);
      }
      try {
        process.kill(-killGroup, "SIGTERM");
      } catch {
        process.kill(killGroup, "SIGTERM");
      }
      process.exit(3);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
