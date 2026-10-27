#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

//
// Build the walkthrough shown under each embedded video: one frame per scene taken from the
// recording, a thumbnail and a full-size WebP of it, and the scene's text and start time,
// written into the "walkthrough" array of the video's entry in videos/publish.json.
//
// Usage: node scripts/video-walkthrough.js [--id <video id>]... [--sizes]
//
// --sizes writes only the pixel size of each existing thumbnail and full image into the
// entries (thumbWidth, thumbHeight, fullWidth, fullHeight); it cuts no frames and needs no ffmpeg.
//
// For every entry with a videoId (or only the named ids) the capture artifact is downloaded to
// target/videos/<sourceArtifact>/ when it is missing, the scene script videos/<id>.json gives
// each scene's captions, the recording's timeline gives each scene's times, and ffmpeg (from
// ffmpeg-static) writes the images to web/public/videos/<id>/.
//
// Scenes shown: a scene with at least one captioned step, unless the scene is flagged
// fastForward (those compress a step every video repeats, such as sign-in, into seconds).
// A scene with more than three captioned steps gets one frame per captioned step.
//
// The frame is cut from the card-free still the recorder wrote for the step (stills/step-*.png,
// stepStill.js) when the recording has one. Otherwise it is cut from a moment of the recording
// with no headline card in it: the recording is sampled, each sample is tested for the card (frameCut.js), and the frame is the first card-free sample after
// the step ends. The cut then starts below a text line or control the scroll position cut at the
// top edge, and ends before an empty tail, by reading the frame.
//
// A recording of the submit site is cropped to its content column (CONTENT_COLUMN_CSS_PX wide,
// centred) before scaling, because the app is 800 to 960px wide in a 1920px viewport and the
// frame outside it is blank. A script with a localApp records another tool's full-width page
// and keeps the whole frame.

import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { resolveFfmpegBinary } from "./lib/video/encode.js";
import { captionTextForStep } from "./lib/video/captions.js";
import { findStepStill } from "./lib/video/stepStill.js";
import { imageSize } from "./lib/video/imageSize.js";
import { findCutRegion, frameHasCard, pickCardFreeMs } from "./lib/video/frameCut.js";
import { loadPublishList, savePublishList } from "./youtube-upload.js";
import { copyVideosManifest } from "./copy-videos-manifest.js";

export const SETTLE_BACK_MS = 300;
export const THUMB_WIDTH = 480;
export const FULL_WIDTH = 1600;
export const CONTENT_COLUMN_CSS_PX = 1000;
export const COLUMN_FULL_WIDTH = 1000;
export const FULL_MAX_BYTES = 150 * 1024;
export const WEBP_QUALITIES = [90, 82, 74, 66, 58, 50, 42];
export const SAMPLE_FPS = 10;
export const SAMPLE_WIDTH = 125;
export const MAX_CAPTIONS_PER_SCENE = 2;
export const MAX_CAPTIONS_PER_SCENE_FRAME = 3;

export function parseArgs(argv) {
  const ids = [];
  let sizesOnly = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--sizes") {
      sizesOnly = true;
    } else if (argv[i] === "--id") {
      const value = argv[++i];
      if (!value) throw new Error("--id needs a video id");
      ids.push(value);
    } else {
      throw new Error(`Unknown argument: ${argv[i]}`);
    }
  }
  return { ids, sizesOnly };
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

/** The walkthrough entries with the pixel size of each entry's two images, read from the files under siteRoot. */
export function withFrameSizes(walkthrough, siteRoot = path.resolve("web/public")) {
  return walkthrough.map((entry) => {
    const thumb = imageSize(path.join(siteRoot, entry.thumb));
    const full = imageSize(path.join(siteRoot, entry.full));
    return { ...entry, thumbWidth: thumb.width, thumbHeight: thumb.height, fullWidth: full.width, fullHeight: full.height };
  });
}

function ffmpegProbeDurationMs(ffmpeg, mp4Path) {
  const report = spawnSync(ffmpeg, ["-i", mp4Path, "-hide_banner"], { encoding: "utf8" }).stderr || "";
  const match = report.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
  if (!match) throw new Error(`could not read the duration of ${mp4Path}`);
  return (Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])) * 1000;
}

/**
 * The ffmpeg crop filter that keeps the content column, centred, of a frame laid out at
 * viewportWidthCssPx; empty for a script that records a full-width page.
 */
export function columnCropFilter(script) {
  if (script.localApp) return "";
  const keep = `trunc(iw*${CONTENT_COLUMN_CSS_PX}/${script.viewport.width}/2)*2`;
  return `crop=${keep}:ih:(iw-${keep})/2:0,`;
}

function ffmpegProbeSize(ffmpeg, mp4Path) {
  const report = spawnSync(ffmpeg, ["-i", mp4Path, "-hide_banner"], { encoding: "utf8" }).stderr || "";
  const match = report.match(/Video:.*?,\s(\d{2,5})x(\d{2,5})/);
  if (!match) throw new Error(`could not read the size of ${mp4Path}`);
  return { width: Number(match[1]), height: Number(match[2]) };
}

/** Every SAMPLE_FPS-th of a second of the recording, cropped as the frames are, tested for the headline card. */
export function sampleRecording(ffmpeg, mp4Path, script) {
  const video = ffmpegProbeSize(ffmpeg, mp4Path);
  const keepWidth = script.localApp ? video.width : Math.trunc((video.width * CONTENT_COLUMN_CSS_PX) / script.viewport.width / 2) * 2;
  const height = Math.max(8, Math.round((SAMPLE_WIDTH * video.height) / keepWidth));
  const result = spawnSync(
    ffmpeg,
    [
      "-v",
      "error",
      "-i",
      mp4Path,
      "-vf",
      `fps=${SAMPLE_FPS},${columnCropFilter(script)}scale=${SAMPLE_WIDTH}:${height}:flags=area`,
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "pipe:1",
    ],
    { maxBuffer: 2 * 1024 * 1024 * 1024 },
  );
  if (result.status !== 0) throw new Error(`ffmpeg sampling failed for ${mp4Path}: ${result.stderr}`);
  const frameBytes = SAMPLE_WIDTH * height * 3;
  const samples = [];
  for (let i = 0; i * frameBytes + frameBytes <= result.stdout.length; i++) {
    const rgb = result.stdout.subarray(i * frameBytes, (i + 1) * frameBytes);
    samples.push({ ms: Math.round((i * 1000) / SAMPLE_FPS), card: frameHasCard({ rgb, width: SAMPLE_WIDTH, height }) });
  }
  return samples;
}

/** The seek arguments before an input: a position in a recording, nothing for a still image (frameMs null). */
export function seekArgs(frameMs) {
  return frameMs === null ? [] : ["-ss", (frameMs / 1000).toFixed(3)];
}

/** The crop filter that drops the cut top line and the empty tail of the frame at frameMs; empty when the frame needs neither. */
export function regionCropFilter(ffmpeg, inputPath, frameMs, cropFilter) {
  if (!cropFilter) return "";
  const result = spawnSync(
    ffmpeg,
    [
      "-v",
      "error",
      ...seekArgs(frameMs),
      "-i",
      inputPath,
      "-frames:v",
      "1",
      "-vf",
      `${cropFilter}scale=${COLUMN_FULL_WIDTH}:-2:flags=area`,
      "-f",
      "rawvideo",
      "-pix_fmt",
      "gray",
      "pipe:1",
    ],
    { maxBuffer: 64 * 1024 * 1024 },
  );
  if (result.status !== 0) throw new Error(`ffmpeg failed reading ${inputPath} at ${frameMs}ms: ${result.stderr}`);
  const gray = result.stdout;
  const height = Math.floor(gray.length / COLUMN_FULL_WIDTH);
  const { top, bottom } = findCutRegion({ gray, width: COLUMN_FULL_WIDTH, height });
  if (top === 0 && bottom === height) return "";
  const even = (rows) => `trunc(ih*${rows}/${height}/2)*2`;
  return `crop=iw:${even(bottom - top)}:0:${even(top)},`;
}

function writeWebp(ffmpeg, inputPath, frameMs, width, quality, outPath, cropFilter) {
  const result = spawnSync(
    ffmpeg,
    [
      "-y",
      "-v",
      "error",
      ...seekArgs(frameMs),
      "-i",
      inputPath,
      "-frames:v",
      "1",
      "-vf",
      `${cropFilter}scale=${width}:-2:flags=lanczos`,
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

export function ensureArtifact(entry) {
  if (!entry.sourceRun || !entry.sourceArtifact) {
    const localDir = entry.videoFile ? path.resolve(path.dirname(entry.videoFile)) : null;
    if (
      localDir &&
      fs.existsSync(path.join(localDir, `${entry.id}.mp4`)) &&
      fs.existsSync(path.join(localDir, `${entry.id}.timeline.json`))
    ) {
      return localDir;
    }
    throw new Error(
      `${entry.id}: no sourceRun and sourceArtifact in publish.json, and no local recording with its timeline at ${entry.videoFile}`,
    );
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
  const cropFilter = columnCropFilter(script);
  const fullWidth = cropFilter ? COLUMN_FULL_WIDTH : FULL_WIDTH;
  const outDir = path.join(outRoot, entry.id);
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  let bytes = 0;
  let samples = null;
  const sampleCards = () => (samples ??= sampleRecording(ffmpeg, mp4Path, script));
  for (const item of plan) {
    const timing = timeline.steps.filter(
      (step) => step.sceneId === item.scene && (item.step === undefined || step.stepIndex === item.step),
    );
    const sceneSteps = script.scenes.find((scene) => scene.id === item.scene).steps.length;
    const still = findStepStill(path.join(dir, "stills"), item, sceneSteps);
    let source = still;
    let frameMs = null;
    if (!still) {
      const picked = pickCardFreeMs(sampleCards(), {
        startMs: Math.min(...timing.map((step) => step.startMs)),
        endMs: Math.max(...timing.map((step) => step.endMs)),
        fallbackMs: item.frameMs,
      });
      if (!picked.clean) console.warn(`${entry.id}: ${frameKey(item)} has the headline card in every sample; the frame keeps it`);
      source = mp4Path;
      frameMs = picked.ms;
    }
    const itemCrop = `${cropFilter}${regionCropFilter(ffmpeg, source, frameMs, cropFilter)}`;
    writeWebp(ffmpeg, source, frameMs, THUMB_WIDTH, 70, path.join(outDir, `${frameKey(item)}-thumb.webp`), itemCrop);
    const fullPath = path.join(outDir, `${frameKey(item)}.webp`);
    let size = Infinity;
    for (const quality of WEBP_QUALITIES) {
      size = writeWebp(ffmpeg, source, frameMs, fullWidth, quality, fullPath, itemCrop);
      if (size <= FULL_MAX_BYTES) break;
    }
    bytes += size + fs.statSync(path.join(outDir, `${frameKey(item)}-thumb.webp`)).size;
  }
  return { walkthrough: withFrameSizes(buildWalkthroughEntries(entry.id, plan), path.dirname(outRoot)), bytes };
}

export function main(argv = process.argv.slice(2)) {
  const { ids, sizesOnly } = parseArgs(argv);
  const list = loadPublishList();
  const entries = list.videos.filter((entry) => entry.videoId && (ids.length === 0 || ids.includes(entry.id)));
  for (const id of ids) {
    if (!entries.some((entry) => entry.id === id)) throw new Error(`No published entry with id ${id}`);
  }
  const failures = [];
  for (const entry of entries) {
    try {
      const { walkthrough, bytes } = sizesOnly ? { walkthrough: withFrameSizes(entry.walkthrough), bytes: 0 } : buildForEntry(entry);
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
