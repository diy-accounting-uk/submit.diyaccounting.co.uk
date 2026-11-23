// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/expiredSession.browser.test.js
// A visitor whose stored sign-in has expired and has no refresh token is shown as signed out, and
// an action that needs a session sends them to sign in, back to the page they were on.

import { test, expect } from "@playwright/test";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { serveRealSite, SITE_ORIGIN } from "./serveRealSite.js";
import { PEOPLE } from "@app/http-simulator/fixtures/register.js";

const SIGNED_IN_EMAIL = PEOPLE.samPatel.email;

dotenvConfigIfNotBlank({ path: ".env.test" });

const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
const expiredJwt = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${b64url({ exp: Math.floor(Date.now() / 1000) - 3600 })}.sig`;

test("an expired sign-in with no refresh token shows Not signed in and Subscribe goes to sign in", async ({ page }) => {
  const deadTokenCalls = [];
  const refreshCalls = [];
  await page.addInitScript(
    ({ jwt, email }) => {
      try {
        if (sessionStorage.getItem("expiredSeeded")) return;
        sessionStorage.setItem("expiredSeeded", "1");
        localStorage.setItem("cognitoIdToken", jwt);
        localStorage.setItem("cognitoAccessToken", jwt);
        localStorage.setItem("userInfo", JSON.stringify({ sub: "user1", email }));
      } catch {}
    },
    { jwt: expiredJwt, email: SIGNED_IN_EMAIL },
  );
  await serveRealSite(page, {
    signedIn: false,
    apiHandler: (url, request) => {
      if (url.pathname === "/api/v1/cognito/token") refreshCalls.push(url.pathname);
      const auth = request.headers()["authorization"] || request.headers()["x-authorization"] || "";
      if (auth.includes(expiredJwt) && (request.headers()["referer"] || "").includes("/bundles.html"))
        deadTokenCalls.push(`${request.method()} ${url.pathname}`);
      return undefined;
    },
  });
  await page.goto(`${SITE_ORIGIN}/bundles.html`, { waitUntil: "domcontentloaded" });

  await expect(page.locator(".login-status")).toHaveText("Not signed in");
  await expect(page.locator("a.login-link")).toHaveText("Sign in");
  await expect(page.locator("body")).not.toContainText("Session refreshed successfully");

  const subscribe = page.locator("button[data-subscribe]").first();
  await expect(subscribe).toBeVisible({ timeout: 15000 });
  await page.waitForLoadState("networkidle");
  await subscribe.click();
  await page.waitForURL("**/auth/login.html?next=*");
  expect(new URL(page.url()).searchParams.get("next")).toBe("/bundles.html");

  expect(refreshCalls).toEqual([]);
  expect(deadTokenCalls).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem("cognitoIdToken"))).toBeNull();
});

for (const pagePath of ["bundles.html", "index.html"]) {
  test(`${pagePath} with an expired sign-in makes no call with the dead token, clears it and stays put`, async ({ page }) => {
    const deadTokenCalls = [];
    await page.addInitScript(
      ({ jwt, email }) => {
        try {
          if (sessionStorage.getItem("expiredSeeded")) return;
          sessionStorage.setItem("expiredSeeded", "1");
          localStorage.setItem("cognitoIdToken", jwt);
          localStorage.setItem("cognitoAccessToken", jwt);
          localStorage.setItem("userInfo", JSON.stringify({ sub: "user1", email }));
        } catch {}
      },
      { jwt: expiredJwt, email: SIGNED_IN_EMAIL },
    );
    await serveRealSite(page, {
      apiHandler: (url, request) => {
        const headers = request.headers();
        if (`${headers["authorization"] || ""}${headers["x-authorization"] || ""}`.includes(expiredJwt)) deadTokenCalls.push(url.pathname);
        return undefined;
      },
    });
    await page.goto(`${SITE_ORIGIN}/${pagePath}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".login-status")).toHaveText("Not signed in");
    await page.waitForLoadState("networkidle");
    expect(deadTokenCalls).toEqual([]);
    expect(new URL(page.url()).pathname).toBe(`/${pagePath}`);
    const stored = await page.evaluate(() => ["cognitoIdToken", "cognitoAccessToken", "userInfo"].map((k) => localStorage.getItem(k)));
    expect(stored).toEqual([null, null, null]);
  });
}
