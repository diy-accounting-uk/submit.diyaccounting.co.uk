#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Lists the videos/publish.json entries (publish: true) recorded by an older capture pipeline
// than the current one (scripts/lib/video/pipelineVersion.js).
//
//   npm run video:stale                 list them, one per line: id, recorded version, current version
//   npm run video:stale -- --dispatch   also dispatch their re-records through
//                                       video-capture-on-deploy.yml, which records them one after another

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadPublishList } from "./youtube-upload.js";
import { PIPELINE_VERSION, findStaleEntries } from "./lib/video/pipelineVersion.js";

export function formatStaleReport(staleEntries, currentVersion = PIPELINE_VERSION) {
  if (staleEntries.length === 0) return `No published video is below pipeline version ${currentVersion}.`;
  const lines = staleEntries.map((entry) => `${entry.id}\tv${entry.pipelineVersion}\tcurrent v${currentVersion}`);
  return [`${staleEntries.length} published video(s) below pipeline version ${currentVersion}:`, ...lines].join("\n");
}

export function buildDispatchArgs(staleEntries) {
  return ["workflow", "run", "video-capture-on-deploy.yml", "-f", `scripts=${staleEntries.map((entry) => entry.id).join(" ")}`];
}

export function main(argv = process.argv.slice(2)) {
  const stale = findStaleEntries(loadPublishList());
  console.log(formatStaleReport(stale));
  if (argv.includes("--dispatch") && stale.length > 0) {
    execFileSync("gh", buildDispatchArgs(stale), { stdio: "inherit" });
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
