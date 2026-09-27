// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/lib/video/narration.js
//
// Per-caption narration audio from Amazon Polly (design: VID5), through @aws-sdk/client-polly's
// PollyClient. audioDurationMs reads the clip back with ffmpeg's own probe (this repo already
// depends on ffmpeg-static; adding ffprobe-static just to read a duration would be a second
// binary for one number).
//
// synthesizeSpeech and audioDurationMs are the only two functions here that leave the process —
// a real Polly SynthesizeSpeech call and a real ffmpeg probe. Everything the capture does with
// their results (deciding how long to hold a caption, laying clips onto the timeline) is pure
// arithmetic, tested without either.

import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";

// Neural British English voices Amazon Polly offers today (aws polly describe-voices
// --language-code en-GB): Emma and Amy (female, neural), Brian and Arthur (male, neural), Brian
// and Amy also carry the newer generative engine. Amy is the default: a neural voice, not the
// older standard engine, per the row's own requirement, and a common, natural-sounding choice.
export const DEFAULT_VOICE_ID = "Amy";
export const DEFAULT_ENGINE = "neural";

let cachedPollyClient = null;

function getPollyClient() {
  if (!cachedPollyClient) {
    cachedPollyClient = new PollyClient({ region: process.env.AWS_REGION || "eu-west-2" });
  }
  return cachedPollyClient;
}

// Synthesises one caption's speech and writes it to outputPath, one Polly call per caption.
// Credentials and region come from the ambient AWS environment — env vars, or the role
// video-capture.yml's OIDC steps assume — resolved by the SDK's own default provider chain, the
// same chain the CLI it replaces used. sceneId names the scene in the thrown error when Polly
// rejects the call (missing credentials, throttling, a bad voice id) — nothing else here says
// which caption failed.
export async function synthesizeSpeech({
  text,
  outputPath,
  voiceId = DEFAULT_VOICE_ID,
  engine = DEFAULT_ENGINE,
  sceneId,
  client = getPollyClient(),
}) {
  let response;
  try {
    response = await client.send(
      new SynthesizeSpeechCommand({
        Text: text,
        VoiceId: voiceId,
        Engine: engine,
        OutputFormat: "mp3",
      }),
    );
  } catch (error) {
    throw new Error(`narration failed for scene "${sceneId ?? "unknown"}" (Polly SynthesizeSpeech): ${error.message}`, { cause: error });
  }
  const audio = await response.AudioStream.transformToByteArray();
  fs.writeFileSync(outputPath, audio);
}

// Parses ffmpeg's own stderr probe line ("Duration: 00:00:03.45, ...") rather than shelling out
// to a separate ffprobe binary this repo does not otherwise depend on — ffmpeg prints it for
// any input, with or without an output, and exits non-zero for want of one, so the duration is
// read from stderr regardless of that exit code.
const DURATION_PATTERN = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/;

export function audioDurationMs(ffmpegBin, filePath) {
  const result = spawnSync(ffmpegBin, ["-i", filePath], { encoding: "utf8" });
  const match = DURATION_PATTERN.exec(result.stderr || "");
  if (!match) throw new Error(`audioDurationMs: could not read a duration from ffmpeg's probe of ${filePath}`);
  const [, hours, minutes, seconds] = match;
  return Math.round((Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds)) * 1000);
}
