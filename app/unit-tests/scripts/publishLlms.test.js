// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/publishLlms.test.js

import { describe, test, expect } from "vitest";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import TOML from "@iarna/toml";
import { isActivityListedInEnvironment, parseCatalog } from "../../services/productCatalog.js";
import {
  addMarkdownAlternateLink,
  filingActivityNames,
  listedFaqs,
  pageFileOf,
  pageMarkdown,
  publishLlms,
  sitemapUrls,
} from "../../../scripts/publish-llms.mjs";

const ORIGIN = "https://submit.diyaccounting.co.uk";
const CATALOG_TEXT = readFileSync("web/public/submit.catalogue.toml", "utf8");
const CATALOG = parseCatalog(CATALOG_TEXT);
const FAQS = TOML.parse(readFileSync("web/public/faqs.toml", "utf8")).faq;

function pageHtml(title, mainContent) {
  return `<!doctype html>
<html lang="en-GB">
  <head>
    <title>${title}</title>
    <meta name="description" content="${title} description." />
    <meta property="og:site_name" content="DIY Accounting" />
    <script>window.shouldNotAppear = true;</script>
    <!--script async src="./commented-out.js"></script-->
  </head>
  <body>
    <header><a href="#mainContent">Skip to content</a></header>
    <main id="mainContent">
      ${mainContent}
    </main>
    <script>window.alsoHidden = true;</script>
  </body>
</html>
`;
}

const PAGES = {
  "index.html": pageHtml(
    "Home",
    '<h1>File <strong>VAT</strong></h1><p>Intro with a <a href="about.html">link</a>.<br />Second line.</p><ul><li>One</li><li>Two<ul><li>Nested</li></ul></li></ul>',
  ),
  "about.html": pageHtml("About", "<h1>About</h1><p>Text.</p><!-- a comment --><script>var hidden = 1;</script>"),
  "later.html": pageHtml("Later page", "<h1>Later</h1><p>A page that a later change adds.</p>"),
  "unlisted.html": pageHtml("Unlisted", "<h1>Unlisted</h1><p>Not in the sitemap.</p>"),
};

function sitemap(pages) {
  const entries = pages.map((page) => `  <url>\n    <loc>${ORIGIN}/${page === "index.html" ? "" : page}</loc>\n  </url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join("\n")}\n</urlset>\n`;
}

function withWebRoot(listedPages, action) {
  const webRoot = mkdtempSync(join(tmpdir(), "publish-llms-"));
  try {
    for (const [file, html] of Object.entries(PAGES)) writeFileSync(join(webRoot, file), html);
    writeFileSync(join(webRoot, "sitemap.xml"), sitemap(listedPages));
    copyFileSync("web/public/submit.catalogue.toml", join(webRoot, "submit.catalogue.toml"));
    copyFileSync("web/public/faqs.toml", join(webRoot, "faqs.toml"));
    return action(webRoot);
  } finally {
    rmSync(webRoot, { recursive: true, force: true });
  }
}

function read(webRoot, file) {
  return readFileSync(join(webRoot, file), "utf8");
}

const HTML_MARKUP = /<[a-zA-Z/!]|<!--|<script/;

describe("publish-llms files", () => {
  test("writes llms.txt, llms-full.txt and a Markdown copy of each listed page", () => {
    withWebRoot(["index.html", "about.html", "later.html"], (webRoot) => {
      expect(publishLlms(webRoot, "prod")).toBe(3);
      for (const file of ["llms.txt", "llms-full.txt", "index.html.md", "about.html.md", "later.html.md"]) {
        expect(existsSync(join(webRoot, file)), file).toBe(true);
      }
    });
  });

  test("llms.txt links every sitemap URL with its description", () => {
    withWebRoot(["index.html", "about.html", "later.html"], (webRoot) => {
      publishLlms(webRoot, "prod");
      const llms = read(webRoot, "llms.txt");
      for (const url of sitemapUrls(read(webRoot, "sitemap.xml"))) expect(llms).toContain(`](${url})`);
      expect(llms).toContain("- [Later page](https://submit.diyaccounting.co.uk/later.html): Later page description.");
      expect(llms.startsWith("# DIY Accounting Submit\n\n> ")).toBe(true);
    });
  });

  test("no output holds an HTML tag, a script or a comment", () => {
    withWebRoot(["index.html", "about.html", "later.html"], (webRoot) => {
      publishLlms(webRoot, "ci");
      for (const file of ["llms.txt", "llms-full.txt", "index.html.md", "about.html.md", "later.html.md"]) {
        const text = read(webRoot, file);
        expect(text, file).not.toMatch(HTML_MARKUP);
        expect(text, file).not.toContain("shouldNotAppear");
        expect(text, file).not.toContain("alsoHidden");
        expect(text, file).not.toContain("commented-out");
      }
    });
  });

  test("the Markdown copy keeps headings, emphasis, links and nested list items", () => {
    withWebRoot(["index.html"], (webRoot) => {
      publishLlms(webRoot, "prod");
      const markdown = read(webRoot, "index.html.md");
      expect(markdown).toContain("# Home\n\nSource: https://submit.diyaccounting.co.uk/\n\n# File **VAT**");
      expect(markdown).toContain("Intro with a [link](https://submit.diyaccounting.co.uk/about.html).\nSecond line.");
      expect(markdown).toContain("- One\n- Two\n  - Nested");
    });
  });

  test("llms-full.txt holds every page and then the FAQ entries the environment lists", () => {
    withWebRoot(["index.html", "about.html"], (webRoot) => {
      publishLlms(webRoot, "prod");
      const full = read(webRoot, "llms-full.txt");
      expect(full).toContain("# Home\n");
      expect(full).toContain("# About\n");
      const faqSection = full.slice(full.indexOf("# Frequently asked questions"));
      for (const faq of listedFaqs(FAQS, CATALOG, "prod")) expect(faqSection).toContain(`## ${faq.question}`);
    });
  });
});

describe("publish-llms alternate link", () => {
  test("a page gets the link once and a second run adds nothing", () => {
    withWebRoot(["index.html", "about.html"], (webRoot) => {
      publishLlms(webRoot, "prod");
      const once = read(webRoot, "about.html");
      expect(once.match(/type="text\/markdown"/g)).toHaveLength(1);
      expect(once).toContain('<link rel="alternate" type="text/markdown" href="/about.html.md" />\n  </head>');
      publishLlms(webRoot, "prod");
      expect(read(webRoot, "about.html")).toBe(once);
    });
  });

  test("the home page links index.html.md", () => {
    withWebRoot(["index.html"], (webRoot) => {
      publishLlms(webRoot, "prod");
      expect(read(webRoot, "index.html")).toContain('href="/index.html.md"');
    });
  });

  test("a page without a head is an error", () => {
    expect(() => addMarkdownAlternateLink("<p>No head</p>", "x.html")).toThrow("has no </head>");
  });
});

describe("publish-llms environments", () => {
  test("a page the sitemap does not list gets no Markdown copy and no link", () => {
    withWebRoot(["index.html", "about.html"], (webRoot) => {
      publishLlms(webRoot, "prod");
      expect(existsSync(join(webRoot, "unlisted.html.md"))).toBe(false);
      expect(existsSync(join(webRoot, "later.html.md"))).toBe(false);
      expect(read(webRoot, "unlisted.html")).toBe(PAGES["unlisted.html"]);
      expect(read(webRoot, "llms.txt")).not.toContain("unlisted.html");
    });
  });

  test("a prod run names no activity or FAQ entry that prod does not list", () => {
    const unlisted = CATALOG.activities.filter((activity) => !isActivityListedInEnvironment(activity, "prod"));
    expect(unlisted.length).toBeGreaterThan(0);
    withWebRoot(["index.html"], (webRoot) => {
      publishLlms(webRoot, "prod");
      const text = `${read(webRoot, "llms.txt")}\n${read(webRoot, "llms-full.txt")}`;
      for (const activity of unlisted) expect(text, activity.id).not.toContain(activity.name);
      const hiddenFaqs = FAQS.filter((faq) => faq.activity && unlisted.some((activity) => activity.id === faq.activity));
      for (const faq of hiddenFaqs) expect(text, faq.id).not.toContain(faq.question);
    });
  });

  test("ci names the activities that only ci lists and prod does not", () => {
    const names = filingActivityNames(CATALOG, "ci").filter((name) => !filingActivityNames(CATALOG, "prod").includes(name));
    expect(names.length).toBeGreaterThan(0);
    withWebRoot(["index.html"], (webRoot) => {
      publishLlms(webRoot, "ci");
      for (const name of names) expect(read(webRoot, "llms.txt")).toContain(name);
    });
  });

  test("the paragraph names each listed bundle's price from the catalogue", () => {
    withWebRoot(["index.html"], (webRoot) => {
      publishLlms(webRoot, "prod");
      expect(read(webRoot, "llms.txt")).toContain("Resident VAT: £9.99 a year or £0.99 a month.");
      expect(read(webRoot, "llms.txt")).toContain("Day pass: Free.");
    });
  });
});

describe("publish-llms helpers", () => {
  test("a sitemap URL maps to its page file", () => {
    expect(pageFileOf(`${ORIGIN}/`)).toBe("index.html");
    expect(pageFileOf(`${ORIGIN}/cy/index.html`)).toBe("cy/index.html");
  });

  test("a page with no main element is an error", () => {
    expect(() => pageMarkdown("<html><body><p>x</p></body></html>", `${ORIGIN}/x.html`)).toThrow("no <main>");
  });

  test("keeps a link to a page, a mailbox or a phone number, and leaves only the text of any other scheme", () => {
    const links = [
      "/a.html",
      "mailto:x@example.com",
      "tel:+441234567890",
      "javascript:alert(1)",
      "data:text/html,x",
      "vbscript:x",
      "JaVaScRiPt:alert(1)",
    ];
    const body = links.map((href, index) => `<p><a href="${href}">L${index}</a></p>`).join("");
    const markdown = pageMarkdown(`<html><body><main>${body}</main></body></html>`, `${ORIGIN}/x.html`);
    expect(markdown).toContain(`[L0](${ORIGIN}/a.html)`);
    expect(markdown).toContain("[L1](mailto:x@example.com)");
    expect(markdown).toContain("[L2](tel:+441234567890)");
    for (const label of ["L3", "L4", "L5", "L6"]) {
      expect(markdown).toContain(label);
      expect(markdown).not.toContain(`[${label}]`);
    }
  });

  test("a Markdown copy beside a nested page lands in that page's folder", () => {
    const webRoot = mkdtempSync(join(tmpdir(), "publish-llms-nested-"));
    try {
      mkdirSync(join(webRoot, "cy"));
      writeFileSync(join(webRoot, "cy", "index.html"), pageHtml("Cymraeg", "<h1>Croeso</h1>"));
      writeFileSync(join(webRoot, "sitemap.xml"), sitemap(["cy/index.html"]));
      copyFileSync("web/public/submit.catalogue.toml", join(webRoot, "submit.catalogue.toml"));
      copyFileSync("web/public/faqs.toml", join(webRoot, "faqs.toml"));
      publishLlms(webRoot, "prod");
      expect(read(webRoot, "cy/index.html.md")).toContain("# Croeso");
      expect(read(webRoot, "cy/index.html")).toContain('href="/cy/index.html.md"');
    } finally {
      rmSync(webRoot, { recursive: true, force: true });
    }
  });
});
