// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/alarmCompositeState.js
//
// One AWS call that both the alarmToGithubIssue Lambda (the issue body) and
// scripts/resolve-alarm-evidence.mjs (the triage workflow's evidence file)
// share, so they cannot disagree about which of a composite alarm's
// children actually fired it.

import { CloudWatchClient, DescribeAlarmsCommand } from "@aws-sdk/client-cloudwatch";

/**
 * A composite's AlarmRule ORs several "check-" alarms together (one per
 * suffix a function carries, e.g. both "-errors" and "-log-errors"), but
 * only the child(ren) actually in ALARM caused the composite to fire. Reads
 * each child's own current state with one DescribeAlarms call and returns
 * the function names behind whichever are ALARM right now, so the evidence
 * can name the triggering function first instead of every child the rule
 * lists. Returns [] rather than throwing on a DescribeAlarms failure or
 * when no child is currently ALARM (it may have cleared since), so the
 * evidence still widens to every child instead of losing the run.
 */
export async function resolveTriggeringChildFunctionNames({ children, region }) {
  if (children.length === 0) return [];
  try {
    const cloudwatchClient = new CloudWatchClient({ region });
    const result = await cloudwatchClient.send(
      new DescribeAlarmsCommand({ AlarmNames: children.map((child) => child.alarmName), AlarmTypes: ["MetricAlarm"] }),
    );
    const alarmingNames = new Set(
      (result.MetricAlarms || []).filter((alarm) => alarm.StateValue === "ALARM").map((alarm) => alarm.AlarmName),
    );
    return children.filter((child) => alarmingNames.has(child.alarmName)).map((child) => child.functionName);
  } catch {
    return [];
  }
}
