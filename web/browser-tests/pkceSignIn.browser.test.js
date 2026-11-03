// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/pkceSignIn.browser.test.js
// The Cognito authorization code flow carries PKCE: the sign-in page sends an S256
// code_challenge and keeps the verifier in sessionStorage, and the callback page sends the
// verifier with the code.

import { test, expect } from "@playwright/test";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const PUBLIC_ROOT = path.join(process.cwd(), "web/public");
const SITE = "http://localhost:3000";
const COGNITO = "https://auth.example.test";
const CONTENT_TYPES = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".json": "application/json" };
const SUBMIT_ENV = `COGNITO_CLIENT_ID=client123\nCOGNITO_BASE_URI=${COGNITO}/\nDIY_SUBMIT_BASE_URL=${SITE}/\n`;

async function serveSite(page) {
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === COGNITO) {
      await route.fulfill({ status: 200, contentType: "text/html", body: "<html><body>hosted ui</body></html>" });
      return;
    }
    if (url.origin !== SITE) {
      await route.abort();
      return;
    }
    if (url.pathname === "/submit.env") {
      await route.fulfill({ status: 200, contentType: "text/plain", body: SUBMIT_ENV });
      return;
    }
    const filePath = path.join(PUBLIC_ROOT, decodeURIComponent(url.pathname));
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
}

test.describe("PKCE on the Cognito sign-in", () => {
  test("the authorize URL carries an S256 code challenge and the state", async ({ page }) => {
    await serveSite(page);
    await page.goto(`${SITE}/auth/login.html`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#loginWithCognito")).toBeEnabled();

    const authorizeRequest = page.waitForRequest((request) => request.url().startsWith(`${COGNITO}/oauth2/authorize`));
    await page.click("#loginWithCognito");
    const authorizeUrl = new URL((await authorizeRequest).url());

    const challenge = authorizeUrl.searchParams.get("code_challenge");
    expect(authorizeUrl.searchParams.get("code_challenge_method")).toBe("S256");
    expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(authorizeUrl.searchParams.get("state")).toBeTruthy();
  });

  test("the challenge in the authorize URL is the SHA-256 of the stored verifier", async ({ page }) => {
    await serveSite(page);
    await page.goto(`${SITE}/auth/login.html`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#loginWithCognito")).toBeEnabled();

    const authorizeRequest = page.waitForRequest((request) => request.url().startsWith(`${COGNITO}/oauth2/authorize`));
    const verifierAtRedirect = page.evaluate(
      () =>
        new Promise((resolve) => {
          const original = Storage.prototype.setItem;
          Storage.prototype.setItem = function (key, value) {
            if (key === "cognito_pkce_verifier") resolve(value);
            return original.call(this, key, value);
          };
        }),
    );
    await page.click("#loginWithCognito");
    const verifier = await verifierAtRedirect;
    const challenge = new URL((await authorizeRequest).url()).searchParams.get("code_challenge");

    expect(challenge).toBe(crypto.createHash("sha256").update(verifier, "ascii").digest("base64url"));
  });

  test("the callback sends the stored verifier with the code", async ({ page }) => {
    await serveSite(page);
    let tokenRequestBody = null;
    await page.route("**/api/v1/cognito/token", async (route) => {
      tokenRequestBody = route.request().postData();
      await route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ message: "stop here" }) });
    });
    await page.addInitScript(() => {
      sessionStorage.setItem("cognito_oauth_state", "state-1");
      sessionStorage.setItem("cognito_pkce_verifier", "verifier-from-sign-in");
    });

    await page.goto(`${SITE}/auth/loginWithCognitoCallback.html?code=code-1&state=state-1`, { waitUntil: "domcontentloaded" });
    await expect.poll(() => tokenRequestBody).not.toBeNull();

    const sent = new URLSearchParams(tokenRequestBody);
    expect(sent.get("grant_type")).toBe("authorization_code");
    expect(sent.get("code")).toBe("code-1");
    expect(sent.get("code_verifier")).toBe("verifier-from-sign-in");
  });

  test("the callback makes no token request when the verifier is missing", async ({ page }) => {
    await serveSite(page);
    let tokenRequested = false;
    await page.route("**/api/v1/cognito/token", async (route) => {
      tokenRequested = true;
      await route.fulfill({ status: 400, contentType: "application/json", body: "{}" });
    });
    await page.addInitScript(() => {
      sessionStorage.setItem("cognito_oauth_state", "state-1");
    });

    await page.goto(`${SITE}/auth/loginWithCognitoCallback.html?code=code-1&state=state-1`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toContainText("Security validation failed");
    expect(tokenRequested).toBe(false);
  });
});
