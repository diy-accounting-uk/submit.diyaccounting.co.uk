// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect } from "vitest";
import { findCutRegion, frameHasCard, pickCardFreeMs, AFTER_CARD_MARGIN_FRAMES } from "../../../scripts/lib/video/frameCut.js";

function rgbFrame(width, height, paint) {
  const rgb = new Uint8Array(width * height * 3).fill(245);
  paint((x0, y0, x1, y1, value) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) rgb.fill(value, (y * width + x) * 3, (y * width + x) * 3 + 3);
  });
  return { rgb, width, height };
}

function grayFrame(width, height, inkRows) {
  const gray = new Uint8Array(width * height).fill(245);
  for (const [from, to] of inkRows) {
    for (let y = from; y < to; y++) for (let x = 200; x < 700; x += 3) gray[y * width + x] = 40;
  }
  return { gray, width, height };
}

describe("frameHasCard", () => {
  it("finds a dark neutral block with white letters in it", () => {
    const frame = rgbFrame(125, 136, (fill) => {
      fill(40, 16, 80, 24, 54);
      fill(48, 19, 52, 22, 240);
      fill(60, 19, 64, 22, 240);
    });
    expect(frameHasCard(frame)).toBe(true);
  });

  it("finds no card on a plain page", () => {
    expect(frameHasCard(rgbFrame(125, 136, () => {}))).toBe(false);
  });

  it("does not take a thin dark rule or a narrow dark field for a card", () => {
    const frame = rgbFrame(125, 136, (fill) => {
      fill(10, 50, 110, 51, 40);
      fill(10, 80, 14, 100, 40);
    });
    expect(frameHasCard(frame)).toBe(false);
  });

  it("does not take a blue button for a card", () => {
    const frame = rgbFrame(125, 136, () => {});
    for (let y = 60; y < 70; y++) {
      for (let x = 20; x < 100; x++) frame.rgb.set([42, 90, 160], (y * 125 + x) * 3);
    }
    expect(frameHasCard(frame)).toBe(false);
  });
});

describe("pickCardFreeMs", () => {
  const samples = (pattern) => [...pattern].map((c, i) => ({ ms: i * 100, card: c === "#" }));

  it("takes the first card-free sample after the step once the fade is over", () => {
    const picked = pickCardFreeMs(samples("..####..........."), { startMs: 200, endMs: 600, fallbackMs: 500 });
    expect(picked).toEqual({ ms: 600 + AFTER_CARD_MARGIN_FRAMES * 100, clean: true });
  });

  it("waits out a card that is still showing at the end of the step", () => {
    const picked = pickCardFreeMs(samples("..######........"), { startMs: 200, endMs: 400, fallbackMs: 300 });
    expect(picked.clean).toBe(true);
    expect(picked.ms).toBe(800 + AFTER_CARD_MARGIN_FRAMES * 100);
  });

  it("falls back to the last card-free sample inside the step when the next card follows at once", () => {
    const picked = pickCardFreeMs(samples("..#.#.#.#.#.#.#.#"), { startMs: 0, endMs: 600, fallbackMs: 500 });
    expect(picked).toEqual({ ms: 500, clean: true });
  });

  it("keeps the old moment and says so when every sample has the card", () => {
    const picked = pickCardFreeMs(samples("################"), { startMs: 0, endMs: 600, fallbackMs: 500 });
    expect(picked).toEqual({ ms: 500, clean: false });
  });
});

describe("findCutRegion", () => {
  it("leaves a frame that starts on a blank row and ends on content as it is", () => {
    const region = findCutRegion(
      grayFrame(1000, 400, [
        [20, 60],
        [100, 140],
        [200, 380],
      ]),
    );
    expect(region).toEqual({ top: 0, bottom: 400 });
  });

  it("starts below a line the top edge cut", () => {
    const region = findCutRegion(
      grayFrame(1000, 400, [
        [0, 12],
        [50, 70],
        [120, 380],
      ]),
    );
    expect(region.top).toBe(40);
    expect(region.bottom).toBe(400);
  });

  it("does not cut more than the top third looking for a gap", () => {
    const region = findCutRegion(
      grayFrame(1000, 400, [
        [0, 300],
        [330, 395],
      ]),
    );
    expect(region.top).toBe(0);
  });

  it("ends the frame shortly after the content when a long blank run follows", () => {
    const region = findCutRegion(
      grayFrame(1000, 1000, [
        [20, 60],
        [100, 300],
        [950, 990],
      ]),
    );
    expect(region).toEqual({ top: 0, bottom: 340 });
  });

  it("ends the frame before a footer when a blank run of an eighth of the height precedes it", () => {
    const region = findCutRegion(
      grayFrame(1000, 1000, [
        [20, 60],
        [100, 700],
        [940, 975],
      ]),
    );
    expect(region).toEqual({ top: 0, bottom: 740 });
  });

  it("keeps content below a blank run of an eighth of the height when more than a footer follows", () => {
    const region = findCutRegion(
      grayFrame(1000, 1000, [
        [20, 60],
        [100, 500],
        [640, 960],
      ]),
    );
    expect(region).toEqual({ top: 0, bottom: 1000 });
  });
});
