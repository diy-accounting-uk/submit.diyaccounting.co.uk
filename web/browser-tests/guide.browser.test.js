// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/guide.browser.test.js
// guide.html: every journey is a twisty that opens to its numbered steps, every screenshot loads
// and carries alt text, and a screenshot opens in the lightbox.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";

const PUBLIC_ROOT = path.join(process.cwd(), "web/public");

const CONTENT_TYPES = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".toml": "text/x-toml",
  ".json": "application/json",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

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
    const filePath = path.join(PUBLIC_ROOT, decodeURIComponent(url.pathname));
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath);
      await route.fulfill({ status: 200, contentType: CONTENT_TYPES[ext] || "application/octet-stream", body: fs.readFileSync(filePath) });
    } else {
      await route.fulfill({ status: 404, contentType: "text/plain", body: "Not found" });
    }
  });
}

test.describe("guide.html", () => {
  test("every journey opens to numbered steps and every screenshot loads with alt text", async ({ page }) => {
    await serveRealSite(page);
    await page.goto("http://localhost:3000/guide.html", { waitUntil: "load" });
    await expect(page.locator("details.guide-journey").first()).toBeVisible();

    const journeys = page.locator("details.guide-journey");
    const journeyCount = await journeys.count();
    expect(journeyCount).toBeGreaterThan(30);

    for (let i = 0; i < journeyCount; i++) {
      const journey = journeys.nth(i);
      await journey.locator("summary").click();
      await expect(journey).toHaveAttribute("open", "");
      await expect(journey.locator("ol.guide-steps-list > li").first()).toBeVisible();
    }

    const result = await page.evaluate(async () => {
      const images = [...document.querySelectorAll(".guide-step img")];
      images.forEach((img) => {
        img.loading = "eager";
      });
      await Promise.all(
        images.map((img) =>
          img.complete
            ? undefined
            : new Promise((resolve) => (img.addEventListener("load", resolve), img.addEventListener("error", resolve))),
        ),
      );
      return {
        total: images.length,
        notLoaded: images.filter((img) => !(img.naturalWidth > 0)).map((img) => img.src),
        noAlt: images.filter((img) => !(img.alt && img.alt.trim())).map((img) => img.src),
        altIsCaption: images
          .filter((img) => img.alt === img.closest(".guide-step").querySelector(".guide-caption").textContent)
          .map((img) => img.src),
      };
    });
    expect(result.total).toBeGreaterThan(100);
    expect(result.notLoaded).toEqual([]);
    expect(result.noAlt).toEqual([]);
    expect(result.altIsCaption).toEqual([]);
  });

  test("a screenshot opens full size in the lightbox and Escape closes it", async ({ page }) => {
    await serveRealSite(page);
    await page.goto("http://localhost:3000/guide.html", { waitUntil: "load" });
    const journey = page.locator("details.guide-journey#submit-return");
    await journey.locator("summary").click();
    await journey.locator(".guide-thumb").first().click();
    const lightbox = page.locator("#lightbox");
    await expect(lightbox).toHaveClass(/active/);
    await expect(page.locator("#lightbox-image")).toHaveAttribute("src", /videos\/submit-return\/.*\.webp$/);
    await page.keyboard.press("Escape");
    await expect(lightbox).not.toHaveClass(/active/);
  });

  test("a journey named in the link hash opens", async ({ page }) => {
    await serveRealSite(page);
    await page.goto("http://localhost:3000/guide.html#view-penalties", { waitUntil: "load" });
    await expect(page.locator("details#view-penalties")).toHaveAttribute("open", "");
  });

  test("the lightbox is a labelled dialog that takes focus, keeps it, and returns it on close", async ({ page }) => {
    await serveRealSite(page);
    await page.goto("http://localhost:3000/guide.html", { waitUntil: "load" });
    const journey = page.locator("details.guide-journey#submit-return");
    await journey.locator("summary").click();
    const thumb = journey.locator(".guide-thumb").first();
    await thumb.focus();
    await page.keyboard.press("Enter");
    const lightbox = page.locator("#lightbox");
    await expect(lightbox).toHaveClass(/active/);
    await expect(lightbox).toHaveAttribute("role", "dialog");
    await expect(lightbox).toHaveAttribute("aria-modal", "true");
    const close = lightbox.locator(".lightbox-close");
    await expect(close).toBeFocused();
    expect(await close.evaluate((node) => node.tagName)).toBe("BUTTON");
    for (let press = 0; press < 6; press++) {
      await page.keyboard.press("Tab");
      expect(await page.evaluate(() => document.activeElement.closest("#lightbox") !== null)).toBe(true);
    }
    await close.focus();
    await page.keyboard.press("Enter");
    await expect(lightbox).not.toHaveClass(/active/);
    await expect(thumb).toBeFocused();
  });

  test("the lightbox stacks above the fixed consent banner", async ({ page }) => {
    await serveRealSite(page);
    await page.goto("http://localhost:3000/guide.html", { waitUntil: "load" });
    const lightboxZ = await page.locator("#lightbox").evaluate((node) => Number(getComputedStyle(node).zIndex));
    expect(lightboxZ).toBeGreaterThan(10000);
  });

  test("a thumbnail carries its pixel size so the page does not shift as it loads, and the page does not scroll sideways at phone width", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await serveRealSite(page);
    await page.goto("http://localhost:3000/guide.html", { waitUntil: "load" });
    const journeys = page.locator("details.guide-journey");
    const count = await journeys.count();
    for (let i = 0; i < count; i++) await journeys.nth(i).locator("summary").click();
    const result = await page.evaluate(() => ({
      sideways: document.documentElement.scrollWidth > window.innerWidth,
      unsized: [...document.querySelectorAll(".guide-thumb img")].filter(
        (img) => !(Number(img.getAttribute("width")) > 0 && Number(img.getAttribute("height")) > 0),
      ).length,
    }));
    expect(result.sideways).toBe(false);
    expect(result.unsized).toBe(0);
  });

  test("changing the link hash to a journey opens it", async ({ page }) => {
    await serveRealSite(page);
    await page.goto("http://localhost:3000/guide.html", { waitUntil: "load" });
    await expect(page.locator("details.guide-journey").first()).toBeVisible();
    await page.evaluate(() => {
      window.location.hash = "#view-payments";
    });
    await expect(page.locator("details#view-payments")).toHaveAttribute("open", "");
  });

  test("the lightbox moves through a journey's frames with buttons and arrow keys and closes with its button", async ({ page }) => {
    await serveRealSite(page);
    await page.goto("http://localhost:3000/guide.html", { waitUntil: "load" });
    const journey = page.locator("details.guide-journey#submit-return");
    await journey.locator("summary").click();
    const frameCount = await journey.locator(".guide-thumb").count();
    expect(frameCount).toBeGreaterThan(2);
    await journey.locator(".guide-thumb").first().click();
    const lightbox = page.locator("#lightbox");
    const image = page.locator("#lightbox-image");
    const first = await image.getAttribute("src");
    await expect(lightbox.locator(".lightbox-previous")).toBeDisabled();
    await expect(lightbox.locator(".lightbox-position")).toHaveText(`1 of ${frameCount}`);

    await page.keyboard.press("ArrowRight");
    await expect(lightbox.locator(".lightbox-position")).toHaveText(`2 of ${frameCount}`);
    const second = await image.getAttribute("src");
    expect(second).not.toBe(first);
    expect(second).toBe(await journey.locator(".guide-thumb").nth(1).getAttribute("data-full"));

    await lightbox.locator(".lightbox-next").click();
    await expect(lightbox).toHaveClass(/active/);
    await expect(lightbox.locator(".lightbox-position")).toHaveText(`3 of ${frameCount}`);
    await lightbox.locator(".lightbox-previous").click();
    await page.keyboard.press("ArrowLeft");
    await expect(image).toHaveAttribute("src", first);

    await lightbox.locator(".lightbox-close").click();
    await expect(lightbox).not.toHaveClass(/active/);
    await expect(journey.locator(".guide-thumb").first()).toBeFocused();
  });

  test("each group has a jump list that opens its journey, and each step has an id and a copy-link control", async ({ page }) => {
    await serveRealSite(page);
    await page.goto("http://localhost:3000/guide.html", { waitUntil: "load" });
    await expect(page.locator("details.guide-journey").first()).toBeVisible();
    const groups = await page.locator("section.guide-group").count();
    expect(await page.locator("nav.guide-jump-nav").count()).toBe(groups);

    const jump = page.locator('nav.guide-jump-nav a[href="#view-penalties"]');
    await jump.click();
    await expect(page.locator("details#view-penalties")).toHaveAttribute("open", "");

    const step = page.locator("details#view-penalties li.guide-step").nth(1);
    expect(await step.getAttribute("id")).toBe("view-penalties-step-2");
    await expect(step.locator(".guide-step-link")).toBeVisible();

    await page.goto("http://localhost:3000/guide.html#view-return-step-3", { waitUntil: "load" });
    await expect(page.locator("details#view-return")).toHaveAttribute("open", "");
    await expect(page.locator("#view-return-step-3")).toBeInViewport();
  });
});
