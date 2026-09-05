// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// scripts/lib/video/encode.js
//
// The concat manifest and the ffmpeg encode from design section 6. buildManifest is pure (no
// I/O) so it is unit-tested directly; everything else here shells out to the ffmpeg binary
// resolved from ffmpeg-static, falling back to `ffmpeg` on PATH — see design section 11 choice 4.

import { spawnSync } from "child_process";
import fs from "fs";
// ffmpeg-static is a CommonJS module exporting the resolved binary path as module.exports;
// Node's ESM/CJS interop maps that to the default import.
import ffmpegStaticPath from "ffmpeg-static";

export function frameFileName(index) {
  return `${String(index).padStart(6, "0")}.jpg`;
}

// frames: [{ index, tMs }] in capture order, tMs measured from the first frame. Each entry's
// duration is the gap to the next frame; the last entry's duration is finalHoldMs. The concat
// demuxer needs the last file repeated once more with no duration line, or its duration is
// ignored (https://svn.ffmpeg.org/ffmpeg-formats.html).
export function buildManifest(frames, finalHoldMs, framesDir = "frames") {
  if (!Array.isArray(frames) || frames.length === 0) {
    throw new Error("buildManifest: at least one frame is required");
  }
  const lines = [];
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    const fileName = `${framesDir}/${frameFileName(frame.index)}`;
    const durationMs = i < frames.length - 1 ? frames[i + 1].tMs - frame.tMs : finalHoldMs;
    if (durationMs < 0) {
      throw new Error(`buildManifest: frame ${frame.index} has a negative duration (${durationMs}ms) — timestamps are out of order`);
    }
    lines.push(`file '${fileName}'`);
    lines.push(`duration ${(durationMs / 1000).toFixed(6)}`);
  }
  const last = frames[frames.length - 1];
  lines.push(`file '${framesDir}/${frameFileName(last.index)}'`);
  return lines.join("\n") + "\n";
}

export function writeManifest(manifestPath, frames, finalHoldMs, framesDir) {
  fs.writeFileSync(manifestPath, buildManifest(frames, finalHoldMs, framesDir));
}

// ffmpeg-static resolves to a path at install time. Fall back to `ffmpeg` on PATH if that path
// is missing — e.g. its postinstall was skipped — rather than fail with a confusing ENOENT deep
// inside spawnSync.
export function resolveFfmpegBinary() {
  if (ffmpegStaticPath && fs.existsSync(ffmpegStaticPath)) return ffmpegStaticPath;
  return "ffmpeg";
}

function runOrThrow(bin, args, opts = {}) {
  const result = spawnSync(bin, args, { encoding: "utf8", ...opts });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${bin} ${args.join(" ")} exited ${result.status}\n${result.stderr || result.stdout}`);
  }
  return result;
}

// The encode command from design section 6.2: constant 60fps, H.264 High, a closed GOP at half
// the frame rate, two B-frames, CABAC, BT.709 tags, faststart. No overlay is drawn by ffmpeg —
// everything visible was already drawn in the page, so it survives into the stills too.
export function encodeVideo({ ffmpegBin, manifestPath, outputPath, fps, width, height }) {
  const args = [
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    manifestPath,
    "-vsync",
    "cfr",
    "-r",
    String(fps),
    "-vf",
    `scale=${width}:${height}:flags=lanczos,format=yuv420p`,
    "-c:v",
    "libx264",
    "-profile:v",
    "high",
    "-preset",
    "slow",
    "-crf",
    "18",
    "-g",
    String(Math.round(fps / 2)),
    "-keyint_min",
    String(Math.round(fps / 2)),
    "-sc_threshold",
    "0",
    "-bf",
    "2",
    "-coder",
    "1",
    "-color_primaries",
    "bt709",
    "-color_trc",
    "bt709",
    "-colorspace",
    "bt709",
    "-movflags",
    "+faststart",
    outputPath,
  ];
  return runOrThrow(ffmpegBin, args);
}

// A 3-across montage of the per-scene stills, so the operator reviews one image instead of nine.
// The tile filter reads consecutive frames of a single stream, so the stills are concatenated
// into one stream first; feeding tile several inputs directly draws only the first of them.
export function buildContactSheet({ ffmpegBin, stillPaths, outputPath, columns = 3, scaleDivisor = 2 }) {
  if (stillPaths.length === 0) throw new Error("buildContactSheet: no stills to tile");
  const rows = Math.ceil(stillPaths.length / columns);
  const inputs = stillPaths.map((_, index) => `[${index}:v]`).join("");
  const args = [
    "-y",
    ...stillPaths.flatMap((p) => ["-i", p]),
    "-filter_complex",
    `${inputs}concat=n=${stillPaths.length}:v=1:a=0,scale=iw/${scaleDivisor}:ih/${scaleDivisor},tile=${columns}x${rows}`,
    "-frames:v",
    "1",
    outputPath,
  ];
  return runOrThrow(ffmpegBin, args);
}
