#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// scripts/check-video-timings.js
//
// The acceptance check from the site-video-capture design, section 10.1 and 10.2. Exits
// non-zero with a table of the offending steps when a check fails.
//
// Usage:
//   node scripts/check-video-timings.js target/videos/tour/tour.timeline.json
//
// No ffprobe on the operator's Mac or in the Playwright container (only ffmpeg-static's ffmpeg
// binary). The mp4-level checks below either parse `ffmpeg -i`'s own stderr report or walk the
// mp4's top-level boxes directly — both avoid needing ffprobe. What that leaves unchecked: an
// exact per-frame PTS-gap scan and a bitstream-level keyframe-interval count need ffprobe's
// frame-level output, which this script does not attempt; the encode command's own `-g` value is
// the evidence for keyframe interval instead.

import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { validateScript } from "./lib/video/scriptSchema.js";
import { groupFor, pauseForGroup, residualAfterWait } from "./lib/video/pacing.js";
import { resolveFfmpegBinary } from "./lib/video/encode.js";

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

// --- 10.1: timings match the config ---

function checkTimings(timelineSteps, script) {
  const failures = [];
  for (const step of timelineSteps) {
    if (step.group === 2 || step.group === 3) {
      const expectedResidual = residualAfterWait(step.configuredMs, step.waitMs, script.pacing);
      const diff = Math.abs(expectedResidual - step.residualMs);
      if (diff > 60) {
        failures.push({
          step: `${step.sceneId}#${step.stepIndex}`,
          check: "residualAfterWait",
          expected: expectedResidual,
          actual: step.residualMs,
          toleranceMs: 60,
        });
      }
    }
    if (step.waitMs > script.pacing.timerThresholdMs) {
      // See the note at the top of this file: exact per-step attribution against the overlay
      // event log needs a shared clock between the browser and Node, which screencast capture
      // does not have (performance.now() resets every navigation). checkTimerMarkers below does
      // a count-based check across the whole run instead.
    }
  }
  return failures;
}

function checkTimerMarkers(timelineSteps, overlayEvents, script) {
  const expectedCount = timelineSteps.filter((s) => s.waitMs > script.pacing.timerThresholdMs).length;
  const actualCount = overlayEvents.filter((e) => e.type === "timerStart").length;
  if (actualCount < expectedCount) {
    return [{ check: "timerMarkers", expected: `>= ${expectedCount}`, actual: actualCount }];
  }
  return [];
}

function checkTypingCadence(overlayEvents, script) {
  const typeEvents = overlayEvents.filter((e) => e.type === "typeChar").map((e) => e.t);
  if (typeEvents.length < 2) return [];
  const intervals = [];
  for (let i = 1; i < typeEvents.length; i++) {
    const gap = typeEvents[i] - typeEvents[i - 1];
    if (gap > 0 && gap < script.pacing.perCharMs * 5) intervals.push(gap); // drop cross-step gaps
  }
  if (intervals.length === 0) return [];
  const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const diff = Math.abs(mean - script.pacing.perCharMs);
  if (diff > 25) {
    return [{ check: "typingCadence", expected: script.pacing.perCharMs, actual: Math.round(mean), toleranceMs: 25 }];
  }
  return [];
}

// --- 10.2: the file is what it claims ---

function ffmpegProbe(ffmpegBin, mp4Path) {
  const result = spawnSync(ffmpegBin, ["-i", mp4Path, "-hide_banner"], { encoding: "utf8" });
  // ffmpeg -i with no output file exits non-zero by design; its report is on stderr regardless.
  return result.stderr || "";
}

function parseProbe(report) {
  const durationMatch = report.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
  const durationMs = durationMatch
    ? (Number(durationMatch[1]) * 3600 + Number(durationMatch[2]) * 60 + Number(durationMatch[3])) * 1000
    : null;
  const videoLine = report.split("\n").find((l) => l.includes("Video:")) || "";
  const resMatch = videoLine.match(/(\d{3,5})x(\d{3,5})/);
  const fpsMatch = videoLine.match(/([\d.]+)\s*fps/);
  const pixFmtMatch = videoLine.match(/Video:\s*h264[^,]*,\s*([a-z0-9]+)/);
  const profileMatch = videoLine.match(/\(([A-Za-z0-9 ]+)\)/);
  return {
    durationMs,
    width: resMatch ? Number(resMatch[1]) : null,
    height: resMatch ? Number(resMatch[2]) : null,
    fps: fpsMatch ? Number(fpsMatch[1]) : null,
    pixelFormat: pixFmtMatch ? pixFmtMatch[1] : null,
    profile: profileMatch ? profileMatch[1] : null,
    isH264: /Video:\s*h264/.test(videoLine),
  };
}

// mp4/mov containers are a flat sequence of [uint32 size][4-byte fourcc][payload] boxes at the
// top level. Faststart means the 'moov' box's start offset is before 'mdat''s — checkable
// without ffprobe by walking those top-level boxes directly.
function checkFaststart(mp4Path) {
  const buffer = fs.readFileSync(mp4Path);
  let offset = 0;
  let moovOffset = null;
  let mdatOffset = null;
  while (offset + 8 <= buffer.length) {
    const size = buffer.readUInt32BE(offset);
    const fourcc = buffer.toString("ascii", offset + 4, offset + 8);
    if (fourcc === "moov" && moovOffset === null) moovOffset = offset;
    if (fourcc === "mdat" && mdatOffset === null) mdatOffset = offset;
    if (size < 8) break; // malformed or a 64-bit size box we don't need to parse for this check
    offset += size;
  }
  return { moovOffset, mdatOffset, faststart: moovOffset !== null && mdatOffset !== null && moovOffset < mdatOffset };
}

function checkVtt(vttPath, transcriptPath) {
  const vtt = fs.readFileSync(vttPath, "utf8");
  const transcript = fs.readFileSync(transcriptPath, "utf8");
  const cueTextLines = vtt
    .split("\n\n")
    .slice(1)
    .map((block) => block.split("\n").slice(2).join(" ").trim())
    .filter(Boolean);
  const missing = cueTextLines.filter((text) => !transcript.includes(text));
  return { cueCount: cueTextLines.length, missing };
}

function main() {
  const timelinePath = process.argv[2];
  if (!timelinePath) {
    console.error("Usage: node scripts/check-video-timings.js <path/to/name.timeline.json>");
    process.exit(2);
  }
  const outDir = path.dirname(timelinePath);
  const name = path.basename(timelinePath).replace(/\.timeline\.json$/, "");
  const scriptPath = path.join("videos", `${name}.json`);
  const script = validateScript(readJson(scriptPath));

  const { steps: timelineSteps } = readJson(timelinePath);
  const overlayEventsPath = path.join(outDir, `${name}.overlay-events.json`);
  const overlayEvents = fs.existsSync(overlayEventsPath) ? readJson(overlayEventsPath) : [];

  const failures = [
    ...checkTimings(timelineSteps, script),
    ...checkTimerMarkers(timelineSteps, overlayEvents, script),
    ...checkTypingCadence(overlayEvents, script),
  ];

  const mp4Path = path.join(outDir, `${name}.mp4`);
  if (fs.existsSync(mp4Path)) {
    const ffmpegBin = resolveFfmpegBinary();
    const report = ffmpegProbe(ffmpegBin, mp4Path);
    const probe = parseProbe(report);
    console.log("ffmpeg probe:", JSON.stringify(probe, null, 2));

    if (probe.width !== script.viewport.width || probe.height !== script.viewport.height) {
      failures.push({ check: "resolution", expected: `${script.viewport.width}x${script.viewport.height}`, actual: `${probe.width}x${probe.height}` });
    }
    if (!probe.isH264) failures.push({ check: "codec", expected: "h264", actual: report.match(/Video:\s*(\S+)/)?.[1] || "unknown" });
    if (probe.fps !== null && Math.abs(probe.fps - script.fps) > 0.1) {
      failures.push({ check: "fps", expected: script.fps, actual: probe.fps });
    }
    const expectedDurationMs = timelineSteps.length ? timelineSteps[timelineSteps.length - 1].endMs + script.finalHoldMs : script.finalHoldMs;
    if (probe.durationMs !== null) {
      const tolerance = expectedDurationMs * 0.05;
      const diff = Math.abs(probe.durationMs - expectedDurationMs);
      if (diff > tolerance) {
        failures.push({ check: "duration", expected: expectedDurationMs, actual: probe.durationMs, tolerancePct: 5 });
      }
    }

    const faststart = checkFaststart(mp4Path);
    console.log("faststart:", JSON.stringify(faststart));
    if (!faststart.faststart) failures.push({ check: "faststart", expected: "moov before mdat", actual: JSON.stringify(faststart) });
  } else {
    console.log(`(no mp4 at ${mp4Path} — skipping section 10.2 file checks)`);
  }

  const vttPath = path.join(outDir, `${name}.vtt`);
  const transcriptPath = path.join(outDir, `${name}.transcript.md`);
  if (fs.existsSync(vttPath) && fs.existsSync(transcriptPath)) {
    const vttCheck = checkVtt(vttPath, transcriptPath);
    console.log(`vtt: ${vttCheck.cueCount} cues, ${vttCheck.missing.length} missing from transcript`);
    if (vttCheck.missing.length > 0) {
      failures.push({ check: "vttInTranscript", expected: "every cue text in transcript", actual: vttCheck.missing });
    }
  }

  if (failures.length > 0) {
    console.error("\nFAILURES:");
    console.table(failures);
    process.exit(1);
  }
  console.log("\nAll checks passed.");
}

main();
