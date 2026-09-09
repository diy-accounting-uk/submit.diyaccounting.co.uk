// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/resolveAlarmEvidence.test.js

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

const mockCloudWatchSend = vi.fn();
vi.mock("@aws-sdk/client-cloudwatch", () => ({
  CloudWatchClient: class {
    send(...args) {
      return mockCloudWatchSend(...args);
    }
  },
  DescribeAlarmsCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
}));

import { main } from "../../../scripts/resolve-alarm-evidence.mjs";

describe("resolve-alarm-evidence.mjs main --from-alarm", () => {
  let logSpy;
  const originalAlarmWindow = process.env.ALARM_WINDOW;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    mockCloudWatchSend.mockReset();
    delete process.env.ALARM_WINDOW;
  });

  afterEach(() => {
    logSpy.mockRestore();
    if (originalAlarmWindow === undefined) {
      delete process.env.ALARM_WINDOW;
    } else {
      process.env.ALARM_WINDOW = originalAlarmWindow;
    }
  });

  test("alarm found: resolves evidence from the live metric alarm unchanged", async () => {
    mockCloudWatchSend.mockResolvedValue({
      MetricAlarms: [
        {
          Namespace: "AWS/Lambda",
          MetricName: "Errors",
          Dimensions: [{ Name: "FunctionName", Value: "prod-cfb43ee-app-hmrc-vat-return-post" }],
          StateUpdatedTimestamp: new Date("2026-09-06T10:00:00.000Z"),
          Period: 300,
          StateReasonData: JSON.stringify({
            period: 300,
            evaluatedDatapoints: [{ timestamp: "2026-09-06T09:55:00+0000" }],
          }),
        },
      ],
      CompositeAlarms: [],
    });

    const output = await main([
      "--alarm-name",
      "prod-cfb43ee-app-hmrc-vat-return-post-errors",
      "--deployment",
      "cfb43ee",
      "--region",
      "eu-west-2",
      "--from-alarm",
    ]);

    expect(output.alarmFound).toBe(true);
    expect(output.note).toBeUndefined();
    expect(output.logGroupNamePrefixes).toEqual(["/aws/lambda/prod-cfb43ee-app-hmrc-vat-return-post"]);
    expect(output.logsInsightsUrl).toBeTruthy();
    expect(output.xrayUrl).toBeTruthy();
    expect(logSpy).toHaveBeenCalledTimes(1);

    // DescribeAlarms defaults to MetricAlarm only when AlarmTypes is omitted, so a composite
    // ("-stack-health") alarm would come back empty even when it exists unless both are asked for.
    const [describeAlarmsCommand] = mockCloudWatchSend.mock.calls[0];
    expect(describeAlarmsCommand.input.AlarmTypes).toEqual(expect.arrayContaining(["CompositeAlarm", "MetricAlarm"]));
  });

  test("alarm not found: writes fallback evidence with alarmFound false and exits without throwing", async () => {
    mockCloudWatchSend.mockResolvedValue({ MetricAlarms: [], CompositeAlarms: [] });
    process.env.ALARM_WINDOW =
      "2026-09-06T09:00:00.000Z to 2026-09-06T09:30:00.000Z (period 300s × 6, margin 300s)";

    const output = await main([
      "--alarm-name",
      "prod-0967fab-app-account-stack-health",
      "--deployment",
      "0967fab",
      "--region",
      "eu-west-2",
      "--from-alarm",
    ]);

    expect(output.alarmFound).toBe(false);
    expect(output.alarmName).toBe("prod-0967fab-app-account-stack-health");
    expect(output.deployment).toBe("0967fab");
    expect(output.region).toBe("eu-west-2");
    expect(output.logGroupNamePrefixes).toEqual(["/aws/lambda/0967fab-app-"]);
    expect(output.window).toContain("2026-09-06T09:00:00.000Z to 2026-09-06T09:30:00.000Z");
    expect(output.window).toContain("ALARM_WINDOW");
    expect(output.note).toMatch(/deployment set has been retired/);
    expect(output.logsInsightsUrl).toBeNull();
    expect(output.xrayUrl).toBeNull();
    expect(logSpy).toHaveBeenCalledTimes(1);
  });

  test("alarm not found and no ALARM_WINDOW set: says the window is unknown", async () => {
    mockCloudWatchSend.mockResolvedValue({});

    const output = await main([
      "--alarm-name",
      "prod-0967fab-app-account-stack-health",
      "--deployment",
      "0967fab",
      "--region",
      "eu-west-2",
      "--from-alarm",
    ]);

    expect(output.alarmFound).toBe(false);
    expect(output.window).toMatch(/unknown/);
  });

  test("an AWS error other than not-found propagates so the workflow step fails", async () => {
    mockCloudWatchSend.mockRejectedValue(new Error("AccessDenied: user is not authorized to perform this action"));

    await expect(
      main([
        "--alarm-name",
        "prod-cfb43ee-app-account-stack-health",
        "--deployment",
        "cfb43ee",
        "--region",
        "eu-west-2",
        "--from-alarm",
      ]),
    ).rejects.toThrow("AccessDenied");
  });
});
