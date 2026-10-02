// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/videos.browser.test.js
// videos.html is the index: the full table of contents plus the four featured videos, each
// under an anchor that resolves, with a youtube-nocookie embed and a share link. Each area page
// (videos-hmrc-vat.html, videos-hmrc-itsa.html, videos-account.html, videos-ch.html,
// videos-accounting.html) carries every video of its own group, plus the same full contents, or
// says none is published yet when its group has nothing uploaded. A hash on the index naming a
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
  ".webp": "image/webp",
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

test.describe("videos-hmrc-itsa.html", () => {
  const itsaVideos = EMBEDDED.filter((v) => v.group === "itsa");

  test("embeds all ten itsa videos, each with its title and a caption track", async ({ page }) => {
    expect(itsaVideos).toHaveLength(10);
    await serveRealSite(page);
    await page.goto("http://localhost:3000/videos-hmrc-itsa.html", { waitUntil: "domcontentloaded" });
    await assertSections(page, itsaVideos);
    for (const video of itsaVideos) {
      expect(video.captionFile).toMatch(/\.vtt$/);
      await expect(page.locator(`section.video-section#${video.id} iframe`)).toHaveAttribute("title", video.title);
    }
  });
});

test.describe("relabelled and stripped titles", () => {
  const relabelled = EMBEDDED.find((v) => v.id === "itsa-quarterly-update");
  const stripped = EMBEDDED.find((v) => v.id === "change-registered-email");
  const contentsText = (video) => video.title.replace("DIY Accounting Submit: ", "");

  test("a video of a feature not yet on prod reads coming soon in its heading, iframe title and Contents link", async ({ page }) => {
    expect(relabelled.title).toMatch(/\(coming soon - sandbox example\)$/);
    await serveRealSite(page);
    await page.goto("http://localhost:3000/videos-hmrc-itsa.html", { waitUntil: "domcontentloaded" });
    const section = page.locator(`section.video-section#${relabelled.id}`);
    await expect(section.locator("h2")).toHaveText(relabelled.title);
    await expect(section.locator("iframe")).toHaveAttribute("title", relabelled.title);
    await expect(page.locator(`nav a[href$="#${relabelled.id}"]`).first()).toHaveText(contentsText(relabelled));
  });

  test("a video of a live feature carries no sandbox label in its heading, iframe title and Contents link", async ({ page }) => {
    expect(stripped.title).not.toMatch(/sandbox/i);
    await serveRealSite(page);
    await page.goto("http://localhost:3000/videos-ch.html", { waitUntil: "domcontentloaded" });
    const section = page.locator(`section.video-section#${stripped.id}`);
    await expect(section.locator("h2")).toHaveText(stripped.title);
    await expect(section.locator("iframe")).toHaveAttribute("title", stripped.title);
    await expect(page.locator(`nav a[href$="#${stripped.id}"]`).first()).toHaveText(contentsText(stripped));
  });
});

test.describe("videos-accounting.html", () => {
  const ACCOUNTING_URL = `http://localhost:3000/${AREA_PAGES.accounting}`;
  const accountingEntry = MANIFEST.videos.find((v) => v.group === "accounting");
  const uploaded = { ...accountingEntry, videoId: "AbCdEfGhIjK" };

  async function serveUploadedAccountingVideo(page) {
    await serveRealSite(page);
    const videos = MANIFEST.videos.map((v) => (v.id === uploaded.id ? uploaded : v));
    await page.route("**/videos/publish.json", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...MANIFEST, videos }) }),
    );
  }

  test("says no videos are published yet while the group has nothing uploaded", async ({ page }) => {
    await serveRealSite(page);
    const videos = MANIFEST.videos.map((v) => (v.group === "accounting" ? { ...v, videoId: null } : v));
    await page.route("**/videos/publish.json", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...MANIFEST, videos }) }),
    );
    await page.goto(ACCOUNTING_URL, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#videoList")).toHaveText("No videos are published yet.");
    await expect(page.locator("section.video-section")).toHaveCount(0);
    await expect(page.locator("#videoContents h3", { hasText: "How to do your accounts" })).toHaveCount(0);
  });

  test("shows an uploaded accounting video with its embed and share link", async ({ page }) => {
    await serveUploadedAccountingVideo(page);
    await page.goto(ACCOUNTING_URL, { waitUntil: "domcontentloaded" });
    await assertSections(page, [uploaded]);
  });

  test("lists an uploaded accounting video under its own heading, without the title prefix", async ({ page }) => {
    await serveUploadedAccountingVideo(page);
    await page.goto("http://localhost:3000/videos.html", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#videoContents h3", { hasText: "How to do your accounts" })).toHaveCount(1);
    const link = page.locator(`#videoContents a[href="${AREA_PAGES.accounting}#${uploaded.id}"]`);
    await expect(link).toHaveText(uploaded.title.replace("DIY Accounting: ", ""));
  });

  test("a hash on the index naming an accounting video redirects to the accounting page", async ({ page }) => {
    await serveUploadedAccountingVideo(page);
    await page.goto(`http://localhost:3000/videos.html#${uploaded.id}`, { waitUntil: "domcontentloaded" });
    await page.waitForURL(`**/${AREA_PAGES.accounting}#${uploaded.id}`);
    await expect(page.locator(`section.video-section#${uploaded.id}`)).toBeVisible();
  });
});

// The manifest served to the page: one non-featured video of the group carries a three-scene
// walkthrough, another carries none.
const WALKTHROUGH_GROUP = "account";
const WALKTHROUGH_VIDEOS = EMBEDDED.filter((v) => v.group === WALKTHROUGH_GROUP);
const WITH_WALKTHROUGH = WALKTHROUGH_VIDEOS.find((v) => !FEATURED_IDS.includes(v.id));
const WITHOUT_WALKTHROUGH = WALKTHROUGH_VIDEOS.find((v) => v.id !== WITH_WALKTHROUGH.id);
const SCENES = [
  { scene: "one", headline: "First step", caption: "The first thing happens.", startSeconds: 4 },
  { scene: "two", headline: "Second step", caption: "The second thing happens.", startSeconds: 21 },
  { scene: "three", step: 5, headline: "Third step", caption: "The third thing happens.", startSeconds: 40 },
].map((s) => ({
  ...s,
  thumb: `videos/${WITH_WALKTHROUGH.id}/${s.scene}-thumb.webp`,
  full: `videos/${WITH_WALKTHROUGH.id}/${s.scene}.webp`,
}));

async function serveWalkthroughManifest(page) {
  await serveRealSite(page);
  const videos = MANIFEST.videos.map((v) => {
    const { walkthrough: _ignored, ...rest } = v;
    return v.id === WITH_WALKTHROUGH.id ? { ...rest, walkthrough: SCENES } : rest;
  });
  await page.route("**/videos/publish.json", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...MANIFEST, videos }) }),
  );
}

const AREA_URL = `http://localhost:3000/${AREA_PAGES[WALKTHROUGH_GROUP]}`;

test.describe("walkthrough under a video", () => {
  test("the twistie is closed by default and opens to one thumbnail per scene", async ({ page }) => {
    await serveWalkthroughManifest(page);
    await page.goto(AREA_URL, { waitUntil: "domcontentloaded" });
    const twistie = page.locator(`section#${WITH_WALKTHROUGH.id} details.walkthrough`);
    await expect(twistie).toHaveCount(1);
    await expect(twistie).not.toHaveAttribute("open", "");
    await expect(twistie.locator("summary")).toHaveText(/Walkthrough: 3 steps/);
    await twistie.locator("summary").click();
    await expect(twistie.locator(".walkthrough-thumb")).toHaveCount(3);
    await expect(twistie.locator(".walkthrough-thumb img").first()).toHaveAttribute("alt", SCENES[0].caption);
    await expect(twistie.locator(".walkthrough-headline").first()).toHaveText(SCENES[0].headline);
  });

  test("a video with no walkthrough data has no twistie", async ({ page }) => {
    await serveWalkthroughManifest(page);
    await page.goto(AREA_URL, { waitUntil: "domcontentloaded" });
    await expect(page.locator(`section#${WITHOUT_WALKTHROUGH.id}`)).toHaveCount(1);
    await expect(page.locator(`section#${WITHOUT_WALKTHROUGH.id} details`)).toHaveCount(0);
  });

  test("a thumbnail opens the overlay, Escape closes it and focus returns to the thumbnail", async ({ page }) => {
    await serveWalkthroughManifest(page);
    await page.goto(AREA_URL, { waitUntil: "domcontentloaded" });
    await page.locator(`section#${WITH_WALKTHROUGH.id} details.walkthrough summary`).click();
    const thumb = page.locator(`#${WITH_WALKTHROUGH.id}-two .walkthrough-thumb`);
    await thumb.click();
    const overlay = page.locator("dialog.walkthrough-overlay");
    await expect(overlay).toBeVisible();
    await expect(overlay.locator("h3")).toHaveText(SCENES[1].headline);
    await expect(overlay.locator("img")).toHaveAttribute("alt", SCENES[1].caption);
    await expect(overlay.locator("img")).toHaveAttribute("src", SCENES[1].full);
    await expect(overlay.locator(".walkthrough-close")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(overlay).toBeHidden();
    await expect(thumb).toBeFocused();
  });

  test("arrow keys and buttons move between scenes", async ({ page }) => {
    await serveWalkthroughManifest(page);
    await page.goto(AREA_URL, { waitUntil: "domcontentloaded" });
    await page.locator(`section#${WITH_WALKTHROUGH.id} details.walkthrough summary`).click();
    await page.locator(`#${WITH_WALKTHROUGH.id}-one .walkthrough-thumb`).click();
    const overlay = page.locator("dialog.walkthrough-overlay");
    await expect(overlay.locator(".walkthrough-previous")).toBeDisabled();
    await page.keyboard.press("ArrowRight");
    await expect(overlay.locator("h3")).toHaveText(SCENES[1].headline);
    await overlay.locator(".walkthrough-next").click();
    await expect(overlay.locator("h3")).toHaveText(SCENES[2].headline);
    await expect(overlay.locator(".walkthrough-next")).toBeDisabled();
    await page.keyboard.press("ArrowLeft");
    await expect(overlay.locator("h3")).toHaveText(SCENES[1].headline);
  });

  test("sharing without the share sheet copies the scene text and both links and says Copied", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await serveWalkthroughManifest(page);
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
    });
    await page.goto(AREA_URL, { waitUntil: "domcontentloaded" });
    await page.locator(`section#${WITH_WALKTHROUGH.id} details.walkthrough summary`).click();
    const item = page.locator(`#${WITH_WALKTHROUGH.id}-two`);
    await item.locator(".walkthrough-share").click();
    await expect(item.locator(".walkthrough-status")).toHaveText("Copied");
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toContain(SCENES[1].caption);
    expect(copied).toContain(`${AREA_URL}#${WITH_WALKTHROUGH.id}-two`);
    expect(copied).toContain(`https://youtu.be/${WITH_WALKTHROUGH.videoId}?t=21`);
  });

  test("sharing inside the overlay uses the share sheet when there is one", async ({ page }) => {
    await serveWalkthroughManifest(page);
    await page.addInitScript(() => {
      window.sharedPayloads = [];
      navigator.share = async (payload) => {
        window.sharedPayloads.push(payload);
      };
    });
    await page.goto(AREA_URL, { waitUntil: "domcontentloaded" });
    await page.locator(`section#${WITH_WALKTHROUGH.id} details.walkthrough summary`).click();
    await page.locator(`#${WITH_WALKTHROUGH.id}-three-5 .walkthrough-thumb`).click();
    await page.locator("dialog.walkthrough-overlay .walkthrough-share-overlay").click();
    const [payload] = await page.evaluate(() => window.sharedPayloads);
    expect(payload.url).toBe(`${AREA_URL}#${WITH_WALKTHROUGH.id}-three-5`);
    expect(payload.text).toContain(SCENES[2].caption);
    expect(payload.text).toContain(`https://youtu.be/${WITH_WALKTHROUGH.videoId}?t=40`);
  });

  test("a scene hash opens the twistie and the overlay on that scene", async ({ page }) => {
    await serveWalkthroughManifest(page);
    await page.goto(`${AREA_URL}#${WITH_WALKTHROUGH.id}-three-5`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(`section#${WITH_WALKTHROUGH.id} details.walkthrough`)).toHaveAttribute("open", "");
    const overlay = page.locator("dialog.walkthrough-overlay");
    await expect(overlay).toBeVisible();
    await expect(overlay.locator("h3")).toHaveText(SCENES[2].headline);
  });

  test("a scene hash on the index for a video not featured there redirects to its area page and opens the scene", async ({ page }) => {
    await serveWalkthroughManifest(page);
    expect(FEATURED_IDS).not.toContain(WITH_WALKTHROUGH.id);
    await page.goto(`http://localhost:3000/videos.html#${WITH_WALKTHROUGH.id}-two`, { waitUntil: "domcontentloaded" });
    await page.waitForURL(`**/${AREA_PAGES[WALKTHROUGH_GROUP]}#${WITH_WALKTHROUGH.id}-two`);
    await expect(page.locator("dialog.walkthrough-overlay h3")).toHaveText(SCENES[1].headline);
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
