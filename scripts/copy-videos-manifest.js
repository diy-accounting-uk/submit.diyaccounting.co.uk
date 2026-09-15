#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Copies videos/publish.json to web/public/videos/publish.json, the manifest videos.html reads.
// web/unit-tests/videos-manifest.test.js fails when the two differ, so a manifest change that
// skips this copy does not reach main.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SOURCE_PATH = path.join(repoRoot, "videos", "publish.json");
export const TARGET_PATH = path.join(repoRoot, "web", "public", "videos", "publish.json");

export function copyVideosManifest({ sourcePath = SOURCE_PATH, targetPath = TARGET_PATH } = {}) {
  const content = fs.readFileSync(sourcePath, "utf8");
  JSON.parse(content);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, content);
  return targetPath;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const written = copyVideosManifest();
  console.log(`Copied ${path.relative(repoRoot, SOURCE_PATH)} to ${path.relative(repoRoot, written)}`);
}
