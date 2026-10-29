// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { availabilityStatus } from "../../../scripts/build-mtd-calendar.mjs";

const read = (file) => readFileSync(new URL(`../../../${file}`, import.meta.url), "utf8");
const publish = JSON.parse(read("videos/publish.json"));
const STATUS_WORDS = ["production", "sandbox", "preview"];
const shown = publish.videos.filter((video) => video.activity);

describe("published video status words", () => {
  test("the manifest copy equals videos/publish.json", () => {
    expect(read("web/public/videos/publish.json")).toBe(read("videos/publish.json"));
  });

  test("some published videos name the activity they show", () => {
    expect(shown.length).toBeGreaterThan(0);
  });

  test.each(shown.map((video) => [video.id, video]))("%s: the activity has a row in the availability table", (_id, video) => {
    expect(availabilityStatus(video.activity), `${video.id} shows ${video.activity}`).toBeDefined();
  });

  test.each(shown.map((video) => [video.id, video]))("%s: the title carries the table's status word", (_id, video) => {
    const status = availabilityStatus(video.activity);
    const titleWords = STATUS_WORDS.filter((word) => video.title.toLowerCase().includes(word));
    expect(titleWords).toEqual(status === "production" ? [] : [status]);
    if (status !== "production") expect(video.title.endsWith(`(${status})`)).toBe(true);
  });

  test.each(shown.map((video) => [video.id, video]))("%s: the description's status sentence uses the table's status word", (_id, video) => {
    const status = availabilityStatus(video.activity);
    const sentence = video.description.match(/This is an? (\w+)/);
    if (sentence) expect(sentence[1]).toBe(status);
    expect(video.description).not.toMatch(/sandbox preview/i);
  });

  test("no title or description says coming soon or Resident ITSA", () => {
    for (const video of publish.videos) {
      expect(`${video.title} ${video.description}`).not.toMatch(/coming soon|Resident ITSA/i);
    }
  });
});
