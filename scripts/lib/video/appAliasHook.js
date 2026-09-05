// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// scripts/lib/video/appAliasHook.js
//
// Node module-resolution hook mapping the repo's "@app/*" specifier onto "app/*". vitest and
// jsconfig.json define that alias for the test runners; plain `node` does not, and the behaviour
// step functions the video capture reuses import through it. Registered by behaviourSteps.js
// before those modules load.

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../app");

export function resolve(specifier, context, nextResolve) {
  if (specifier === "@app" || specifier.startsWith("@app/")) {
    const rest = specifier === "@app" ? "" : specifier.slice("@app/".length);
    return nextResolve(pathToFileURL(path.join(appDir, rest)).href, context);
  }
  return nextResolve(specifier, context);
}
