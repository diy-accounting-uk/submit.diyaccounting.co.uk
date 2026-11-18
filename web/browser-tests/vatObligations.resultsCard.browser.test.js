// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/vatObligations.resultsCard.browser.test.js
// Once HMRC's obligations show, the reader sees no empty card above them, and New search brings
// the form back with its fields. The page is opened as it is on the way back from HMRC's
// authorisation: the request waits in sessionStorage and runs on load, with the form hidden.

import { test, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import path from "node:path";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

let serverProcess;
let baseUrl;

test.beforeAll(async () => {
  const port = await new Promise((resolve, reject) => {
    const child = spawn("node", ["scripts/static-server.mjs", "web/public"], {
      cwd: path.resolve(process.cwd()),
      stdio: ["ignore", "pipe", "pipe"],
    });
    serverProcess = child;
    child.stdout.on("data", (chunk) => {
      const match = chunk.toString().match(/LISTENING_ON:(\d+)/);
      if (match) resolve(Number(match[1]));
    });
    child.stderr.on("data", (chunk) => console.error(`[static-server] ${chunk}`));
    child.on("error", reject);
  });
  baseUrl = `http://127.0.0.1:${port}`;
});

test.afterAll(async () => {
  serverProcess?.kill();
});

const OBLIGATIONS = {
  obligations: [
    { periodKey: "17A1", start: "2017-01-01", end: "2017-03-31", due: "2017-05-07", status: "F", received: "2017-05-06" },
    { periodKey: "17A2", start: "2017-04-01", end: "2017-06-30", due: "2017-08-07", status: "O" },
  ],
};

async function servePage(page) {
  await page.route("**/submit.js", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: `
        import "/lib/utils/dom-utils.js";
        window.authorizedFetch = (url, options) => fetch(url, options);
        window.getGovClientHeaders = async () => ({});
      `,
    });
  });
  await page.route("**/hmrc-scope-check.js", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: `
        window.hmrcScopeCheck = {
          isTokenSufficient: async () => true,
          clearHmrcToken: () => {},
          getOAuthScopeString: async () => "read:vat",
        };
      `,
    });
  });
  await page.route("**/api/v1/hmrc/vat/obligation*", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(OBLIGATIONS) });
  });
  await page.addInitScript(() => {
    if (sessionStorage.getItem("hmrcGrantId")) return;
    sessionStorage.setItem("hmrcGrantId", "00000000-0000-4000-8000-000000000001");
    sessionStorage.setItem("pendingObligationsRequest", JSON.stringify({ vrn: "193054661", from: "2025-12-01", to: "2026-11-18" }));
    sessionStorage.setItem("currentActivity", window.location.pathname);
    localStorage.setItem("cognitoIdToken", "test-id-token");
  });
}

// A card the reader sees with nothing visible inside it.
async function visibleEmptyCards(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll("main .form-container"))
      .filter((card) => card.getBoundingClientRect().height > 0 && getComputedStyle(card).display !== "none")
      .filter(
        (card) =>
          !Array.from(card.querySelectorAll("*")).some((child) => {
            const box = child.getBoundingClientRect();
            return box.width > 0 && box.height > 0 && getComputedStyle(child).visibility !== "hidden";
          }),
      )
      .map((card) => card.id || card.className),
  );
}

for (const language of ["en", "cy"]) {
  test(`with the obligations shown there is no empty card above them, and New search shows the form again (${language})`, async ({
    page,
  }) => {
    await servePage(page);
    await page.goto(`${baseUrl}/${language === "cy" ? "cy/" : ""}hmrc/vat/vatObligations.html`, { waitUntil: "domcontentloaded" });

    await expect(page.locator("#obligationsResults")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("#obligationsResults")).toContainText("2017");

    expect(await visibleEmptyCards(page)).toEqual([]);
    await page.screenshot({ path: `target/browser-test-results/vatObligations-results-card-${language}.png`, fullPage: true });

    await page.locator("#newSearchBtn").click();
    await expect(page.locator("#obligationsResults")).toBeHidden();
    await expect(page.locator("#vatObligationsForm")).toBeVisible();
    await expect(page.locator("#vrn")).toBeVisible();
    await expect(page.locator("#retrieveBtn")).toBeVisible();
    expect(await visibleEmptyCards(page)).toEqual([]);
  });
}
