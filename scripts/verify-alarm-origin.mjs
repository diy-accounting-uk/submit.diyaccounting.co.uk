#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/verify-alarm-origin.mjs
//
// Confirms that an alarm issue's claim is true: that the named CloudWatch
// alarm really transitioned to ALARM inside the window the issue body
// gives. This is the strongest proof available anywhere in the alarm
// pipeline (see REPORT_IDENTITY_AUDIT.md section 5, rank 1), because it
// depends on nothing but re-reading AWS's own record with
// `cloudwatch describe-alarm-history`.
//
// Fails closed: a missing alarm name, an unparseable window, an AWS call
// that errors, or a history with no matching transition all come back as
// `verified: false`, never as a default pass. The caller (alarm-triage.yml)
// exits non-zero on any unverified result, so an issue nobody can confirm
// stops the workflow rather than running triage on an unproven claim.
//
// Usage:
//   node scripts/verify-alarm-origin.mjs --alarm-name prod-a0f41c7-app-api-5xx \
//     --window "2026-09-03T21:25:00.000Z to 2026-09-03T21:50:23.618Z (period 300s x 2, margin 300s)" \
//     --region eu-west-2
//
// --window takes the exact string alarm-triage.yml extracts from the
// issue's "**Window:**" line (see app/functions/ops/alarmToGithubIssue.js
// renderWindowLine). --start and --end may be given instead of --window.

import { fileURLToPath } from "node:url";
import { CloudWatchClient, DescribeAlarmHistoryCommand } from "@aws-sdk/client-cloudwatch";

const WINDOW_PATTERN = /^(\S+)\s+to\s+(\S+)/;

/**
 * Extract the start and end timestamps from the window text the issue body
 * carries. Only the first two tokens matter; the trailing "(period ...,
 * margin ...)" annotation is not needed to query CloudWatch. Returns null
 * for anything that does not parse as two ISO timestamps, so a garbled or
 * hand-edited window claim fails the caller's check rather than silently
 * querying an empty or wrong-way-round range.
 */
export function parseWindow(windowText) {
  if (typeof windowText !== "string") return null;
  const match = windowText.trim().match(WINDOW_PATTERN);
  if (!match) return null;
  const [, startIso, endIso] = match;
  if (Number.isNaN(Date.parse(startIso)) || Number.isNaN(Date.parse(endIso))) return null;
  return { startIso, endIso };
}

/**
 * DescribeAlarmHistory's HistoryData is a JSON string describing the state
 * transition. Malformed or missing data is treated as "no evidence here",
 * not as a crash: one bad history item must not stop the rest from being
 * checked.
 */
function parseHistoryData(historyData) {
  if (typeof historyData !== "string" || historyData.length === 0) return null;
  try {
    return JSON.parse(historyData);
  } catch {
    return null;
  }
}

/**
 * The one check this script exists for: does CloudWatch's own history
 * contain a state update, for this exact alarm name, that landed on ALARM,
 * inside the claimed window? Everything else in the issue body (the
 * reason text, the deployment, the region) is not re-checked here, because
 * a wrong reason string does not make the alarm event itself fake — only a
 * transition that never happened does.
 */
export function evaluateAlarmHistory({ alarmName, startIso, endIso, historyItems }) {
  if (!alarmName) {
    return { verified: false, reason: "no alarm name was claimed" };
  }

  const startMs = Date.parse(startIso);
  const endMs = Date.parse(endIso);
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
    return { verified: false, reason: `the claimed window did not parse: "${startIso}" to "${endIso}"` };
  }

  for (const item of historyItems || []) {
    if (item.AlarmName !== alarmName) continue;
    if (item.HistoryItemType !== "StateUpdate") continue;

    const data = parseHistoryData(item.HistoryData);
    if (!data || data.newState?.stateValue !== "ALARM") continue;

    const itemMs = new Date(item.Timestamp).getTime();
    if (Number.isNaN(itemMs) || itemMs < startMs || itemMs > endMs) continue;

    return {
      verified: true,
      reason: `confirmed: ${alarmName} transitioned to ALARM at ${new Date(itemMs).toISOString()}`,
      matchedTimestamp: new Date(itemMs).toISOString(),
    };
  }

  return {
    verified: false,
    reason: `no ALARM transition for ${alarmName} was found in CloudWatch's alarm history between ${startIso} and ${endIso}`,
  };
}

/**
 * Pages through DescribeAlarmHistory for the exact alarm name and window
 * claimed. AlarmTypes covers both a metric alarm and a composite
 * ("-stack-health") alarm, since either can be the one an issue names.
 */
export async function fetchAlarmHistory({ alarmName, region, startIso, endIso }) {
  const client = new CloudWatchClient({ region });
  const items = [];
  let nextToken;
  do {
    const result = await client.send(
      new DescribeAlarmHistoryCommand({
        AlarmName: alarmName,
        AlarmTypes: ["CompositeAlarm", "MetricAlarm"],
        HistoryItemType: "StateUpdate",
        StartDate: new Date(startIso),
        EndDate: new Date(endIso),
        NextToken: nextToken,
      }),
    );
    items.push(...(result.AlarmHistoryItems || []));
    nextToken = result.NextToken;
  } while (nextToken);
  return items;
}

export function parseArgs(argv) {
  const opts = { alarmName: undefined, window: undefined, start: undefined, end: undefined, region: "eu-west-2" };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--alarm-name":
        opts.alarmName = argv[++i];
        break;
      case "--window":
        opts.window = argv[++i];
        break;
      case "--start":
        opts.start = argv[++i];
        break;
      case "--end":
        opts.end = argv[++i];
        break;
      case "--region":
        opts.region = argv[++i];
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return opts;
}

/**
 * Resolves to `{ verified, reason }` and never throws: an AWS error is
 * itself a failure to confirm the claim, so it is caught and reported as
 * `verified: false` rather than left to crash the caller.
 */
export async function main(argv) {
  const opts = parseArgs(argv);

  if (!opts.alarmName) {
    const result = { verified: false, reason: "no --alarm-name was given" };
    console.log(JSON.stringify(result, null, 2));
    return result;
  }

  const window = opts.window ? parseWindow(opts.window) : opts.start && opts.end ? { startIso: opts.start, endIso: opts.end } : null;
  if (!window) {
    const result = { verified: false, reason: "no usable window was given: pass --window, or both --start and --end" };
    console.log(JSON.stringify(result, null, 2));
    return result;
  }

  let historyItems;
  try {
    historyItems = await fetchAlarmHistory({
      alarmName: opts.alarmName,
      region: opts.region,
      startIso: window.startIso,
      endIso: window.endIso,
    });
  } catch (error) {
    const result = { verified: false, reason: `describe-alarm-history call failed: ${error.message}` };
    console.log(JSON.stringify(result, null, 2));
    return result;
  }

  const result = evaluateAlarmHistory({
    alarmName: opts.alarmName,
    startIso: window.startIso,
    endIso: window.endIso,
    historyItems,
  });
  console.log(JSON.stringify(result, null, 2));
  return result;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2))
    .then((result) => {
      process.exitCode = result.verified ? 0 : 1;
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
