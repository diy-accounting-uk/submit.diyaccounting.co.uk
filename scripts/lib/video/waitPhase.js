// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// scripts/lib/video/waitPhase.js
//
// Brackets exactly a step's real wait — a network round trip, an identity provider redirect —
// with the timer pill and the wait-compression clock. Arming at the step's own start instead
// would catch the pointer animation and click ripple that precede a click, or the on-screen
// typing and clicking a journey action does before its own round trip, and show the pill for
// those instead of for an actual wait. An action with no real wait to report never calls run(),
// so the pill never arms for it.

import { timerStart, timerSetCompressing, timerStop } from "./overlay.js";

export function createWaitPhase(page, step, unscaledPacing, capture, supportsTimer) {
  let shown = false;

  async function run(fn) {
    if (!supportsTimer) return fn();
    let compressing = false;
    // A wait phase that spans a same-URL reload (ensureBundle's pass-granting round trip does
    // one) can have the threshold land in the narrow window where the old document is gone and
    // the new one hasn't parsed yet — the timerStart call silently drops on a destroyed
    // execution context. The pill state (shown/compressing) already survives that in this
    // closure; re-asserting it against the page once the reload's own load event fires puts the
    // same state back in front of a document that is definitely ready, so the overlay's event
    // log always ends up with the marker the acceptance check counts.
    const reassertOnLoad = () => {
      if (shown) timerStart(page, step.label || step.action, unscaledPacing.timerFullScaleMs).catch(() => {});
      if (compressing) timerSetCompressing(page, true).catch(() => {});
    };
    page.on("load", reassertOnLoad);
    const showTimer = setTimeout(() => {
      shown = true;
      timerStart(page, step.label || step.action, unscaledPacing.timerFullScaleMs).catch(() => {});
    }, unscaledPacing.timerThresholdMs);
    const compressTimer = setTimeout(() => {
      compressing = true;
      capture?.setCompression(true, unscaledPacing.waitCompressionFactor);
      timerSetCompressing(page, true).catch(() => {});
    }, unscaledPacing.waitCompressionAfterMs);
    try {
      return await fn();
    } finally {
      page.off("load", reassertOnLoad);
      clearTimeout(showTimer);
      clearTimeout(compressTimer);
      if (compressing) {
        capture?.setCompression(false);
        await timerSetCompressing(page, false).catch(() => {});
      }
      if (shown) await timerStop(page).catch(() => {});
    }
  }

  return {
    run,
    get shown() {
      return shown;
    },
  };
}
