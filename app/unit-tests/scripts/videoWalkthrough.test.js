// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { columnCropFilter, ensureArtifact, parseArgs, planWalkthrough, buildWalkthroughEntries, SETTLE_BACK_MS } from "../../../scripts/video-walkthrough.js";

function step(sceneId, stepIndex, startMs, endMs) {
  return { sceneId, stepIndex, startMs, endMs };
}

const script = {
  scenes: [
    {
      id: "intro",
      chapter: "Intro",
      fastForward: true,
      steps: [{ action: "goto", caption: "Skipped scene." }],
    },
    {
      id: "form",
      chapter: "The form",
      steps: [
        { action: "click", caption: "Open the form", headline: "Open" },
        { action: "hold" },
        { action: "type", caption: "Enter the number.", headline: "Enter" },
        { action: "point", caption: "Check it." },
      ],
    },
    { id: "silent", chapter: "Silent", steps: [{ action: "hold" }] },
    {
      id: "result",
      steps: [{ action: "caption", text: "Filed.", headline: "Done" }],
    },
  ],
};

const timeline = {
  steps: [
    step("intro", 0, 0, 1000),
    step("form", 0, 1000, 3500),
    step("form", 1, 3500, 4000),
    step("form", 2, 4000, 9100),
    step("form", 3, 9100, 12400),
    step("silent", 0, 12400, 13000),
    step("result", 0, 13000, 13200),
  ],
};

describe("planWalkthrough", () => {
  it("skips fast-forward scenes and scenes with no captioned step", () => {
    expect(planWalkthrough({ script, timeline }).map((p) => p.scene)).toEqual(["form", "result"]);
  });

  it("starts at the scene's first step, in whole seconds", () => {
    expect(planWalkthrough({ script, timeline })[0].startSeconds).toBe(1);
  });

  it("takes the frame a settle margin before the scene's last step ends", () => {
    expect(planWalkthrough({ script, timeline })[0].frameMs).toBe(12400 - SETTLE_BACK_MS);
  });

  it("keeps the frame inside a scene shorter than the settle margin", () => {
    const [, result] = planWalkthrough({ script, timeline });
    expect(result.frameMs).toBe(13000);
  });

  it("keeps the frame inside the recording", () => {
    const [form] = planWalkthrough({ script, timeline, videoDurationMs: 11000 });
    expect(form.frameMs).toBe(10999);
  });

  it("names the scene by its chapter, else its last captioned step's headline", () => {
    const plan = planWalkthrough({ script, timeline });
    expect(plan[0].headline).toBe("The form");
    expect(plan[1].headline).toBe("Done");
  });

  it("joins the last two captions as sentences", () => {
    const [form] = planWalkthrough({ script, timeline });
    expect(form.caption).toBe("Enter the number. Check it.");
  });

  it("throws when the script and the timeline disagree about a scene's steps", () => {
    const short = { steps: timeline.steps.filter((s) => !(s.sceneId === "form" && s.stepIndex === 3)) };
    expect(() => planWalkthrough({ script, timeline: short })).toThrow(/scene "form"/);
  });
});

describe("a scene with more than three captioned steps", () => {
  const longScript = {
    scenes: [
      {
        id: "long",
        chapter: "Long scene",
        steps: [
          { action: "click", caption: "One", headline: "Step one" },
          { action: "hold" },
          { action: "type", caption: "Two." },
          { action: "point", caption: "Two." },
          { action: "scroll", caption: "Four", headline: "Step four" },
          { action: "hold", caption: "Five", headline: "Step five" },
        ],
      },
    ],
  };
  const longTimeline = {
    steps: [
      step("long", 0, 0, 2000),
      step("long", 1, 2000, 2500),
      step("long", 2, 2500, 5000),
      step("long", 3, 5000, 7000),
      step("long", 4, 7000, 9000),
      step("long", 5, 9000, 9100),
    ],
  };

  it("gets one frame per captioned step, skipping a caption identical to the one before", () => {
    const plan = planWalkthrough({ script: longScript, timeline: longTimeline });
    expect(plan.map((p) => p.step)).toEqual([0, 2, 4, 5]);
  });

  it("takes each step's own headline, caption, start and settled frame", () => {
    const [first, second, , last] = planWalkthrough({ script: longScript, timeline: longTimeline });
    expect(first).toEqual({
      scene: "long",
      step: 0,
      headline: "Step one",
      caption: "One.",
      startSeconds: 0,
      frameMs: 2000 - SETTLE_BACK_MS,
    });
    expect(second.headline).toBe("Long scene");
    expect(second.startSeconds).toBe(2);
    expect(last.frameMs).toBe(9000);
  });

  it("names images and the manifest entry by scene and step", () => {
    const [entry] = buildWalkthroughEntries("demo", planWalkthrough({ script: longScript, timeline: longTimeline }));
    expect(entry).toMatchObject({ scene: "long", step: 0, thumb: "videos/demo/long-0-thumb.webp", full: "videos/demo/long-0.webp" });
  });
});

describe("buildWalkthroughEntries", () => {
  it("gives each scene the site paths of its thumbnail and full image", () => {
    const entries = buildWalkthroughEntries("demo", planWalkthrough({ script, timeline }));
    expect(entries[0]).toEqual({
      scene: "form",
      headline: "The form",
      caption: "Enter the number. Check it.",
      startSeconds: 1,
      thumb: "videos/demo/form-thumb.webp",
      full: "videos/demo/form.webp",
    });
  });
});

describe("parseArgs", () => {
  it("collects every --id", () => {
    expect(parseArgs(["--id", "a", "--id", "b"])).toEqual({ ids: ["a", "b"] });
  });

  it("rejects an unknown argument and a bare --id", () => {
    expect(() => parseArgs(["--x"])).toThrow(/Unknown argument/);
    expect(() => parseArgs(["--id"])).toThrow(/--id needs/);
  });
});

describe("ensureArtifact for a locally recorded entry", () => {
  it("uses the recording's own directory when the mp4 and timeline exist", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "walkthrough-"));
    fs.writeFileSync(path.join(dir, "local-one.mp4"), "");
    fs.writeFileSync(path.join(dir, "local-one.timeline.json"), "{}");
    expect(ensureArtifact({ id: "local-one", videoFile: path.join(dir, "local-one.mp4") })).toBe(dir);
  });

  it("throws when the local recording or its timeline is missing", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "walkthrough-"));
    fs.writeFileSync(path.join(dir, "local-one.mp4"), "");
    expect(() => ensureArtifact({ id: "local-one", videoFile: path.join(dir, "local-one.mp4") })).toThrow(/no local recording/);
  });
});

describe("columnCropFilter", () => {
  it("crops a submit-site recording to a centred content column", () => {
    expect(columnCropFilter({ viewport: { width: 1920, height: 1080 } })).toBe("crop=trunc(iw*1000/1920/2)*2:ih:(iw-trunc(iw*1000/1920/2)*2)/2:0,");
  });

  it("keeps the whole frame of a recording that targets another tool's page", () => {
    expect(columnCropFilter({ viewport: { width: 1920, height: 1080 }, localApp: { command: "x", url: "y", readyPattern: "z" } })).toBe("");
  });
});
