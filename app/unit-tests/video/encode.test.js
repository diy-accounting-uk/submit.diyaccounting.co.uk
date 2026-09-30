// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/video/encode.test.js

import { describe, test, expect } from "vitest";
import {
  frameFileName,
  buildManifest,
  buildEncodeArgs,
  buildNarrationMixArgs,
  muxNarrationArgs,
} from "../../../scripts/lib/video/encode.js";

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

describe("buildNarrationMixArgs", () => {
  test("delays each clip to its own startMs, then mixes them onto one track", () => {
    const clips = [
      { path: "a.mp3", startMs: 0 },
      { path: "b.mp3", startMs: 1500 },
    ];
    const args = buildNarrationMixArgs({ clips, outputPath: "out.wav" });
    expect(args).toEqual([
      "-y",
      "-i",
      "a.mp3",
      "-i",
      "b.mp3",
      "-filter_complex",
      "[0:a]adelay=0:all=1[a0];[1:a]adelay=1500:all=1[a1];[a0][a1]amix=inputs=2:duration=longest:dropout_transition=0[aout]",
      "-map",
      "[aout]",
      "out.wav",
    ]);
  });

  test("rounds a fractional startMs, and never delays by a negative amount", () => {
    const clips = [
      { path: "a.mp3", startMs: -5 },
      { path: "b.mp3", startMs: 12.6 },
    ];
    const args = buildNarrationMixArgs({ clips, outputPath: "out.wav" });
    expect(args).toContain(
      "[0:a]adelay=0:all=1[a0];[1:a]adelay=13:all=1[a1];[a0][a1]amix=inputs=2:duration=longest:dropout_transition=0[aout]",
    );
  });

  test("throws on an empty clip list", () => {
    expect(() => buildNarrationMixArgs({ clips: [], outputPath: "out.wav" })).toThrow(/at least one narration clip/);
  });
});

describe("muxNarrationArgs", () => {
  test("copies the video stream and re-encodes only the mixed audio as aac", () => {
    const args = muxNarrationArgs({ videoPath: "video.mp4", narrationTrackPath: "mix.wav", outputPath: "out.mp4" });
    expect(args).toEqual([
      "-y",
      "-i",
      "video.mp4",
      "-i",
      "mix.wav",
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
      "out.mp4",
    ]);
  });

  test("never passes -shortest, so a narration track shorter than the video cannot trim the output", () => {
    const args = muxNarrationArgs({ videoPath: "video.mp4", narrationTrackPath: "mix.wav", outputPath: "out.mp4" });
    expect(args).not.toContain("-shortest");
  });

  test("keeps +faststart on the remux, since this is the mp4 site-video-capture.js ships", () => {
    const args = muxNarrationArgs({ videoPath: "video.mp4", narrationTrackPath: "mix.wav", outputPath: "out.mp4" });
    expect(args).toContain("+faststart");
  });
});

describe("buildEncodeArgs", () => {
  const base = { manifestPath: "frames/manifest.txt", outputPath: "out.mp4", fps: 30, width: 3840, height: 2160 };
  const valueAfter = (args, flag) => args[args.indexOf(flag) + 1];

  test("encodes at crf 22, preset medium, tune animation by default", () => {
    const args = buildEncodeArgs(base);
    expect(valueAfter(args, "-crf")).toBe("22");
    expect(valueAfter(args, "-preset")).toBe("medium");
    expect(valueAfter(args, "-tune")).toBe("animation");
  });

  test("keeps the frames' own resolution and YouTube's closed GOP of half the frame rate", () => {
    const args = buildEncodeArgs(base);
    expect(valueAfter(args, "-vf")).toBe("scale=3840:2160:flags=lanczos,format=yuv420p");
    expect(valueAfter(args, "-g")).toBe("15");
    expect(valueAfter(args, "-keyint_min")).toBe("15");
    expect(valueAfter(args, "-sc_threshold")).toBe("0");
  });

  test("writes H.264 High with CABAC, BT.709 tags and the moov atom first", () => {
    const args = buildEncodeArgs(base);
    expect(valueAfter(args, "-profile:v")).toBe("high");
    expect(valueAfter(args, "-coder")).toBe("1");
    expect(valueAfter(args, "-colorspace")).toBe("bt709");
    expect(valueAfter(args, "-movflags")).toBe("+faststart");
    expect(args[args.length - 1]).toBe("out.mp4");
  });

  test("takes crf, preset and tune overrides", () => {
    const args = buildEncodeArgs({ ...base, crf: 18, preset: "slow", tune: "stillimage" });
    expect(valueAfter(args, "-crf")).toBe("18");
    expect(valueAfter(args, "-preset")).toBe("slow");
    expect(valueAfter(args, "-tune")).toBe("stillimage");
  });
});
