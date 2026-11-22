// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/loginCallbackAcquisition.browser.test.js
// After a sign-in, the callback page posts the stored landing as the account's source, once, and
// never holds up the sign-in for it.

import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

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

// Serves web/public, answers the token exchange, and records every acquisition post. The post is
// held unanswered, so a sign-in that waited for it would never reach the home page.
async function serveSignIn(page) {
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
      const payload = Buffer.from(JSON.stringify({ sub: "sub-1", email: "person@example.com", nonce: "nonce-1" })).toString("base64url");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id_token: `h.${payload}.s`, access_token: "access-1" }),
      });
      return;
    }
    if (url.pathname === "/api/v1/account/acquisition") {
      posts.push({ body: JSON.parse(request.postData() || "{}"), authorization: request.headers()["authorization"] });
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

async function signIn(page, landing) {
  await page.addInitScript((stored) => {
    if (sessionStorage.getItem("test_seeded")) return;
    sessionStorage.setItem("test_seeded", "1");
    sessionStorage.setItem("cognito_oauth_state", "state-1");
    sessionStorage.setItem("cognito_oauth_nonce", "nonce-1");
    sessionStorage.setItem("cognito_pkce_verifier", "verifier-1");
    sessionStorage.setItem("cognito_redirect_uri", "http://localhost:3000/auth/loginWithCognitoCallback.html");
    if (stored) localStorage.setItem("attribution.landing", JSON.stringify(stored));
    // analytics.js keeps an existing dataLayer, so each gtag call is kept across the redirect.
    window.dataLayer = [];
    window.dataLayer.push = (args) => {
      const calls = JSON.parse(sessionStorage.getItem("gtag_calls") || "[]");
      calls.push(Array.from(args));
      sessionStorage.setItem("gtag_calls", JSON.stringify(calls));
    };
  }, landing);
  await page.goto(`${SITE}/auth/loginWithCognitoCallback.html?code=code-1&state=state-1`, { waitUntil: "domcontentloaded" });
}

test.describe("the account's source posted from the sign-in callback", () => {
  test("posts the stored landing once, without the click ids, and the sign-in goes on without waiting", async ({ page }) => {
    const posts = await serveSignIn(page);
    await signIn(page, LANDING);

    await page.waitForURL(`${SITE}/`);
    expect(posts).toHaveLength(1);
    expect(posts[0].body).toEqual({
      utmSource: "newsletter",
      utmMedium: "email",
      utmCampaign: "watch-list",
      utmContent: "director",
      landedAt: "2026-11-20T09:00:00.000Z",
    });
    expect(posts[0].authorization).toBe("Bearer access-1");
    expect(await page.evaluate(() => localStorage.getItem("attribution.landing.posted"))).toBe(LANDING.landedAt);
    const gtagCalls = JSON.parse(await page.evaluate(() => sessionStorage.getItem("gtag_calls") || "[]"));
    expect(gtagCalls).toContainEqual(["event", "sign_up", { method: "cognito" }]);
    expect(JSON.stringify(gtagCalls)).not.toContain("click");
  });

  test("makes no post when no landing is stored", async ({ page }) => {
    const posts = await serveSignIn(page);
    await signIn(page, null);

    await page.waitForURL(`${SITE}/`);
    expect(posts).toEqual([]);
  });
});
