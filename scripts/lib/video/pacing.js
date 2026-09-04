// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// scripts/lib/video/pacing.js
//
// Pure pacing arithmetic for site-video-capture. No I/O, no Playwright, no ffmpeg — see
// PLAN section 4 of the site-video-capture design for the model this implements. Every
// function here takes the script's "pacing" config object and returns a number or a plain
// object; nothing here reads a clock or a file.

const GROUP_PAUSE_KEY = {
  1: "perCharMs",
  2: "betweenActionsMs",
  3: "aroundMotionMs",
};

// Which pacing group settles after each action finishes. "type" paces per character while it
// runs (group 1, applied directly with perCharMs, not through this table) and then settles with
// group 2 like any other completed action. "await" measures a real wait and then settles with
// the group 2 residual. Actions with no group of their own (caption, hold, still) return null:
// their timing is either explicit (hold's ms) or carried by the caption/still write itself.
const STEP_GROUP = {
  goto: 3,
  click: 2,
  point: 2,
  type: 2,
  press: 2,
  tab: 2,
  select: 2,
  scroll: 3,
  highlight: 2,
  await: 2,
  caption: null,
  hold: null,
  still: null,
};

export function groupFor(action) {
  if (!(action in STEP_GROUP)) {
    throw new Error(`pacing.groupFor: unknown action "${action}"`);
  }
  return STEP_GROUP[action];
}

export function pauseForGroup(group, cfg) {
  const key = GROUP_PAUSE_KEY[group];
  if (!key) {
    throw new Error(`pacing.pauseForGroup: no pause key for group ${group}`);
  }
  return cfg[key];
}

// Section 4.2: what's left on screen after a step that waited on the backend. A short wait
// inside a long pause leaves most of the pause; a wait that already ran past the pause leaves
// only the floor, so the video never cuts straight into the next action with no beat.
export function residualAfterWait(pauseMs, waitMs, cfg) {
  return Math.max(cfg.minResidualMs, pauseMs - waitMs);
}

// Section 4.5: a caption's minimum on-screen time, driven by reading speed rather than by
// whatever the steps under it happen to take.
export function captionMinMs(text, cfg) {
  const chars = text.length;
  const readMs = Math.ceil((chars / cfg.charsPerSecond) * 1000);
  return Math.max(cfg.minMs, readMs);
}

// Section 4.4: time compression for a wait past waitCompressionAfterMs. The first
// waitCompressionAfterMs of any wait is filmed in full; anything past it is compressed by
// waitCompressionFactor. Returns the on-screen duration and whether compression applied, so the
// caller can decide how many frames to keep versus skip.
export function compressionFor(waitMs, cfg) {
  if (waitMs <= cfg.waitCompressionAfterMs) {
    return {
      compressed: false,
      normalMs: waitMs,
      compressedSourceMs: 0,
      onScreenMs: waitMs,
    };
  }
  const compressedSourceMs = waitMs - cfg.waitCompressionAfterMs;
  const compressedOnScreenMs = compressedSourceMs / cfg.waitCompressionFactor;
  return {
    compressed: true,
    normalMs: cfg.waitCompressionAfterMs,
    compressedSourceMs,
    onScreenMs: cfg.waitCompressionAfterMs + compressedOnScreenMs,
  };
}
