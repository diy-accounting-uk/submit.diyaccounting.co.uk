// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  PUBLIC_DIR,
  WELSH_PAGES,
  catalogueProblems,
  expectedAlternates,
  loadCatalogue,
  renderWelshPage,
  welshUrl,
} from "../../scripts/build-welsh-pages.mjs";

const read = (relativePath) => fs.readFileSync(path.join(PUBLIC_DIR, relativePath), "utf-8");
const alternateLink = ({ hreflang, href }) => `<link rel="alternate" hreflang="${hreflang}" href="${href}" />`;

describe("Welsh catalogue", () => {
  it("has a current Welsh entry for every marked English string and no unused entries", () => {
    expect(catalogueProblems()).toEqual([]);
  });

  it("reports an entry as stale when its English text changes", () => {
    const catalogue = loadCatalogue();
    const changed = structuredClone(catalogue);
    changed.strings["index.heading"].hash = "000000000000";
    expect(catalogueProblems(changed)).toEqual([expect.stringMatching(/^index\.heading: stale/)]);
  });

  it("reports a missing and an unused entry", () => {
    const changed = structuredClone(loadCatalogue());
    changed.strings["no.such.string"] = changed.strings["index.heading"];
    delete changed.strings["index.heading"];
    const problems = catalogueProblems(changed);
    expect(problems).toContainEqual(expect.stringMatching(/^index\.heading: missing/));
    expect(problems).toContainEqual(expect.stringMatching(/^no\.such\.string: unused/));
  });
});

describe.each(WELSH_PAGES)("Welsh page $cy", (page) => {
  const welsh = read(page.cy);
  const english = read(page.en);

  it("is the current build of its English page and the catalogue", async () => {
    expect(welsh).toBe(await renderWelshPage(page));
  });

  it('declares lang="cy"', () => {
    expect(welsh).toMatch(/<html lang="cy">/);
  });

  it("carries the en-GB, cy and x-default alternates, as its English page does", () => {
    for (const alternate of expectedAlternates(page)) {
      expect(welsh).toContain(alternateLink(alternate));
      expect(english).toContain(alternateLink(alternate));
    }
  });

  it("names itself as canonical", () => {
    expect(welsh).toContain(`<link rel="canonical" href="${welshUrl(page)}" />`);
  });

  it("carries HMRC's Welsh services block", () => {
    const block = welsh.match(/<aside class="welsh-services"[^>]*data-welsh-services[^>]*>([\s\S]*?)<\/aside>/);
    expect(block).not.toBeNull();
    const text = block[1].replace(/\s+/g, " ");
    expect(text).toContain("0300 200 1900");
    expect(text).toContain("0300 200 3705");
    expect(text).toMatch(/sgriniau a negeseuon ar-lein CThEF ar gael yn Gymraeg/);
    expect(text).toMatch(/HMRC Assist .* yn Gymraeg/);
  });

  it("leaves no English string marked for translation untranslated", () => {
    const catalogue = loadCatalogue();
    for (const match of welsh.matchAll(/data-i18n="([^"]+)"[^>]*>([\s\S]*?)<\//g)) {
      expect(catalogue.strings[match[1]], match[1]).toBeDefined();
    }
  });

  it("is listed in sitemap.xml with the same alternates", () => {
    const sitemap = read("sitemap.xml");
    for (const loc of [page.enUrl, welshUrl(page)]) {
      const entry = sitemap.match(new RegExp(`<url>\\s*<loc>${loc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</loc>([\\s\\S]*?)</url>`));
      expect(entry, loc).not.toBeNull();
      for (const { hreflang, href } of expectedAlternates(page)) {
        expect(entry[1]).toContain(`<xhtml:link rel="alternate" hreflang="${hreflang}" href="${href}" />`);
      }
    }
  });
});
