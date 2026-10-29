#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Copies the repository's experiments.toml into a web root so the operator dashboard can fetch it
// at /experiments.toml. The web root is gitignored output of the build, not a second source.
// Usage: node scripts/publish-experiments.mjs <web-root>   (the deploy workflow and deploy-app.js)

import { copyFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPOSITORY_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const EXPERIMENTS_SOURCE_PATH = join(REPOSITORY_ROOT, "experiments.toml");

/**
 * @param {string} webRoot directory whose contents are served at the site root
 * @param {string} [sourcePath] the experiments file to copy
 * @returns {string} the path written
 */
export function publishExperiments(webRoot, sourcePath = EXPERIMENTS_SOURCE_PATH) {
  if (!existsSync(sourcePath)) throw new Error(`experiments file not found: ${sourcePath}`);
  const destination = join(webRoot, "experiments.toml");
  copyFileSync(sourcePath, destination);
  return destination;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const webRoot = process.argv[2];
  if (!webRoot) {
    console.error("Usage: node scripts/publish-experiments.mjs <web-root>");
    process.exit(1);
  }
  console.log(`Published ${publishExperiments(webRoot)}`);
}
