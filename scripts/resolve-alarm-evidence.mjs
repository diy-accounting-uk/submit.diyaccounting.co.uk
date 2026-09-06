#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// scripts/resolve-alarm-evidence.mjs
//
// Prints the same alarm-to-evidence mapping the alarmToGithubIssue Lambda
// uses, as one JSON object, so anything that needs to query the same log
// groups and traces an issue links to — today the alarm-triage workflow —
// reads it through the same modules the Lambda does and can never drift
// from what the issue actually says.
//
// Two modes:
//
// Explicit inputs (no AWS calls, everything given on the command line):
//   node scripts/resolve-alarm-evidence.mjs --alarm-name prod-env-hmrc-submission-failure \
//     --deployment prod-0f68ed8 --namespace Submit/Business --metric-name VatSubmissionFailure \
//     --dimensions '{"Actor":"customer"}' --start 2026-09-03T21:25:00.000Z \
//     --end 2026-09-03T21:50:23.618Z --region eu-west-2
//
// From the live alarm (one DescribeAlarms call reads the current metric or
// composite configuration and state; the window is derived the same way
// the Lambda derives it):
//   node scripts/resolve-alarm-evidence.mjs --alarm-name prod-env-hmrc-submission-failure \
//     --region eu-west-2 --from-alarm

import { fileURLToPath } from "node:url";
import { CloudWatchClient, DescribeAlarmsCommand } from "@aws-sdk/client-cloudwatch";

import { alarmFamilyKey, resolveAlarmEnv } from "../app/lib/alarmName.js";
import { resolveAlarmEvidence, extractCompositeChildFunctionNames } from "../app/lib/alarmEvidence.js";
import { resolveAlarmWindow } from "../app/lib/alarmWindow.js";
import { buildLogsInsightsLink, buildXRayTraceSearchLink } from "../app/lib/consoleLinks.js";
import { resolveDeploymentSlug } from "../app/functions/ops/alarmToGithubIssue.js";

export function parseArgs(argv) {
  const opts = {
    alarmName: undefined,
    deployment: undefined,
    namespace: undefined,
    metricName: undefined,
    dimensions: "{}",
    start: undefined,
    end: undefined,
    region: "eu-west-2",
    fromAlarm: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--alarm-name":
        opts.alarmName = argv[++i];
        break;
      case "--deployment":
        opts.deployment = argv[++i];
        break;
      case "--namespace":
        opts.namespace = argv[++i];
        break;
      case "--metric-name":
        opts.metricName = argv[++i];
        break;
      case "--dimensions":
        opts.dimensions = argv[++i];
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
      case "--from-alarm":
        opts.fromAlarm = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!opts.alarmName) throw new Error("--alarm-name is required");
  if (!opts.fromAlarm && (!opts.start || !opts.end)) {
    throw new Error("--start and --end are required unless --from-alarm is given");
  }
  return opts;
}

/**
 * Reads the alarm's current configuration and state with one DescribeAlarms
 * call and derives the same window a live ALARM event would have produced.
 * A composite alarm (a "-stack-health" family) carries no metric of its
 * own, so its window falls back to the default period against its own
 * state transition timestamp.
 *
 * Returns `{ found: false }` when DescribeAlarms has nothing by that name
 * rather than throwing: a deployment-scoped alarm on a retired set (every
 * main deploy retires the previous one; ci sets self-destruct hourly) is
 * the normal case, not a failure.
 */
async function resolveFromLiveAlarm({ alarmName, region }) {
  const cloudwatchClient = new CloudWatchClient({ region });
  // DescribeAlarms defaults to MetricAlarm only when AlarmTypes is omitted, so a composite
  // ("-stack-health") alarm name would otherwise come back empty even when it exists.
  const result = await cloudwatchClient.send(
    new DescribeAlarmsCommand({ AlarmNames: [alarmName], AlarmTypes: ["CompositeAlarm", "MetricAlarm"] }),
  );

  const metricAlarm = result.MetricAlarms?.[0];
  const compositeAlarm = result.CompositeAlarms?.[0];
  if (!metricAlarm && !compositeAlarm) {
    return { found: false };
  }

  if (compositeAlarm) {
    const window = resolveAlarmWindow({
      reasonData: null,
      timestamp: (compositeAlarm.StateTransitionTimestamp || new Date()).toISOString(),
      periodSeconds: null,
    });
    return {
      found: true,
      namespace: null,
      metricName: null,
      dimensions: {},
      compositeChildFunctionNames: extractCompositeChildFunctionNames(compositeAlarm.AlarmRule),
      window,
    };
  }

  const metric = metricAlarm.Metrics?.[0]?.MetricStat?.Metric;
  const namespace = metricAlarm.Namespace || metric?.Namespace || null;
  const metricName = metricAlarm.MetricName || metric?.MetricName || null;
  const dimensionList = metricAlarm.Dimensions || metric?.Dimensions || [];
  const dimensions = Object.fromEntries(dimensionList.map((dimension) => [dimension.Name, dimension.Value]));

  let reasonData = null;
  if (typeof metricAlarm.StateReasonData === "string" && metricAlarm.StateReasonData.length > 0) {
    try {
      reasonData = JSON.parse(metricAlarm.StateReasonData);
    } catch {
      reasonData = null;
    }
  }

  const window = resolveAlarmWindow({
    reasonData,
    timestamp: (metricAlarm.StateUpdatedTimestamp || new Date()).toISOString(),
    periodSeconds: metricAlarm.Period || null,
  });

  return { found: true, namespace, metricName, dimensions, compositeChildFunctionNames: [], window };
}

/**
 * Builds the evidence object for an alarm DescribeAlarms no longer returns.
 * Runs the same resolveAlarmEvidence rules a live alarm would, with no
 * namespace or metric to key on, so a family key alone (e.g. a
 * "-stack-health" or app-scoped alarm name) still resolves to the
 * deployment's Lambda log group prefix rather than an empty answer.
 */
function buildNotFoundEvidence({ alarmName, familyKey, env, deployment, region }) {
  const evidence = resolveAlarmEvidence({
    alarmName,
    familyKey,
    env,
    deployment,
    namespace: null,
    metricName: null,
    dimensions: {},
    compositeChildFunctionNames: [],
  });

  const rawWindow = process.env.ALARM_WINDOW;
  const window =
    rawWindow && rawWindow.trim().length > 0
      ? `${rawWindow} (from the ALARM_WINDOW environment variable; the alarm's own history could not be read)`
      : "unknown: the alarm's own history could not be read and no ALARM_WINDOW was set";

  return {
    ...evidence,
    logsInsightsUrl: null,
    xrayUrl: null,
    alarmFound: false,
    alarmName,
    deployment,
    region,
    window,
    note: "the alarm no longer exists: its deployment set has been retired, so the log groups may be gone too",
  };
}

export async function main(argv) {
  const opts = parseArgs(argv);
  const familyKey = alarmFamilyKey(opts.alarmName);
  const env = resolveAlarmEnv(opts.alarmName, "prod");
  const deployment = opts.deployment || (await resolveDeploymentSlug({ alarmName: opts.alarmName, env }));

  let namespace;
  let metricName;
  let dimensions;
  let compositeChildFunctionNames;
  let window;

  if (opts.fromAlarm) {
    const liveAlarm = await resolveFromLiveAlarm({ alarmName: opts.alarmName, region: opts.region });
    if (!liveAlarm.found) {
      const output = buildNotFoundEvidence({
        alarmName: opts.alarmName,
        familyKey,
        env,
        deployment,
        region: opts.region,
      });
      console.log(JSON.stringify(output, null, 2));
      return output;
    }
    ({ namespace, metricName, dimensions, compositeChildFunctionNames, window } = liveAlarm);
  } else {
    namespace = opts.namespace || null;
    metricName = opts.metricName || null;
    dimensions = JSON.parse(opts.dimensions);
    compositeChildFunctionNames = [];
    window = { startIso: opts.start, endIso: opts.end };
  }

  const evidence = resolveAlarmEvidence({
    alarmName: opts.alarmName,
    familyKey,
    env,
    deployment,
    namespace,
    metricName,
    dimensions,
    compositeChildFunctionNames,
  });

  const logsInsightsUrl = buildLogsInsightsLink({
    region: opts.region,
    startIso: window.startIso,
    endIso: window.endIso,
    queryString: evidence.insightsQuery,
  });
  const xrayUrl = buildXRayTraceSearchLink({
    region: opts.region,
    startIso: window.startIso,
    endIso: window.endIso,
    filterExpression: evidence.xrayFilterExpression,
  });

  const output = { ...evidence, logsInsightsUrl, xrayUrl, alarmFound: true };
  console.log(JSON.stringify(output, null, 2));
  return output;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
