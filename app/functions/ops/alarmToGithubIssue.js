// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/functions/ops/alarmToGithubIssue.js
//
// EventBridge target Lambda: receives raw CloudWatch Alarm State Change
// events (default bus, source "aws.cloudwatch") and raises a GitHub issue
// in this repository when an alarm enters the ALARM state. If an open
// issue already exists for the alarm, it comments on that issue instead
// of opening a duplicate.
//
// This is deliberately minimal: one alarm, one issue thread, no fan-out
// to multiple channels or repos. It proves the alarm-to-issue path works
// end to end; a later build can add routing/dedup across many alarms.

import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { createLogger } from "../../lib/logger.js";

const logger = createLogger({ source: "app/functions/ops/alarmToGithubIssue.js" });

const smClient = new SecretsManagerClient({ region: process.env.AWS_REGION || "eu-west-2" });

let cachedGitHubToken = null;

async function resolveGitHubToken() {
  if (cachedGitHubToken) return cachedGitHubToken;

  const arn = process.env.OPS_GITHUB_TOKEN_SECRET_ARN;
  if (!arn) throw new Error("OPS_GITHUB_TOKEN_SECRET_ARN environment variable is required");

  const result = await smClient.send(new GetSecretValueCommand({ SecretId: arn }));
  if (!result.SecretString) throw new Error(`Secret ${arn} exists but has no SecretString value`);

  cachedGitHubToken = result.SecretString;
  return cachedGitHubToken;
}

/**
 * Extract the fields needed to raise or comment on an issue from a raw
 * CloudWatch Alarm State Change event.
 */
export function resolveAlarmDetail(event) {
  const detail = event.detail || {};
  const alarmArn = Array.isArray(event.resources) ? event.resources[0] : undefined;

  return {
    alarmName: detail.alarmName || "unknown",
    state: detail.state?.value || "UNKNOWN",
    previousState: detail.previousState?.value || "UNKNOWN",
    reason: detail.state?.reason || "",
    timestamp: detail.state?.timestamp || event.time || "",
    region: event.region || process.env.AWS_REGION || "eu-west-2",
    alarmArn,
  };
}

export function buildAlarmConsoleLink(region, alarmName) {
  return `https://${region}.console.aws.amazon.com/cloudwatch/home?region=${region}#alarmsV2:alarm/${encodeURIComponent(alarmName)}`;
}

export function buildIssueTitle(alarmName) {
  return `[ALARM] ${alarmName}`;
}

export function buildIssueBody({ alarmName, state, previousState, reason, timestamp, consoleLink }) {
  return `## CloudWatch alarm state change

**Alarm:** ${alarmName}
**State:** ${previousState} → ${state}
**Reason:** ${reason || "not provided"}
**Timestamp:** ${timestamp}

[View in CloudWatch console](${consoleLink})

---
*Raised automatically by the alarm-to-issue pipeline.*`;
}

export function buildCommentBody({ state, previousState, reason, timestamp, consoleLink }) {
  return `Alarm state changed again: ${previousState} → ${state}${reason ? ` (${reason})` : ""} at ${timestamp}.

[View in CloudWatch console](${consoleLink})`;
}

/**
 * Search open issues in the repo for one already raised for this alarm.
 * Matches on exact title so unrelated issues that happen to mention the
 * alarm name in their body are not picked up.
 */
export async function findOpenIssueByAlarmName(githubToken, githubRepo, alarmName) {
  const title = buildIssueTitle(alarmName);
  const query = `repo:${githubRepo} is:issue is:open in:title "${title}"`;
  const response = await fetch(`https://api.github.com/search/issues?q=${encodeURIComponent(query)}`, {
    headers: {
      "Authorization": `Bearer ${githubToken}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitHub search API error: ${response.status} ${errorText}`);
  }

  const result = await response.json();
  return (result.items || []).find((issue) => issue.title === title) || null;
}

export async function createGitHubIssue(githubToken, githubRepo, { title, body, labels }) {
  const response = await fetch(`https://api.github.com/repos/${githubRepo}/issues`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${githubToken}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title, body, labels }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitHub API error creating issue: ${response.status} ${errorText}`);
  }

  return response.json();
}

export async function commentOnGitHubIssue(githubToken, githubRepo, issueNumber, body) {
  const response = await fetch(`https://api.github.com/repos/${githubRepo}/issues/${issueNumber}/comments`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${githubToken}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ body }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitHub API error commenting on issue: ${response.status} ${errorText}`);
  }

  return response.json();
}

/**
 * EventBridge target handler for CloudWatch Alarm State Change events.
 * Only ALARM transitions raise or update a GitHub issue; OK and
 * INSUFFICIENT_DATA transitions are logged and skipped.
 */
export async function handler(event) {
  const alarm = resolveAlarmDetail(event);

  logger.info({
    message: "Processing CloudWatch alarm state change for GitHub issue routing",
    alarmName: alarm.alarmName,
    state: alarm.state,
    previousState: alarm.previousState,
  });

  if (alarm.state !== "ALARM") {
    logger.info({
      message: "Alarm state is not ALARM, skipping issue creation",
      alarmName: alarm.alarmName,
      state: alarm.state,
    });
    return;
  }

  const githubRepo = process.env.GITHUB_REPO;
  if (!githubRepo) throw new Error("GITHUB_REPO environment variable is required");

  const githubToken = await resolveGitHubToken();
  const consoleLink = buildAlarmConsoleLink(alarm.region, alarm.alarmName);

  const existingIssue = await findOpenIssueByAlarmName(githubToken, githubRepo, alarm.alarmName);

  if (existingIssue) {
    logger.info({
      message: "Open issue already exists for alarm, adding comment instead of duplicating",
      alarmName: alarm.alarmName,
      issueNumber: existingIssue.number,
    });
    await commentOnGitHubIssue(
      githubToken,
      githubRepo,
      existingIssue.number,
      buildCommentBody({
        state: alarm.state,
        previousState: alarm.previousState,
        reason: alarm.reason,
        timestamp: alarm.timestamp,
        consoleLink,
      }),
    );
    return;
  }

  const issue = await createGitHubIssue(githubToken, githubRepo, {
    title: buildIssueTitle(alarm.alarmName),
    body: buildIssueBody({
      alarmName: alarm.alarmName,
      state: alarm.state,
      previousState: alarm.previousState,
      reason: alarm.reason,
      timestamp: alarm.timestamp,
      consoleLink,
    }),
    labels: ["alarm", "ops"],
  });

  logger.info({
    message: "Created GitHub issue for alarm",
    alarmName: alarm.alarmName,
    issueNumber: issue.number,
    issueUrl: issue.html_url,
  });
}
