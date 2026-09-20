#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/close-alarm-issue-when-ok.mjs
//
// Closes one open [ALARM] issue when its family's remedy row says it can
// close itself: the issue was authored by the alarm pipeline's own App
// identity, verify-alarm-origin.mjs's own functions confirm the alarm it
// names really transitioned to ALARM in the window claimed, and every live
// CloudWatch alarm of the family is OK (or, for a close-when-gone family,
// none exists at all).
//
// Fails closed: a missing family, an unrecognised author, an unverified
// origin, or an AWS call that errors all leave the issue open. Nothing here
// defaults to closing.
//
// Usage:
//   node scripts/close-alarm-issue-when-ok.mjs --issue-number 305 \
//     --repo diy-accounting-uk/submit.diyaccounting.co.uk
//
// Reads GH_TOKEN from the environment for every `gh` call it makes, and AWS
// credentials the same way every other script here does: from whatever the
// caller already configured.

import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CloudWatchClient, DescribeAlarmsCommand } from "@aws-sdk/client-cloudwatch";

import { parseWindow, fetchAlarmHistory, evaluateAlarmHistory } from "./verify-alarm-origin.mjs";

const EXPECTED_AUTHOR_LOGIN = "diyaccounting-ops[bot]";
const TITLE_PATTERN = /^\[ALARM]\s+(.+)$/;
const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const REMEDIES_PATH = join(REPO_ROOT, "app", "data", "alarm-remedies.json");

/**
 * Extracts the alarm family key from an [ALARM] issue's title. Returns null
 * for a title that does not carry the marker, so a hand-typed issue with a
 * similar-looking title never resolves to a family by accident.
 */
export function familyFromTitle(title) {
  const match = (title || "").match(TITLE_PATTERN);
  return match ? match[1].trim() : null;
}

/**
 * Extracts the alarm name, window and region the issue body claims, in the
 * same shape alarm-triage.yml already reads from an alarm-to-issue body.
 */
export function readAlarmClaimFromBody(body) {
  const alarmName = (body || "").match(/^\*\*Alarm:\*\*\s*(.+)$/m)?.[1]?.trim() ?? null;
  const window = (body || "").match(/^\*\*Window:\*\*\s*(.+)$/m)?.[1]?.trim() ?? null;
  const region = (body || "").match(/^\*\*Region:\*\*\s*(.+)$/m)?.[1]?.trim() ?? null;
  return { alarmName, window, region };
}

/**
 * True only when the issue was authored by the alarm pipeline's own App
 * identity. Ambiguity resolves to false: an issue this cannot confirm as
 * machine-raised is never closed by this script.
 */
export function isAuthoredByAlarmPipeline(author, expectedLogin = EXPECTED_AUTHOR_LOGIN) {
  return Boolean(author) && author.type === "Bot" && author.login === expectedLogin;
}

/**
 * The one decision this script exists to make: given the remedy a family
 * carries and the current state of every live alarm found for it, should
 * the issue close? `alarms` is whatever DescribeAlarms returned for the
 * family's name; an empty list means no alarm by that name exists any
 * more, which only a close-when-gone family treats as resolved.
 */
export function decideClosure({ remedy, alarms }) {
  if (!remedy || remedy === "none") {
    return { shouldClose: false, reason: "the family's remedy is none; a person decides" };
  }
  if (alarms.length === 0) {
    if (remedy === "close-when-gone") {
      return { shouldClose: true, reason: "no alarm of this family exists any more" };
    }
    return { shouldClose: false, reason: "no alarm of this family was found, and its remedy is not close-when-gone" };
  }
  const states = alarms.map((alarm) => `${alarm.AlarmName} (${alarm.StateValue})`).join(", ");
  const allOk = alarms.every((alarm) => alarm.StateValue === "OK");
  if (allOk) {
    return { shouldClose: true, reason: `every alarm of this family is OK: ${states}` };
  }
  return { shouldClose: false, reason: `not every alarm of this family is OK: ${states}` };
}

export function loadRemedyRow(family, remediesPath = REMEDIES_PATH) {
  const remedies = JSON.parse(readFileSync(remediesPath, "utf8"));
  return remedies.find((row) => row.family === family) ?? null;
}

export async function describeAlarmsForFamily(family, region) {
  const client = new CloudWatchClient({ region });
  const alarms = [];
  let nextToken;
  do {
    const result = await client.send(
      new DescribeAlarmsCommand({
        AlarmNamePrefix: family,
        AlarmTypes: ["CompositeAlarm", "MetricAlarm"],
        NextToken: nextToken,
      }),
    );
    alarms.push(...(result.MetricAlarms || []), ...(result.CompositeAlarms || []));
    nextToken = result.NextToken;
  } while (nextToken);
  return alarms;
}

export function parseArgs(argv) {
  const opts = { issueNumber: undefined, repo: undefined, region: "eu-west-2" };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--issue-number":
        opts.issueNumber = argv[++i];
        break;
      case "--repo":
        opts.repo = argv[++i];
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

function ghApiJson(path) {
  return JSON.parse(execFileSync("gh", ["api", path], { encoding: "utf8" }));
}

function ghIssueClose(repo, issueNumber, comment) {
  execFileSync("gh", ["issue", "close", String(issueNumber), "--repo", repo, "--comment", comment], { stdio: "inherit" });
}

/**
 * Resolves to `{ closed, reason }` and never throws: any failure along the
 * way (a bad argument, an unverifiable origin, an AWS error) is reported as
 * `closed: false` with the reason, leaving the issue open for a person.
 */
export async function main(argv, { ghApi = ghApiJson, closeIssue = ghIssueClose, fetchAlarms = describeAlarmsForFamily } = {}) {
  const opts = parseArgs(argv);
  if (!opts.issueNumber || !opts.repo) {
    const result = { closed: false, reason: "no --issue-number or --repo was given" };
    console.log(JSON.stringify(result, null, 2));
    return result;
  }

  const issue = ghApi(`repos/${opts.repo}/issues/${opts.issueNumber}`);

  const family = familyFromTitle(issue.title);
  if (!family) {
    const result = { closed: false, reason: `issue title does not carry an [ALARM] family: "${issue.title}"` };
    console.log(JSON.stringify(result, null, 2));
    return result;
  }

  if (!isAuthoredByAlarmPipeline(issue.user)) {
    const result = { closed: false, reason: `issue #${opts.issueNumber} was not authored by ${EXPECTED_AUTHOR_LOGIN}` };
    console.log(JSON.stringify(result, null, 2));
    return result;
  }

  const remedyRow = loadRemedyRow(family);
  if (!remedyRow || remedyRow.remedy === "none") {
    const result = { closed: false, reason: `family ${family} has no remedy other than none` };
    console.log(JSON.stringify(result, null, 2));
    return result;
  }

  const claim = readAlarmClaimFromBody(issue.body);
  const window = claim.window ? parseWindow(claim.window) : null;
  if (!claim.alarmName || !window) {
    const result = { closed: false, reason: `issue #${opts.issueNumber} body carries no usable alarm name or window` };
    console.log(JSON.stringify(result, null, 2));
    return result;
  }

  const region = claim.region || opts.region;

  let historyItems;
  try {
    historyItems = await fetchAlarmHistory({ alarmName: claim.alarmName, region, startIso: window.startIso, endIso: window.endIso });
  } catch (error) {
    const result = { closed: false, reason: `describe-alarm-history call failed: ${error.message}` };
    console.log(JSON.stringify(result, null, 2));
    return result;
  }
  const origin = evaluateAlarmHistory({ alarmName: claim.alarmName, startIso: window.startIso, endIso: window.endIso, historyItems });
  if (!origin.verified) {
    const result = { closed: false, reason: `alarm origin did not verify: ${origin.reason}` };
    console.log(JSON.stringify(result, null, 2));
    return result;
  }

  let alarms;
  try {
    alarms = await fetchAlarms(family, region);
  } catch (error) {
    const result = { closed: false, reason: `describe-alarms call failed: ${error.message}` };
    console.log(JSON.stringify(result, null, 2));
    return result;
  }

  const decision = decideClosure({ remedy: remedyRow.remedy, alarms });
  if (!decision.shouldClose) {
    const result = { closed: false, reason: decision.reason };
    console.log(JSON.stringify(result, null, 2));
    return result;
  }

  const comment = `Closed by alarm-remedy-close: family ${family}'s remedy is ${remedyRow.remedy}. ${decision.reason}.`;
  closeIssue(opts.repo, opts.issueNumber, comment);
  const result = { closed: true, reason: decision.reason, comment };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2))
    .then((result) => {
      process.exitCode = result.closed ? 0 : 1;
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
