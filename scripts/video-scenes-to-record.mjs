#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/video-scenes-to-record.mjs
//
// Narrows a list of scene scripts a deploy's page diff touched down to the ones actually worth
// re-recording: the scene must be one videos/publish.json marks "publish": true, and no recent
// video-capture.yml run may already hold a recording of it. Used by video-capture-on-deploy.yml
// so a deploy that touches a page nobody publishes, or that was already recorded earlier the
// same day, dispatches no capture job at all.
//
// CLI usage: touched scene names one per line on stdin, an optional --publish <path> (default
// videos/publish.json) and an optional --recorded <path> to a file of artifact names collected
// from recent video-capture.yml runs (default: treat nothing as already recorded).
//   echo "view-obligations" | node scripts/video-scenes-to-record.mjs --recorded /tmp/artifacts.txt
// Prints one scene name per line, in the order given on stdin. Prints nothing (exit 0) when none
// qualifies.

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

// video-capture.yml uploads each recording as "video-<script>-<environment-name>" (see its
// "Upload artifacts" step). A scene counts as already recorded when any artifact name from the
// lookback window starts with its own prefix, whatever environment it was recorded against.
export function sceneArtifactPrefix(sceneId) {
  return `video-${sceneId}-`;
}

export function publishableSceneIds(publishConfig) {
  return new Set((publishConfig.videos ?? []).filter((video) => video.publish === true).map((video) => video.id));
}

export function sceneAlreadyRecorded(sceneId, artifactNames) {
  const prefix = sceneArtifactPrefix(sceneId);
  return artifactNames.some((name) => name.startsWith(prefix));
}

// Pure: narrows touchedSceneIds to the ones publishConfig marks publish: true and that no name
// in artifactNames already covers.
export function scenesToRecord(touchedSceneIds, publishConfig, artifactNames) {
  const publishable = publishableSceneIds(publishConfig);
  return touchedSceneIds.filter((id) => publishable.has(id) && !sceneAlreadyRecorded(id, artifactNames));
}

async function readLines(input) {
  if (!input) return [];
  const lines = [];
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  for await (const line of rl) {
    if (line.trim().length > 0) lines.push(line.trim());
  }
  return lines;
}

async function main() {
  const args = process.argv.slice(2);
  let publishPath = "videos/publish.json";
  let recordedPath;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--publish") publishPath = args[++i];
    else if (args[i] === "--recorded") recordedPath = args[++i];
  }

  const touchedSceneIds = await readLines(process.stdin);
  const publishConfig = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), publishPath), "utf8"));
  const artifactNames = recordedPath && fs.existsSync(recordedPath) ? await readLines(fs.createReadStream(recordedPath)) : [];

  for (const id of scenesToRecord(touchedSceneIds, publishConfig, artifactNames)) {
    console.log(id);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
