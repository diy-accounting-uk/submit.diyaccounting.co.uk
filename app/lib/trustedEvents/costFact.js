// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/trustedEvents/costFact.js
//
// One SNS record from the root budget topic, turned into a fact. A budget alert is the plain text
// of the AWS Budgets email. An anomaly alert is a JSON object with an anomalyId. A record that
// neither parser can read becomes an "unparsed" fact, so it still opens an issue.

import { singleLine } from "./issueFormat.js";

const SUBJECT_LIMIT = 200;

export function unparsedFact(sns) {
  return {
    source: "aws.budgets",
    sourceLabel: "budget",
    key: `budget:unparsed:${sns.MessageId}`,
    version: "1",
    subject: "unparsed notification",
    region: "us-east-1",
    lines: [["SNS subject", singleLine(sns.Subject).slice(0, SUBJECT_LIMIT)]],
  };
}

function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function anomalyFact(sns, anomaly) {
  const impact = anomaly.impact?.totalImpact;
  return {
    source: "aws.ce",
    sourceLabel: "anomaly",
    key: `anomaly:${anomaly.anomalyId}`,
    version: "1",
    subject: `cost anomaly ${anomaly.dimensionalValue} impact USD ${impact}`,
    region: "us-east-1",
    account: anomaly.accountId,
    lines: [
      ["Anomaly id", anomaly.anomalyId],
      ["Monitor", anomaly.monitorArn],
      ["Service", anomaly.dimensionalValue],
      ["Start", anomaly.anomalyStartDate],
      ["Total impact USD", impact],
      ["Details", anomaly.anomalyDetailsLink],
    ],
  };
}

function lineOf(message, label) {
  for (const line of message.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith(label)) return trimmed.slice(label.length).trim();
  }
  return undefined;
}

function budgetFact(sns) {
  const message = String(sns.Message ?? "");
  const name = lineOf(message, "AWS Budget Name:") || lineOf(message, "Budget Name:");
  const alertType = lineOf(message, "Alert Type:");
  const threshold = lineOf(message, "Alert Threshold:")?.replace(/^>\s*/, "");
  const month = /^\d{4}-\d{2}/.exec(sns.Timestamp || "")?.[0];
  if (!name || !alertType || !threshold || !month) return null;
  const kind = alertType === "FORECASTED" ? "forecast" : "actual";
  return {
    source: "aws.budgets",
    sourceLabel: "budget",
    key: `budget:${name}:${alertType}:${threshold}:${month}`,
    logKey: `budget:${name}:${alertType}:${month}`,
    version: "1",
    subject: `${name} ${kind} over ${threshold} (${month})`,
    region: "us-east-1",
    account: lineOf(message, "AWS Account:"),
    lines: [
      ["Budget", name],
      ["Alert type", alertType],
      ["Threshold", threshold],
      ["Month", month],
      ["SNS subject", singleLine(sns.Subject).slice(0, SUBJECT_LIMIT)],
    ],
  };
}

export function costFactFromSnsRecord(record) {
  const sns = record.Sns;
  const parsedJson = tryParseJson(String(sns.Message ?? ""));
  if (parsedJson && typeof parsedJson === "object") {
    return parsedJson.anomalyId ? anomalyFact(sns, parsedJson) : unparsedFact(sns);
  }
  return budgetFact(sns) || unparsedFact(sns);
}
