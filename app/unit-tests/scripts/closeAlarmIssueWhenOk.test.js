// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/closeAlarmIssueWhenOk.test.js

import { describe, test, expect, vi, beforeEach } from "vitest";

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
  DescribeAlarmHistoryCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
}));

import {
  familyFromTitle,
  readAlarmClaimFromBody,
  isAuthoredByAlarmPipeline,
  decideClosure,
  main,
} from "../../../scripts/close-alarm-issue-when-ok.mjs";

const ALARM_NAME = "prod-env-activity-stack-health";
const FAMILY = "prod-env-activity-stack-health";
const WINDOW = "2026-09-20T11:41:00.000Z to 2026-09-20T11:56:19.021Z (period 300s x 1, margin 300s)";

function issueBody({ alarmName = ALARM_NAME, window = WINDOW, region = "eu-west-2" } = {}) {
  return `## CloudWatch alarm state change\n\n**Alarm:** ${alarmName}\n**State:** OK -> ALARM\n**Timestamp:** 2026-09-20T11:51:19.023+0000\n**Window:** ${window}\n**Region:** ${region}\n**Deployment:** prod-dd95c16\n`;
}

function stateUpdateItem({ alarmName = ALARM_NAME, newState = "ALARM", timestamp = "2026-09-20T11:51:00.000Z" }) {
  return {
    AlarmName: alarmName,
    HistoryItemType: "StateUpdate",
    Timestamp: new Date(timestamp),
    HistoryData: JSON.stringify({ oldState: { stateValue: "OK" }, newState: { stateValue: newState } }),
  };
}

describe("familyFromTitle", () => {
  test("reads the family key out of an [ALARM] issue title", () => {
    expect(familyFromTitle("[ALARM] prod-env-cis-unauthorized-api-calls")).toBe("prod-env-cis-unauthorized-api-calls");
  });

  test("returns null for a title with no [ALARM] marker", () => {
    expect(familyFromTitle("ITSA+MTD Add-on")).toBeNull();
  });

  test("returns null for an empty or missing title", () => {
    expect(familyFromTitle("")).toBeNull();
    expect(familyFromTitle(undefined)).toBeNull();
  });
});

describe("readAlarmClaimFromBody", () => {
  test("reads the alarm name, window and region out of the issue body", () => {
    expect(readAlarmClaimFromBody(issueBody())).toEqual({
      alarmName: ALARM_NAME,
      window: WINDOW,
      region: "eu-west-2",
    });
  });

  test("returns nulls for a body carrying none of the fields", () => {
    expect(readAlarmClaimFromBody("nothing useful here")).toEqual({ alarmName: null, window: null, region: null });
  });
});

describe("isAuthoredByAlarmPipeline", () => {
  test("true for the alarm pipeline's own bot", () => {
    expect(isAuthoredByAlarmPipeline({ login: "diyaccounting-ops[bot]", type: "Bot" })).toBe(true);
  });

  test("false for a human author", () => {
    expect(isAuthoredByAlarmPipeline({ login: "antonycc", type: "User" })).toBe(false);
  });

  test("false for a different bot", () => {
    expect(isAuthoredByAlarmPipeline({ login: "diya-agent[bot]", type: "Bot" })).toBe(false);
  });

  test("false for a missing author", () => {
    expect(isAuthoredByAlarmPipeline(null)).toBe(false);
    expect(isAuthoredByAlarmPipeline(undefined)).toBe(false);
  });
});

describe("decideClosure", () => {
  test("closes a close-when-gone family when no alarm exists", () => {
    const decision = decideClosure({ remedy: "close-when-gone", alarms: [] });
    expect(decision.shouldClose).toBe(true);
  });

  test("does not close a dispatch family when no alarm was found", () => {
    const decision = decideClosure({ remedy: "dispatch", alarms: [] });
    expect(decision.shouldClose).toBe(false);
  });

  test("closes when every alarm of the family is OK", () => {
    const decision = decideClosure({
      remedy: "draft-pr",
      alarms: [{ AlarmName: FAMILY, StateValue: "OK" }],
    });
    expect(decision.shouldClose).toBe(true);
  });

  test("does not close when any alarm of the family is still in ALARM", () => {
    const decision = decideClosure({
      remedy: "draft-pr",
      alarms: [
        { AlarmName: FAMILY, StateValue: "OK" },
        { AlarmName: `check-${FAMILY}`, StateValue: "ALARM" },
      ],
    });
    expect(decision.shouldClose).toBe(false);
  });

  test("never closes a none family", () => {
    const decision = decideClosure({ remedy: "none", alarms: [{ AlarmName: FAMILY, StateValue: "OK" }] });
    expect(decision.shouldClose).toBe(false);
  });
});

describe("main", () => {
  beforeEach(() => {
    mockCloudWatchSend.mockReset();
  });

  test("closes the issue when the author, origin and alarm states all check out", async () => {
    const ghApi = vi.fn().mockReturnValue({
      title: `[ALARM] ${FAMILY}`,
      body: issueBody(),
      user: { login: "diyaccounting-ops[bot]", type: "Bot" },
    });
    const closeIssue = vi.fn();
    mockCloudWatchSend.mockResolvedValueOnce({ AlarmHistoryItems: [stateUpdateItem({})] });
    const fetchAlarms = vi.fn().mockResolvedValue([{ AlarmName: FAMILY, StateValue: "OK" }]);

    const result = await main(["--issue-number", "305", "--repo", "diy-accounting-uk/submit.diyaccounting.co.uk"], {
      ghApi,
      closeIssue,
      fetchAlarms,
    });

    expect(result.closed).toBe(true);
    expect(closeIssue).toHaveBeenCalledTimes(1);
    expect(closeIssue.mock.calls[0][0]).toBe("diy-accounting-uk/submit.diyaccounting.co.uk");
    expect(closeIssue.mock.calls[0][1]).toBe("305");
  });

  test("does not close when the issue was not authored by the alarm pipeline", async () => {
    const ghApi = vi.fn().mockReturnValue({
      title: `[ALARM] ${FAMILY}`,
      body: issueBody(),
      user: { login: "antonycc", type: "User" },
    });
    const closeIssue = vi.fn();
    const fetchAlarms = vi.fn();

    const result = await main(["--issue-number", "305", "--repo", "diy-accounting-uk/submit.diyaccounting.co.uk"], {
      ghApi,
      closeIssue,
      fetchAlarms,
    });

    expect(result.closed).toBe(false);
    expect(closeIssue).not.toHaveBeenCalled();
    expect(fetchAlarms).not.toHaveBeenCalled();
  });

  test("does not close when the family has no remedy other than none", async () => {
    const ghApi = vi.fn().mockReturnValue({
      title: "[ALARM] prod-env-bundle-cap-reached",
      body: issueBody({ alarmName: "prod-env-bundle-cap-reached" }),
      user: { login: "diyaccounting-ops[bot]", type: "Bot" },
    });
    const closeIssue = vi.fn();
    const fetchAlarms = vi.fn();

    const result = await main(["--issue-number", "9", "--repo", "diy-accounting-uk/submit.diyaccounting.co.uk"], {
      ghApi,
      closeIssue,
      fetchAlarms,
    });

    expect(result.closed).toBe(false);
    expect(closeIssue).not.toHaveBeenCalled();
    expect(fetchAlarms).not.toHaveBeenCalled();
  });

  test("does not close when the alarm origin cannot be verified", async () => {
    const ghApi = vi.fn().mockReturnValue({
      title: `[ALARM] ${FAMILY}`,
      body: issueBody(),
      user: { login: "diyaccounting-ops[bot]", type: "Bot" },
    });
    const closeIssue = vi.fn();
    mockCloudWatchSend.mockResolvedValueOnce({ AlarmHistoryItems: [] });
    const fetchAlarms = vi.fn();

    const result = await main(["--issue-number", "305", "--repo", "diy-accounting-uk/submit.diyaccounting.co.uk"], {
      ghApi,
      closeIssue,
      fetchAlarms,
    });

    expect(result.closed).toBe(false);
    expect(closeIssue).not.toHaveBeenCalled();
    expect(fetchAlarms).not.toHaveBeenCalled();
  });

  test("does not close when an alarm of the family is still in ALARM", async () => {
    const ghApi = vi.fn().mockReturnValue({
      title: `[ALARM] ${FAMILY}`,
      body: issueBody(),
      user: { login: "diyaccounting-ops[bot]", type: "Bot" },
    });
    const closeIssue = vi.fn();
    mockCloudWatchSend.mockResolvedValueOnce({ AlarmHistoryItems: [stateUpdateItem({})] });
    const fetchAlarms = vi.fn().mockResolvedValue([{ AlarmName: FAMILY, StateValue: "ALARM" }]);

    const result = await main(["--issue-number", "305", "--repo", "diy-accounting-uk/submit.diyaccounting.co.uk"], {
      ghApi,
      closeIssue,
      fetchAlarms,
    });

    expect(result.closed).toBe(false);
    expect(closeIssue).not.toHaveBeenCalled();
  });

  test("reports a usable error when no --issue-number or --repo is given", async () => {
    const result = await main([]);
    expect(result.closed).toBe(false);
  });
});
