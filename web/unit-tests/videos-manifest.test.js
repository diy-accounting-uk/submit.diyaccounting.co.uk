// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// videos.html reads web/public/videos/publish.json, a copy of videos/publish.json made by
// `npm run videos:manifest`. The copy must match the source, and every entry the page will
// embed must carry what the page renders.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SOURCE_PATH, TARGET_PATH } from "../../scripts/copy-videos-manifest.js";

const WIDGET_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "../public/widgets/video-pages.js");

function areaPageGroups() {
  const widgetSource = fs.readFileSync(WIDGET_PATH, "utf8");
  const areaPagesBlock = widgetSource.match(/const AREA_PAGES = \{([\s\S]*?)\};/)[1];
  return [...areaPagesBlock.matchAll(/"([a-z-]+)":/g)].map((m) => m[1]);
}

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
      expect(typeof video.group).toBe("string");
      expect(video.group.length).toBeGreaterThan(0);
    }
  });

  it("every entry with a videoId has a group with an area page to render on", () => {
    const { videos } = JSON.parse(fs.readFileSync(SOURCE_PATH, "utf8"));
    const knownGroups = areaPageGroups();
    for (const video of videos.filter((v) => v.videoId)) {
      expect(
        knownGroups,
        `"${video.id}" has group "${video.group}", missing from AREA_PAGES in web/public/widgets/video-pages.js`,
      ).toContain(video.group);
    }
  });
});
