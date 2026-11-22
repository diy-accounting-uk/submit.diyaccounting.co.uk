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

  it("every placeholder in a script string is one siteText fills: lowercase letters only", () => {
    const unfilled = scriptStrings()
      .filter(({ source }) => /\{[^}]*[^a-z}][^}]*\}/.test(source))
      .map(({ id, source }) => `${id}: ${source}`);
    expect(unfilled).toEqual([]);
  });

  it("a fragment a script joins to a value keeps the spaces its Welsh entry states, and a whole sentence loses them", async () => {
    const catalogue = {
      strings: {
        "x.return-word": { cy: "Ffurflen " },
        "x.is": { cy: ": " },
        "x.sentence": { cy: "Elw gros. " },
      },
    };
    const scripts = [
      { id: "x.return-word", source: "Return ", file: "x.js" },
      { id: "x.is", source: " is ", file: "x.js" },
      { id: "x.sentence", source: "Gross profit.", file: "x.js" },
    ];
    const built = await renderWelshText(catalogue, scripts, []);
    expect(built).toContain('"x.return-word": "Ffurflen "');
    expect(built).toContain('"x.is": ": "');
    expect(built).toContain('"x.sentence": "Elw gros."');
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
      /<script src="(\/|(\.\.\/)+)lib\/welsh-text\.js"><\/script>\s*<script src="(\/|(\.\.\/)+)widgets\/page-chrome\.js"><\/script>/,
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

  it("links a page that has a Welsh copy at that copy, unless the link says it opens the English", () => {
    const welshCopies = new Set(WELSH_PAGES.map((other) => other.en));
    const english = [];
    for (const [tag, url] of welsh.matchAll(/<a\s[^>]*href="([^"]*)"[^>]*>/g)) {
      if (url === "" || /^(#|\$\{|[a-z][a-z0-9+.-]*:)/i.test(url)) continue;
      if (/\shreflang="en(-GB)?"/.test(tag)) continue;
      const bare = url.replace(/[?#].*$/, "");
      const resolved = bare.startsWith("/") ? bare.slice(1) : path.posix.join(path.posix.dirname(page.cy), bare);
      const file = resolved === "" || resolved.endsWith("/") ? `${resolved}index.html` : resolved;
      if (!file.startsWith("cy/") && welshCopies.has(file)) english.push(url);
    }
    expect(english).toEqual([]);
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

  it("carries HMRC's Welsh services block where Submit sends the reader to HMRC, and none on a Companies House page", () => {
    const block = welsh.match(/<aside class="welsh-services"[^>]*data-welsh-services[^>]*>([\s\S]*?)<\/aside>/);
    if (page.id.startsWith("ch-")) {
      expect(block).toBeNull();
      expect(welsh).not.toContain("Gwasanaethau Cymraeg CThEF");
      return;
    }
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

describe("Welsh spreadsheets page", () => {
  it("marks each customer review, quoted in its English words, as English", () => {
    const html = read("cy/spreadsheets.html");
    const reviews = html.slice(html.indexOf('<div class="reviews-quotes">'), html.indexOf('<div class="products">'));
    const quotes = [...reviews.matchAll(/<blockquote\b([^>]*)>/g)];
    expect(quotes.length).toBeGreaterThan(0);
    quotes.forEach(([, attributes]) => expect(attributes).toContain('lang="en"'));
  });
});

describe("The list of the site's Welsh services", () => {
  const linkedFiles = (html, from) =>
    [...html.matchAll(/<a\s[^>]*href="([^"]+)"/g)]
      .map((match) => match[1])
      .filter((href) => !/^[a-z][a-z0-9+.-]*:/i.test(href))
      .map((href) => path.posix.join(path.posix.dirname(from), href));
  const welshCopies = WELSH_PAGES.map((page) => page.cy);
  const section = (html, pattern) => (html.match(pattern)?.[1] ?? "").replace(/\s+/g, " ");

  const welshList = section(read("cy/index.html"), /<section class="welsh-offer"[^>]*data-welsh-offer[^>]*>([\s\S]*?)<\/section>/);
  const englishList = section(read("about.html"), /<section class="about-welsh"[^>]*>([\s\S]*?)<\/section>/);

  it("is on the Welsh home page, in Welsh, and links only Welsh copies", () => {
    expect(welshList).toContain("Submit yn Gymraeg");
    const files = linkedFiles(welshList, "cy/index.html");
    expect(files.length).toBeGreaterThan(20);
    for (const file of files) expect(welshCopies, file).toContain(file);
  });

  it("is on the About page in English and links the same Welsh copies, with the home page", () => {
    const files = linkedFiles(englishList, "about.html");
    expect(files.sort()).toEqual([...linkedFiles(welshList, "cy/index.html"), "cy/index.html"].sort());
    for (const [link] of englishList.matchAll(/<a\s[^>]*href="cy\/[^>]*>/g)) expect(link).toContain('hreflang="cy"');
  });

  it("says in both languages that a message in Welsh gets its reply in English for now", () => {
    expect(welshList).toContain("Rydym yn ateb yn Saesneg am y tro.");
    expect(englishList).toContain("We reply in English for");
    const welshLine = englishList
      .match(/<span lang="cy"\s*>([\s\S]*?)<\/span\s*>/)?.[1]
      .replace(/\s+/g, " ")
      .trim();
    expect(welshLine).toBe("Gallwch ysgrifennu atom yn Gymraeg. Rydym yn ateb yn Saesneg am y tro.");
  });

  it("is on no other Welsh page", () => {
    for (const page of WELSH_PAGES.filter((entry) => entry.id !== "index"))
      expect(read(page.cy), page.cy).not.toContain("data-welsh-offer");
  });
});
