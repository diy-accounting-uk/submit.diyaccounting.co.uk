// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/content-activities.test.js
// Every activity id that site content names exists in the catalogue.

import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import TOML from "@iarna/toml";

const catalogIds = new Set(TOML.parse(readFileSync("web/public/submit.catalogue.toml", "utf8")).activities.map((activity) => activity.id));

describe("content that names a catalogue activity", () => {
  test("every video names an activity the catalogue has", () => {
    const manifest = JSON.parse(readFileSync("videos/publish.json", "utf8"));
    const named = manifest.videos.filter((video) => video.catalogueActivity).map((video) => video.catalogueActivity);
    expect(named.length).toBeGreaterThan(0);
    expect(named.filter((id) => !catalogIds.has(id))).toEqual([]);
  });

  test("every FAQ names an activity the catalogue has", () => {
    const faqs = TOML.parse(readFileSync("web/public/faqs.toml", "utf8")).faq;
    const named = faqs.filter((faq) => faq.activity).map((faq) => faq.activity);
    expect(named.length).toBeGreaterThan(0);
    expect(named.filter((id) => !catalogIds.has(id))).toEqual([]);
  });

  test("every tagged element on a page names an activity the catalogue has", () => {
    for (const page of ["mcp.html", "about.html", "help.html", "index.html", "guide.html"]) {
      const html = readFileSync(`web/public/${page}`, "utf8");
      const named = [...html.matchAll(/data-listed-activity="([^"]+)"/g)].map((match) => match[1]);
      expect(named.filter((id) => !catalogIds.has(id))).toEqual([]);
    }
  });
});
