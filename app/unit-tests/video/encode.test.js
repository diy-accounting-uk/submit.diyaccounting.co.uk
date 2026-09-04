// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/unit-tests/video/encode.test.js

import { describe, test, expect } from "vitest";
import { frameFileName, buildManifest } from "../../../scripts/lib/video/encode.js";

describe("frameFileName", () => {
  test("pads to six digits", () => {
    expect(frameFileName(1)).toBe("000001.jpg");
    expect(frameFileName(123456)).toBe("123456.jpg");
  });
});

describe("buildManifest", () => {
  test("each entry's duration is the gap to the next frame", () => {
    const frames = [
      { index: 1, tMs: 0 },
      { index: 2, tMs: 16.667 },
      { index: 3, tMs: 33.333 },
    ];
    const manifest = buildManifest(frames, 3000, "frames");
    const lines = manifest.trim().split("\n");
    expect(lines).toEqual([
      "file 'frames/000001.jpg'",
      "duration 0.016667",
      "file 'frames/000002.jpg'",
      "duration 0.016666",
      "file 'frames/000003.jpg'",
      "duration 3.000000",
      "file 'frames/000003.jpg'",
    ]);
  });

  test("the last file is repeated once more with no duration, for the concat demuxer", () => {
    const frames = [{ index: 1, tMs: 0 }];
    const manifest = buildManifest(frames, 1000, "frames");
    const lines = manifest.trim().split("\n");
    expect(lines[lines.length - 1]).toBe("file 'frames/000001.jpg'");
    expect(lines.filter((l) => l.startsWith("file "))).toHaveLength(2);
  });

  test("throws on an empty frame list", () => {
    expect(() => buildManifest([], 1000)).toThrow(/at least one frame/);
  });

  test("throws when timestamps go backwards", () => {
    const frames = [
      { index: 1, tMs: 100 },
      { index: 2, tMs: 50 },
    ];
    expect(() => buildManifest(frames, 1000)).toThrow(/negative duration/);
  });
});
