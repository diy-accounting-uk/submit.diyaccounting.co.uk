// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/consoleLinks.js
//
// Builds AWS console URLs for the evidence links an alarm issue carries:
// the alarm itself, a CloudWatch Logs Insights query scoped to the alarm's
// window, and an X-Ray trace search over the same window. Pure: no AWS
// calls, no I/O. Every link needs a signed-in AWS session to resolve, so
// none of this ever exposes log text, metric values or table contents.

const SAFE_HASH_CHARACTER = /[A-Za-z0-9\-_.]/;

/**
 * The CloudWatch console encodes strings inside its URL fragment with "*"
 * plus two lowercase hex digits for every byte outside [A-Za-z0-9-_.],
 * rather than the percent-encoding a query string would use.
 */
export function encodeConsoleHashValue(value) {
  let out = "";
  for (const byte of Buffer.from(value, "utf8")) {
    const ch = String.fromCharCode(byte);
    out += SAFE_HASH_CHARACTER.test(ch) ? ch : "*" + byte.toString(16).padStart(2, "0");
  }
  return out;
}

export function buildAlarmConsoleLink(region, alarmName) {
  return `https://${region}.console.aws.amazon.com/cloudwatch/home?region=${region}#alarmsV2:alarm/${encodeURIComponent(alarmName)}`;
}

export function buildLogsInsightsLink({ region, startIso, endIso, queryString }) {
  if (!queryString) return null;
  const encEnd = encodeConsoleHashValue(endIso);
  const encStart = encodeConsoleHashValue(startIso);
  const encQuery = encodeConsoleHashValue(queryString);
  return `https://${region}.console.aws.amazon.com/cloudwatch/home?region=${region}#logsV2:logs-insights$3FqueryDetail$3D~(end~'${encEnd}~start~'${encStart}~timeType~'ABSOLUTE~tz~'UTC~editorString~'${encQuery}~source~())`;
}

export function buildXRayTraceSearchLink({ region, startIso, endIso, filterExpression }) {
  if (!filterExpression) return null;
  return `https://${region}.console.aws.amazon.com/xray/home?region=${region}#/traces?timeRange=${encodeURIComponent(startIso)}~${encodeURIComponent(endIso)}&filter=${encodeURIComponent(filterExpression)}`;
}

export function buildCloudWatchDashboardLink(region, dashboardName) {
  return `https://${region}.console.aws.amazon.com/cloudwatch/home?region=${region}#dashboards:name=${encodeURIComponent(dashboardName)}`;
}

export function buildCloudWatchAlarmsOverviewLink(region) {
  return `https://${region}.console.aws.amazon.com/cloudwatch/home?region=${region}#alarmsV2:`;
}

/** Links to the Athena workgroup's saved queries, where every named view definition lives
 * alongside the SQL that answers this observation. Athena's console carries no URL scheme for
 * one named query by name, only the workgroup's list. */
export function buildAthenaSavedQueryLink(region, workGroupName) {
  return `https://${region}.console.aws.amazon.com/athena/home?region=${region}#/query-editor/saved-queries?workgroup=${encodeURIComponent(workGroupName)}`;
}

export function buildGithubActionsWorkflowLink(repo, workflowFileName) {
  return `https://github.com/${repo}/actions/workflows/${workflowFileName}`;
}

export function buildGa4ReportsLink(propertyId) {
  if (!propertyId) return null;
  return `https://analytics.google.com/analytics/web/#/p${propertyId}/reports/intelligenthome`;
}
