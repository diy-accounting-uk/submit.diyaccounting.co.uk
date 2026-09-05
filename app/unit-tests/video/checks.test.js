// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/unit-tests/video/checks.test.js

import { describe, test, expect } from "vitest";
import { checkTimings, checkTimerMarkers, checkTypingCadence } from "../../../scripts/lib/video/checks.js";

const script = {
  pacing: {
    minResidualMs: 150,
    timerThresholdMs: 250,
    perCharMs: 40,
  },
};

function step(overrides) {
  return {
    sceneId: "scene",
    stepIndex: 0,
    action: "click",
    group: 2,
    configuredMs: 700,
    waitMs: 0,
    residualMs: 700,
    navigated: false,
    timerShown: false,
    ...overrides,
  };
}

describe("checkTimings", () => {
  test("passes when residualMs matches the pacing formula", () => {
    expect(checkTimings([step({ waitMs: 100, residualMs: 600 })], script)).toEqual([]);
  });

  test("fails when residualMs drifts past tolerance", () => {
    const failures = checkTimings([step({ waitMs: 100, residualMs: 200 })], script);
    expect(failures).toHaveLength(1);
    expect(failures[0].check).toBe("residualAfterWait");
  });

  test("skips an off-camera step even though its recorded residual does not match the formula", () => {
    const offCameraStep = step({ offCamera: true, waitMs: 100, residualMs: 0 });
    expect(checkTimings([offCameraStep], script)).toEqual([]);
  });
});

describe("checkTimerMarkers", () => {
  test("expects one timerStart per long wait that did not navigate", () => {
    const steps = [
      step({ stepIndex: 0, waitMs: 400, navigated: false, timerShown: true }),
      step({ stepIndex: 1, action: "goto", waitMs: 5000, navigated: true, timerShown: false }),
    ];
    const overlayEvents = [{ type: "timerStart" }];
    expect(checkTimerMarkers(steps, overlayEvents, script)).toEqual([]);
  });

  test("a navigating step is not expected to have shown a timer even with a long wait", () => {
    const steps = [step({ action: "login", waitMs: 13427, navigated: true, timerShown: false })];
    expect(checkTimerMarkers(steps, [], script)).toEqual([]);
  });

  test("fails when fewer timerStart events landed than the non-navigating long waits require", () => {
    const steps = [step({ waitMs: 400, navigated: false, timerShown: true })];
    const failures = checkTimerMarkers(steps, [], script);
    expect(failures).toEqual([{ check: "timerMarkers", expected: ">= 1", actual: 0 }]);
  });

  test("fails when a timer was shown for a step whose wait never crossed the threshold", () => {
    const steps = [step({ waitMs: 50, navigated: false, timerShown: true })];
    const failures = checkTimerMarkers(steps, [{ type: "timerStart" }], script);
    expect(failures).toEqual([
      { check: "timerShownWithoutLongWait", step: "scene#0", expected: "waitMs > 250", actual: 50 },
    ]);
  });

  test("throws naming the field on a timeline recorded before navigated/timerShown existed", () => {
    const oldStep = { sceneId: "scene", stepIndex: 0, action: "click", waitMs: 400 };
    expect(() => checkTimerMarkers([oldStep], [], script)).toThrow(/"navigated"/);
  });

  test("throws naming timerShown when only navigated is missing it", () => {
    const oldStep = { sceneId: "scene", stepIndex: 0, action: "click", waitMs: 400, navigated: false };
    expect(() => checkTimerMarkers([oldStep], [], script)).toThrow(/"timerShown"/);
  });

  test("an off-camera step's long wait is not expected to have shown a timer", () => {
    const steps = [step({ offCamera: true, action: "submitReturn", waitMs: 30000, navigated: false, timerShown: false })];
    expect(checkTimerMarkers(steps, [], script)).toEqual([]);
  });

  test("an off-camera step with timerShown true is not flagged, even without a long wait", () => {
    const steps = [step({ offCamera: true, waitMs: 50, navigated: false, timerShown: true })];
    expect(checkTimerMarkers(steps, [], script)).toEqual([]);
  });
});

describe("checkTypingCadence", () => {
  test("passes when the mean gap between keystrokes matches perCharMs", () => {
    const overlayEvents = [
      { type: "typeChar", t: 0 },
      { type: "typeChar", t: 40 },
      { type: "typeChar", t: 80 },
    ];
    expect(checkTypingCadence(overlayEvents, script)).toEqual([]);
  });

  test("fails when the mean gap drifts far from perCharMs", () => {
    const overlayEvents = [
      { type: "typeChar", t: 0 },
      { type: "typeChar", t: 150 },
      { type: "typeChar", t: 300 },
    ];
    const failures = checkTypingCadence(overlayEvents, script);
    expect(failures).toHaveLength(1);
    expect(failures[0].check).toBe("typingCadence");
  });
});
