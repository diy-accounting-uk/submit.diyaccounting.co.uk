// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, vi } from "vitest";
import {
  findStepStill,
  stepStillName,
  writeCardFreeStill,
  HEADLINE_CARD_ATTRIBUTE,
  CHAPTER_LABEL_ATTRIBUTE,
} from "../../../scripts/lib/video/stepStill.js";
import { seekArgs } from "../../../scripts/video-walkthrough.js";

describe("findStepStill", () => {
  const dir = "/rec/stills";
  const has = (...names) => {
    const files = new Set(names.map((name) => path.join(dir, name)));
    return (file) => files.has(file);
  };

  it("uses the still of the step for a frame of one step", () => {
    const found = findStepStill(dir, { scene: "claims", step: 4 }, 9, has(stepStillName("claims", 4), stepStillName("claims", 8)));
    expect(found).toBe(path.join(dir, "step-claims-4.png"));
  });

  it("returns null when the step has no still, so the cutter samples the recording", () => {
    expect(findStepStill(dir, { scene: "claims", step: 4 }, 9, has(stepStillName("claims", 5)))).toBeNull();
  });

  it("uses the still of the last step that has one for a frame of a whole scene", () => {
    const found = findStepStill(dir, { scene: "result" }, 4, has(stepStillName("result", 0), stepStillName("result", 2)));
    expect(found).toBe(path.join(dir, "step-result-2.png"));
  });

  it("returns null for a scene with no still", () => {
    expect(findStepStill(dir, { scene: "result" }, 4, has())).toBeNull();
  });
});

describe("seekArgs", () => {
  it("seeks into a recording and leaves a still image alone", () => {
    expect(seekArgs(1500)).toEqual(["-ss", "1.500"]);
    expect(seekArgs(null)).toEqual([]);
  });
});

describe("writeCardFreeStill", () => {
  it("screenshots the page with the headline card and the chapter label hidden into the stills directory", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "step-still-"));
    const page = { screenshot: vi.fn().mockResolvedValue(undefined), evaluate: vi.fn().mockResolvedValue(undefined) };
    await writeCardFreeStill(page, path.join(dir, "stills"), "claims", 3);
    const [options] = page.screenshot.mock.calls[0];
    expect(options.path).toBe(path.join(dir, "stills", "step-claims-3.png"));
    expect(options.style).toContain(`[${HEADLINE_CARD_ATTRIBUTE}]`);
    expect(options.style).toContain(`[${CHAPTER_LABEL_ATTRIBUTE}]`);
    expect(options.style).toContain("visibility: hidden");
    expect(page.evaluate).toHaveBeenCalledTimes(2);
    expect(page.evaluate.mock.calls[0][1]).toContain(`[${HEADLINE_CARD_ATTRIBUTE}]`);
  });
});
