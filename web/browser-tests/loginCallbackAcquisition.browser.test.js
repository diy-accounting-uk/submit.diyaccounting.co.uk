// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/loginCallbackAcquisition.browser.test.js
// After a sign-in, the page the sign-in lands on posts the stored landing as the account's source.
// The sign-in never waits for the post, and sign_up is sent only for the account's first record.

import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { PEOPLE } from "@app/http-simulator/fixtures/register.js";

const PUBLIC_ROOT = path.join(process.cwd(), "web/public");
const SITE = "http://localhost:3000";
const COGNITO = "https://auth.example.test";
const CONTENT_TYPES = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};
const SUBMIT_ENV = `COGNITO_CLIENT_ID=client123\nCOGNITO_BASE_URI=${COGNITO}/\nDIY_SUBMIT_BASE_URL=${SITE}/\n`;
const LANDING = {
  utmSource: "newsletter",
  utmMedium: "email",
  utmCampaign: "watch-list",
  utmContent: "director",
  gclid: "Cj0KCQ-click",
  msclkid: "ms-click",
  landedAt: "2026-11-20T09:00:00.000Z",
};

// Serves web/public, answers the token exchange, and records every acquisition post. Each post
// takes the next answer of the list, and the last answer serves every post after it.
async function serveSignIn(page, { acquisitionAnswers = ["first"] } = {}) {
  const posts = [];
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== SITE) {
      await route.fulfill({ status: 200, contentType: "text/html", body: "<html><body>elsewhere</body></html>" });
      return;
    }
    if (url.pathname === "/submit.env") {
      await route.fulfill({ status: 200, contentType: "text/plain", body: SUBMIT_ENV });
      return;
    }
    if (url.pathname === "/api/v1/cognito/token") {
      const payload = Buffer.from(JSON.stringify({ sub: "sub-1", email: PEOPLE.samPatel.email, nonce: "nonce-1" })).toString("base64url");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id_token: `h.${payload}.s`, access_token: "access-1" }),
      });
      return;
    }
    if (url.pathname === "/api/v1/account/acquisition") {
      const answer = acquisitionAnswers[Math.min(posts.length, acquisitionAnswers.length - 1)];
      posts.push({ body: JSON.parse(request.postData() || "{}"), authorization: request.headers()["authorization"] });
      if (answer === "first" || answer === "notFirst") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true, firstRecord: answer === "first" }),
        });
      }
      if (answer === "500") await route.fulfill({ status: 500, contentType: "text/html", body: "<html>error</html>" });
      if (answer === "fails") await route.abort("failed");
      // "never": the post is left unanswered.
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      return;
    }
    const filePath = path.join(PUBLIC_ROOT, decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname));
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      await route.fulfill({
        status: 200,
        contentType: CONTENT_TYPES[path.extname(filePath)] || "application/octet-stream",
        body: fs.readFileSync(filePath),
      });
    } else {
      await route.fulfill({ status: 404, contentType: "text/plain", body: "Not found" });
    }
  });
  return posts;
}

// Seeds the sign-in state and the stored landing once, and keeps every gtag call of every page.
async function prepareBrowser(page, landing) {
  await page.addInitScript((stored) => {
    // analytics.js keeps an existing dataLayer, so each gtag call is kept across the redirect.
    window.dataLayer = [];
    window.dataLayer.push = (args) => {
      const calls = JSON.parse(sessionStorage.getItem("gtag_calls") || "[]");
      calls.push(Array.from(args));
      sessionStorage.setItem("gtag_calls", JSON.stringify(calls));
    };
    if (sessionStorage.getItem("test_seeded")) return;
    sessionStorage.setItem("test_seeded", "1");
    if (typeof stored === "string") localStorage.setItem("attribution.landing", stored);
  }, landing);
}

async function signIn(page) {
  await page.goto(`${SITE}/privacy.html`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    sessionStorage.setItem("cognito_oauth_state", "state-1");
    sessionStorage.setItem("cognito_oauth_nonce", "nonce-1");
    sessionStorage.setItem("cognito_pkce_verifier", "verifier-1");
    sessionStorage.setItem("cognito_redirect_uri", "http://localhost:3000/auth/loginWithCognitoCallback.html");
  });
  await page.goto(`${SITE}/auth/loginWithCognitoCallback.html?code=code-1&state=state-1`, { waitUntil: "domcontentloaded" });
  await page.waitForURL(`${SITE}/`);
}

const postedMarker = (page) => page.evaluate(() => localStorage.getItem("attribution.landing.posted"));
const signUpEvents = async (page) =>
  JSON.parse(await page.evaluate(() => sessionStorage.getItem("gtag_calls") || "[]")).filter((call) => call[1] === "sign_up");

test.describe("the account's source posted after a sign-in", () => {
  test("posts the stored landing without the click ids, marks it posted and sends sign_up when it is the account's first record", async ({
    page,
  }) => {
    const posts = await serveSignIn(page);
    await prepareBrowser(page, JSON.stringify(LANDING));
    await signIn(page);

    await expect.poll(() => postedMarker(page)).toBe(LANDING.landedAt);
    expect(posts).toHaveLength(1);
    expect(posts[0].body).toEqual({
      utmSource: "newsletter",
      utmMedium: "email",
      utmCampaign: "watch-list",
      utmContent: "director",
      landedAt: "2026-11-20T09:00:00.000Z",
    });
    expect(posts[0].authorization).toBe("Bearer access-1");
    expect(await signUpEvents(page)).toEqual([["event", "sign_up", { method: "cognito" }]]);
    expect(await page.evaluate(() => sessionStorage.getItem("gtag_calls"))).not.toContain("click");
  });

  test("sends no sign_up when the account already has a source, and marks the landing posted", async ({ page }) => {
    const posts = await serveSignIn(page, { acquisitionAnswers: ["notFirst"] });
    await prepareBrowser(page, JSON.stringify(LANDING));
    await signIn(page);

    await expect.poll(() => postedMarker(page)).toBe(LANDING.landedAt);
    expect(posts).toHaveLength(1);
    expect(await signUpEvents(page)).toEqual([]);
  });

  test("a second sign-in after a posted landing posts nothing more and sends no second sign_up", async ({ page }) => {
    const posts = await serveSignIn(page);
    await prepareBrowser(page, JSON.stringify(LANDING));
    await signIn(page);
    await expect.poll(() => postedMarker(page)).toBe(LANDING.landedAt);

    await signIn(page);
    await page.waitForLoadState("networkidle");

    expect(posts).toHaveLength(1);
    expect(await signUpEvents(page)).toHaveLength(1);
  });

  test("posts once for a sign-in, however many pages follow it", async ({ page }) => {
    const posts = await serveSignIn(page, { acquisitionAnswers: ["500"] });
    await prepareBrowser(page, JSON.stringify(LANDING));
    await signIn(page);
    await expect.poll(() => posts.length).toBe(1);

    await page.goto(`${SITE}/privacy.html`, { waitUntil: "networkidle" });
    expect(posts).toHaveLength(1);
  });

  for (const [name, answer] of [
    ["answers 500 with a page", "500"],
    ["fails", "fails"],
    ["never answers", "never"],
  ]) {
    test(`a post that ${name} leaves the sign-in complete and the landing unposted, and the next sign-in sends it again`, async ({
      page,
    }) => {
      const pageErrors = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      const posts = await serveSignIn(page, { acquisitionAnswers: [answer, "first"] });
      await prepareBrowser(page, JSON.stringify(LANDING));
      await signIn(page);

      await expect.poll(() => posts.length).toBe(1);
      expect(await page.evaluate(() => Boolean(localStorage.getItem("cognitoAccessToken")))).toBe(true);
      await page.waitForLoadState("load");
      expect(await postedMarker(page)).toBeNull();
      expect(await signUpEvents(page)).toEqual([]);
      expect(pageErrors).toEqual([]);

      await signIn(page);
      await expect.poll(() => postedMarker(page)).toBe(LANDING.landedAt);
      expect(posts).toHaveLength(2);
      expect(posts[1].body).toEqual(posts[0].body);
      expect(await signUpEvents(page)).toHaveLength(1);
    });
  }

  test("the sign-in completes and nothing is posted when the stored landing cannot be read", async ({ page }) => {
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    const posts = await serveSignIn(page);
    await prepareBrowser(page, "{not json");
    await signIn(page);

    await page.waitForLoadState("networkidle");
    expect(posts).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test("makes no post when no landing is stored", async ({ page }) => {
    const posts = await serveSignIn(page);
    await prepareBrowser(page, null);
    await signIn(page);

    await page.waitForLoadState("networkidle");
    expect(posts).toEqual([]);
  });
});
