// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/video/finalCaptionTail.test.js

import fs from "fs";
import path from "path";
import { describe, test, expect } from "vitest";
import { checkFinalCaptionTail, estimateTimeline } from "../../../scripts/check-video-timings.js";

const videosDir = path.resolve("videos");
const sceneScripts = fs
  .readdirSync(videosDir)
  .filter((name) => name.endsWith(".json"))
  .map((name) => ({ name, script: JSON.parse(fs.readFileSync(path.join(videosDir, name), "utf8")) }))
  .filter(({ script }) => script.captions && Array.isArray(script.scenes));

const pacing = { perCharMs: 90, betweenActionsMs: 700, aroundMotionMs: 600 };
const captions = { charsPerSecond: 15, minMs: 1500 };

function scriptEndingOn(lastHoldMs, finalHoldMs) {
  return {
    pacing,
    captions,
    finalHoldMs,
    scenes: [
      {
        id: "end",
        steps: [
          { action: "click", target: "#go", caption: "A caption of forty characters or so, more." },
          { action: "hold", ms: lastHoldMs },
        ],
      },
    ],
  };
}

describe("the last caption's narration fits before the video ends", () => {
  test.each(sceneScripts.map(({ name, script }) => [name, script]))("%s", (name, script) => {
    expect(checkFinalCaptionTail(estimateTimeline(script), script)).toEqual([]);
  });

  test("a tail shorter than the narration plus two seconds fails", () => {
    const script = scriptEndingOn(500, 500);
    expect(checkFinalCaptionTail(estimateTimeline(script), script)).toHaveLength(1);
  });

  test("a tail that covers the narration plus two seconds passes", () => {
    const script = scriptEndingOn(500, 5000);
    expect(checkFinalCaptionTail(estimateTimeline(script), script)).toEqual([]);
  });
});
