// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/lib/video/headlinePlacement.js
//
// Pure placement arithmetic for the burned-in headline tag (design: VID3). No DOM, no
// Playwright — overlay.js calls this in Node, where the target's real bounding box is known,
// and sends the finished box position down to overlay-runtime.js, which only ever renders it.
// Keeping the math here (rather than inside the browser-side runtime, a self-contained IIFE with
// no imports) is what lets it run under vitest with no browser at all.
//
// All coordinates are CSS pixels relative to the viewport, the same units Playwright's
// boundingBox() and the overlay's `position:fixed` root already use — never device pixels, so
// the placement is identical at devicePixelRatio 1 or 2.

export const DEFAULT_HEADLINE_CONFIG = {
  maxWidth: 680, // the tag's assumed width for clearing viewport edges; the tag itself shrinks to its text
  height: 64, // one line at the headline's font/line-height plus padding and border
  gapPx: 22, // clearance kept between the tag and the target's box
  marginPx: 28, // minimum clearance kept between the tag and any viewport edge
  defaultTop: 132, // below the chapter label, for a step with no target of its own
};

// overlay-runtime.js draws the chapter label 24px from the top, about 40px tall.
const CHAPTER_LABEL_BOTTOM = 64;

function overlapArea(a, b) {
  const width = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
  const height = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
  return width > 0 && height > 0 ? width * height : 0;
}

// rect: {left, top, width, height} in CSS px, or null for a step with no target (e.g. login,
// consent, a bare caption step). viewport: {width, height} in CSS px, from the script's own
// "viewport" field. obstacles: boxes of page content a tag would hide, each
// {left, top, width, height, weight}; of the two sides that clear the target, the tag takes the
// one that hides less weighted area. config.width is the tag's expected width, used only to
// score overlap. Returns {anchor, centerX, top, maxWidth, height}: anchor is "above", "below",
// "beside" or "default"; centerX/top are where the runtime centers and positions the tag.
// beside: always place the tag in the margin left of the target, level with it, when the margin
// is wide enough. Without it the tag still goes there when above or below would hide page
// content and the margin hides none.
// With no target the tag takes the band below the chapter label, or, when obstacles (the page's
// h1) lie in that band, the margin left of them or the space below them.
export function placeHeadline(rect, viewport, config = DEFAULT_HEADLINE_CONFIG, obstacles = [], { beside = false } = {}) {
  const { maxWidth, height, gapPx, marginPx, defaultTop } = config;
  const tagWidth = config.width ?? maxWidth;
  const halfWidth = maxWidth / 2;
  const minCenterX = marginPx + halfWidth;
  const maxCenterX = viewport.width - marginPx - halfWidth;
  const clampCenterX = (x) => Math.min(Math.max(x, minCenterX), maxCenterX);
  const clampTop = (y) => Math.min(Math.max(y, marginPx), viewport.height - marginPx - height);

  const besideWidth = Math.min(tagWidth, maxWidth);
  const weightHidden = (box) => obstacles.reduce((sum, obstacle) => sum + overlapArea(box, obstacle) * obstacle.weight, 0);

  if (!rect) {
    const band = { anchor: "default", centerX: clampCenterX(viewport.width / 2), top: clampTop(defaultTop), maxWidth, height };
    const bandBox = { left: band.centerX - tagWidth / 2, top: band.top, width: tagWidth, height };
    const inBand = obstacles.filter((obstacle) => overlapArea(bandBox, obstacle) > 0);
    if (inBand.length === 0) return band;
    const contentLeft = Math.min(...inBand.map((obstacle) => obstacle.left));
    if (contentLeft - gapPx - marginPx >= besideWidth) {
      return { anchor: "default", centerX: contentLeft - gapPx - besideWidth / 2, top: band.top, maxWidth: besideWidth, height };
    }
    const below = Math.max(...inBand.map((obstacle) => obstacle.top + obstacle.height)) + gapPx;
    return { ...band, top: clampTop(below) };
  }

  const besideFits = rect.left - gapPx - marginPx >= besideWidth;
  const besidePlacement = () => {
    const top = clampTop(rect.top + rect.height / 2 - height / 2);
    return { anchor: "beside", centerX: rect.left - gapPx - besideWidth / 2, top, maxWidth: besideWidth, height };
  };
  if (beside && besideFits) return besidePlacement();

  const centerX = clampCenterX(rect.left + rect.width / 2);
  const spaceAbove = rect.top - gapPx - marginPx;
  const spaceBelow = viewport.height - (rect.top + rect.height) - gapPx - marginPx;

  // Prefer above the target — a viewer reads top-to-bottom, so a label above what it names
  // reads before the eye reaches the target itself. Below only when there isn't room above;
  // whichever side has more room when neither fits the tag's full height, clamped inside the
  // frame rather than let the tag spill past an edge.
  const hiddenWeight = (top) => {
    const tag = { left: centerX - tagWidth / 2, top, width: tagWidth, height };
    return obstacles.reduce((sum, obstacle) => sum + overlapArea(tag, obstacle) * obstacle.weight, 0);
  };
  const aboveTop = rect.top - gapPx - height;
  const belowTop = rect.top + rect.height + gapPx;
  let anchor, top;
  if (spaceAbove >= height && spaceBelow >= height) {
    anchor = hiddenWeight(belowTop) < hiddenWeight(aboveTop) ? "below" : "above";
    top = anchor === "above" ? aboveTop : belowTop;
  } else if (spaceAbove >= height) {
    anchor = "above";
    top = aboveTop;
  } else if (spaceBelow >= height) {
    anchor = "below";
    top = belowTop;
  } else {
    anchor = spaceAbove >= spaceBelow ? "above" : "below";
    top = anchor === "above" ? rect.top - gapPx - height : rect.top + rect.height + gapPx;
  }

  const placed = { anchor, centerX, top: clampTop(top), maxWidth, height };
  if (besideFits && hiddenWeight(placed.top) > 0) {
    const alt = besidePlacement();
    // The chapter label holds the top-left corner, so a tag beside a target near the top stays put.
    const clearOfChapterLabel = alt.top >= CHAPTER_LABEL_BOTTOM + gapPx;
    if (clearOfChapterLabel && weightHidden({ left: alt.centerX - besideWidth / 2, top: alt.top, width: besideWidth, height }) === 0)
      return alt;
  }
  return placed;
}
