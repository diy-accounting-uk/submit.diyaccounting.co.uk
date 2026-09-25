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

// Backs resolveDeploymentSlug's SSM lookup, which --from-alarm mode now always makes once to
// learn the environment's live deployment. "prod-d9ef3c9" is the default so every existing
// "prod-…" test below resolves the same cached value regardless of call order (resolveDeploymentSlug
// caches per environment for the life of the module).
const mockSsmSend = vi.fn();
vi.mock("@aws-sdk/client-ssm", () => ({
  SSMClient: class {
    send(...args) {
      return mockSsmSend(...args);
    }
  },
  GetParameterCommand: class {
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
    mockSsmSend.mockReset();
    mockSsmSend.mockResolvedValue({ Parameter: { Value: "prod-d9ef3c9" } });
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

  test("composite alarm: names the triggering child's log group first, dedupes the rest, and confirms the named deployment is live", async () => {
    // Reproduces prod-env-activity-stack-health (issue #355, run 36109684922): a composite whose
    // AlarmRule carries both an "-errors" and a "-log-errors" child for two functions, where only
    // check-prod-env-sign-in-activity-publish-log-errors was actually in ALARM.
    const alarmRule =
      'ALARM("arn:aws:cloudwatch:eu-west-2:972912397388:alarm:check-prod-env-activity-telegram-forwarder-errors") ' +
      'OR ALARM("arn:aws:cloudwatch:eu-west-2:972912397388:alarm:check-prod-env-activity-telegram-forwarder-log-errors") ' +
      'OR ALARM("arn:aws:cloudwatch:eu-west-2:972912397388:alarm:check-prod-env-sign-in-activity-publish-errors") ' +
      'OR ALARM("arn:aws:cloudwatch:eu-west-2:972912397388:alarm:check-prod-env-sign-in-activity-publish-log-errors")';

    mockCloudWatchSend.mockImplementation((command) => {
      const alarmNames = command.input.AlarmNames || [];
      if (alarmNames.includes("prod-env-activity-stack-health")) {
        return Promise.resolve({
          MetricAlarms: [],
          CompositeAlarms: [{ AlarmRule: alarmRule, StateTransitionTimestamp: new Date("2026-09-25T07:50:04.058Z") }],
        });
      }
      // The per-child DescribeAlarms call this fix adds: only the sign-in-activity-publish
      // log-errors check is ALARM, the other three are OK.
      return Promise.resolve({
        MetricAlarms: [
          { AlarmName: "check-prod-env-activity-telegram-forwarder-errors", StateValue: "OK" },
          { AlarmName: "check-prod-env-activity-telegram-forwarder-log-errors", StateValue: "OK" },
          { AlarmName: "check-prod-env-sign-in-activity-publish-errors", StateValue: "OK" },
          { AlarmName: "check-prod-env-sign-in-activity-publish-log-errors", StateValue: "ALARM" },
        ],
      });
    });

    const output = await main([
      "--alarm-name",
      "prod-env-activity-stack-health",
      "--deployment",
      "prod-d9ef3c9",
      "--region",
      "eu-west-2",
      "--from-alarm",
    ]);

    expect(output.alarmFound).toBe(true);
    expect(output.logGroupNamePrefixes).toEqual([
      "/aws/lambda/prod-env-sign-in-activity-publish",
      "/aws/lambda/prod-env-activity-telegram-forwarder",
    ]);
    expect(output.triggeringLogGroupNamePrefixes).toEqual(["/aws/lambda/prod-env-sign-in-activity-publish"]);
    expect(output.deploymentLive).toBe(true);
    expect(output.liveDeployment).toBe("prod-d9ef3c9");
  });

  test("the named deployment is reported not live when it differs from SSM's last-known-good deployment", async () => {
    mockSsmSend.mockResolvedValueOnce({ Parameter: { Value: "ci-newer5678" } });
    mockCloudWatchSend.mockResolvedValue({
      MetricAlarms: [
        {
          Namespace: "AWS/Lambda",
          MetricName: "Errors",
          Dimensions: [{ Name: "FunctionName", Value: "ci-abc1234-app-hmrc-vat-return-post" }],
          StateUpdatedTimestamp: new Date("2026-09-06T10:00:00.000Z"),
          Period: 300,
        },
      ],
      CompositeAlarms: [],
    });

    const output = await main([
      "--alarm-name",
      "ci-abc1234-app-hmrc-vat-return-post-errors",
      "--deployment",
      "ci-abc1234",
      "--region",
      "eu-west-2",
      "--from-alarm",
    ]);

    expect(output.deploymentLive).toBe(false);
    expect(output.liveDeployment).toBe("ci-newer5678");
  });

  test("alarm not found: writes fallback evidence with alarmFound false and exits without throwing", async () => {
    mockCloudWatchSend.mockResolvedValue({ MetricAlarms: [], CompositeAlarms: [] });
    process.env.ALARM_WINDOW = "2026-09-06T09:00:00.000Z to 2026-09-06T09:30:00.000Z (period 300s × 6, margin 300s)";

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
      main(["--alarm-name", "prod-cfb43ee-app-account-stack-health", "--deployment", "cfb43ee", "--region", "eu-west-2", "--from-alarm"]),
    ).rejects.toThrow("AccessDenied");
  });
});
