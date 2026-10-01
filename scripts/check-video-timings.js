#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/check-video-timings.js
//
// The acceptance check from the site-video-capture design, section 10.1 and 10.2. Exits
// non-zero with a table of the offending steps when a check fails.
//
// Usage:
//   node scripts/check-video-timings.js target/videos/tour/tour.timeline.json
//   node scripts/check-video-timings.js --static [videos/name.json ...]   (every script when none named)
//
// --static runs the final-caption tail check against a timeline estimated from the script alone
// (explicit holds, pacing pauses and typing cadence; waits on the backend count as zero, which
// makes the estimate the shortest the video can be).
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
import { pathToFileURL } from "url";
import { validateScript, effectiveScaleFactor } from "./lib/video/scriptSchema.js";
import { resolveFfmpegBinary } from "./lib/video/encode.js";
import { checkTimings, checkTimerMarkers, checkTypingCadence } from "./lib/video/checks.js";
import { captionMinMs, groupFor, pauseForGroup } from "./lib/video/pacing.js";
import { captionTextForStep } from "./lib/video/captions.js";

const NARRATION_TAIL_MARGIN_MS = 2000;

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
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

// The last captioned step's narration, plus a margin, must end before the video does.
export function checkFinalCaptionTail(timelineSteps, script) {
  if (!timelineSteps.length) return [];
  const endOfVideoMs = timelineSteps[timelineSteps.length - 1].endMs + script.finalHoldMs;
  const sceneById = new Map(script.scenes.map((scene) => [scene.id, scene]));
  for (let i = timelineSteps.length - 1; i >= 0; i--) {
    const record = timelineSteps[i];
    const scene = sceneById.get(record.sceneId);
    if (!scene || scene.offCamera || scene.fastForward || record.offCamera || record.fastForward) continue;
    const text = captionTextForStep(scene.steps[record.stepIndex]);
    if (!text) continue;
    const narrationEndMs = record.startMs + captionMinMs(text, script.captions);
    if (narrationEndMs + NARRATION_TAIL_MARGIN_MS <= endOfVideoMs) return [];
    return [
      {
        step: `${record.sceneId}#${record.stepIndex}`,
        check: "finalCaptionTail",
        expected: `video ends at or after ${narrationEndMs + NARRATION_TAIL_MARGIN_MS}ms`,
        actual: `${Math.round(endOfVideoMs)}ms`,
        shortByMs: Math.round(narrationEndMs + NARRATION_TAIL_MARGIN_MS - endOfVideoMs),
      },
    ];
  }
  return [];
}

// A timeline built from the script alone: holds are their own length, typed text is paced per
// character, every other grouped action takes its configured pause, and waits count as zero.
export function estimateTimeline(script) {
  const steps = [];
  let clockMs = 0;
  for (const scene of script.scenes) {
    const offCamera = Boolean(scene.offCamera);
    const fastForward = Boolean(scene.fastForward);
    (scene.steps || []).forEach((step, stepIndex) => {
      const startMs = clockMs;
      if (!offCamera && !fastForward) {
        let durationMs = 0;
        if (step.action === "hold") durationMs = step.ms;
        else if (step.action === "caption") durationMs = step.holdMs || captionMinMs(step.text, script.captions);
        else {
          const group = groupFor(step.action);
          if (group) durationMs = pauseForGroup(group, script.pacing);
          if (step.action === "type") durationMs += (step.text || "").length * script.pacing.perCharMs;
        }
        clockMs += durationMs;
      }
      steps.push({ sceneId: scene.id, stepIndex, offCamera, fastForward, startMs, endMs: clockMs });
    });
  }
  return steps;
}

function runStatic(names) {
  const files = names.length
    ? names
    : fs
        .readdirSync("videos")
        .filter((n) => n.endsWith(".json") && !["publish.json", "scene-script.schema.json"].includes(n))
        .map((n) => path.join("videos", n));
  const failures = [];
  for (const file of files) {
    const script = validateScript(readJson(file));
    for (const failure of checkFinalCaptionTail(estimateTimeline(script), script)) failures.push({ script: file, ...failure });
  }
  if (failures.length > 0) {
    console.error("\nFAILURES:");
    console.table(failures);
    process.exit(1);
  }
  console.log(`All static checks passed over ${files.length} scripts.`);
}

function main() {
  if (process.argv[2] === "--static") return runStatic(process.argv.slice(3));
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
    ...checkFinalCaptionTail(timelineSteps, script),
  ];

  const mp4Path = path.join(outDir, `${name}.mp4`);
  if (fs.existsSync(mp4Path)) {
    const ffmpegBin = resolveFfmpegBinary();
    const report = ffmpegProbe(ffmpegBin, mp4Path);
    const probe = parseProbe(report);
    console.log("ffmpeg probe:", JSON.stringify(probe, null, 2));

    // The frame carries the CSS viewport times deviceScaleFactor, not the viewport alone — a
    // 1920x1080 layout captures as 3840x2160 at the default scale factor.
    const scaleFactor = effectiveScaleFactor(script);
    const expectedWidth = script.viewport.width * scaleFactor;
    const expectedHeight = script.viewport.height * scaleFactor;
    if (probe.width !== expectedWidth || probe.height !== expectedHeight) {
      failures.push({
        check: "resolution",
        expected: `${expectedWidth}x${expectedHeight}`,
        actual: `${probe.width}x${probe.height}`,
      });
    }
    if (!probe.isH264) failures.push({ check: "codec", expected: "h264", actual: report.match(/Video:\s*(\S+)/)?.[1] || "unknown" });
    if (probe.fps !== null && Math.abs(probe.fps - script.fps) > 0.1) {
      failures.push({ check: "fps", expected: script.fps, actual: probe.fps });
    }
    const expectedDurationMs = timelineSteps.length
      ? timelineSteps[timelineSteps.length - 1].endMs + script.finalHoldMs
      : script.finalHoldMs;
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

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
