#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

//
// Build the walkthrough shown under each embedded video: one frame per scene taken from the
// recording, a thumbnail and a full-size WebP of it, and the scene's text and start time,
// written into the "walkthrough" array of the video's entry in videos/publish.json.
//
// Usage: node scripts/video-walkthrough.js [--id <video id>]...
//
// For every entry with a videoId (or only the named ids) the capture artifact is downloaded to
// target/videos/<sourceArtifact>/ when it is missing, the scene script videos/<id>.json gives
// each scene's captions, the recording's timeline gives each scene's times, and ffmpeg (from
// ffmpeg-static) writes the images to web/public/videos/<id>/.
//
// Scenes shown: a scene with at least one captioned step, unless the scene is flagged
// fastForward (those compress a step every video repeats, such as sign-in, into seconds).
// A scene with more than three captioned steps gets one frame per captioned step.

import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { resolveFfmpegBinary } from "./lib/video/encode.js";
import { captionTextForStep } from "./lib/video/captions.js";
import { loadPublishList, savePublishList } from "./youtube-upload.js";
import { copyVideosManifest } from "./copy-videos-manifest.js";

export const SETTLE_BACK_MS = 300;
export const THUMB_WIDTH = 480;
export const FULL_WIDTH = 1600;
export const FULL_MAX_BYTES = 150 * 1024;
export const WEBP_QUALITIES = [90, 82, 74, 66, 58, 50, 42];
export const MAX_CAPTIONS_PER_SCENE = 2;
export const MAX_CAPTIONS_PER_SCENE_FRAME = 3;

export function parseArgs(argv) {
  const ids = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--id") {
      const value = argv[++i];
      if (!value) throw new Error("--id needs a video id");
      ids.push(value);
    } else {
      throw new Error(`Unknown argument: ${argv[i]}`);
    }
  }
  return { ids };
}

function sentence(text) {
  const trimmed = String(text).trim();
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/**
 * Plans the walkthrough of one recording from its scene script and timeline.
 *
 * @param {{scenes: Array}} script the scene script (videos/<id>.json)
 * @param {{steps: Array}} timeline the recording's timeline
 * @param {number} [videoDurationMs] the recording's length; frame times stay inside it
 * @returns {Array<{scene: string, headline: string, caption: string, startSeconds: number, frameMs: number}>}
 */
export function planWalkthrough({ script, timeline, videoDurationMs = Infinity }) {
  const frameAt = (startMs, endMs) => {
    const latestFrameMs = Math.max(0, Math.min(endMs, videoDurationMs) - 1);
    return Math.min(latestFrameMs, Math.max(startMs, endMs - SETTLE_BACK_MS));
  };
  const plan = [];
  for (const scene of script.scenes) {
    if (scene.fastForward) continue;
    const captioned = scene.steps.map((step, index) => ({ step, index })).filter(({ step }) => captionTextForStep(step));
    if (captioned.length === 0) continue;
    const timed = timeline.steps.filter((step) => step.sceneId === scene.id);
    if (timed.length !== scene.steps.length) {
      throw new Error(`scene "${scene.id}" has ${scene.steps.length} steps in the script but ${timed.length} in the timeline`);
    }
    if (captioned.length > MAX_CAPTIONS_PER_SCENE_FRAME) {
      let previousCaption = null;
      for (const { step, index } of captioned) {
        const caption = sentence(captionTextForStep(step));
        if (caption === previousCaption) continue;
        previousCaption = caption;
        const timing = timed.find((t) => t.stepIndex === index);
        if (!timing) throw new Error(`scene "${scene.id}" has no timeline entry for step ${index}`);
        plan.push({
          scene: scene.id,
          step: index,
          headline: step.headline || scene.chapter || caption,
          caption,
          startSeconds: Math.floor(timing.startMs / 1000),
          frameMs: frameAt(timing.startMs, timing.endMs),
        });
      }
      continue;
    }
    const startMs = Math.min(...timed.map((step) => step.startMs));
    const endMs = Math.max(...timed.map((step) => step.endMs));
    const lastCaptioned = captioned[captioned.length - 1].step;
    const headline = scene.chapter || lastCaptioned.headline || captionTextForStep(lastCaptioned);
    const caption = captioned
      .slice(-MAX_CAPTIONS_PER_SCENE)
      .map(({ step }) => sentence(captionTextForStep(step)))
      .join(" ");
    plan.push({ scene: scene.id, headline, caption, startSeconds: Math.floor(startMs / 1000), frameMs: frameAt(startMs, endMs) });
  }
  return plan;
}

/** The key naming a plan item's images and anchor: the scene id, plus the step for a split scene. */
export function frameKey(item) {
  return item.step === undefined ? item.scene : `${item.scene}-${item.step}`;
}

/** The manifest entry's walkthrough array for a plan, with the site paths of its two images. */
export function buildWalkthroughEntries(videoId, plan) {
  return plan.map((item) => {
    const entry = { scene: item.scene };
    if (item.step !== undefined) entry.step = item.step;
    return {
      ...entry,
      headline: item.headline,
      caption: item.caption,
      startSeconds: item.startSeconds,
      thumb: `videos/${videoId}/${frameKey(item)}-thumb.webp`,
      full: `videos/${videoId}/${frameKey(item)}.webp`,
    };
  });
}

function ffmpegProbeDurationMs(ffmpeg, mp4Path) {
  const report = spawnSync(ffmpeg, ["-i", mp4Path, "-hide_banner"], { encoding: "utf8" }).stderr || "";
  const match = report.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
  if (!match) throw new Error(`could not read the duration of ${mp4Path}`);
  return (Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])) * 1000;
}

function writeWebp(ffmpeg, mp4Path, frameMs, width, quality, outPath) {
  const result = spawnSync(
    ffmpeg,
    [
      "-y",
      "-v",
      "error",
      "-ss",
      (frameMs / 1000).toFixed(3),
      "-i",
      mp4Path,
      "-frames:v",
      "1",
      "-vf",
      `scale=${width}:-2:flags=lanczos`,
      "-c:v",
      "libwebp",
      "-quality",
      String(quality),
      outPath,
    ],
    { encoding: "utf8" },
  );
  if (result.status !== 0 || !fs.existsSync(outPath)) {
    throw new Error(`ffmpeg failed for ${outPath}: ${result.stderr}`);
  }
  return fs.statSync(outPath).size;
}

function ensureArtifact(entry) {
  if (!entry.sourceRun || !entry.sourceArtifact) {
    throw new Error(`${entry.id}: no sourceRun and sourceArtifact in publish.json, so there is no capture artifact to read`);
  }
  const dir = path.resolve("target", "videos", entry.sourceArtifact);
  if (fs.existsSync(path.join(dir, `${entry.id}.mp4`))) return dir;
  const result = spawnSync("gh", ["run", "download", String(entry.sourceRun), "-n", entry.sourceArtifact, "-D", dir], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`${entry.id}: gh run download ${entry.sourceRun} -n ${entry.sourceArtifact} failed: ${(result.stderr || "").trim()}`);
  }
  return dir;
}

export function buildForEntry(entry, { ffmpeg = resolveFfmpegBinary(), outRoot = path.resolve("web/public/videos") } = {}) {
  const dir = ensureArtifact(entry);
  const mp4Path = path.join(dir, `${entry.id}.mp4`);
  const timeline = JSON.parse(fs.readFileSync(path.join(dir, `${entry.id}.timeline.json`), "utf8"));
  const script = JSON.parse(fs.readFileSync(path.resolve("videos", `${entry.id}.json`), "utf8"));
  const plan = planWalkthrough({ script, timeline, videoDurationMs: ffmpegProbeDurationMs(ffmpeg, mp4Path) });
  const outDir = path.join(outRoot, entry.id);
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  let bytes = 0;
  for (const item of plan) {
    writeWebp(ffmpeg, mp4Path, item.frameMs, THUMB_WIDTH, 70, path.join(outDir, `${frameKey(item)}-thumb.webp`));
    const fullPath = path.join(outDir, `${frameKey(item)}.webp`);
    let size = Infinity;
    for (const quality of WEBP_QUALITIES) {
      size = writeWebp(ffmpeg, mp4Path, item.frameMs, FULL_WIDTH, quality, fullPath);
      if (size <= FULL_MAX_BYTES) break;
    }
    bytes += size + fs.statSync(path.join(outDir, `${frameKey(item)}-thumb.webp`)).size;
  }
  return { walkthrough: buildWalkthroughEntries(entry.id, plan), bytes };
}

export function main(argv = process.argv.slice(2)) {
  const { ids } = parseArgs(argv);
  const list = loadPublishList();
  const entries = list.videos.filter((entry) => entry.videoId && (ids.length === 0 || ids.includes(entry.id)));
  for (const id of ids) {
    if (!entries.some((entry) => entry.id === id)) throw new Error(`No published entry with id ${id}`);
  }
  const failures = [];
  for (const entry of entries) {
    try {
      const { walkthrough, bytes } = buildForEntry(entry);
      entry.walkthrough = walkthrough;
      savePublishList(list);
      copyVideosManifest();
      console.log(`${entry.id}: ${walkthrough.length} scenes, ${(bytes / 1024).toFixed(0)} KB`);
    } catch (error) {
      failures.push(error.message);
      console.error(error.message);
    }
  }
  savePublishList(list);
  copyVideosManifest();
  if (failures.length > 0) {
    throw new Error(`${failures.length} video(s) not built:\n${failures.join("\n")}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
