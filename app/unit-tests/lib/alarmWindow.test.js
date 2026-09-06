// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

import { describe, test, expect } from "vitest";

import { resolveAlarmWindow } from "@app/lib/alarmWindow.js";

describe("resolveAlarmWindow", () => {
  test("a single 900-second datapoint gives a 300-second margin, start on the datapoint minus five minutes, end on queryDate plus five minutes", () => {
    const window = resolveAlarmWindow({
      reasonData: {
        period: 900,
        queryDate: "2026-09-03T21:45:23.618Z",
        evaluatedDatapoints: [{ timestamp: "2026-09-03T21:30:00.000Z" }],
      },
      timestamp: "2026-09-03T21:45:23.618+0000",
      periodSeconds: 300,
    });

    expect(window.periodSeconds).toBe(900);
    expect(window.evaluatedPeriods).toBe(1);
    expect(window.marginSeconds).toBe(300);
    expect(window.startIso).toBe("2026-09-03T21:25:00.000Z");
    expect(window.endIso).toBe("2026-09-03T21:50:23.618Z");
  });

  test("a 7200-second period with one datapoint gives a 720-second margin", () => {
    const window = resolveAlarmWindow({
      reasonData: {
        period: 7200,
        queryDate: "2026-09-05T22:04:50.762Z",
        evaluatedDatapoints: [{ timestamp: "2026-09-05T20:04:00.000Z" }],
      },
      timestamp: "2026-09-05T22:04:50.762+0000",
      periodSeconds: 300,
    });

    expect(window.marginSeconds).toBe(720);
  });

  test("a 93600-second period is capped at a 3600-second margin", () => {
    const window = resolveAlarmWindow({
      reasonData: {
        period: 93600,
        queryDate: "2026-09-05T22:04:50.762Z",
        evaluatedDatapoints: [{ timestamp: "2026-09-04T20:04:00.000Z" }],
      },
      timestamp: "2026-09-05T22:04:50.762+0000",
      periodSeconds: 300,
    });

    expect(window.marginSeconds).toBe(3600);
  });

  test("three evaluated datapoints widen the window to three periods and start on the earliest", () => {
    const window = resolveAlarmWindow({
      reasonData: {
        period: 300,
        queryDate: "2026-09-03T21:45:00.000Z",
        evaluatedDatapoints: [
          { timestamp: "2026-09-03T21:40:00.000Z" },
          { timestamp: "2026-09-03T21:30:00.000Z" },
          { timestamp: "2026-09-03T21:35:00.000Z" },
        ],
      },
      timestamp: "2026-09-03T21:45:00.000+0000",
      periodSeconds: 300,
    });

    expect(window.evaluatedPeriods).toBe(3);
    // windowSeconds = 300 * 3 = 900, margin = max(300, round(0.1*900)) = 300
    expect(window.marginSeconds).toBe(300);
    expect(window.startIso).toBe("2026-09-03T21:25:00.000Z");
  });

  test("absent reasonData falls back to the configuration period, one evaluated period, and the state timestamp", () => {
    const window = resolveAlarmWindow({
      reasonData: null,
      timestamp: "2026-09-03T21:45:00.000Z",
      periodSeconds: 600,
    });

    expect(window.periodSeconds).toBe(600);
    expect(window.evaluatedPeriods).toBe(1);
    // windowSeconds = 600, margin = max(300, round(60)) = 300
    expect(window.marginSeconds).toBe(300);
    expect(window.endIso).toBe("2026-09-03T21:50:00.000Z");
    expect(window.startIso).toBe("2026-09-03T21:30:00.000Z");
  });

  test("absent reasonData and absent configuration period fall back to 300 seconds", () => {
    const window = resolveAlarmWindow({
      reasonData: null,
      timestamp: "2026-09-03T21:45:00.000Z",
      periodSeconds: undefined,
    });

    expect(window.periodSeconds).toBe(300);
  });

  test("a +0000 offset parses to the same instant as the Z form", () => {
    const withOffset = resolveAlarmWindow({
      reasonData: null,
      timestamp: "2026-09-03T21:45:00.000+0000",
      periodSeconds: 300,
    });
    const withZ = resolveAlarmWindow({
      reasonData: null,
      timestamp: "2026-09-03T21:45:00.000Z",
      periodSeconds: 300,
    });
    expect(withOffset.startIso).toBe(withZ.startIso);
    expect(withOffset.endIso).toBe(withZ.endIso);
  });

  test("output is always ...Z with milliseconds", () => {
    const window = resolveAlarmWindow({
      reasonData: null,
      timestamp: "2026-09-03T21:45:00.000+0000",
      periodSeconds: 300,
    });
    expect(window.startIso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(window.endIso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});
