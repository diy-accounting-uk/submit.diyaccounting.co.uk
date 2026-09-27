// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/video/narration.test.js

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, test, expect, afterEach } from "vitest";
import { audioDurationMs, DEFAULT_VOICE_ID, DEFAULT_ENGINE } from "../../../scripts/lib/video/narration.js";

// audioDurationMs shells out to a real ffmpeg binary and reads its stderr probe line, so this
// stubs a fake "ffmpeg" that prints a fixed line the same shape ffmpeg's own -i probe does,
// rather than depend on ffmpeg-static's real binary or a real audio file existing on disk.
function stubFfmpeg(stderrLine, exitCode = 1) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "narration-test-"));
  const binPath = path.join(dir, "ffmpeg");
  fs.writeFileSync(binPath, `#!/bin/sh\n>&2 echo "${stderrLine}"\nexit ${exitCode}\n`);
  fs.chmodSync(binPath, 0o755);
  return binPath;
}

describe("audioDurationMs", () => {
  let stubDir;

  afterEach(() => {
    if (stubDir) fs.rmSync(path.dirname(stubDir), { recursive: true, force: true });
    stubDir = null;
  });

  test("reads a duration from ffmpeg's own probe line", () => {
    stubDir = stubFfmpeg("  Duration: 00:00:02.62, start: 0.000000, bitrate: 48 kb/s");
    expect(audioDurationMs(stubDir, "clip.mp3")).toBe(2620);
  });

  test("reads a duration carrying hours and minutes", () => {
    stubDir = stubFfmpeg("  Duration: 01:02:03.45, start: 0.000000, bitrate: 48 kb/s");
    expect(audioDurationMs(stubDir, "clip.mp3")).toBe((3600 + 120 + 3.45) * 1000);
  });

  test("throws, naming the file, when ffmpeg's output carries no duration", () => {
    stubDir = stubFfmpeg("some other ffmpeg output with no duration line");
    expect(() => audioDurationMs(stubDir, "clip.mp3")).toThrow(/could not read a duration/);
  });
});

describe("defaults", () => {
  test("the default voice is a neural British English voice", () => {
    expect(DEFAULT_VOICE_ID).toBe("Amy");
    expect(DEFAULT_ENGINE).toBe("neural");
  });
});
