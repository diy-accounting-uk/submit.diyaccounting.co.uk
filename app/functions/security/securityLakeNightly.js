// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/security/securityLakeNightly.js
//
// Nightly job for the security dashboard's data. Writes one JSON-lines file per source per day to
// curated/security/<source>/dt=<date>/data.json in the analytics lake: Security Hub findings,
// GuardDuty findings, GitHub alert counts (code scanning, Dependabot, secret scanning), the
// lifecycle calendar (lifecycle.toml checked against endoflife.date and the AWS Lambda runtime
// deprecation policy), WAF blocks per rule (from the current deployment's WAF log groups in
// us-east-1), and the secret rotation record (secrets-rotation.toml against each secret's
// rotated-at tag).
//
// Every source always writes at least one row for the day, even when there is nothing to report
// (zero findings, or a lookup that failed): a source-day partition that never exists at all reads
// as "the check didn't run" and a partition holding one row that says "0 findings, checked at
// <time>" reads as "the check ran and found nothing", which is the distinction Glue Data Quality
// rules elsewhere in this pipeline (RowCount > 0) rely on.
//
// The lifecycle alarm publishes a custom metric (Submit/Security, LifecycleMinDaysRemaining) so a
// CloudWatch alarm can fire when an item is inside 60 days of its end date; every other source's
// health is the plain Lambda-errors alarm on this function.

import { SecurityHubClient, GetFindingsCommand } from "@aws-sdk/client-securityhub";
import {
  GuardDutyClient,
  ListDetectorsCommand,
  ListFindingsCommand,
  GetFindingsCommand as GetGuardDutyFindingsCommand,
} from "@aws-sdk/client-guardduty";
import { CloudWatchLogsClient, DescribeLogGroupsCommand, StartQueryCommand, GetQueryResultsCommand } from "@aws-sdk/client-cloudwatch-logs";
import { SecretsManagerClient, GetSecretValueCommand, DescribeSecretCommand } from "@aws-sdk/client-secrets-manager";
import { CloudWatchClient, PutMetricDataCommand } from "@aws-sdk/client-cloudwatch";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import fs from "node:fs";
import path from "node:path";
import TOML from "@iarna/toml";
import { createLogger } from "../../lib/logger.js";

const logger = createLogger({ source: "app/functions/security/securityLakeNightly.js" });

const REGION = process.env.AWS_REGION || "eu-west-2";
const WAF_LOG_GROUP_REGION = "us-east-1";
const METRICS_NAMESPACE = "Submit/Security";
const LIFECYCLE_ALARM_METRIC_NAME = "LifecycleMinDaysRemaining";
const INSIGHTS_QUERY_POLL_INTERVAL_MS = 2000;
const INSIGHTS_QUERY_MAX_POLLS = 30;

let securityHubClient;
let guardDutyClient;
let logsClient;
let secretsClient;
let cloudWatchClient;
let s3Client;

function getSecurityHubClient() {
  if (!securityHubClient) securityHubClient = new SecurityHubClient({ region: REGION });
  return securityHubClient;
}
function getGuardDutyClient() {
  if (!guardDutyClient) guardDutyClient = new GuardDutyClient({ region: REGION });
  return guardDutyClient;
}
function getLogsClient() {
  if (!logsClient) logsClient = new CloudWatchLogsClient({ region: WAF_LOG_GROUP_REGION });
  return logsClient;
}
function getSecretsClient() {
  if (!secretsClient) secretsClient = new SecretsManagerClient({ region: REGION });
  return secretsClient;
}
function getCloudWatchClient() {
  if (!cloudWatchClient) cloudWatchClient = new CloudWatchClient({ region: REGION });
  return cloudWatchClient;
}
function getS3Client() {
  if (!s3Client) s3Client = new S3Client({ region: REGION });
  return s3Client;
}

function defaultTargetDate(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString().slice(0, 10);
}

/**
 * One JSON-lines file per source per day. An empty `rows` list still writes one line (the caller
 * is expected to have appended a heartbeat row already), so this never writes a genuinely empty
 * object.
 */
export function toJsonLines(rows) {
  return rows.length === 0 ? "" : rows.map((row) => JSON.stringify(row)).join("\n") + "\n";
}

export async function putLakeObject(client, bucket, source, dateStr, rows) {
  const key = `curated/security/${source}/dt=${dateStr}/data.json`;
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: toJsonLines(rows),
      ContentType: "application/json",
    }),
  );
  return key;
}

// ============================================================================
// Security Hub
// ============================================================================

export function mapSecurityHubFinding(finding, dateStr) {
  return {
    dt: dateStr,
    finding_id: finding.Id,
    title: finding.Title,
    severity_label: finding.Severity?.Label ?? null,
    severity_normalized: finding.Severity?.Normalized ?? null,
    types: (finding.Types || []).join(";"),
    resource_id: finding.Resources?.[0]?.Id ?? null,
    resource_type: finding.Resources?.[0]?.Type ?? null,
    record_state: finding.RecordState ?? null,
    workflow_status: finding.Workflow?.Status ?? null,
    generator_id: finding.GeneratorId ?? null,
    first_observed_at: finding.FirstObservedAt ?? null,
    updated_at: finding.UpdatedAt ?? null,
  };
}

export async function fetchSecurityHubFindings(client, dateStr) {
  const rows = [];
  let nextToken;
  do {
    const response = await client.send(
      new GetFindingsCommand({
        Filters: { RecordState: [{ Value: "ACTIVE", Comparison: "EQUALS" }] },
        MaxResults: 100,
        NextToken: nextToken,
      }),
    );
    for (const finding of response.Findings || []) {
      rows.push(mapSecurityHubFinding(finding, dateStr));
    }
    nextToken = response.NextToken;
  } while (nextToken);

  if (rows.length === 0) {
    rows.push({ dt: dateStr, zero_findings: true, checked_at: new Date().toISOString() });
  }
  return rows;
}

// ============================================================================
// GuardDuty
// ============================================================================

export function mapGuardDutyFinding(finding, dateStr) {
  return {
    dt: dateStr,
    finding_id: finding.Id,
    type: finding.Type,
    severity: finding.Severity ?? null,
    resource_type: finding.Resource?.ResourceType ?? null,
    region: finding.Region ?? null,
    account_id: finding.AccountId ?? null,
    title: finding.Title ?? null,
    created_at: finding.CreatedAt ?? null,
    updated_at: finding.UpdatedAt ?? null,
  };
}

export async function fetchGuardDutyFindings(client, dateStr) {
  const rows = [];
  const detectorsResponse = await client.send(new ListDetectorsCommand({}));
  for (const detectorId of detectorsResponse.DetectorIds || []) {
    let nextToken;
    do {
      const listResponse = await client.send(
        new ListFindingsCommand({
          DetectorId: detectorId,
          FindingCriteria: { Criterion: { "service.archived": { Eq: ["false"] } } },
          MaxResults: 50,
          NextToken: nextToken,
        }),
      );
      const findingIds = listResponse.FindingIds || [];
      if (findingIds.length > 0) {
        const getResponse = await client.send(new GetGuardDutyFindingsCommand({ DetectorId: detectorId, FindingIds: findingIds }));
        for (const finding of getResponse.Findings || []) {
          rows.push(mapGuardDutyFinding(finding, dateStr));
        }
      }
      nextToken = listResponse.NextToken;
    } while (nextToken);
  }

  if (rows.length === 0) {
    rows.push({ dt: dateStr, zero_findings: true, checked_at: new Date().toISOString() });
  }
  return rows;
}

// ============================================================================
// GitHub alert counts (code scanning, Dependabot, secret scanning)
// ============================================================================

const GITHUB_ALERT_ENDPOINTS = [
  { alertType: "code_scanning", path: "code-scanning/alerts", severityField: (a) => a.rule?.severity ?? "unknown" },
  { alertType: "dependabot", path: "dependabot/alerts", severityField: (a) => a.security_advisory?.severity ?? "unknown" },
  { alertType: "secret_scanning", path: "secret-scanning/alerts", severityField: () => "n/a" },
];

async function fetchOpenGithubAlerts(fetchImpl, token, repo, endpointPath) {
  const alerts = [];
  let page = 1;
  for (;;) {
    const response = await fetchImpl(`https://api.github.com/repos/${repo}/${endpointPath}?state=open&per_page=100&page=${page}`, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (!response.ok) {
      throw new Error(`GitHub API error fetching ${endpointPath}: ${response.status} ${await response.text()}`);
    }
    const batch = await response.json();
    alerts.push(...batch);
    if (batch.length < 100) break;
    page += 1;
  }
  return alerts;
}

/**
 * One row per (alert_type, severity), with a count and the oldest open alert's creation date.
 */
export function aggregateGithubAlertCounts(alertType, alerts, severityField, dateStr) {
  const bySeverity = new Map();
  for (const alert of alerts) {
    const severity = severityField(alert) || "unknown";
    const bucket = bySeverity.get(severity) || { count: 0, oldestCreatedAt: null };
    bucket.count += 1;
    if (!bucket.oldestCreatedAt || alert.created_at < bucket.oldestCreatedAt) {
      bucket.oldestCreatedAt = alert.created_at;
    }
    bySeverity.set(severity, bucket);
  }
  if (bySeverity.size === 0) {
    return [{ dt: dateStr, alert_type: alertType, severity: null, count: 0, oldest_created_at: null }];
  }
  return Array.from(bySeverity.entries()).map(([severity, bucket]) => ({
    dt: dateStr,
    alert_type: alertType,
    severity,
    count: bucket.count,
    oldest_created_at: bucket.oldestCreatedAt,
  }));
}

export async function fetchGithubAlertRows(fetchImpl, token, repo, dateStr) {
  const rows = [];
  for (const endpoint of GITHUB_ALERT_ENDPOINTS) {
    const alerts = await fetchOpenGithubAlerts(fetchImpl, token, repo, endpoint.path);
    rows.push(...aggregateGithubAlertCounts(endpoint.alertType, alerts, endpoint.severityField, dateStr));
  }
  return rows;
}

// ============================================================================
// Lifecycle calendar (lifecycle.toml against endoflife.date and the Lambda runtime policy)
// ============================================================================

// endoflife.date has no product page for every item lifecycle.toml tracks (Playwright and the
// Synthetics runtime among them); a 404 there is expected and just leaves end_date unfilled
// rather than failing the whole run.
const ENDOFLIFE_PRODUCT_SLUGS = {
  "Lambda Node.js Runtime": "nodejs",
  "AWS CDK": "aws-cdk",
  "Java Compiler Target": "amazon-corretto",
};

// AWS Lambda publishes no machine-readable deprecation feed. Its stated policy (Lambda runtime
// support policy) is to block function creation on a runtime approximately 30 days after the
// runtime's underlying language reaches end-of-life, so the Node.js runtime's Lambda deprecation
// date is derived from the same endoflife.date lookup rather than a second hardcoded date.
const LAMBDA_RUNTIME_DEPRECATION_GRACE_DAYS = 30;

export function computeDaysRemaining(endDateStr, now = new Date()) {
  if (!endDateStr) return null;
  const end = new Date(endDateStr + "T00:00:00Z");
  if (Number.isNaN(end.getTime())) return null;
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((end.getTime() - now.getTime()) / msPerDay);
}

function addDays(dateStr, days) {
  const date = new Date(dateStr + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function fetchEndOfLifeDate(fetchImpl, slug, cycle) {
  const response = await fetchImpl(`https://endoflife.date/api/${slug}.json`);
  if (!response.ok) return null;
  const cycles = await response.json();
  const match = cycles.find((entry) => String(entry.cycle) === String(cycle));
  if (!match) return null;
  // endoflife.date's eol field is either a date string or `false` when still supported.
  return typeof match.eol === "string" ? match.eol : null;
}

function majorVersion(current) {
  const match = /^(\d+)/.exec(String(current).trim());
  return match ? match[1] : String(current).trim();
}

export function readLifecycleToml(tomlPath) {
  const raw = fs.readFileSync(tomlPath, "utf-8");
  return TOML.parse(raw).lifecycle || [];
}

/**
 * Builds one row per lifecycle.toml entry: a live end_date lookup against endoflife.date where a
 * product slug is known, the AWS Lambda deprecation policy applied on top of the Node.js runtime
 * entry, and the toml's own end_date for everything else (certificates, and anything
 * endoflife.date doesn't track).
 */
export async function buildLifecycleRows(fetchImpl, tomlPath, dateStr, now = new Date()) {
  const entries = readLifecycleToml(tomlPath);
  const rows = [];
  for (const entry of entries) {
    let endDate = entry.end_date || null;
    const slug = ENDOFLIFE_PRODUCT_SLUGS[entry.name];
    if (slug) {
      const live = await fetchEndOfLifeDate(fetchImpl, slug, majorVersion(entry.current));
      if (live) endDate = live;
    }

    let lambdaDeprecationDate = null;
    if (entry.name === "Lambda Node.js Runtime" && endDate) {
      lambdaDeprecationDate = addDays(endDate, LAMBDA_RUNTIME_DEPRECATION_GRACE_DAYS);
    }

    const effectiveEndDate = lambdaDeprecationDate || endDate;
    rows.push({
      dt: dateStr,
      name: entry.name,
      kind: entry.kind,
      current: entry.current,
      end_date: effectiveEndDate,
      days_remaining: computeDaysRemaining(effectiveEndDate, now),
      source: entry.source,
      checked_at: now.toISOString(),
    });
  }
  return rows;
}

export function minDaysRemaining(lifecycleRows) {
  const known = lifecycleRows.map((row) => row.days_remaining).filter((value) => typeof value === "number");
  return known.length > 0 ? Math.min(...known) : null;
}

// ============================================================================
// WAF blocks per rule (the live deployment's WAF log groups in us-east-1)
// ============================================================================

async function listWafLogGroups(client, envName) {
  const names = [];
  let nextToken;
  do {
    const response = await client.send(new DescribeLogGroupsCommand({ logGroupNamePrefix: `aws-waf-logs-${envName}-`, nextToken }));
    for (const group of response.logGroups || []) {
      if (group.logGroupName) names.push(group.logGroupName);
    }
    nextToken = response.nextToken;
  } while (nextToken);
  return names;
}

async function runInsightsQuery(client, logGroupNames, queryString, startTime, endTime) {
  const start = await client.send(new StartQueryCommand({ logGroupNames, queryString, startTime, endTime }));
  for (let attempt = 0; attempt < INSIGHTS_QUERY_MAX_POLLS; attempt += 1) {
    const result = await client.send(new GetQueryResultsCommand({ queryId: start.queryId }));
    if (result.status === "Complete") return result.results || [];
    if (result.status === "Failed" || result.status === "Cancelled") {
      throw new Error(`CloudWatch Logs Insights query ${result.status.toLowerCase()}`);
    }
    await new Promise((resolve) => setTimeout(resolve, INSIGHTS_QUERY_POLL_INTERVAL_MS));
  }
  throw new Error("CloudWatch Logs Insights query did not complete in time");
}

function fieldValue(row, field) {
  return row.find((entry) => entry.field === field)?.value;
}

export async function fetchWafBlockRows(client, envName, dateStr) {
  const logGroupNames = await listWafLogGroups(client, envName);
  if (logGroupNames.length === 0) {
    return [{ dt: dateStr, rule: null, blocks: 0, log_group: null, zero_findings: true }];
  }

  const startTime = Math.floor(new Date(dateStr + "T00:00:00Z").getTime() / 1000);
  const endTime = startTime + 24 * 60 * 60;
  const queryString = 'fields terminatingRuleId | filter action = "BLOCK" | stats count(*) as blocks by terminatingRuleId';

  const rows = [];
  for (const logGroupName of logGroupNames) {
    const results = await runInsightsQuery(client, [logGroupName], queryString, startTime, endTime);
    for (const row of results) {
      rows.push({
        dt: dateStr,
        rule: fieldValue(row, "terminatingRuleId") ?? null,
        blocks: Number(fieldValue(row, "blocks") ?? 0),
        log_group: logGroupName,
      });
    }
  }

  if (rows.length === 0) {
    rows.push({ dt: dateStr, rule: null, blocks: 0, log_group: logGroupNames.join(";"), zero_findings: true });
  }
  return rows;
}

// ============================================================================
// Secret rotation record (secrets-rotation.toml against each secret's rotated-at tag)
// ============================================================================

export function readRotationToml(tomlPath) {
  const raw = fs.readFileSync(tomlPath, "utf-8");
  return TOML.parse(raw).secret || [];
}

async function describeSecretTags(client, secretId) {
  try {
    const response = await client.send(new DescribeSecretCommand({ SecretId: secretId }));
    return response.Tags || [];
  } catch (error) {
    if (error?.name === "ResourceNotFoundException") return null;
    throw error;
  }
}

export async function buildRotationRows(client, tomlPath, envName, dateStr, now = new Date()) {
  const entries = readRotationToml(tomlPath);
  const rows = [];
  for (const entry of entries) {
    const secretId = `${envName}/submit/${entry.name}`;
    const tags = await describeSecretTags(client, secretId);
    if (tags === null) {
      rows.push({ dt: dateStr, secret_name: entry.name, console: entry.console, found: false });
      continue;
    }
    const rotatedAtTag = tags.find((tag) => tag.Key === "rotated-at")?.Value ?? null;
    rows.push({
      dt: dateStr,
      secret_name: entry.name,
      console: entry.console,
      found: true,
      rotated_at: rotatedAtTag,
      age_days: rotatedAtTag ? -computeDaysRemaining(rotatedAtTag, now) : null,
    });
  }
  if (rows.length === 0) {
    rows.push({ dt: dateStr, zero_findings: true, checked_at: now.toISOString() });
  }
  return rows;
}

// ============================================================================
// Handler
// ============================================================================

export async function handler(event = {}) {
  const dateStr = event.date ?? defaultTargetDate();

  const bucket = process.env.ANALYTICS_LAKE_BUCKET_NAME;
  if (!bucket) throw new Error("ANALYTICS_LAKE_BUCKET_NAME environment variable is required");
  const envName = process.env.ENVIRONMENT_NAME;
  if (!envName) throw new Error("ENVIRONMENT_NAME environment variable is required");
  const githubRepo = process.env.GITHUB_REPO;
  if (!githubRepo) throw new Error("GITHUB_REPO environment variable is required");
  const opsGithubTokenSecretId = process.env.OPS_GITHUB_TOKEN_SECRET_ID;
  if (!opsGithubTokenSecretId) throw new Error("OPS_GITHUB_TOKEN_SECRET_ID environment variable is required");
  const lifecycleTomlPath = process.env.LIFECYCLE_TOML_PATH || path.join(process.cwd(), "lifecycle.toml");
  const rotationTomlPath = process.env.SECRETS_ROTATION_TOML_PATH || path.join(process.cwd(), "secrets-rotation.toml");

  const s3 = getS3Client();
  const counts = {};

  const securityHubRows = await fetchSecurityHubFindings(getSecurityHubClient(), dateStr);
  await putLakeObject(s3, bucket, "security-hub", dateStr, securityHubRows);
  counts["security-hub"] = securityHubRows.length;

  const guardDutyRows = await fetchGuardDutyFindings(getGuardDutyClient(), dateStr);
  await putLakeObject(s3, bucket, "guardduty", dateStr, guardDutyRows);
  counts["guardduty"] = guardDutyRows.length;

  const secretsClient = getSecretsClient();
  const tokenResult = await secretsClient.send(new GetSecretValueCommand({ SecretId: opsGithubTokenSecretId }));
  const githubAlertRows = await fetchGithubAlertRows(fetch, tokenResult.SecretString, githubRepo, dateStr);
  await putLakeObject(s3, bucket, "github-alerts", dateStr, githubAlertRows);
  counts["github-alerts"] = githubAlertRows.length;

  const lifecycleRows = await buildLifecycleRows(fetch, lifecycleTomlPath, dateStr);
  await putLakeObject(s3, bucket, "lifecycle", dateStr, lifecycleRows);
  counts["lifecycle"] = lifecycleRows.length;

  const wafRows = await fetchWafBlockRows(getLogsClient(), envName, dateStr);
  await putLakeObject(s3, bucket, "waf", dateStr, wafRows);
  counts["waf"] = wafRows.length;

  const rotationRows = await buildRotationRows(secretsClient, rotationTomlPath, envName, dateStr);
  await putLakeObject(s3, bucket, "rotation", dateStr, rotationRows);
  counts["rotation"] = rotationRows.length;

  const minDays = minDaysRemaining(lifecycleRows);
  if (minDays !== null) {
    await getCloudWatchClient().send(
      new PutMetricDataCommand({
        Namespace: METRICS_NAMESPACE,
        MetricData: [{ MetricName: LIFECYCLE_ALARM_METRIC_NAME, Value: minDays, Unit: "None" }],
      }),
    );
  }

  logger.info({ message: "Security lake nightly run complete", date: dateStr, counts, minDaysRemaining: minDays });
  return { date: dateStr, counts, minDaysRemaining: minDays };
}
