// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/video/chapters.test.js

import { describe, test, expect } from "vitest";
import { buildChapters, formatChapterLines } from "../../../scripts/lib/video/chapters.js";

const scenes = [
  { id: "home", chapter: "Home" },
  { id: "sign-in", chapter: "Sign in" },
  { id: "day-pass", chapter: "Day pass" },
  { id: "obligations-form", chapter: "Ask HMRC" },
];

function step(overrides) {
  return { sceneId: "home", stepIndex: 0, offCamera: false, startMs: 0, ...overrides };
}

describe("buildChapters", () => {
  test("takes one chapter per scene, at its earliest on-camera step", () => {
    const steps = [
      step({ sceneId: "home", startMs: 5 }),
      step({ sceneId: "home", startMs: 800 }),
      step({ sceneId: "sign-in", startMs: 1200 }),
      step({ sceneId: "sign-in", startMs: 1500 }),
      step({ sceneId: "day-pass", startMs: 12000 }),
    ];
    expect(buildChapters(steps, scenes)).toEqual([
      { startMs: 0, label: "Home" },
      { startMs: 1200, label: "Sign in" },
      { startMs: 12000, label: "Day pass" },
    ]);
  });

  test("forces the first chapter to 0:00 even when its own first step started later", () => {
    const steps = [step({ sceneId: "home", startMs: 42 })];
    expect(buildChapters(steps, scenes)[0]).toEqual({ startMs: 0, label: "Home" });
  });

  test("skips a scene whose steps are all off-camera", () => {
    const steps = [step({ sceneId: "home", startMs: 0 }), step({ sceneId: "sign-in", startMs: 100, offCamera: true })];
    expect(buildChapters(steps, scenes)).toEqual([{ startMs: 0, label: "Home" }]);
  });

  test("keeps scene order from the script, not timeline order", () => {
    const steps = [step({ sceneId: "sign-in", startMs: 1000 }), step({ sceneId: "home", startMs: 5000 })];
    expect(buildChapters(steps, scenes).map((c) => c.label)).toEqual(["Home", "Sign in"]);
  });

  test("returns nothing for a timeline with no matching scene", () => {
    expect(buildChapters([step({ sceneId: "unknown-scene" })], scenes)).toEqual([]);
  });
});

describe("formatChapterLines", () => {
  test("formats under an hour as MM:SS", () => {
    const lines = formatChapterLines([
      { startMs: 0, label: "Home" },
      { startMs: 75000, label: "Sign in" },
    ]);
    expect(lines).toBe("00:00 Home\n01:15 Sign in");
  });

  test("formats an hour or more as HH:MM:SS", () => {
    const lines = formatChapterLines([{ startMs: 3661000, label: "Late chapter" }]);
    expect(lines).toBe("01:01:01 Late chapter");
  });
});
