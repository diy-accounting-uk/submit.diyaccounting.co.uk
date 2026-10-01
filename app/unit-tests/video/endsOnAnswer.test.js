// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/video/endsOnAnswer.test.js

import fs from "fs";
import path from "path";
import { describe, test, expect } from "vitest";

// timer-check.json is a deliberately slow step that exercises the timer overlay; it has no answer to show.
const NO_ANSWER_SCRIPTS = new Set(["timer-check.json"]);

const videosDir = path.resolve("videos");
const sceneScripts = fs
  .readdirSync(videosDir)
  .filter((name) => name.endsWith(".json") && !NO_ANSWER_SCRIPTS.has(name))
  .map((name) => ({ name, script: JSON.parse(fs.readFileSync(path.join(videosDir, name), "utf8")) }))
  .filter(({ script }) => Array.isArray(script.scenes));

function stepsAfterLastAwait(script) {
  const steps = script.scenes.flatMap((scene) => scene.steps || []);
  const lastAwaitIndex = steps.map((step) => step.action).lastIndexOf("await");
  return lastAwaitIndex === -1 ? null : steps.slice(lastAwaitIndex + 1);
}

describe("scene script endings", () => {
  test.each(sceneScripts.map(({ name, script }) => [name, script]))(
    "%s: the last await is followed by a scroll or point to the answer",
    (name, script) => {
      const after = stepsAfterLastAwait(script);
      if (after === null) return;
      expect(after.some((step) => step.action === "scroll" || step.action === "point")).toBe(true);
    },
  );

  test("a script whose last await is followed only by a still and a hold is rejected", () => {
    const script = { scenes: [{ steps: [{ action: "await" }, { action: "still" }, { action: "hold", ms: 1200 }] }] };
    const after = stepsAfterLastAwait(script);
    expect(after.some((step) => step.action === "scroll" || step.action === "point")).toBe(false);
  });
});
