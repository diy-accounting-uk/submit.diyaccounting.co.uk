// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/video/scrollTo.test.js
//
// A step with scrollTo scrolls the page so the named element's top edge sits a small margin below
// the top of the viewport before the step acts, so the frame starts at that element.

import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("../../../scripts/lib/video/overlay.js", () => ({
  scrollTo: vi.fn().mockResolvedValue(undefined),
  rectOf: vi.fn().mockResolvedValue({ left: 0, top: 0, width: 10, height: 10 }),
  pointTo: vi.fn().mockResolvedValue(undefined),
  highlight: vi.fn().mockResolvedValue(undefined),
}));

import * as overlay from "../../../scripts/lib/video/overlay.js";
import { executeAction, SCROLL_TO_TOP_MARGIN_PX } from "../../../scripts/lib/video/actions.js";
import { validateScript } from "../../../scripts/lib/video/scriptSchema.js";

function pageWithElements({ sectionTop, scrollY }) {
  globalThis.window = { scrollY };
  const section = { getBoundingClientRect: () => ({ top: sectionTop }) };
  const field = { getBoundingClientRect: () => ({ top: 900, height: 30 }) };
  const locatorFor = (selector) => ({
    count: vi.fn().mockResolvedValue(1),
    isVisible: vi.fn().mockResolvedValue(true),
    scrollIntoViewIfNeeded: vi.fn().mockResolvedValue(undefined),
    first() {
      return this;
    },
    evaluate: vi.fn(async (fn, arg) => fn(selector === "#section" ? section : field, arg)),
  });
  return { locator: locatorFor, evaluate: vi.fn().mockResolvedValue(0), screenshot: vi.fn() };
}

const ctx = {
  sceneId: "statement",
  stepIndex: 3,
  stillsDir: "target/videos/test-stills",
  pacing: { aroundMotionMs: 400 },
  onTargetRect: null,
};

describe("scrollTo before a step", () => {
  beforeEach(() => overlay.scrollTo.mockClear());

  test("scrolls so the element's top edge is a margin below the top of the viewport", async () => {
    const page = pageWithElements({ sectionTop: 700, scrollY: 1000 });
    await executeAction(page, { action: "point", target: "#field", scrollTo: "#section" }, ctx);
    expect(overlay.scrollTo).toHaveBeenCalledWith(expect.anything(), 0, 1000 + 700 - SCROLL_TO_TOP_MARGIN_PX, 400);
  });

  test("never scrolls above the page top", async () => {
    const page = pageWithElements({ sectionTop: 5, scrollY: 0 });
    await executeAction(page, { action: "point", target: "#field", scrollTo: "#section" }, ctx);
    expect(overlay.scrollTo).toHaveBeenCalledWith(expect.anything(), 0, 0, 400);
  });

  test("an await step scrolls after the wait, so the element it scrolls to can appear during it", async () => {
    const order = [];
    const page = pageWithElements({ sectionTop: 700, scrollY: 1000 });
    const original = page.locator;
    page.locator = (selector) => {
      const locator = original(selector);
      if (selector === "#result") locator.waitFor = vi.fn(async () => order.push("waited"));
      return locator;
    };
    overlay.scrollTo.mockImplementation(async () => order.push("scrolled"));
    const waitPhase = (wait) => wait();
    await executeAction(page, { action: "await", until: "#result", scrollTo: "#section" }, { ...ctx, waitPhase });
    expect(order).toEqual(["waited", "scrolled"]);
    overlay.scrollTo.mockReset();
  });

  test("a step without scrollTo does not scroll first", async () => {
    const page = pageWithElements({ sectionTop: 700, scrollY: 1000 });
    await executeAction(page, { action: "point", target: "#field" }, ctx);
    expect(overlay.scrollTo).not.toHaveBeenCalled();
  });
});

describe("scrollTo in the scene script schema", () => {
  const withStep = (step) =>
    validateScript({
      name: "t",
      title: "t",
      description: "t",
      auth: "none",
      pages: ["index.html"],
      viewport: { width: 1920, height: 1080 },
      fps: 30,
      pacing: {
        perCharMs: 1,
        betweenActionsMs: 1,
        aroundMotionMs: 1,
        minResidualMs: 1,
        timerThresholdMs: 1,
        timerFullScaleMs: 1,
        waitCompressionAfterMs: 1,
        waitCompressionFactor: 1,
      },
      captions: {
        fontPx: 1,
        lineHeightPx: 1,
        maxLines: 1,
        maxCharsPerLine: 1,
        charsPerSecond: 1,
        minMs: 1,
        fadeMs: 1,
        safeArea: { topPct: 1, bottomPct: 1, sidePct: 1 },
      },
      scenes: [{ id: "a", chapter: "A", steps: [{ action: "goto", url: "/" }, step] }],
    });

  test("accepts a target on a step that acts on the page", () => {
    expect(() => withStep({ action: "point", target: "#p", scrollTo: "#section" })).not.toThrow();
    expect(() => withStep({ action: "await", until: "#r", scrollTo: { role: "heading", name: "Result" } })).not.toThrow();
  });

  test("rejects a malformed target and a step with no page to scroll", () => {
    expect(() => withStep({ action: "point", target: "#p", scrollTo: {} })).toThrow(/scrollTo/);
    expect(() => withStep({ action: "hold", ms: 100, scrollTo: "#section" })).toThrow(/scrollTo/);
  });
});
