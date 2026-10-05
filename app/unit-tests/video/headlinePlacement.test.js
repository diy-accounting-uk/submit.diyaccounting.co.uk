// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/video/headlinePlacement.test.js

import { describe, test, expect } from "vitest";
import { placeHeadline } from "../../../scripts/lib/video/headlinePlacement.js";

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
    expect(placeHeadline(rect, viewport, config, [controlAbove, textBelow]).anchor).toBe("below");
    expect(placeHeadline(rect, viewport, config, []).anchor).toBe("above");
  });

  test("a side that hides content still loses to the only side that clears the target", () => {
    const rect = { left: 860, top: 100, width: 200, height: 60 };
    const controlBelow = { left: 760, top: 182, width: 400, height: 60, weight: 4 };
    expect(placeHeadline(rect, viewport, config, [controlBelow]).anchor).toBe("below");
  });
});
