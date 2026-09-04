// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/unit-tests/video/pacing.test.js

import { describe, test, expect } from "vitest";
import { groupFor, pauseForGroup, residualAfterWait, captionMinMs, compressionFor } from "../../../scripts/lib/video/pacing.js";

const cfg = {
  perCharMs: 90,
  betweenActionsMs: 700,
  aroundMotionMs: 1200,
  minResidualMs: 150,
  timerThresholdMs: 250,
  timerFullScaleMs: 5000,
  waitCompressionAfterMs: 6000,
  waitCompressionFactor: 8,
};

const captionCfg = {
  charsPerSecond: 15,
  minMs: 1500,
};

describe("groupFor", () => {
  test("maps each action to its pacing group", () => {
    expect(groupFor("goto")).toBe(3);
    expect(groupFor("scroll")).toBe(3);
    expect(groupFor("click")).toBe(2);
    expect(groupFor("point")).toBe(2);
    expect(groupFor("type")).toBe(2);
    expect(groupFor("press")).toBe(2);
    expect(groupFor("tab")).toBe(2);
    expect(groupFor("select")).toBe(2);
    expect(groupFor("highlight")).toBe(2);
    expect(groupFor("await")).toBe(2);
  });

  test("returns null for actions with no group of their own", () => {
    expect(groupFor("caption")).toBeNull();
    expect(groupFor("hold")).toBeNull();
    expect(groupFor("still")).toBeNull();
  });

  test("throws for an unknown action", () => {
    expect(() => groupFor("teleport")).toThrow(/unknown action/);
  });
});

describe("pauseForGroup", () => {
  test("reads the configured pause for groups 1-3", () => {
    expect(pauseForGroup(1, cfg)).toBe(90);
    expect(pauseForGroup(2, cfg)).toBe(700);
    expect(pauseForGroup(3, cfg)).toBe(1200);
  });
});

describe("residualAfterWait", () => {
  test("a wait well inside the pause leaves most of the pause", () => {
    // 700ms group-2 pause, 200ms measured wait -> 500ms residual.
    expect(residualAfterWait(700, 200, cfg)).toBe(500);
  });

  test("a wait exactly equal to the pause leaves the floor", () => {
    expect(residualAfterWait(700, 700, cfg)).toBe(cfg.minResidualMs);
  });

  test("a wait longer than the pause floors at minResidualMs", () => {
    // A 3s wait inside a 700ms pause leaves only the floor, not a negative number.
    expect(residualAfterWait(700, 3000, cfg)).toBe(150);
  });
});

describe("captionMinMs", () => {
  test("a caption below the floor gets the floor", () => {
    expect(captionMinMs("Bundles.", captionCfg)).toBe(1500);
  });

  test("a long caption is timed at charsPerSecond", () => {
    const text = "a".repeat(90); // 90 chars / 15 cps = 6000ms
    expect(captionMinMs(text, captionCfg)).toBe(6000);
  });
});

describe("compressionFor", () => {
  test("a wait at the compression boundary is not compressed", () => {
    const result = compressionFor(6000, cfg);
    expect(result.compressed).toBe(false);
    expect(result.onScreenMs).toBe(6000);
  });

  test("a wait one ms past the boundary is compressed", () => {
    const result = compressionFor(6001, cfg);
    expect(result.compressed).toBe(true);
    expect(result.normalMs).toBe(6000);
    expect(result.compressedSourceMs).toBe(1);
  });

  test("a 40s wait becomes about 10s on screen", () => {
    // 6s in full, plus (40s - 6s) / 8 = 4.25s compressed = 10.25s on screen.
    const result = compressionFor(40000, cfg);
    expect(result.onScreenMs).toBeCloseTo(10250, 0);
  });
});
