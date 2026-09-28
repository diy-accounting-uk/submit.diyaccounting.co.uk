// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/videos.browser.test.js
// videos.html is the index: the full table of contents plus the four featured videos, each
// under an anchor that resolves, with a youtube-nocookie embed and a share link. Each area page
// (videos-hmrc-vat.html, videos-hmrc-itsa.html, videos-account.html, videos-ch.html) carries
// every video of its own group, plus the same full contents. A hash on the index naming a
// video that is published but not featured there redirects to that video's area page. And
// about.html carries the button that leads to the index.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { AREA_PAGES, FEATURED_IDS } from "../public/widgets/video-pages.js";

const PUBLIC_ROOT = path.join(process.cwd(), "web/public");
const MANIFEST = JSON.parse(fs.readFileSync(path.join(process.cwd(), "videos/publish.json"), "utf8"));
const EMBEDDED = MANIFEST.videos.filter((v) => v.videoId);
const FEATURED = EMBEDDED.filter((v) => FEATURED_IDS.includes(v.id));

function areaLinkHref(video) {
  return `${AREA_PAGES[video.group]}#${video.id}`;
}

const CONTENT_TYPES = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".toml": "text/x-toml",
  ".txt": "text/plain",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

// Serves the real static site from disk; YouTube's embed frames answer with an empty document.
async function serveRealSite(page) {
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "localhost") {
      const isFrame = route.request().resourceType() === "document";
      await route.fulfill({
        status: 200,
        contentType: isFrame ? "text/html" : "application/javascript",
        body: isFrame ? "<!doctype html><title>embed</title>" : "",
      });
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      return;
    }
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === "/") pathname = "/index.html";
    const filePath = path.join(PUBLIC_ROOT, pathname);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath);
      await route.fulfill({ status: 200, contentType: CONTENT_TYPES[ext] || "application/octet-stream", body: fs.readFileSync(filePath) });
    } else {
      await route.fulfill({ status: 404, contentType: "text/plain", body: "Not found" });
    }
  });
}

async function assertSections(page, videos) {
  const sections = page.locator("section.video-section");
  await expect(sections).toHaveCount(videos.length);

  for (const video of videos) {
    const section = page.locator(`section.video-section#${video.id}`);
    await expect(section).toHaveCount(1);
    await expect(section.locator("h2")).toHaveText(video.title);
    await expect(section.locator("iframe")).toHaveAttribute("src", `https://www.youtube-nocookie.com/embed/${video.videoId}`);
    await expect(section.locator("a.video-link")).toHaveAttribute("href", areaLinkHref(video));
    await expect(section.locator("button.copy-link")).toBeEnabled();
  }
}

// The full contents nav lists every published video once, each link naming its own area page.
async function assertFullContents(page) {
  const contentLinks = page.locator("#videoContents a");
  await expect(contentLinks).toHaveCount(EMBEDDED.length);

  const hrefs = await contentLinks.evaluateAll((els) => els.map((el) => el.getAttribute("href")));
  const expectedHrefs = EMBEDDED.map(areaLinkHref);
  for (const href of hrefs) {
    expect(expectedHrefs).toContain(href);
  }
}

test.describe("videos.html (index)", () => {
  test("shows only the four featured videos, each with an embed, a resolving link and a share button", async ({ page }) => {
    await serveRealSite(page);
    await page.goto("http://localhost:3000/videos.html", { waitUntil: "domcontentloaded" });
    await assertSections(page, FEATURED);
  });

  test("shows the full contents, one link per published video, pointing to its own area page", async ({ page }) => {
    await serveRealSite(page);
    await page.goto("http://localhost:3000/videos.html", { waitUntil: "domcontentloaded" });
    await assertFullContents(page);
  });

  test("a hash naming a featured video scrolls to its section", async ({ page }) => {
    await serveRealSite(page);
    const { id } = FEATURED[FEATURED.length - 1];
    await page.goto(`http://localhost:3000/videos.html#${id}`, { waitUntil: "domcontentloaded" });

    const section = page.locator(`section.video-section#${id}`);
    await expect(section).toBeVisible();
    await expect(section).toBeInViewport();
    expect(new URL(page.url()).pathname).toBe("/videos.html");
  });

  test("a hash naming a published but non-featured video redirects to that video's area page", async ({ page }) => {
    await serveRealSite(page);
    const video = EMBEDDED.find((v) => !FEATURED_IDS.includes(v.id));
    await page.goto(`http://localhost:3000/videos.html#${video.id}`, { waitUntil: "domcontentloaded" });
    await page.waitForURL(`**/${AREA_PAGES[video.group]}#${video.id}`);

    const section = page.locator(`section.video-section#${video.id}`);
    await expect(section).toBeVisible();
  });
});

test.describe("area pages", () => {
  for (const [group, areaPage] of Object.entries(AREA_PAGES)) {
    const groupVideos = EMBEDDED.filter((v) => v.group === group);

    test(`${areaPage} shows every "${group}" video, featured one included`, async ({ page }) => {
      await serveRealSite(page);
      await page.goto(`http://localhost:3000/${areaPage}`, { waitUntil: "domcontentloaded" });
      await assertSections(page, groupVideos);
    });

    test(`${areaPage} shows the same full contents as the index`, async ({ page }) => {
      await serveRealSite(page);
      await page.goto(`http://localhost:3000/${areaPage}`, { waitUntil: "domcontentloaded" });
      await assertFullContents(page);
    });
  }
});

test.describe("about.html", () => {
  test("carries the Watch the walkthroughs button linking to videos.html", async ({ page }) => {
    await serveRealSite(page);
    await page.goto("http://localhost:3000/about.html", { waitUntil: "domcontentloaded" });

    const button = page.locator("a.btn", { hasText: "Watch the walkthroughs" });
    await expect(button).toBeVisible();
    await expect(button).toHaveAttribute("href", "videos.html");
  });
});
