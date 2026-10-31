// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/marketing.browser.test.js
// The marketing page, served from web/marketing under the edge's content security policy on a
// deployed-looking host. Every other host is blocked, so a script or style from elsewhere fails here
// as it does in production.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";

const SITE_ROOT = path.join(process.cwd(), "web/marketing");
const HOST = "marketing.example.test";
const ORIGIN = `https://${HOST}`;
const CONTENT_TYPES = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};
// The policy StaticSite.java sets on every static site.
const EDGE_CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: blob:; media-src 'self' blob:; frame-ancestors 'none'; form-action 'none';";
const PASS = "tiger-happy-maple-river";
const PASS_LINK = `https://submit.diyaccounting.co.uk/bundles.html?pass=${PASS}`;

test.use({ permissions: ["clipboard-read", "clipboard-write"], baseURL: ORIGIN });

async function serveSite(context) {
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== HOST) {
      await route.abort();
      return;
    }
    const pathname = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
    const filePath = path.join(SITE_ROOT, pathname);
    if (filePath.startsWith(SITE_ROOT) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      await route.fulfill({
        status: 200,
        contentType: CONTENT_TYPES[path.extname(filePath)] || "application/octet-stream",
        headers: { "content-security-policy": EDGE_CSP },
        body: fs.readFileSync(filePath),
      });
    } else {
      await route.fulfill({ status: 404, contentType: "text/plain", body: "Not found" });
    }
  });
}

async function openPage(page, context, target = "/", now = "2026-11-15T12:00:00Z") {
  await serveSite(context);
  await page.clock.setFixedTime(now);
  await page.addInitScript(() => {
    window.__violations = [];
    document.addEventListener("securitypolicyviolation", (event) => window.__violations.push(event.violatedDirective));
  });
  await page.goto(target, { waitUntil: "load" });
  await expect(page.locator("#submit-vat-price")).toBeAttached();
}

async function inView(page, selector) {
  return page.locator(selector).evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return rect.top < window.innerHeight && rect.bottom > 0;
  });
}

test("loads with no console error and no content security policy violation", async ({ page, context }) => {
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await openPage(page, context);
  await page.waitForLoadState("networkidle");
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => window.__violations)).toEqual([]);
  await expect(page.locator("#submit-vat-price .post-text")).not.toBeEmpty();
});

test("a pass in the address fills both fields, scrolls to the group and reaches only Submit links", async ({ page, context }) => {
  await openPage(page, context, `/?pass=${PASS}#submit-vat`);
  await expect(page.locator("#passCode")).toHaveValue(PASS);
  await expect(page.locator("#passUrl")).toHaveValue(PASS_LINK);
  await expect(page.locator("#submit-vat-title")).toBeFocused();
  expect(await inView(page, "#submit-vat-title")).toBe(true);
  const submitHrefs = await page.locator("#submit-vat-price a.share").evaluateAll((nodes) => nodes.map((n) => n.getAttribute("href")));
  const xHref = await page.locator('#submit-vat-price a.share[data-network="x"]').getAttribute("href");
  const linkedinHref = await page.locator('#submit-vat-price a.share[data-network="linkedin"]').getAttribute("href");
  expect(submitHrefs.length).toBe(6);
  expect(linkedinHref).toContain("bundles.html%3Fpass%3Dtiger-happy-maple-river");
  expect(xHref).toContain("bundles.html%3Fpass%3Dtiger-happy-maple-river");
  expect(new URL(xHref).searchParams.get("text").startsWith("#ad ")).toBe(true);
  expect(xHref.split("text=")[1].startsWith("%23ad")).toBe(true);
  for (const id of ["spreadsheets-all", "diya-gl-all", "limited-all"]) {
    const hrefs = await page.locator(`#${id} a.share`).evaluateAll((nodes) => nodes.map((n) => n.getAttribute("href")));
    for (const href of hrefs) expect(href).not.toMatch(/pass/i);
  }
});

test("typing a code fills the link and the reverse, a bad code shows the error, Clear empties both", async ({ page, context }) => {
  await openPage(page, context);
  await page.locator("#passCode").fill(`  ${PASS.toUpperCase()} `);
  await expect(page.locator("#passUrl")).toHaveValue(PASS_LINK);
  expect(new URL(page.url()).searchParams.get("pass")).toBe(PASS);
  await expect(page.locator("#passStatus")).toContainText("#ad");

  await page.locator("#passCode").fill("");
  await expect(page.locator("#passUrl")).toHaveValue("");
  await page.locator("#passUrl").fill(`${PASS_LINK}&ref=somebody`);
  await expect(page.locator("#passCode")).toHaveValue(PASS);

  await page.locator("#passCode").fill("tiger-happy");
  await page.locator("#passCode").blur();
  await expect(page.locator("#passStatus")).toContainText("four words joined by hyphens");
  const href = await page.locator('#submit-vat-price a.share[data-network="linkedin"]').getAttribute("href");
  expect(href).not.toContain("pass%3D");
  expect(page.url()).not.toContain("pass=");

  await page.locator("#passUrl").fill("http://submit.diyaccounting.co.uk/bundles.html?pass=" + PASS);
  await page.locator("#passUrl").blur();
  await expect(page.locator("#passStatus")).toContainText("Paste the link from Generate a pass");

  await page.locator("#passCode").fill(PASS);
  await page.locator("#passClear").click();
  await expect(page.locator("#passCode")).toHaveValue("");
  await expect(page.locator("#passUrl")).toHaveValue("");
  expect(page.url()).not.toContain("pass=");
});

test("the medium length changes the post and Copy post puts it on the clipboard", async ({ page, context }) => {
  await openPage(page, context);
  const set = page.locator("#submit-vat-price");
  const shortText = await set.locator(".post-text").innerText();
  await set.getByLabel(/^Medium/).check();
  const mediumText = await set.locator(".post-text").innerText();
  expect(mediumText.length).toBeGreaterThan(shortText.length);
  await set.getByRole("button", { name: "Copy post" }).click();
  await expect(set.locator(".copy-status")).toHaveText("Copied");
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied.replace(/\s+/g, " ")).toBe(mediumText.replace(/\s+/g, " "));
  expect(copied).toContain("utm_medium=copy");
});

test("a LinkedIn click copies the post", async ({ page, context }) => {
  await openPage(page, context);
  await context.route("https://www.linkedin.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "<p>stub</p>" }),
  );
  const set = page.locator("#submit-vat-price");
  const [popup] = await Promise.all([context.waitForEvent("page"), set.locator('a.share[data-network="linkedin"]').click()]);
  await popup.close();
  await expect(set.locator(".copy-status")).toContainText("Post text copied. Paste it into LinkedIn.");
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("utm_source=linkedin");
});

test("Post lists the running campaigns and moves to the heading, and hides after they end", async ({ page, context }) => {
  await openPage(page, context);
  await expect(page.locator("#postButton")).toBeVisible();
  await page.locator("#postButton").click();
  await expect(page.locator("#campaignList li")).toHaveCount(2);
  await page.getByRole("link", { name: "Post Submit VAT" }).click();
  await expect(page.locator("#submit-vat-title")).toBeFocused();
  await expect(page.locator("#campaignList")).toBeHidden();

  await page.locator("#postButton").click();
  await page.keyboard.press("Escape");
  await expect(page.locator("#campaignList")).toBeHidden();
  await expect(page.locator("#postButton")).toBeFocused();

  const later = await context.newPage();
  await openPage(later, context, "/", "2027-11-01T12:00:00Z");
  await expect(later.locator("#postButton")).toBeHidden();
});

test("Share shows when the browser can share and sends the pass link", async ({ page, context }) => {
  await page.addInitScript(() => {
    window.__shared = [];
    navigator.share = async (payload) => {
      window.__shared.push(payload);
    };
  });
  await openPage(page, context, `/?pass=${PASS}`);
  const set = page.locator("#submit-vat-price");
  await expect(set.locator(".native-share")).toBeVisible();
  await set.locator(".native-share").click();
  await expect.poll(() => page.evaluate(() => window.__shared.length)).toBe(1);
  const payload = await page.evaluate(() => window.__shared[0]);
  expect(Object.keys(payload).sort()).toEqual(["text", "title", "url"]);
  expect(payload.url).toContain(`bundles.html?pass=${PASS}`);
  expect(payload.text).not.toContain(payload.url);
  expect(payload.title.length).toBeGreaterThan(0);
});

test("the Dark button swaps a guide to its dark scheme and is disabled for a light-only site", async ({ page, context }) => {
  await openPage(page, context);
  const guide = page.locator("#submit-brand");
  await guide.getByRole("button", { name: "Dark" }).click();
  await expect(guide.locator(".brand-submit")).toHaveAttribute("data-theme", "dark");
  await expect(guide.getByRole("button", { name: "Dark" })).toHaveAttribute("aria-pressed", "true");
  const sources = await guide.locator("[data-shots] img").evaluateAll((nodes) => nodes.map((n) => n.getAttribute("src")));
  expect(sources.length).toBeGreaterThan(0);
  for (const src of sources) expect(src.endsWith("-dark.png")).toBe(true);
  await guide.getByRole("button", { name: "Light" }).click();
  await expect(guide.locator(".brand-submit")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("#spreadsheets-brand").getByRole("button", { name: "Dark" })).toBeDisabled();
  await expect(page.locator("#spreadsheets-brand .scheme-note")).toHaveText("This site has a light scheme only.");
});

test("at 390 pixels wide the page does not scroll sideways", async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPage(page, context);
  for (const id of ["submit", "spreadsheets", "diya-gl", "limited"]) {
    await page.locator(`#${id}-brand`).getByRole("button", { name: "Light" }).click();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
