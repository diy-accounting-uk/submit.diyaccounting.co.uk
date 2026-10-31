// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/stackStallWatchdog.test.js

import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { describeStall, observe, STALL_THRESHOLD_MS, unidentifiedInProgress } from "../../../scripts/ci/stack-stall-watchdog.mjs";

const recorded = JSON.parse(readFileSync(new URL("./fixtures/stack-stalled-alarm.json", import.meta.url), "utf8")).StackResourceSummaries;

const MINUTE = 60 * 1000;

describe("stack stall watchdog decision", () => {
  test("the recorded stuck AccountStack has one unidentified resource in progress", () => {
    const found = unidentifiedInProgress(recorded);
    expect(found.map((r) => r.LogicalResourceId)).toEqual(["QueueDlqAlarmaccountE9659E8F"]);
    expect(found[0].ResourceType).toBe("AWS::CloudWatch::Alarm");
  });

  test("the recorded stack is reported stalled after 15 minutes of an unchanged state", () => {
    let seen = observe(undefined, recorded, 0);
    for (let minute = 1; minute < 15; minute++) {
      seen = observe(seen, recorded, minute * MINUTE);
      expect(seen.stalled).toEqual([]);
    }
    seen = observe(seen, recorded, 15 * MINUTE);
    expect(seen.stalled.map((r) => r.LogicalResourceId)).toEqual(["QueueDlqAlarmaccountE9659E8F"]);
    expect(describeStall("prod-x-app-AccountStack", "eu-west-2", seen.stalled, 15)[0]).toContain(
      "QueueDlqAlarmaccountE9659E8F (AWS::CloudWatch::Alarm)",
    );
  });

  test("another resource changing state restarts the clock", () => {
    let seen = observe(undefined, recorded, 0);
    seen = observe(seen, recorded, 14 * MINUTE);
    const changed = recorded.map((r, i) => (i === 0 ? { ...r, ResourceStatus: "UPDATE_COMPLETE" } : r));
    seen = observe(seen, changed, 15 * MINUTE);
    expect(seen.stalled).toEqual([]);
    seen = observe(seen, changed, 15 * MINUTE + STALL_THRESHOLD_MS - MINUTE);
    expect(seen.stalled).toEqual([]);
  });

  test("an in-progress resource with a physical id is never a stall", () => {
    const withId = recorded.map((r) => (r.ResourceStatus === "CREATE_IN_PROGRESS" ? { ...r, PhysicalResourceId: "arn:x" } : r));
    let seen = observe(undefined, withId, 0);
    seen = observe(seen, withId, 60 * MINUTE);
    expect(seen.stalled).toEqual([]);
  });

  test("a stack with every resource complete is never a stall", () => {
    const done = recorded.map((r) => ({ ...r, ResourceStatus: "CREATE_COMPLETE", PhysicalResourceId: "x" }));
    let seen = observe(undefined, done, 0);
    seen = observe(seen, done, 60 * MINUTE);
    expect(seen.stalled).toEqual([]);
  });
});
