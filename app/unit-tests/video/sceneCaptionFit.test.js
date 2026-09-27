// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/video/sceneCaptionFit.test.js

import fs from "fs";
import path from "path";
import { describe, test, expect } from "vitest";
import { wrapCaptionLines, captionTextForStep } from "../../../scripts/lib/video/captions.js";

const videosDir = path.resolve("videos");
const sceneScripts = fs
  .readdirSync(videosDir)
  .filter((name) => name.endsWith(".json"))
  .map((name) => ({ name, script: JSON.parse(fs.readFileSync(path.join(videosDir, name), "utf8")) }))
  .filter(({ script }) => script.captions && Array.isArray(script.scenes));

describe("scene script captions", () => {
  test.each(sceneScripts.map(({ name, script }) => [name, script]))("%s: every caption fits its line limits", (name, script) => {
    const { maxCharsPerLine, maxLines } = script.captions;
    const overflowing = script.scenes
      .flatMap((scene) => (scene.steps || []).map((step) => captionTextForStep(step)))
      .filter(Boolean)
      .filter((text) => {
        try {
          wrapCaptionLines(text, maxCharsPerLine, maxLines);
          return false;
        } catch {
          return true;
        }
      });
    expect(overflowing).toEqual([]);
  });
});
