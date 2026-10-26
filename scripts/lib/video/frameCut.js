// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/lib/video/frameCut.js
//
// Pure arithmetic for cutting a walkthrough frame out of a recording. The recorder burns the
// headline card into the page, so every frame taken while a step is on screen has the card over
// the page text. These functions read decoded frames (raw RGB or gray bytes, no ffmpeg, no files)
// to find the moments with no card, and to find where a frame should start and end so that no
// text line or control is cut at the top edge and no blank band fills the bottom.

const CARD_MAX_CHANNEL = 110;
const CARD_MAX_SPREAD = 30;
const CARD_MAX_GAP_PX = 6;
const CARD_MIN_RUN_FRACTION = 0.15;
const CARD_MIN_DENSITY = 0.35;
const CARD_MAX_ROW_GAP = 3;
const CARD_MIN_ROWS_FRACTION = 0.03;

/**
 * True when a decoded frame holds the headline card: a block of dark neutral pixels (the card is
 * near-black over a light page) wide and tall enough that page text cannot make it, with the
 * white letters inside it bridged.
 *
 * @param {{rgb: Uint8Array, width: number, height: number}} frame raw rgb24 pixels, row by row
 */
export function frameHasCard({ rgb, width, height }) {
  const minRun = Math.max(8, Math.round(width * CARD_MIN_RUN_FRACTION));
  const minRows = Math.max(4, Math.round(height * CARD_MIN_ROWS_FRACTION));
  let qualifyingRows = 0;
  let lastQualifying = -Infinity;
  for (let y = 0; y < height; y++) {
    let rowHasRun = false;
    let runStart = -1;
    let lastDark = -1;
    let darkCount = 0;
    const closeRun = () => {
      if (runStart >= 0) {
        const length = lastDark - runStart + 1;
        if (length >= minRun && darkCount / length >= CARD_MIN_DENSITY) rowHasRun = true;
      }
      runStart = -1;
      darkCount = 0;
    };
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      const r = rgb[i];
      const g = rgb[i + 1];
      const b = rgb[i + 2];
      const max = Math.max(r, g, b);
      const dark = max <= CARD_MAX_CHANNEL && max - Math.min(r, g, b) <= CARD_MAX_SPREAD;
      if (dark) {
        if (runStart < 0) runStart = x;
        lastDark = x;
        darkCount++;
      } else if (runStart >= 0 && x - lastDark > CARD_MAX_GAP_PX) {
        closeRun();
      }
    }
    closeRun();
    if (rowHasRun) {
      qualifyingRows = y - lastQualifying > CARD_MAX_ROW_GAP + 1 ? 1 : qualifyingRows + 1;
      lastQualifying = y;
      if (qualifyingRows >= minRows) return true;
    }
  }
  return false;
}

export const AFTER_CARD_MARGIN_FRAMES = 3;
export const MAX_WAIT_AFTER_STEP_MS = 700;

/**
 * Chooses the moment to cut a step's frame so that the headline card is not in it.
 *
 * The frame shows the page as the step left it, so the first choice is the first card-free sample
 * after the step's end (the card has faded out), a sample later than the first card-free one by
 * AFTER_CARD_MARGIN_FRAMES so the fade is over. When the next step's card is already coming in,
 * the choice is the last card-free sample before the card appeared, inside the step. When no
 * sample is free of the card the old moment stands and `clean` is false.
 *
 * @param {Array<{ms: number, card: boolean}>} samples every sampled moment of the recording, ascending
 * @param {{startMs: number, endMs: number, fallbackMs: number}} step
 * @returns {{ms: number, clean: boolean}}
 */
export function pickCardFreeMs(samples, { startMs, endMs, fallbackMs }) {
  const after = samples.filter((s) => s.ms >= endMs && s.ms <= endMs + MAX_WAIT_AFTER_STEP_MS);
  for (let i = 0; i < after.length; i++) {
    if (after[i].card) continue;
    const settled = after.slice(i, i + 1 + AFTER_CARD_MARGIN_FRAMES);
    if (settled.length === 1 + AFTER_CARD_MARGIN_FRAMES && settled.every((s) => !s.card))
      return { ms: settled[settled.length - 1].ms, clean: true };
  }
  const during = samples.filter((s) => s.ms >= startMs && s.ms < endMs && !s.card);
  if (during.length > 0) return { ms: during[during.length - 1].ms, clean: true };
  return { ms: fallbackMs, clean: false };
}

const INK_DEVIATION = 28;
const BLANK_BAND_ROWS = 4;
const TOP_MARGIN_PX = 10;
const MAX_TOP_CUT_FRACTION = 0.3;
const MIN_EMPTY_TAIL_FRACTION = 0.3;
const MIN_EMPTY_BEFORE_FOOTER_FRACTION = 0.12;
const MAX_FOOTER_FRACTION = 0.08;
const BOTTOM_MARGIN_PX = 40;
const INNER_FROM = 0.14;
const INNER_TO = 0.86;

function rowIsInk(gray, width, y) {
  const from = Math.floor(width * INNER_FROM);
  const to = Math.ceil(width * INNER_TO);
  const values = [];
  for (let x = from; x < to; x++) values.push(gray[y * width + x]);
  const sorted = Uint8Array.from(values).sort();
  const median = sorted[sorted.length >> 1];
  let ink = 0;
  for (const v of values) if (Math.abs(v - median) > INK_DEVIATION) ink++;
  return ink >= 2;
}

/**
 * Where a frame should start and end. `gray` is the frame decoded as one byte per pixel at the
 * size the image will have.
 *
 * Top: when the first row holds ink the frame was cut mid-line by the scroll position, so the
 * frame starts at the first block below the first blank band (a gap of BLANK_BAND_ROWS rows or
 * more), if that block starts within the top MAX_TOP_CUT_FRACTION of the frame.
 * Bottom: a blank run of MIN_EMPTY_TAIL_FRACTION of the height or more ends the frame
 * BOTTOM_MARGIN_PX after the content above it, which removes an empty page below a short form
 * together with the footer under it. A shorter blank run of MIN_EMPTY_BEFORE_FOOTER_FRACTION
 * ends the frame the same way when only a footer (at most MAX_FOOTER_FRACTION of the height of
 * ink rows) follows it.
 *
 * @returns {{top: number, bottom: number}} row indexes; bottom is exclusive
 */
export function findCutRegion({ gray, width, height }) {
  const ink = [];
  for (let y = 0; y < height; y++) ink.push(rowIsInk(gray, width, y));

  let top = 0;
  if (ink[0]) {
    let y = 0;
    while (y < height && ink[y]) y++;
    let bandStart = y;
    while (y < height) {
      if (ink[y]) {
        if (y - bandStart >= BLANK_BAND_ROWS) {
          if (y <= height * MAX_TOP_CUT_FRACTION) top = Math.max(0, y - TOP_MARGIN_PX);
          break;
        }
        bandStart = y + 1;
      }
      y++;
    }
  }

  let bottom = height;
  let runStart = -1;
  for (let y = top; y <= height; y++) {
    const blank = y < height && !ink[y];
    if (blank && runStart < 0) runStart = y;
    if (!blank && runStart >= 0) {
      const inkAfter = ink.slice(y).filter(Boolean).length;
      const longRun = y - runStart >= height * MIN_EMPTY_TAIL_FRACTION;
      const runBeforeFooter = y - runStart >= height * MIN_EMPTY_BEFORE_FOOTER_FRACTION && inkAfter <= height * MAX_FOOTER_FRACTION;
      if ((longRun || runBeforeFooter) && runStart > top) {
        bottom = Math.min(height, runStart + BOTTOM_MARGIN_PX);
        break;
      }
      runStart = -1;
    }
  }
  return { top, bottom };
}
