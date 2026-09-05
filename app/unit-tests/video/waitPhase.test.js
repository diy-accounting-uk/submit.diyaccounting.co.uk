// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/unit-tests/video/waitPhase.test.js
//
// createWaitPhase is the fix for the timer pill arming against a step's own pointer animation
// or on-screen typing instead of against its real wait: it must only start its clocks once the
// wrapped function itself begins, and only for an action the pacing model calls wait-capable.

import { describe, test, expect, vi } from "vitest";
import { EventEmitter } from "node:events";

vi.mock("../../../scripts/lib/video/overlay.js", () => ({
  timerStart: vi.fn().mockResolvedValue(undefined),
  timerSetCompressing: vi.fn().mockResolvedValue(undefined),
  timerStop: vi.fn().mockResolvedValue(undefined),
}));

const overlay = await import("../../../scripts/lib/video/overlay.js");
const { createWaitPhase } = await import("../../../scripts/lib/video/waitPhase.js");

// A real Playwright page is an event emitter with a "load" event fired on every navigation;
// this fake stands in for it wherever a test needs to simulate one happening mid-wait.
const page = new EventEmitter();
const pacing = { timerThresholdMs: 20, timerFullScaleMs: 5000, waitCompressionAfterMs: 60, waitCompressionFactor: 8 };

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("createWaitPhase", () => {
  test("an action outside WAIT_CAPABLE_ACTIONS never arms, however long its wrapped call runs", async () => {
    const wp = createWaitPhase(page, { action: "type" }, pacing, null, false);
    await wp.run(() => wait(pacing.timerThresholdMs * 3));
    expect(wp.shown).toBe(false);
    expect(overlay.timerStart).not.toHaveBeenCalled();
  });

  test("a wait-capable action whose wrapped call resolves before the threshold never arms", async () => {
    vi.clearAllMocks();
    const wp = createWaitPhase(page, { action: "click" }, pacing, null, true);
    await wp.run(() => wait(5));
    expect(wp.shown).toBe(false);
    expect(overlay.timerStart).not.toHaveBeenCalled();
  });

  test("a wait-capable action whose wrapped call runs past the threshold arms and then stops", async () => {
    vi.clearAllMocks();
    const wp = createWaitPhase(page, { action: "click" }, pacing, null, true);
    await wp.run(() => wait(pacing.timerThresholdMs * 3));
    expect(wp.shown).toBe(true);
    expect(overlay.timerStart).toHaveBeenCalledTimes(1);
    expect(overlay.timerStop).toHaveBeenCalledTimes(1);
  });

  test("time spent before run() is called never counts toward the threshold", async () => {
    vi.clearAllMocks();
    const wp = createWaitPhase(page, { action: "click" }, pacing, null, true);
    // The animation/preamble a caller times outside run() must not arm the pill by itself.
    await wait(pacing.timerThresholdMs * 3);
    await wp.run(() => wait(5));
    expect(wp.shown).toBe(false);
    expect(overlay.timerStart).not.toHaveBeenCalled();
  });

  test("a wait past waitCompressionAfterMs turns compression on and back off", async () => {
    vi.clearAllMocks();
    const capture = { setCompression: vi.fn() };
    const wp = createWaitPhase(page, { action: "await" }, pacing, capture, true);
    await wp.run(() => wait(pacing.waitCompressionAfterMs + 40));
    expect(capture.setCompression).toHaveBeenNthCalledWith(1, true, pacing.waitCompressionFactor);
    expect(capture.setCompression).toHaveBeenNthCalledWith(2, false);
  });

  test("a step label reaches the pill", async () => {
    vi.clearAllMocks();
    const wp = createWaitPhase(page, { action: "await", label: "Loading activities" }, pacing, null, true);
    await wp.run(() => wait(pacing.timerThresholdMs * 3));
    expect(overlay.timerStart).toHaveBeenCalledWith(page, "Loading activities", pacing.timerFullScaleMs);
  });

  test("a load event mid-wait re-asserts an already-shown pill against the fresh document", async () => {
    vi.clearAllMocks();
    const wp = createWaitPhase(page, { action: "ensureBundle" }, pacing, null, true);
    await wp.run(async () => {
      await wait(pacing.timerThresholdMs * 3); // past the threshold: shown becomes true
      page.emit("load"); // the wait phase's own same-URL reload finishing
      await wait(5);
    });
    // Once for the threshold firing, once more for the reload's load event.
    expect(overlay.timerStart).toHaveBeenCalledTimes(2);
  });

  test("a load event before the threshold does not arm the pill early", async () => {
    vi.clearAllMocks();
    const wp = createWaitPhase(page, { action: "ensureBundle" }, pacing, null, true);
    await wp.run(async () => {
      page.emit("load");
      await wait(5);
    });
    expect(wp.shown).toBe(false);
    expect(overlay.timerStart).not.toHaveBeenCalled();
  });

  test("removes its load listener once the wrapped call settles", async () => {
    vi.clearAllMocks();
    const wp = createWaitPhase(page, { action: "click" }, pacing, null, true);
    const before = page.listenerCount("load");
    await wp.run(() => wait(5));
    expect(page.listenerCount("load")).toBe(before);
  });

  test("cleans up its timers and rethrows when the wrapped call fails", async () => {
    vi.clearAllMocks();
    const wp = createWaitPhase(page, { action: "click" }, pacing, null, true);
    await expect(
      wp.run(async () => {
        await wait(5);
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(wp.shown).toBe(false);
    expect(overlay.timerStart).not.toHaveBeenCalled();
  });
});
