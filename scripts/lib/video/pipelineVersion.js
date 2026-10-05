// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/lib/video/pipelineVersion.js
//
// The version of the capture pipeline that produced a recording. Bump PIPELINE_VERSION in the
// same commit as any change to what a recording looks or sounds like (resolution, encoding,
// overlays, captions, narration, timing). site-video-capture.js writes it into
// <script>.manifest.json beside the mp4, video:publish copies it onto the videos/publish.json
// entry, and video:stale lists every published entry recorded by an older pipeline.

import fs from "node:fs";

export const PIPELINE_VERSION = 10;

export function manifestPathFor(videoFile) {
  if (!videoFile.endsWith(".mp4")) throw new Error(`${videoFile} is not an .mp4 file`);
  return videoFile.replace(/\.mp4$/, ".manifest.json");
}

export function buildCaptureManifest({ scriptName, pipelineVersion = PIPELINE_VERSION }) {
  return { script: scriptName, pipelineVersion };
}

export function writeCaptureManifest(filePath, manifest) {
  fs.writeFileSync(filePath, JSON.stringify(manifest, null, 2) + "\n");
}

export function readPipelineVersion(videoFile) {
  const manifestPath = manifestPathFor(videoFile);
  if (!fs.existsSync(manifestPath)) throw new Error(`capture manifest not found: ${manifestPath}`);
  const { pipelineVersion } = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (!Number.isInteger(pipelineVersion)) throw new Error(`${manifestPath} has no integer pipelineVersion`);
  return pipelineVersion;
}

/**
 * The publish:true entries whose recording predates the current pipeline. An entry without a
 * pipelineVersion is an error, not a stale entry: every published entry records how it was made.
 */
export function findStaleEntries(list, currentVersion = PIPELINE_VERSION) {
  const published = list.videos.filter((entry) => entry.publish === true);
  const unversioned = published.filter((entry) => !Number.isInteger(entry.pipelineVersion));
  if (unversioned.length > 0) {
    throw new Error(`videos/publish.json entries without a pipelineVersion: ${unversioned.map((entry) => entry.id).join(", ")}`);
  }
  return published.filter((entry) => entry.pipelineVersion < currentVersion);
}
