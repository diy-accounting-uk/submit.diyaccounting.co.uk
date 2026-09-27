// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/video/narration.test.js

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, test, expect, afterEach, vi } from "vitest";
import { synthesizeSpeech, audioDurationMs, DEFAULT_VOICE_ID, DEFAULT_ENGINE } from "../../../scripts/lib/video/narration.js";

// Stands in for a PollyClient: AudioStream carries the same transformToByteArray() helper the
// real SDK response mixes onto a Node Readable, so synthesizeSpeech's write path is exercised
// without a real Polly call.
function fakePollyClient(audioBytes = new Uint8Array([1, 2, 3])) {
  return { send: vi.fn().mockResolvedValue({ AudioStream: { transformToByteArray: async () => audioBytes } }) };
}

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

describe("synthesizeSpeech", () => {
  let outputPath;

  afterEach(() => {
    if (outputPath && fs.existsSync(outputPath)) fs.rmSync(outputPath);
    outputPath = null;
  });

  test("sends the text and default voice/engine to Polly and writes the audio stream", async () => {
    const client = fakePollyClient(new Uint8Array([9, 9, 9]));
    outputPath = path.join(os.tmpdir(), `narration-test-${Date.now()}.mp3`);

    await synthesizeSpeech({ text: "Welcome to DIY Accounting Submit.", outputPath, client });

    expect(client.send).toHaveBeenCalledTimes(1);
    expect(client.send.mock.calls[0][0].input).toEqual({
      Text: "Welcome to DIY Accounting Submit.",
      VoiceId: DEFAULT_VOICE_ID,
      Engine: DEFAULT_ENGINE,
      OutputFormat: "mp3",
    });
    expect(fs.readFileSync(outputPath)).toEqual(Buffer.from([9, 9, 9]));
  });

  test("passes a caller's voiceId and engine through to Polly", async () => {
    const client = fakePollyClient();
    outputPath = path.join(os.tmpdir(), `narration-test-${Date.now()}.mp3`);

    await synthesizeSpeech({ text: "hello", outputPath, voiceId: "Brian", engine: "generative", client });

    expect(client.send.mock.calls[0][0].input).toMatchObject({ VoiceId: "Brian", Engine: "generative" });
  });

  test("throws, naming the scene, when Polly rejects the call", async () => {
    const client = { send: vi.fn().mockRejectedValue(new Error("no credentials")) };
    outputPath = path.join(os.tmpdir(), `narration-test-${Date.now()}.mp3`);

    await expect(synthesizeSpeech({ text: "hello", outputPath, sceneId: "home", client })).rejects.toThrow(/scene "home".*no credentials/);
  });

  test("throws naming the scene as unknown when none is given", async () => {
    const client = { send: vi.fn().mockRejectedValue(new Error("throttled")) };
    outputPath = path.join(os.tmpdir(), `narration-test-${Date.now()}.mp3`);

    await expect(synthesizeSpeech({ text: "hello", outputPath, client })).rejects.toThrow(/scene "unknown"/);
  });
});
