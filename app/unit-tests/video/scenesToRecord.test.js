// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/video/scenesToRecord.test.js

import { describe, test, expect } from "vitest";
import {
  scenesToRecord,
  publishableSceneIds,
  sceneAlreadyRecorded,
  sceneArtifactPrefix,
} from "../../../scripts/video-scenes-to-record.mjs";

const publishConfig = {
  videos: [
    { id: "view-obligations", publish: true },
    { id: "submit-return", publish: true },
    { id: "tour", publish: false },
  ],
};

describe("publishableSceneIds", () => {
  test("keeps only the ids marked publish: true", () => {
    expect(publishableSceneIds(publishConfig)).toEqual(new Set(["view-obligations", "submit-return"]));
  });

  test("returns an empty set for a publish config with no videos", () => {
    expect(publishableSceneIds({ videos: [] })).toEqual(new Set());
  });
});

describe("sceneAlreadyRecorded", () => {
  test("matches an artifact name for the scene against any environment suffix", () => {
    expect(sceneAlreadyRecorded("view-obligations", ["video-view-obligations-prod"])).toBe(true);
  });

  test("does not match an artifact name for a different scene", () => {
    expect(sceneAlreadyRecorded("view-obligations", ["video-view-return-prod"])).toBe(false);
  });

  test("returns false against an empty artifact list", () => {
    expect(sceneAlreadyRecorded("view-obligations", [])).toBe(false);
  });
});

describe("sceneArtifactPrefix", () => {
  test("builds the prefix video-capture.yml uploads artifacts under", () => {
    expect(sceneArtifactPrefix("view-obligations")).toBe("video-view-obligations-");
  });
});

describe("scenesToRecord", () => {
  test("keeps a touched scene publish.json marks publish: true with nothing recorded yet", () => {
    expect(scenesToRecord(["view-obligations"], publishConfig, [])).toEqual(["view-obligations"]);
  });

  test("drops a touched scene publish.json marks publish: false", () => {
    expect(scenesToRecord(["tour"], publishConfig, [])).toEqual([]);
  });

  test("drops a touched scene publish.json does not list at all", () => {
    expect(scenesToRecord(["view-liabilities"], publishConfig, [])).toEqual([]);
  });

  test("drops a touched scene already recorded within the lookback window", () => {
    expect(scenesToRecord(["view-obligations", "submit-return"], publishConfig, ["video-view-obligations-prod"])).toEqual([
      "submit-return",
    ]);
  });

  test("keeps scenes in the order they were given", () => {
    expect(scenesToRecord(["submit-return", "view-obligations"], publishConfig, [])).toEqual(["submit-return", "view-obligations"]);
  });

  test("returns nothing for an empty touched list", () => {
    expect(scenesToRecord([], publishConfig, [])).toEqual([]);
  });
});
