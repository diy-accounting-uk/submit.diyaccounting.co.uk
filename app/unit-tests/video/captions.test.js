// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/unit-tests/video/captions.test.js

import { describe, test, expect } from "vitest";
import { formatVttTimestamp, wrapCaptionLines, buildVttCue, buildVtt, buildTranscript } from "../../../scripts/lib/video/captions.js";

describe("formatVttTimestamp", () => {
  test("formats sub-second, minute and hour boundaries", () => {
    expect(formatVttTimestamp(0)).toBe("00:00:00.000");
    expect(formatVttTimestamp(1500)).toBe("00:00:01.500");
    expect(formatVttTimestamp(65000)).toBe("00:01:05.000");
    expect(formatVttTimestamp(3661234)).toBe("01:01:01.234");
  });
});

describe("wrapCaptionLines", () => {
  test("wraps at maxCharsPerLine on a word boundary", () => {
    const lines = wrapCaptionLines("Bundles decide what you can run and how many submissions you get.", 46, 2);
    expect(lines.length).toBeLessThanOrEqual(2);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(46);
    expect(lines.join(" ")).toBe("Bundles decide what you can run and how many submissions you get.");
  });

  test("a short caption stays on one line", () => {
    expect(wrapCaptionLines("Got a pass? Redeem it here.", 46, 2)).toEqual(["Got a pass? Redeem it here."]);
  });

  test("throws when the wrap needs more lines than maxLines", () => {
    const long = "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen";
    expect(() => wrapCaptionLines(long, 10, 2)).toThrow(/more than maxLines/);
  });
});

describe("buildVttCue", () => {
  test("formats one cue block", () => {
    const cue = buildVttCue(1, 0, 1500, ["Hello"]);
    expect(cue).toBe("1\n00:00:00.000 --> 00:00:01.500\nHello\n");
  });
});

describe("buildVtt", () => {
  test("numbers cues in order and separates them with a blank line", () => {
    const vtt = buildVtt([
      { startMs: 0, endMs: 1000, text: "First", maxCharsPerLine: 46, maxLines: 2 },
      { startMs: 1000, endMs: 2000, text: "Second", maxCharsPerLine: 46, maxLines: 2 },
    ]);
    expect(vtt.startsWith("WEBVTT\n\n")).toBe(true);
    expect(vtt).toContain("1\n00:00:00.000 --> 00:00:01.000\nFirst\n");
    expect(vtt).toContain("2\n00:00:01.000 --> 00:00:02.000\nSecond\n");
  });
});

describe("buildTranscript", () => {
  test("contains every caption from every scene", () => {
    const transcript = buildTranscript({
      title: "A tour of DIY Accounting Submit",
      description: "An unauthenticated walk through the site.",
      sceneRecords: [
        {
          id: "home",
          chapter: "Home",
          entries: [
            { caption: "DIY Accounting Submit files VAT returns straight to HMRC.", description: "loads the home page" },
            { description: "points at the heading" },
          ],
        },
        {
          id: "bundles",
          chapter: "Bundles",
          entries: [{ caption: "Got a pass? Redeem it here.", description: "scrolls to the pass form" }],
        },
      ],
    });
    expect(transcript).toContain("# A tour of DIY Accounting Submit");
    expect(transcript).toContain("## Home");
    expect(transcript).toContain("DIY Accounting Submit files VAT returns straight to HMRC.");
    expect(transcript).toContain("## Bundles");
    expect(transcript).toContain("Got a pass? Redeem it here.");
    expect(transcript).toContain("points at the heading");
  });
});
