#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Records one scene script (videos/<scene>.json) against one lane: loads the lane's .env file, runs
// scripts/site-video-capture.js and tees the output to videoCapture-<lane>.log. Extra arguments pass to
// the capture script.
//
//   npm run video:record -- <scene> <simulator|proxy|ci|prod> [capture args]

import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const VIDEO_LANES = ["simulator", "proxy", "ci", "prod"];

export function buildVideoCommand(scene, lane, extraArgs = []) {
  if (!scene || !existsSync(`videos/${scene}.json`)) {
    throw new Error(`Unknown scene "${scene}": there is no videos/${scene}.json`);
  }
  if (!VIDEO_LANES.includes(lane)) {
    throw new Error(`Unknown lane "${lane}": use one of ${VIDEO_LANES.join(", ")}`);
  }
  return {
    command: "bash",
    args: [
      "-c",
      'set -o pipefail; npx dotenv -e ".env.$0" -- node scripts/site-video-capture.js --script "videos/$1.json" "${@:2}" 2>&1 | tee "videoCapture-$0.log"',
      lane,
      scene,
      ...extraArgs,
    ],
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [scene, lane, ...extraArgs] = process.argv.slice(2);
  try {
    const { command, args } = buildVideoCommand(scene, lane, extraArgs);
    process.exit(spawnSync(command, args, { stdio: "inherit" }).status ?? 1);
  } catch (error) {
    console.error(`${error.message}\nUsage: npm run video:record -- <scene> <${VIDEO_LANES.join("|")}> [capture args]`);
    process.exit(2);
  }
}
