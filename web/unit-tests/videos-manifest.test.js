// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// videos.html reads web/public/videos/publish.json, a copy of videos/publish.json made by
// `npm run videos:manifest`. The copy must match the source, and every entry the page will
// embed must carry what the page renders.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { SOURCE_PATH, TARGET_PATH } from "../../scripts/copy-videos-manifest.js";

describe("videos manifest published to the site", () => {
  it("web/public/videos/publish.json is identical to videos/publish.json (run npm run videos:manifest)", () => {
    expect(fs.existsSync(TARGET_PATH)).toBe(true);
    expect(fs.readFileSync(TARGET_PATH, "utf8")).toBe(fs.readFileSync(SOURCE_PATH, "utf8"));
  });

  it("every entry with a videoId has a unique id, a title and a description", () => {
    const { videos } = JSON.parse(fs.readFileSync(SOURCE_PATH, "utf8"));
    const embedded = videos.filter((v) => v.videoId);
    expect(embedded.length).toBeGreaterThan(0);
    const ids = new Set();
    for (const video of embedded) {
      expect(video.id).toMatch(/^[a-z0-9-]+$/);
      expect(ids.has(video.id)).toBe(false);
      ids.add(video.id);
      expect(video.videoId).toMatch(/^[A-Za-z0-9_-]{11}$/);
      expect(typeof video.title).toBe("string");
      expect(video.title.length).toBeGreaterThan(0);
      expect(typeof video.description).toBe("string");
      expect(video.description.length).toBeGreaterThan(0);
    }
  });
});
