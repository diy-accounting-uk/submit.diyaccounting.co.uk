// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

import { describe, test, expect, beforeEach, afterEach } from "vitest";

import { handler, flattenEnvelope } from "../../functions/analytics/alarmStateChangeTransform.js";

function encode(value) {
  return Buffer.from(typeof value === "string" ? value : JSON.stringify(value), "utf8").toString("base64");
}

function decode(data) {
  return Buffer.from(data, "base64").toString("utf8");
}

function alarmStateChangeEnvelope(overrides = {}) {
  return {
    version: "0",
    id: "11111111-2222-3333-4444-555555555555",
    "detail-type": "CloudWatch Alarm State Change",
    source: "aws.cloudwatch",
    account: "367191799875",
    time: "2026-09-08T09:15:00Z",
    region: "eu-west-2",
    resources: ["arn:aws:cloudwatch:eu-west-2:367191799875:alarm:prod-a0f41c7-app-api-5xx"],
    detail: {
      alarmName: "prod-a0f41c7-app-api-5xx",
      state: {
        value: "ALARM",
        reason: "Threshold Crossed",
        reasonData: JSON.stringify({ version: "1.0", threshold: 5, statistic: "Sum", period: 300 }),
        timestamp: "2026-09-08T09:14:58.123Z",
      },
      previousState: { value: "OK", reason: "", timestamp: "2026-09-08T08:00:00.000Z" },
      configuration: {
        metrics: [{ metricStat: { metric: { namespace: "AWS/ApiGateway", name: "5XXError" }, period: 300 } }],
      },
    },
    ...overrides,
  };
}

describe("alarmStateChangeTransform", () => {
  let originalEnvironmentName;

  beforeEach(() => {
    originalEnvironmentName = process.env.ENVIRONMENT_NAME;
    process.env.ENVIRONMENT_NAME = "prod";
  });

  afterEach(() => {
    if (originalEnvironmentName === undefined) {
      delete process.env.ENVIRONMENT_NAME;
    } else {
      process.env.ENVIRONMENT_NAME = originalEnvironmentName;
    }
  });

  test("flattens a real alarm state change envelope to the declared columns", async () => {
    const result = await handler({ records: [{ recordId: "r1", data: encode(alarmStateChangeEnvelope()) }] });

    expect(result.records[0].result).toBe("Ok");
    const text = decode(result.records[0].data);
    expect(text.endsWith("\n")).toBe(true);

    const row = JSON.parse(text);
    expect(row.event_id).toBe("11111111-2222-3333-4444-555555555555");
    expect(row.event_ts).toBe("2026-09-08 09:14:58.123");
    expect(row.ingest_ts).toBe("2026-09-08 09:15:00.000");
    expect(row.alarm_name).toBe("prod-a0f41c7-app-api-5xx");
    expect(row.alarm_arn).toBe("arn:aws:cloudwatch:eu-west-2:367191799875:alarm:prod-a0f41c7-app-api-5xx");
    expect(row.deployment_slug).toBe("a0f41c7");
    expect(row.state).toBe("ALARM");
    expect(row.previous_state).toBe("OK");
    expect(row.reason).toBe("Threshold Crossed");
    expect(row.region).toBe("eu-west-2");
    expect(row.namespace).toBe("AWS/ApiGateway");
    expect(row.metric_name).toBe("5XXError");
    expect(row.period_seconds).toBe(300);
    expect(row.threshold).toBe(5);
    expect(row.env).toBe("prod");
  });

  test("family drops the deployment slug", () => {
    const row = flattenEnvelope(alarmStateChangeEnvelope());
    expect(row.family).toBe("prod-app-api-5xx");
  });

  test("an environment-scoped alarm carries no deployment slug", () => {
    const envelope = alarmStateChangeEnvelope();
    envelope.detail.alarmName = "prod-env-salt-secret-unexpected-read";
    envelope.resources = ["arn:aws:cloudwatch:eu-west-2:367191799875:alarm:prod-env-salt-secret-unexpected-read"];

    const row = flattenEnvelope(envelope);
    expect(row.family).toBe("prod-env-salt-secret-unexpected-read");
    expect(row.deployment_slug).toBeNull();
  });

  test("a record that will not parse comes back ProcessingFailed", async () => {
    const result = await handler({ records: [{ recordId: "r1", data: encode("this is not json") }] });

    expect(result.records[0].result).toBe("ProcessingFailed");
    expect(result.records[0].data).toBeUndefined();
  });

  test("keeps good records when one record in the batch fails", async () => {
    const result = await handler({
      records: [
        { recordId: "r1", data: encode(alarmStateChangeEnvelope()) },
        { recordId: "r2", data: encode("{ broken") },
      ],
    });

    expect(result.records.map((r) => r.result)).toEqual(["Ok", "ProcessingFailed"]);
  });

  test("round-trips the original detail into detail_json", async () => {
    const envelope = alarmStateChangeEnvelope();
    const result = await handler({ records: [{ recordId: "r1", data: encode(envelope) }] });
    const row = JSON.parse(decode(result.records[0].data));

    expect(JSON.parse(row.detail_json)).toEqual(envelope.detail);
  });
});
