// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  GUIDE_PAGE_PATH,
  HELP_PAGE_PATH,
  loadCatalog,
  loadFaqs,
  loadManifest,
  renderGuideJourneys,
  renderGuidePage,
  renderHelpPage,
} from "../../scripts/build-static-content.mjs";
import { renderFaqMarkdown } from "../public/lib/faq-markdown.js";

const catalog = loadCatalog();

describe("the help page", () => {
  test("the committed page equals what the build script renders", async () => {
    expect(readFileSync(HELP_PAGE_PATH, "utf8")).toBe(await renderHelpPage());
  }, 30000);

  test("each FAQ entry that prod lists is a heading with its answer in the HTML", () => {
    const html = readFileSync(HELP_PAGE_PATH, "utf8");
    const listed = loadFaqs().filter((faq) => !faq.activity || faq.activity === "file-confirmation-statement");
    expect(listed.length).toBeGreaterThan(25);
    for (const faq of listed) {
      expect(html).toContain(`data-id="${faq.id}"`);
      expect(html).toContain(faq.question.replace(/&/g, "&amp;"));
    }
  });

  test("an entry for an activity that prod does not list is not in the committed page", () => {
    const html = readFileSync(HELP_PAGE_PATH, "utf8");
    expect(html).not.toContain('data-id="company-tax-return-ct600"');
    expect(html).not.toContain('data-id="diya-gl-books"');
  });

  test("a numbered list, a bullet list and a table render as lists and a table", () => {
    const html = renderFaqMarkdown("Intro\n\n1. **One** first\n2. Two\n\n- a\n- b\n\n| H1 | H2 |\n|---|---|\n| x | y |");
    expect(html).toContain("<ol>\n<li><strong>One</strong> first</li>\n<li>Two</li>\n</ol>");
    expect(html).toContain("<ul>\n<li>a</li>\n<li>b</li>\n</ul>");
    expect(html).toContain(
      '<table class="faq-table"><thead><tr><th>H1</th><th>H2</th></tr></thead><tbody><tr><td>x</td><td>y</td></tr></tbody></table>',
    );
  });
});

describe("the guide page", () => {
  test("the committed page equals what the build script renders", async () => {
    expect(readFileSync(GUIDE_PAGE_PATH, "utf8")).toBe(await renderGuidePage());
  }, 60000);

  test("each screenshot is an image with alt text and each step has its caption", () => {
    const html = readFileSync(GUIDE_PAGE_PATH, "utf8");
    const images = (html.match(/<img\b[^>]*>/g) ?? []).filter((image) => image.includes("loading="));
    expect(images.length).toBeGreaterThan(100);
    for (const image of images) expect(image).toMatch(/alt="Screenshot: [^"]+"/);
    expect(html).toContain("Check what is due, file the return and look up what HMRC holds.");
  });

  test("a journey whose video names an activity that prod does not list is left out", () => {
    const manifest = loadManifest();
    const unlisted = manifest.videos.find((video) => video.catalogueActivity === "file-company-tax-return");
    expect(unlisted).toBeDefined();
    expect(renderGuideJourneys(manifest, catalog)).not.toContain(`id="${unlisted.id}"`);
  });
});
