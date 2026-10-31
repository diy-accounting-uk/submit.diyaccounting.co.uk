// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/generatePassLink.browser.test.js
// The digital pass page hands a generated pass over to My generated passes.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";

const SITE = "https://submit.example.test";

test.describe("Generate digital pass page", () => {
  test("opens My generated passes with the new pass named in the address", async ({ page }) => {
    const root = path.join(process.cwd(), "web/public");
    const html = fs.readFileSync(path.join(root, "passes/generate-digital.html"), "utf-8");
    const pageJs = fs.readFileSync(path.join(root, "passes/generate-digital.page.js"), "utf-8");
    const qrJs = fs.readFileSync(path.join(root, "lib/qrcode.min.js"), "utf-8");

    await page.addInitScript(() => {
      localStorage.setItem("cognitoIdToken", "mock-id-token");
      window.__submitReady__ = true;
      window.showStatus = () => {};
      window.checkAuthStatus = () => {};
      window.fetchWithIdToken = async (url) => {
        if (url === "/api/v1/pass/generate") {
          return {
            ok: true,
            json: async () => ({
              code: "tiger-happy-mountain-silver",
              tokensConsumed: 3,
              tokensRemaining: 7,
            }),
          };
        }
        return { ok: true, json: async () => ({ bundles: [{ allocated: true, tokensRemaining: 10 }] }) };
      };
    });

    await page.route(`${SITE}/**`, async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/passes/generate-digital.html") {
        await route.fulfill({ status: 200, contentType: "text/html", body: html });
      } else if (url.pathname === "/passes/generate-digital.page.js") {
        await route.fulfill({ status: 200, contentType: "application/javascript", body: pageJs });
      } else if (url.pathname === "/lib/qrcode.min.js") {
        await route.fulfill({ status: 200, contentType: "application/javascript", body: qrJs });
      } else if (url.pathname.endsWith(".js")) {
        await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
      } else {
        await route.fulfill({ status: 404, body: "" });
      }
    });

    await page.goto(`${SITE}/passes/generate-digital.html`, { waitUntil: "domcontentloaded" });
    await page.locator("#generatePassBtn").click();

    await page.waitForURL(`${SITE}/bundles.html?newPass=tiger-happy-mountain-silver#myGeneratedPasses`);
  });
});
