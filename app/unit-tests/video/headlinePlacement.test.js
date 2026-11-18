// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/video/headlinePlacement.test.js

import { describe, test, expect } from "vitest";
import { DEFAULT_HEADLINE_CONFIG, placeHeadline } from "../../../scripts/lib/video/headlinePlacement.js";

const viewport = { width: 1920, height: 1080 };
const config = { maxWidth: 680, height: 64, gapPx: 22, marginPx: 28, defaultTop: 132 };

function assertClearOfTarget(placement, rect) {
  const tagTop = placement.top;
  const tagBottom = placement.top + config.height;
  const targetTop = rect.top;
  const targetBottom = rect.top + rect.height;
  const overlaps = tagBottom > targetTop && tagTop < targetBottom;
  expect(overlaps).toBe(false);
}

function assertInsideFrame(placement) {
  expect(placement.top).toBeGreaterThanOrEqual(0);
  expect(placement.top + config.height).toBeLessThanOrEqual(viewport.height);
  expect(placement.centerX - placement.maxWidth / 2).toBeGreaterThanOrEqual(0);
  expect(placement.centerX + placement.maxWidth / 2).toBeLessThanOrEqual(viewport.width);
}

describe("placeHeadline", () => {
  test("no target places the default band clear of the top-left chapter label", () => {
    const placement = placeHeadline(null, viewport, config);
    expect(placement.anchor).toBe("default");
    expect(placement.top).toBe(config.defaultTop);
    expect(placement.centerX).toBe(viewport.width / 2);
    assertInsideFrame(placement);
  });

  test("a target with room above places the tag above it", () => {
    const rect = { left: 860, top: 500, width: 200, height: 60 };
    const placement = placeHeadline(rect, viewport, config);
    expect(placement.anchor).toBe("above");
    expect(placement.top + config.height).toBeLessThanOrEqual(rect.top - config.gapPx);
    assertClearOfTarget(placement, rect);
    assertInsideFrame(placement);
  });

  test("a target near the top of the frame places the tag below it", () => {
    const rect = { left: 860, top: 10, width: 200, height: 40 };
    const placement = placeHeadline(rect, viewport, config);
    expect(placement.anchor).toBe("below");
    expect(placement.top).toBeGreaterThanOrEqual(rect.top + rect.height + config.gapPx);
    assertClearOfTarget(placement, rect);
    assertInsideFrame(placement);
  });

  test("a target near the bottom of the frame places the tag above it", () => {
    const rect = { left: 860, top: 1040, width: 200, height: 30 };
    const placement = placeHeadline(rect, viewport, config);
    expect(placement.anchor).toBe("above");
    expect(placement.top + config.height).toBeLessThanOrEqual(rect.top - config.gapPx);
    assertClearOfTarget(placement, rect);
    assertInsideFrame(placement);
  });

  test("a target near a side edge keeps the tag inside the frame, still centred on it where room allows", () => {
    const rect = { left: 10, top: 500, width: 40, height: 40 };
    const placement = placeHeadline(rect, viewport, config);
    assertInsideFrame(placement);
    assertClearOfTarget(placement, rect);
  });

  test("a target too tall for a full margin on either side still keeps the tag clear, on whichever side has more room", () => {
    const rect = { left: 200, top: 100, width: 400, height: 900 };
    const placement = placeHeadline(rect, viewport, config);
    expect(placement.anchor).toBe("above");
    assertInsideFrame(placement);
    assertClearOfTarget(placement, rect);
  });

  test("when both sides clear the target, the tag takes the side that hides less content", () => {
    const rect = { left: 860, top: 500, width: 200, height: 60 };
    const controlAbove = { left: 760, top: 400, width: 400, height: 60, weight: 4 };
    const textBelow = { left: 760, top: 600, width: 400, height: 20, weight: 1 };
    const marginContent = { left: 0, top: 0, width: 760, height: 1080, weight: 1 };
    expect(placeHeadline(rect, viewport, config, [controlAbove, textBelow, marginContent]).anchor).toBe("below");
    expect(placeHeadline(rect, viewport, config, []).anchor).toBe("above");
  });

  test("a side that hides content still loses to the only side that clears the target", () => {
    const rect = { left: 860, top: 100, width: 200, height: 60 };
    const controlBelow = { left: 760, top: 182, width: 400, height: 60, weight: 4 };
    const marginContent = { left: 0, top: 0, width: 760, height: 1080, weight: 1 };
    expect(placeHeadline(rect, viewport, config, [controlBelow, marginContent]).anchor).toBe("below");
  });
});

describe("placeHeadline beside the target", () => {
  const viewport = { width: 1920, height: 1080 };
  const config = { ...DEFAULT_HEADLINE_CONFIG, width: 400 };

  test("sits in the margin left of the target, level with it", () => {
    const rect = { left: 609, top: 300, width: 700, height: 24 };
    const placement = placeHeadline(rect, viewport, config, [], { beside: true });
    expect(placement.anchor).toBe("beside");
    expect(placement.centerX + placement.maxWidth / 2).toBeLessThanOrEqual(rect.left - DEFAULT_HEADLINE_CONFIG.gapPx);
    expect(placement.top + placement.height / 2).toBe(rect.top + rect.height / 2);
  });

  test("falls back to above or below when the margin is narrower than the tag", () => {
    const rect = { left: 200, top: 300, width: 700, height: 24 };
    expect(placeHeadline(rect, viewport, config, [], { beside: true }).anchor).not.toBe("beside");
  });
});

describe("placeHeadline keeps off page content", () => {
  const viewport = { width: 1920, height: 1080 };
  const config = { ...DEFAULT_HEADLINE_CONFIG, width: 400 };

  test("a tag that would hide the next label moves to an empty margin beside the target", () => {
    const rect = { left: 609, top: 400, width: 700, height: 40 };
    const labelAbove = { left: 609, top: 330, width: 300, height: 24, weight: 1 };
    const labelBelow = { left: 609, top: 470, width: 300, height: 24, weight: 1 };
    expect(placeHeadline(rect, viewport, config, [labelAbove, labelBelow]).anchor).toBe("beside");
  });

  test("a tag that hides nothing above or below stays there", () => {
    const rect = { left: 609, top: 400, width: 700, height: 40 };
    expect(placeHeadline(rect, viewport, config, []).anchor).toBe("above");
  });

  test("a tag with no target takes the band when no h1 is in it", () => {
    const placement = placeHeadline(null, viewport, config, []);
    expect(placement.top).toBe(DEFAULT_HEADLINE_CONFIG.defaultTop);
    expect(placement.centerX).toBe(viewport.width / 2);
  });

  test("a tag with no target moves into the margin left of an h1 in the band", () => {
    const h1 = { left: 576, top: 130, width: 600, height: 50, weight: 1 };
    const placement = placeHeadline(null, viewport, config, [h1]);
    expect(placement.centerX + placement.maxWidth / 2).toBeLessThanOrEqual(h1.left - DEFAULT_HEADLINE_CONFIG.gapPx);
  });

  test("a tag with no target goes below an h1 when the margin is too narrow", () => {
    const narrow = { width: 1280, height: 720 };
    const h1 = { left: 100, top: 130, width: 1000, height: 50, weight: 1 };
    const placement = placeHeadline(null, narrow, config, [h1]);
    expect(placement.top).toBeGreaterThanOrEqual(h1.top + h1.height);
  });
});
