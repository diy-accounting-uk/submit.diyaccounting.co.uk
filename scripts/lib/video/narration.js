// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/lib/video/narration.js
//
// Per-caption narration audio from Amazon Polly (design: VID5), shelled out through the `aws`
// CLI rather than the @aws-sdk/client-polly package: this repo's node_modules is shared across
// every worktree, so a script here adds no new dependency to it. audioDurationMs reads the
// clip back with ffmpeg's own probe (this repo already depends on ffmpeg-static; adding
// ffprobe-static just to read a duration would be a second binary for one number).
//
// synthesizeSpeech and audioDurationMs are the only two functions here that leave the process —
// a real `aws polly synthesize-speech` call and a real ffmpeg probe. Everything the capture does
// with their results (deciding how long to hold a caption, laying clips onto the timeline) is
// pure arithmetic, tested without either.

import { spawnSync } from "child_process";

// Neural British English voices Amazon Polly offers today (aws polly describe-voices
// --language-code en-GB): Emma and Amy (female, neural), Brian and Arthur (male, neural), Brian
// and Amy also carry the newer generative engine. Amy is the default: a neural voice, not the
// older standard engine, per the row's own requirement, and a common, natural-sounding choice.
export const DEFAULT_VOICE_ID = "Amy";
export const DEFAULT_ENGINE = "neural";

function runOrThrow(bin, args, label) {
  const result = spawnSync(bin, args, { encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${label} (${bin} ${args.join(" ")}) exited ${result.status}\n${result.stderr || result.stdout}`);
  }
  return result;
}

// Writes the synthesised speech straight to outputPath (the CLI's own <outfile> argument), one
// AWS call per caption. profile is the AWS CLI profile name (e.g. "submit-ci"); undefined uses
// whatever credentials are already in the environment, the way video-capture.yml's assumed role
// does.
export function synthesizeSpeech({ text, outputPath, voiceId = DEFAULT_VOICE_ID, engine = DEFAULT_ENGINE, profile }) {
  const args = [
    ...(profile ? ["--profile", profile] : []),
    "polly",
    "synthesize-speech",
    "--text",
    text,
    "--voice-id",
    voiceId,
    "--engine",
    engine,
    "--output-format",
    "mp3",
    outputPath,
  ];
  runOrThrow("aws", args, "synthesizeSpeech");
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
