// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/videos.browser.test.js
// videos.html lists every videos/publish.json entry that carries a videoId, one section per
// entry under an anchor that resolves, with a youtube-nocookie embed and a share link; and
// about.html carries the button that leads there.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";

const PUBLIC_ROOT = path.join(process.cwd(), "web/public");
const MANIFEST = JSON.parse(fs.readFileSync(path.join(process.cwd(), "videos/publish.json"), "utf8"));
const EMBEDDED = MANIFEST.videos.filter((v) => v.videoId);

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

test.describe("videos.html", () => {
  test("lists every published video with an embed, a resolving anchor and a share link", async ({ page }) => {
    await serveRealSite(page);
    await page.goto("http://localhost:3000/videos.html", { waitUntil: "domcontentloaded" });

    const sections = page.locator("section.video-section");
    await expect(sections).toHaveCount(EMBEDDED.length);

    for (const video of EMBEDDED) {
      const section = page.locator(`section.video-section#${video.id}`);
      await expect(section).toHaveCount(1);
      await expect(section.locator("h2")).toHaveText(video.title);
      await expect(section.locator("iframe")).toHaveAttribute("src", `https://www.youtube-nocookie.com/embed/${video.videoId}`);
      await expect(section.locator("a.video-link")).toHaveAttribute("href", `videos.html#${video.id}`);
      await expect(section.locator("button.copy-link")).toBeEnabled();
    }

    // Every share anchor points at an element on the page.
    const unresolved = await page.evaluate(() =>
      Array.from(document.querySelectorAll("a.video-link"))
        .map((a) => a.getAttribute("href").split("#")[1])
        .filter((id) => !document.getElementById(id)),
    );
    expect(unresolved).toEqual([]);
  });

  test("a deep link lands on its section", async ({ page }) => {
    await serveRealSite(page);
    const { id } = EMBEDDED[EMBEDDED.length - 1];
    await page.goto(`http://localhost:3000/videos.html#${id}`, { waitUntil: "domcontentloaded" });

    const section = page.locator(`section.video-section#${id}`);
    await expect(section).toBeVisible();
    await expect(section).toBeInViewport();
  });
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
