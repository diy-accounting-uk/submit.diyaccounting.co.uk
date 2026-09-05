// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/functions/ops/alarmToGithubIssue.js
//
// EventBridge target Lambda: receives raw CloudWatch Alarm State Change
// events (default bus, source "aws.cloudwatch") and raises a GitHub issue
// in this repository when an alarm enters the ALARM state. If an open
// issue already exists for the alarm's family, it comments on that issue
// instead of opening a duplicate.
//
// Alarm names carry a deployment slug (e.g. "prod-a0f41c7-app-api-5xx"),
// so a fresh deployment of the same check would otherwise open a fresh
// issue and orphan the previous deployment's. Deduping is keyed on the
// alarm's family (the name with its deployment slug dropped, see
// app/lib/alarmName.js), so every deployment of the same check shares one
// rolling issue per environment. The issue body and every comment still
// name the exact alarm and deployment that fired, so the family issue
// stays traceable to the deployment behind each event.
//
// Every issue and comment carries links to the AWS console (the alarm
// itself, a CloudWatch Logs Insights query and an X-Ray trace search, both
// pre-scoped to the alarm's evaluation window) rather than any log text,
// metric value or table contents, because this repository is public and
// only a signed-in operator can follow those links. See
// app/lib/alarmEvidence.js for the mapping from alarm to evidence and
// app/lib/alarmWindow.js for the window calculation.
//
// OK transitions are never acted on: this Lambda only tracks GitHub issue
// state, not which deployments' children are still in ALARM, so it cannot
// tell whether an OK from one deployment means the whole family has
// recovered. The safe rule is the simple one: only ALARM transitions
// comment or open, and a family issue is closed by a human, never by this
// Lambda.

import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { CloudWatchClient, DescribeAlarmsCommand } from "@aws-sdk/client-cloudwatch";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import { createLogger } from "../../lib/logger.js";
import { alarmFamilyKey, resolveAlarmEnv } from "../../lib/alarmName.js";
import { resolveAlarmEvidence, extractCompositeChildFunctionNames } from "../../lib/alarmEvidence.js";
import { resolveAlarmWindow } from "../../lib/alarmWindow.js";
import { buildAlarmConsoleLink, buildLogsInsightsLink, buildXRayTraceSearchLink } from "../../lib/consoleLinks.js";

const logger = createLogger({ source: "app/functions/ops/alarmToGithubIssue.js" });

const smClient = new SecretsManagerClient({ region: process.env.AWS_REGION || "eu-west-2" });
const ssmClient = new SSMClient({ region: process.env.AWS_REGION || "eu-west-2" });

let cachedGitHubToken = null;
const cachedDeploymentSlugs = new Map();

async function resolveGitHubToken() {
  if (cachedGitHubToken) return cachedGitHubToken;

  const arn = process.env.OPS_GITHUB_TOKEN_SECRET_ARN;
  if (!arn) throw new Error("OPS_GITHUB_TOKEN_SECRET_ARN environment variable is required");

  const result = await smClient.send(new GetSecretValueCommand({ SecretId: arn }));
  if (!result.SecretString) throw new Error(`Secret ${arn} exists but has no SecretString value`);

  cachedGitHubToken = result.SecretString;
  return cachedGitHubToken;
}

function parseReasonData(reasonData) {
  if (typeof reasonData !== "string" || reasonData.length === 0) return null;
  try {
    return JSON.parse(reasonData);
  } catch (error) {
    logger.warn({ message: "Alarm state reasonData is not valid JSON, ignoring", error: error.message });
    return null;
  }
}

/**
 * Extract the fields needed to raise or comment on an issue, and the
 * fields the evidence mapping and window calculation need, from a raw
 * CloudWatch Alarm State Change event.
 */
export function resolveAlarmDetail(event) {
  const detail = event.detail || {};
  const alarmArn = Array.isArray(event.resources) ? event.resources[0] : undefined;
  const metric = detail.configuration?.metrics?.[0]?.metricStat?.metric;

  return {
    alarmName: detail.alarmName || "unknown",
    state: detail.state?.value || "UNKNOWN",
    previousState: detail.previousState?.value || "UNKNOWN",
    reason: detail.state?.reason || "",
    timestamp: detail.state?.timestamp || event.time || "",
    region: event.region || process.env.AWS_REGION || "eu-west-2",
    alarmArn,
    namespace: metric?.namespace || null,
    metricName: metric?.name || null,
    dimensions: metric?.dimensions || {},
    periodSeconds: detail.configuration?.metrics?.[0]?.metricStat?.period || null,
    reasonData: parseReasonData(detail.state?.reasonData),
  };
}

const DEPLOYMENT_SLUG_PATTERN = /^(ci|prod)-([^-]+)-app-/;

/**
 * The deployment slug this alarm belongs to: read straight off the alarm
 * name when it carries one, otherwise the environment's last-known-good
 * deployment from SSM (an environment-scoped alarm, e.g. a submission
 * failure, still points at the deployment whose Lambda wrote the logs).
 * The SSM answer is cached per container: it changes only on a deploy, and
 * every alarm in the same invocation environment shares it.
 */
export async function resolveDeploymentSlug({ alarmName, env }) {
  const match = (alarmName || "").match(DEPLOYMENT_SLUG_PATTERN);
  if (match) return match[2];

  if (cachedDeploymentSlugs.has(env)) return cachedDeploymentSlugs.get(env);

  const parameterName = `/submit/${env}/last-known-good-deployment`;
  const result = await ssmClient.send(new GetParameterCommand({ Name: parameterName }));
  const slug = result.Parameter?.Value || null;
  cachedDeploymentSlugs.set(env, slug);
  return slug;
}

/**
 * A "-stack-health" alarm is a composite with no metric of its own; its
 * children are named in its AlarmRule. Returns [] and logs a warning
 * rather than throwing, so a DescribeAlarms failure widens the evidence to
 * the deployment or environment prefix (see alarmEvidence.js rules 15/16)
 * instead of failing issue creation.
 */
export async function resolveCompositeChildFunctionNames({ region, alarmName }) {
  try {
    const cloudwatchClient = new CloudWatchClient({ region });
    const result = await cloudwatchClient.send(
      new DescribeAlarmsCommand({ AlarmNames: [alarmName], AlarmTypes: ["CompositeAlarm"] }),
    );
    const alarmRule = result.CompositeAlarms?.[0]?.AlarmRule;
    return extractCompositeChildFunctionNames(alarmRule);
  } catch (error) {
    logger.warn({
      message: "Failed to resolve composite alarm's child function names, widening evidence links",
      alarmName,
      error: error.message,
    });
    return [];
  }
}

export function buildIssueTitle(alarmName) {
  return `[ALARM] ${alarmName}`;
}

function renderEvidenceSection({ alarmConsoleLink, logsInsightsLink, xrayLink, evidence }) {
  const lines = ["### Evidence", ""];
  lines.push(`- [CloudWatch alarm](${alarmConsoleLink})`);

  if (logsInsightsLink) {
    lines.push(`- [Logs Insights for this window](${logsInsightsLink}) — \`${evidence.logGroupNamePrefixes.join(", ")}\``);
  } else if (evidence.noEvidenceReason) {
    lines.push(`- No log group applies: ${evidence.noEvidenceReason}`);
  }

  if (xrayLink) {
    lines.push(`- [X-Ray traces for this window](${xrayLink}) — \`${evidence.xrayFilterExpression}\``);
  }

  if (evidence.tableNames.length > 0) {
    const tableList = evidence.tableNames.map((name) => `\`${name}\``).join(", ");
    lines.push(`- Related DynamoDB table${evidence.tableNames.length > 1 ? "s" : ""}: ${tableList}`);
  }

  for (const link of evidence.extraLinks) {
    lines.push(`- [${link.label}](${link.url})`);
  }

  return lines.join("\n");
}

function renderWindowLine(window) {
  return `**Window:** ${window.startIso} to ${window.endIso} (period ${window.periodSeconds}s × ${window.evaluatedPeriods}, margin ${window.marginSeconds}s)`;
}

export function buildIssueBody({
  alarmName,
  familyKey,
  state,
  previousState,
  reason,
  timestamp,
  region,
  deployment,
  window,
  evidence,
  links,
}) {
  const headerLines = ["## CloudWatch alarm state change", "", `**Alarm:** ${alarmName}`];
  if (familyKey && familyKey !== alarmName) headerLines.push(`**Family:** ${familyKey}`);
  headerLines.push(`**State:** ${previousState} → ${state}`);
  headerLines.push(`**Reason:** ${reason || "not provided"}`);
  headerLines.push(`**Timestamp:** ${timestamp}`);
  if (window) headerLines.push(renderWindowLine(window));
  headerLines.push(`**Region:** ${region}`);
  if (deployment) headerLines.push(`**Deployment:** ${deployment}`);

  const evidenceSection = renderEvidenceSection({
    alarmConsoleLink: links.alarmConsole,
    logsInsightsLink: links.logsInsights,
    xrayLink: links.xray,
    evidence,
  });

  return `${headerLines.join("\n")}

${evidenceSection}

Every link needs a signed-in AWS session. Nothing from the logs is copied here.

---
*Raised automatically by the alarm-to-issue pipeline.*`;
}

export function buildCommentBody({ alarmName, state, previousState, reason, timestamp, window, evidence, links }) {
  const headerLines = [
    `Alarm state changed again: ${previousState} → ${state}${reason ? ` (${reason})` : ""} at ${timestamp}.`,
    "",
    `**Alarm:** ${alarmName}`,
  ];
  if (window) headerLines.push(renderWindowLine(window));

  const evidenceSection = renderEvidenceSection({
    alarmConsoleLink: links.alarmConsole,
    logsInsightsLink: links.logsInsights,
    xrayLink: links.xray,
    evidence,
  });

  return `${headerLines.join("\n")}

${evidenceSection}`;
}

/**
 * Search open issues in the repo for one already raised for this alarm's
 * family. Matches on exact title so unrelated issues that happen to mention
 * the family key in their body are not picked up.
 */
export async function findOpenIssueByAlarmFamily(githubToken, githubRepo, familyKey) {
  const title = buildIssueTitle(familyKey);
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
 * INSUFFICIENT_DATA transitions are logged and skipped. This Lambda never
 * closes an issue on OK: it has no record of which other deployments'
 * alarms in the same family are still in ALARM, so closing on one
 * deployment's recovery risks closing a family issue that another
 * deployment is still tripping.
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
  const familyKey = alarmFamilyKey(alarm.alarmName);
  const env = resolveAlarmEnv(alarm.alarmName, process.env.ENVIRONMENT_NAME);

  const deployment = await resolveDeploymentSlug({ alarmName: alarm.alarmName, env });
  const compositeChildFunctionNames = familyKey.endsWith("-stack-health")
    ? await resolveCompositeChildFunctionNames({ region: alarm.region, alarmName: alarm.alarmName })
    : [];

  const window = resolveAlarmWindow({
    reasonData: alarm.reasonData,
    timestamp: alarm.timestamp,
    periodSeconds: alarm.periodSeconds,
  });

  const evidence = resolveAlarmEvidence({
    alarmName: alarm.alarmName,
    familyKey,
    env,
    deployment,
    namespace: alarm.namespace,
    metricName: alarm.metricName,
    dimensions: alarm.dimensions,
    compositeChildFunctionNames,
  });

  const links = {
    alarmConsole: buildAlarmConsoleLink(alarm.region, alarm.alarmName),
    logsInsights: buildLogsInsightsLink({
      region: alarm.region,
      startIso: window.startIso,
      endIso: window.endIso,
      queryString: evidence.insightsQuery,
    }),
    xray: buildXRayTraceSearchLink({
      region: alarm.region,
      startIso: window.startIso,
      endIso: window.endIso,
      filterExpression: evidence.xrayFilterExpression,
    }),
  };

  const bodyFields = {
    alarmName: alarm.alarmName,
    familyKey,
    state: alarm.state,
    previousState: alarm.previousState,
    reason: alarm.reason,
    timestamp: alarm.timestamp,
    region: alarm.region,
    deployment,
    window,
    evidence,
    links,
  };

  const existingIssue = await findOpenIssueByAlarmFamily(githubToken, githubRepo, familyKey);

  if (existingIssue) {
    logger.info({
      message: "Open issue already exists for alarm family, adding comment instead of duplicating",
      alarmName: alarm.alarmName,
      familyKey,
      issueNumber: existingIssue.number,
    });
    await commentOnGitHubIssue(githubToken, githubRepo, existingIssue.number, buildCommentBody(bodyFields));
    return;
  }

  const issue = await createGitHubIssue(githubToken, githubRepo, {
    title: buildIssueTitle(familyKey),
    body: buildIssueBody(bodyFields),
    labels: ["alarm", "ops"],
  });

  logger.info({
    message: "Created GitHub issue for alarm family",
    alarmName: alarm.alarmName,
    familyKey,
    issueNumber: issue.number,
    issueUrl: issue.html_url,
  });
}
