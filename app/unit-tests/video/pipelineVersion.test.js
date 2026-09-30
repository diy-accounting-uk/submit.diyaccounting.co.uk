// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/video/pipelineVersion.test.js

import { describe, test, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  PIPELINE_VERSION,
  buildCaptureManifest,
  findStaleEntries,
  manifestPathFor,
  readPipelineVersion,
  writeCaptureManifest,
} from "../../../scripts/lib/video/pipelineVersion.js";
import { buildDispatchArgs, formatStaleReport } from "../../../scripts/video-stale.js";

describe("findStaleEntries", () => {
  const list = {
    videos: [
      { id: "old", publish: true, pipelineVersion: 1 },
      { id: "current", publish: true, pipelineVersion: 5 },
      { id: "newer", publish: true, pipelineVersion: 6 },
      { id: "old-unpublished", publish: false, pipelineVersion: 1 },
    ],
  };

  test("lists the published entries below the current version, in list order", () => {
    expect(findStaleEntries(list, 5).map((entry) => entry.id)).toEqual(["old"]);
    expect(findStaleEntries(list, 6).map((entry) => entry.id)).toEqual(["old", "current"]);
  });

  test("lists nothing when every published entry is at or above the current version", () => {
    expect(findStaleEntries(list, 1)).toEqual([]);
  });

  test("ignores an entry that is not published", () => {
    expect(findStaleEntries(list, 99).map((entry) => entry.id)).not.toContain("old-unpublished");
  });

  test("throws naming a published entry that has no pipelineVersion", () => {
    const missing = {
      videos: [
        { id: "a", publish: true },
        { id: "b", publish: true, pipelineVersion: 2 },
        { id: "c", publish: true },
      ],
    };
    expect(() => findStaleEntries(missing, 3)).toThrow(/without a pipelineVersion: a, c/);
  });

  test("defaults to the pipeline's current version", () => {
    const atCurrent = { videos: [{ id: "a", publish: true, pipelineVersion: PIPELINE_VERSION }] };
    const behind = { videos: [{ id: "a", publish: true, pipelineVersion: PIPELINE_VERSION - 1 }] };
    expect(findStaleEntries(atCurrent)).toEqual([]);
    expect(findStaleEntries(behind)).toHaveLength(1);
  });
});

describe("capture manifest", () => {
  test("names the manifest beside the mp4", () => {
    expect(manifestPathFor("target/videos/video-tour-prod/tour.mp4")).toBe("target/videos/video-tour-prod/tour.manifest.json");
  });

  test("rejects a video file that is not an mp4", () => {
    expect(() => manifestPathFor("tour.webm")).toThrow(/not an .mp4/);
  });

  test("the version written at capture is the version read at publish", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pipeline-version-"));
    writeCaptureManifest(path.join(dir, "tour.manifest.json"), buildCaptureManifest({ scriptName: "tour", pipelineVersion: 7 }));
    expect(readPipelineVersion(path.join(dir, "tour.mp4"))).toBe(7);
  });

  test("a missing manifest throws", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pipeline-version-"));
    expect(() => readPipelineVersion(path.join(dir, "tour.mp4"))).toThrow(/manifest not found/);
  });

  test("a manifest without an integer version throws", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pipeline-version-"));
    fs.writeFileSync(path.join(dir, "tour.manifest.json"), JSON.stringify({ script: "tour" }));
    expect(() => readPipelineVersion(path.join(dir, "tour.mp4"))).toThrow(/no integer pipelineVersion/);
  });
});

describe("video:stale output", () => {
  const stale = [
    { id: "a", pipelineVersion: 1 },
    { id: "b", pipelineVersion: 2 },
  ];

  test("reports each stale entry with its recorded and current version", () => {
    expect(formatStaleReport(stale, 3).split("\n")).toEqual([
      "2 published video(s) below pipeline version 3:",
      "a\tv1\tcurrent v3",
      "b\tv2\tcurrent v3",
    ]);
  });

  test("reports that nothing is stale", () => {
    expect(formatStaleReport([], 3)).toBe("No published video is below pipeline version 3.");
  });

  test("dispatches the serial dispatcher with the stale ids as one space-separated input", () => {
    expect(buildDispatchArgs(stale)).toEqual(["workflow", "run", "video-capture-on-deploy.yml", "-f", "scripts=a b"]);
  });
});
