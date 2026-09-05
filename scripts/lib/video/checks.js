// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// scripts/lib/video/checks.js
//
// The acceptance checks from the site-video-capture design, section 10.1. Pure functions (no fs,
// no process.exit) so check-video-timings.js can run them and app/unit-tests/video/ can import
// them directly.

import { residualAfterWait } from "./pacing.js";

// --- 10.1: timings match the config ---

export function checkTimings(timelineSteps, script) {
  const failures = [];
  for (const step of timelineSteps) {
    if (step.group === 2 || step.group === 3) {
      const expectedResidual = residualAfterWait(step.configuredMs, step.waitMs, script.pacing);
      const diff = Math.abs(expectedResidual - step.residualMs);
      if (diff > 60) {
        failures.push({
          step: `${step.sceneId}#${step.stepIndex}`,
          check: "residualAfterWait",
          expected: expectedResidual,
          actual: step.residualMs,
          toleranceMs: 60,
        });
      }
    }
  }
  return failures;
}

function assertHasField(step, field) {
  if (!(field in step)) {
    throw new Error(
      `timeline step ${step.sceneId}#${step.stepIndex} has no "${field}" field — re-record with the current site-video-capture.js`,
    );
  }
}

// A step can only draw the timer overlay while its own document is still on screen, so the
// expected count is steps with a long wait that did NOT navigate; navigated is the ground truth
// for that, not the action name. A timer that did appear must line up with its own long wait.
export function checkTimerMarkers(timelineSteps, overlayEvents, script) {
  for (const step of timelineSteps) {
    assertHasField(step, "navigated");
    assertHasField(step, "timerShown");
  }
  const failures = [];
  const expectedCount = timelineSteps.filter((s) => s.waitMs > script.pacing.timerThresholdMs && s.navigated === false).length;
  const actualCount = overlayEvents.filter((e) => e.type === "timerStart").length;
  if (actualCount < expectedCount) {
    failures.push({ check: "timerMarkers", expected: `>= ${expectedCount}`, actual: actualCount });
  }
  for (const step of timelineSteps) {
    if (step.timerShown && !(step.waitMs > script.pacing.timerThresholdMs)) {
      failures.push({
        check: "timerShownWithoutLongWait",
        step: `${step.sceneId}#${step.stepIndex}`,
        expected: `waitMs > ${script.pacing.timerThresholdMs}`,
        actual: step.waitMs,
      });
    }
  }
  return failures;
}

export function checkTypingCadence(overlayEvents, script) {
  const typeEvents = overlayEvents.filter((e) => e.type === "typeChar").map((e) => e.t);
  if (typeEvents.length < 2) return [];
  const intervals = [];
  for (let i = 1; i < typeEvents.length; i++) {
    const gap = typeEvents[i] - typeEvents[i - 1];
    if (gap > 0 && gap < script.pacing.perCharMs * 5) intervals.push(gap); // drop cross-step gaps
  }
  if (intervals.length === 0) return [];
  const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const diff = Math.abs(mean - script.pacing.perCharMs);
  if (diff > 25) {
    return [{ check: "typingCadence", expected: script.pacing.perCharMs, actual: Math.round(mean), toleranceMs: 25 }];
  }
  return [];
}
