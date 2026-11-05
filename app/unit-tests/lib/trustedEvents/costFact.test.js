// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect } from "vitest";
import { costFactFromSnsRecord } from "@app/lib/trustedEvents/costFact.js";

const BUDGET_MESSAGE = [
  "AWS Budget Notification\t                            November 01, 2026",
  "AWS Account: 123456789012",
  "AWS Budget Name: example-monthly-budget",
  "",
  "Dear AWS Customer,",
  "",
  "Budget Type: Cost",
  "Budgeted Amount: $15.00",
  "Alert Type: FORECASTED",
  "Alert Threshold: > $15.00",
  "FORECASTED Amount: $15.87",
].join("\n");

const record = (message, overrides = {}) => ({
  Sns: {
    MessageId: "msg-1",
    Subject: "AWS Budgets: Account 123456789012 has a budget exceeding your alert threshold",
    Message: message,
    Timestamp: "2026-11-01T14:44:11.000Z",
    ...overrides,
  },
});

describe("costFactFromSnsRecord", () => {
  test("reads a budget alert", () => {
    const fact = costFactFromSnsRecord(record(BUDGET_MESSAGE));
    expect(fact.key).toBe("budget:example-monthly-budget:FORECASTED:$15.00:2026-11");
    expect(fact.version).toBe("1");
    expect(fact.subject).toBe("example-monthly-budget forecast over $15.00 (2026-11)");
    expect(fact.account).toBe("123456789012");
    expect(fact.sourceLabel).toBe("budget");
    expect(fact.lines.map(([name]) => name)).toEqual(["Budget", "Alert type", "Threshold", "Month", "SNS subject"]);
  });

  test("the log key carries no amount", () => {
    const fact = costFactFromSnsRecord(record(BUDGET_MESSAGE));
    expect(fact.logKey).toBe("budget:example-monthly-budget:FORECASTED:2026-11");
  });

  test("an actual alert reads as actual", () => {
    const fact = costFactFromSnsRecord(record(BUDGET_MESSAGE.replace("FORECASTED", "ACTUAL")));
    expect(fact.subject).toContain(" actual over ");
  });

  test("reads an anomaly alert", () => {
    const anomaly = {
      accountId: "123456789012",
      anomalyId: "anomaly-1",
      anomalyStartDate: "2026-11-01T00:00:00Z",
      dimensionalValue: "Amazon Elastic Compute Cloud",
      monitorArn: "arn:aws:ce::123456789012:anomalymonitor/monitor-1",
      anomalyDetailsLink: "https://console.aws.amazon.com/cost-management/home#/anomaly-detection/monitors",
      impact: { totalImpact: 12.5 },
    };
    const fact = costFactFromSnsRecord(record(JSON.stringify(anomaly)));
    expect(fact.source).toBe("aws.ce");
    expect(fact.key).toBe("anomaly:anomaly-1");
    expect(fact.subject).toBe("cost anomaly Amazon Elastic Compute Cloud impact USD 12.5");
    expect(fact.lines.map(([name]) => name)).toEqual(["Anomaly id", "Monitor", "Service", "Start", "Total impact USD", "Details"]);
  });

  test("JSON without an anomalyId takes the unparsed path", () => {
    const fact = costFactFromSnsRecord(record(JSON.stringify({ other: 1 })));
    expect(fact.key).toBe("budget:unparsed:msg-1");
  });

  test("text the parser cannot read takes the unparsed path with the subject line only", () => {
    const fact = costFactFromSnsRecord(record("something else entirely"));
    expect(fact.key).toBe("budget:unparsed:msg-1");
    expect(fact.sourceLabel).toBe("budget");
    expect(fact.lines).toHaveLength(1);
    expect(fact.lines[0][0]).toBe("SNS subject");
  });
});
