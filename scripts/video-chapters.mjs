#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/video-chapters.mjs
//
// Prints YouTube chapter lines from a capture's own <name>.timeline.json, so a video's
// description in videos/publish.json carries chapters that match what the recording actually
// shows. Paste the printed lines under the description (see videos/PUBLISH.md).
//
// Usage:
//   node scripts/video-chapters.mjs target/videos/view-obligations/view-obligations.timeline.json videos/view-obligations.json

import fs from "node:fs";
import { buildChapters, formatChapterLines } from "./lib/video/chapters.js";

function main() {
  const [timelinePath, scriptPath] = process.argv.slice(2);
  if (!timelinePath || !scriptPath) {
    throw new Error("usage: node scripts/video-chapters.mjs <name>.timeline.json videos/<name>.json");
  }
  const { steps } = JSON.parse(fs.readFileSync(timelinePath, "utf8"));
  const script = JSON.parse(fs.readFileSync(scriptPath, "utf8"));
  console.log(formatChapterLines(buildChapters(steps, script.scenes)));
}

main();
