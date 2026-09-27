// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/video/headlines.test.js
//
// A step with no caption text shows nothing on screen, so it needs no headline. A step that
// does show caption text always shows a burned-in headline too (overlay-runtime.js), so a
// script that adds a captioned step without one leaves that step silently blank on screen
// instead of failing here, named.

import fs from "node:fs";
import path from "node:path";
import { describe, test, expect } from "vitest";

const videosDir = path.resolve(process.cwd(), "videos");

function readSceneScript(name) {
  return JSON.parse(fs.readFileSync(path.join(videosDir, `${name}.json`), "utf8"));
}

// A "caption" action step carries its shown text under "text"; every other action carries it
// under "caption". Only one of the two is ever the caption text for a given step.
function captionTextFor(step) {
  return step.action === "caption" ? step.text : step.caption;
}

// timer-check.json is a local timing fixture for the overlay's timer pill and wait-compression
// marker, not a published video, so it carries no headlines of its own.
const scriptNames = fs
  .readdirSync(videosDir)
  .filter((file) => file.endsWith(".json") && !file.endsWith(".schema.json"))
  .map((file) => file.replace(/\.json$/, ""))
  .filter((name) => name !== "publish" && name !== "timer-check");

describe("every scene script's captioned steps", () => {
  test.each(scriptNames)("%s: every step with caption text carries a headline", (name) => {
    const script = readSceneScript(name);
    const missing = [];
    for (const scene of script.scenes) {
      scene.steps.forEach((step, stepIndex) => {
        if (captionTextFor(step) && !step.headline) {
          missing.push(`scene "${scene.id}" step ${stepIndex} (${step.action})`);
        }
      });
    }
    expect(missing).toEqual([]);
  });
});
