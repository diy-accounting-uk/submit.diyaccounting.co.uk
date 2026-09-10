// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/verifyAlarmOrigin.test.js

import { describe, test, expect, vi, beforeEach } from "vitest";

const mockCloudWatchSend = vi.fn();
vi.mock("@aws-sdk/client-cloudwatch", () => ({
  CloudWatchClient: class {
    send(...args) {
      return mockCloudWatchSend(...args);
    }
  },
  DescribeAlarmHistoryCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
}));

import { parseWindow, evaluateAlarmHistory, fetchAlarmHistory, parseArgs, main } from "../../../scripts/verify-alarm-origin.mjs";

const ALARM_NAME = "prod-a0f41c7-app-api-5xx";

function stateUpdateItem({ alarmName = ALARM_NAME, newState = "ALARM", timestamp = "2026-09-03T21:40:00.000Z" }) {
  return {
    AlarmName: alarmName,
    HistoryItemType: "StateUpdate",
    Timestamp: new Date(timestamp),
    HistoryData: JSON.stringify({ oldState: { stateValue: "OK" }, newState: { stateValue: newState } }),
  };
}

describe("parseWindow", () => {
  test("reads the start and end timestamps out of the issue body's window text", () => {
    const window = parseWindow("2026-09-03T21:25:00.000Z to 2026-09-03T21:50:23.618Z (period 300s x 2, margin 300s)");
    expect(window).toEqual({ startIso: "2026-09-03T21:25:00.000Z", endIso: "2026-09-03T21:50:23.618Z" });
  });

  test("returns null when the text carries no ' to ' separator", () => {
    expect(parseWindow("not a window")).toBeNull();
  });

  test("returns null when either side does not parse as a date", () => {
    expect(parseWindow("nonsense to 2026-09-03T21:50:23.618Z")).toBeNull();
  });

  test("returns null for a non-string input", () => {
    expect(parseWindow(undefined)).toBeNull();
  });
});

describe("evaluateAlarmHistory", () => {
  const startIso = "2026-09-03T21:25:00.000Z";
  const endIso = "2026-09-03T21:50:23.618Z";

  test("verifies when a matching ALARM transition sits inside the window", () => {
    const result = evaluateAlarmHistory({
      alarmName: ALARM_NAME,
      startIso,
      endIso,
      historyItems: [stateUpdateItem({})],
    });
    expect(result.verified).toBe(true);
    expect(result.matchedTimestamp).toBe("2026-09-03T21:40:00.000Z");
  });

  test("fails closed when no alarm name was claimed", () => {
    const result = evaluateAlarmHistory({ alarmName: undefined, startIso, endIso, historyItems: [stateUpdateItem({})] });
    expect(result.verified).toBe(false);
    expect(result.reason).toMatch(/no alarm name/);
  });

  test("fails closed when the window does not parse", () => {
    const result = evaluateAlarmHistory({
      alarmName: ALARM_NAME,
      startIso: "garbage",
      endIso: "garbage",
      historyItems: [stateUpdateItem({})],
    });
    expect(result.verified).toBe(false);
    expect(result.reason).toMatch(/window did not parse/);
  });

  test("fails closed when history has no items at all", () => {
    const result = evaluateAlarmHistory({ alarmName: ALARM_NAME, startIso, endIso, historyItems: [] });
    expect(result.verified).toBe(false);
    expect(result.reason).toMatch(/no ALARM transition/);
  });

  test("fails closed when the only transition is to OK, not ALARM", () => {
    const result = evaluateAlarmHistory({
      alarmName: ALARM_NAME,
      startIso,
      endIso,
      historyItems: [stateUpdateItem({ newState: "OK" })],
    });
    expect(result.verified).toBe(false);
  });

  test("fails closed when the matching alarm name fired outside the claimed window", () => {
    const result = evaluateAlarmHistory({
      alarmName: ALARM_NAME,
      startIso,
      endIso,
      historyItems: [stateUpdateItem({ timestamp: "2026-09-04T00:00:00.000Z" })],
    });
    expect(result.verified).toBe(false);
  });

  test("fails closed when the history is for a different alarm name", () => {
    const result = evaluateAlarmHistory({
      alarmName: ALARM_NAME,
      startIso,
      endIso,
      historyItems: [stateUpdateItem({ alarmName: "prod-a0f41c7-app-hmrc-stack-health" })],
    });
    expect(result.verified).toBe(false);
  });

  test("skips a history item whose HistoryData is not valid JSON, without crashing", () => {
    const badItem = { AlarmName: ALARM_NAME, HistoryItemType: "StateUpdate", Timestamp: new Date("2026-09-03T21:40:00.000Z"), HistoryData: "{not json" };
    const result = evaluateAlarmHistory({ alarmName: ALARM_NAME, startIso, endIso, historyItems: [badItem, stateUpdateItem({})] });
    expect(result.verified).toBe(true);
  });

  test("ignores a ConfigurationUpdate history item even when it names the alarm", () => {
    const configItem = { AlarmName: ALARM_NAME, HistoryItemType: "ConfigurationUpdate", Timestamp: new Date("2026-09-03T21:40:00.000Z"), HistoryData: "{}" };
    const result = evaluateAlarmHistory({ alarmName: ALARM_NAME, startIso, endIso, historyItems: [configItem] });
    expect(result.verified).toBe(false);
  });
});

describe("parseArgs", () => {
  test("reads every flag", () => {
    const opts = parseArgs(["--alarm-name", ALARM_NAME, "--window", "a to b", "--region", "eu-west-1"]);
    expect(opts).toEqual({ alarmName: ALARM_NAME, window: "a to b", start: undefined, end: undefined, region: "eu-west-1" });
  });

  test("defaults the region to eu-west-2", () => {
    const opts = parseArgs(["--alarm-name", ALARM_NAME, "--start", "a", "--end", "b"]);
    expect(opts.region).toBe("eu-west-2");
  });

  test("rejects an unknown flag", () => {
    expect(() => parseArgs(["--bogus"])).toThrow(/Unknown argument/);
  });
});

describe("fetchAlarmHistory", () => {
  beforeEach(() => {
    mockCloudWatchSend.mockReset();
  });

  test("pages through NextToken until it is absent", async () => {
    mockCloudWatchSend
      .mockResolvedValueOnce({ AlarmHistoryItems: [stateUpdateItem({})], NextToken: "page-2" })
      .mockResolvedValueOnce({ AlarmHistoryItems: [stateUpdateItem({ timestamp: "2026-09-03T21:41:00.000Z" })] });

    const items = await fetchAlarmHistory({ alarmName: ALARM_NAME, region: "eu-west-2", startIso: "2026-09-03T21:25:00.000Z", endIso: "2026-09-03T21:50:00.000Z" });

    expect(items).toHaveLength(2);
    expect(mockCloudWatchSend).toHaveBeenCalledTimes(2);
  });
});

describe("main", () => {
  let logSpy;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    mockCloudWatchSend.mockReset();
  });

  test("fails closed when --alarm-name is missing", async () => {
    const result = await main(["--window", "2026-09-03T21:25:00.000Z to 2026-09-03T21:50:00.000Z"]);
    expect(result.verified).toBe(false);
    expect(mockCloudWatchSend).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });

  test("fails closed when neither --window nor --start/--end is given", async () => {
    const result = await main(["--alarm-name", ALARM_NAME]);
    expect(result.verified).toBe(false);
    expect(mockCloudWatchSend).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });

  test("fails closed when the AWS call itself errors", async () => {
    mockCloudWatchSend.mockRejectedValue(new Error("access denied"));
    const result = await main(["--alarm-name", ALARM_NAME, "--start", "2026-09-03T21:25:00.000Z", "--end", "2026-09-03T21:50:00.000Z"]);
    expect(result.verified).toBe(false);
    expect(result.reason).toMatch(/describe-alarm-history call failed/);
    logSpy.mockRestore();
  });

  test("verifies end to end against a fabricated matching history", async () => {
    mockCloudWatchSend.mockResolvedValue({ AlarmHistoryItems: [stateUpdateItem({})] });
    const result = await main([
      "--alarm-name",
      ALARM_NAME,
      "--window",
      "2026-09-03T21:25:00.000Z to 2026-09-03T21:50:23.618Z (period 300s x 2, margin 300s)",
    ]);
    expect(result.verified).toBe(true);
    logSpy.mockRestore();
  });
});
