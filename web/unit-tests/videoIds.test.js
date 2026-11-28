// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/videoIds.test.js

import { describe, test, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { AVAILABILITY, publishedVideoId } from "../../scripts/build-mtd-calendar.mjs";

const PUBLIC_DIR = path.join(process.cwd(), "web/public");
const publish = JSON.parse(readFileSync(path.join(PUBLIC_DIR, "videos/publish.json"), "utf-8"));
const publishedIds = new Set(publish.videos.filter((video) => video.publish && video.videoId).map((video) => video.videoId));

// A YouTube id in a watch, embed, shorts or youtu.be link.
const YOUTUBE_ID = /(?:youtube(?:-nocookie)?\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/g;

function filesUnder(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : filesUnder(full);
    return /\.(html|js)$/.test(entry.name) && !/\.bundle\.js$/.test(entry.name) ? [full] : [];
  });
}

describe("the videos the site links", () => {
  test("every YouTube id a page or the Welsh text names is a published video in publish.json", () => {
    const sources = [...filesUnder(PUBLIC_DIR), path.join(process.cwd(), "i18n/cy.toml")];
    const unpublished = sources.flatMap((file) =>
      [...readFileSync(file, "utf-8").matchAll(YOUTUBE_ID)]
        .map(([, id]) => id)
        .filter((id) => !publishedIds.has(id))
        .map((id) => `${path.relative(process.cwd(), file)}: ${id}`),
    );
    expect(unpublished).toEqual([]);
  });

  test("each calendar row with a video names a published entry of publish.json", () => {
    for (const row of AVAILABILITY.filter((each) => each.videoEntry)) {
      expect(publishedIds.has(publishedVideoId(row.videoEntry)), row.filing).toBe(true);
    }
  });

  test("an entry that is not published, or has no YouTube id, stops the build", () => {
    const videos = [
      { id: "draft", publish: false, videoId: "abcdefghijk" },
      { id: "not-uploaded", publish: true, videoId: null },
    ];
    expect(() => publishedVideoId("draft", { videos })).toThrow(/no published video draft/);
    expect(() => publishedVideoId("not-uploaded", { videos })).toThrow(/no published video not-uploaded/);
    expect(() => publishedVideoId("absent", { videos })).toThrow(/no published video absent/);
  });
});
