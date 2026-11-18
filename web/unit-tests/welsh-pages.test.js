// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  PUBLIC_DIR,
  WELSH_PAGES,
  WELSH_TEXT_PATH,
  catalogueProblems,
  expectedAlternates,
  loadCatalogue,
  renderWelshPage,
  renderWelshText,
  scriptStrings,
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

describe("Welsh text of the site's scripts", () => {
  it("finds the chrome's strings in page-chrome.js", () => {
    const found = scriptStrings(["widgets/page-chrome.js"]);
    expect(found).toContainEqual({ id: "chrome.nav-tools", source: "Tools", file: "widgets/page-chrome.js" });
    expect(found).toContainEqual({ id: "chrome.sign-in", source: "Sign in", file: "widgets/page-chrome.js" });
  });

  it("reports a script string whose English changed as stale, and a new one as missing", () => {
    const scripts = [
      { id: "chrome.nav-tools", source: "Tools and guides", file: "x.js" },
      { id: "chrome.no-such-string", source: "Nothing", file: "x.js" },
    ];
    const problems = catalogueProblems(loadCatalogue(), WELSH_PAGES, [...scriptStrings(), ...scripts]);
    expect(problems).toContainEqual(expect.stringMatching(/^chrome\.nav-tools: used twice with different English text/));
    expect(problems).toContainEqual(expect.stringMatching(/^chrome\.no-such-string: missing/));
  });

  it("lib/welsh-text.js is the current build of the catalogue and lists every Welsh copy", async () => {
    const committed = fs.readFileSync(WELSH_TEXT_PATH, "utf-8");
    expect(committed).toBe(await renderWelshText());
    for (const page of WELSH_PAGES) expect(committed).toContain(`"${page.en}"`);
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

  it("loads the Welsh text before page-chrome.js", () => {
    expect(welsh).toMatch(
      /<script src="(\.\.\/)+lib\/welsh-text\.js"><\/script>\s*<script src="(\.\.\/)+widgets\/page-chrome\.js"><\/script>/,
    );
  });

  it("reaches a file with every relative link and script", () => {
    const missing = [];
    for (const [, url] of welsh.matchAll(/\s(?:href|src)="([^"]*)"/g)) {
      if (url === "" || /^(\/|#|\$\{|[a-z][a-z0-9+.-]*:)/i.test(url)) continue;
      const target = path.posix.join(path.posix.dirname(page.cy), url.replace(/[?#].*$/, ""));
      const file = target.endsWith("/") || url.replace(/[?#].*$/, "") === "" ? path.posix.join(target, "index.html") : target;
      if (!fs.existsSync(path.join(PUBLIC_DIR, file))) missing.push(url);
    }
    expect(missing).toEqual([]);
  });

  it("writes the line under each source quote in Welsh and keeps the quote's words marked English", () => {
    const blocks = [...welsh.matchAll(/<blockquote class="source-quote[^"]*"[^>]*>([\s\S]*?)<\/blockquote>/g)];
    for (const [block, inner] of blocks) {
      expect(block).not.toMatch(/<blockquote[^>]*\slang=/);
      for (const [paragraph] of inner.matchAll(/<p\b[^>]*>/g)) expect(paragraph).toContain('lang="en-GB"');
      const footer = inner.match(/<footer>([\s\S]*?)<\/footer>/);
      if (!footer) continue;
      const line = footer[1].replace(/\s+/g, " ");
      expect(line).toMatch(/^ ?Ffynhonnell: <a lang="en-GB" hreflang="en" /);
      expect(line).toMatch(
        /\(yn Saesneg\), gwiriwyd \d{1,2} (Ionawr|Chwefror|Mawrth|Ebrill|Mai|Mehefin|Gorffennaf|Awst|Medi|Hydref|Tachwedd|Rhagfyr) \d{4}/,
      );
      expect(line).not.toMatch(/Source:|\(checked/);
    }
  });

  it("reads its skip link in Welsh", () => {
    const links = [...welsh.matchAll(/<a [^>]*class="skip-link"[^>]*>([^<]*)<\/a>/g)].map((match) => match[1].trim());
    expect(links.length).toBeGreaterThan(0);
    for (const text of links) expect(text).toBe("Neidio i’r prif gynnwys");
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
    if (page.id.startsWith("vat-") || page.id === "receipts") expect(text).toMatch(/HMRC Assist .* yn Gymraeg/);
    else expect(text).not.toMatch(/HMRC Assist|Ffurflen TAW/);
  });

  it("leaves no English string marked for translation untranslated", () => {
    const catalogue = loadCatalogue();
    for (const match of welsh.matchAll(/data-i18n="([^"]+)"[^>]*>([\s\S]*?)<\//g)) {
      expect(catalogue.strings[match[1]], match[1]).toBeDefined();
    }
  });

  it("is listed in sitemap.xml with the same alternates when its English page is, and is left out when it is not", () => {
    const sitemap = read("sitemap.xml");
    if (!sitemap.includes(`<loc>${page.enUrl}</loc>`)) {
      expect(sitemap).not.toContain(`<loc>${welshUrl(page)}</loc>`);
      return;
    }
    for (const loc of [page.enUrl, welshUrl(page)]) {
      const entry = sitemap.match(new RegExp(`<url>\\s*<loc>${loc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</loc>([\\s\\S]*?)</url>`));
      expect(entry, loc).not.toBeNull();
      for (const { hreflang, href } of expectedAlternates(page)) {
        expect(entry[1]).toContain(`<xhtml:link rel="alternate" hreflang="${hreflang}" href="${href}" />`);
      }
    }
  });
});
