// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/hmrcResultsCard.browser.test.js
// Once HMRC's answer shows on a read page, the reader sees no empty card above it, and New search
// brings the form back with its fields. Each page is opened as it is on the way back from HMRC's
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

// Each read page, opened with its request waiting from before HMRC's authorisation.
const PAGES = [
  {
    path: "hmrc/vat/vatObligations.html",
    api: "**/api/v1/hmrc/vat/obligation*",
    answer: {
      obligations: [
        { periodKey: "17A1", start: "2017-01-01", end: "2017-03-31", due: "2017-05-07", status: "F", received: "2017-05-06" },
        { periodKey: "17A2", start: "2017-04-01", end: "2017-06-30", due: "2017-08-07", status: "O" },
      ],
    },
    pendingKey: "pendingObligationsRequest",
    pending: { vrn: "193054661", from: "2025-12-01", to: "2026-11-18" },
    results: "#obligationsResults",
    form: "#vatObligationsForm",
  },
  {
    path: "hmrc/vat/vatLiabilities.html",
    api: "**/api/v1/hmrc/vat/liability*",
    answer: { liabilities: [] },
    pendingKey: "pendingLiabilitiesRequest",
    pending: { vrn: "193054661", from: "2018-04-05", to: "2018-12-21" },
    results: "#liabilitiesResults",
  },
  {
    path: "hmrc/vat/vatPayments.html",
    api: "**/api/v1/hmrc/vat/payment*",
    answer: { payments: [] },
    pendingKey: "pendingPaymentsRequest",
    pending: { vrn: "193054661", from: "2018-02-27", to: "2018-12-21" },
    results: "#paymentsResults",
  },
  {
    path: "hmrc/vat/vatPenalties.html",
    api: "**/api/v1/hmrc/vat/penalty*",
    answer: { penalties: null },
    pendingKey: "pendingPenaltiesRequest",
    pending: { vrn: "193054661" },
    results: "#penaltiesResults",
  },
  {
    path: "hmrc/vat/viewVatReturn.html",
    api: "**/api/v1/hmrc/vat/return*",
    answer: {
      periodKey: "17A1",
      vatDueSales: 1000,
      vatDueAcquisitions: 0,
      totalVatDue: 1000,
      vatReclaimedCurrPeriod: 200,
      netVatDue: 800,
      totalValueSalesExVAT: 5000,
      totalValuePurchasesExVAT: 1000,
      totalValueGoodsSuppliedExVAT: 0,
      totalAcquisitionsExVAT: 0,
    },
    pendingKey: "pendingReturnRequest",
    pending: { vrn: "193054661", periodStart: "2017-01-01", periodEnd: "2017-03-31" },
    results: "#returnResults",
  },
  {
    path: "hmrc/itsa/businessDetails.html",
    api: "**/api/v1/hmrc/itsa/business/details*",
    answer: { listOfBusinesses: [] },
    pendingKey: "pendingBusinessDetailsRequest",
    pending: { nino: "AA123456A" },
    results: "#businessDetailsResults",
  },
  {
    path: "hmrc/itsa/obligations.html",
    api: "**/api/v1/hmrc/itsa/obligations*",
    answer: { obligations: [] },
    pendingKey: "pendingObligationsRequest",
    pending: { nino: "AA123456A" },
    results: "#obligationsResults",
  },
];

async function servePage(page, target) {
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
          storedGrantId: () => sessionStorage.getItem("hmrcGrantId"),
        };
      `,
    });
  });
  await page.route(target.api, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(target.answer) });
  });
  await page.addInitScript(
    ({ pendingKey, pending }) => {
      if (sessionStorage.getItem("hmrcGrantId")) return;
      sessionStorage.setItem("hmrcGrantId", "6b1f0c2e-8d4a-4f3b-9e7c-2a5d8f1b3c47");
      sessionStorage.setItem(pendingKey, JSON.stringify(pending));
      sessionStorage.setItem("currentActivity", window.location.pathname);
      localStorage.setItem("cognitoIdToken", "test-id-token");
    },
    { pendingKey: target.pendingKey, pending: target.pending },
  );
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

for (const target of PAGES) {
  for (const language of ["en", "cy"]) {
    test(`${target.path}: with HMRC's answer shown there is no empty card above it, and New search shows the form again (${language})`, async ({
      page,
    }) => {
      await servePage(page, target);
      await page.goto(`${baseUrl}/${language === "cy" ? "cy/" : ""}${target.path}`, { waitUntil: "domcontentloaded" });
      await expect(page.locator(target.results)).toBeVisible({ timeout: 10_000 });

      expect(await visibleEmptyCards(page)).toEqual([]);
      const name = target.path.replace(/[/.]/g, "-");
      await page.screenshot({ path: `target/browser-test-results/results-card-${name}-${language}.png`, fullPage: true });

      await page.locator("#newSearchBtn").click();
      await expect(page.locator(target.results)).toBeHidden();
      await expect(page.locator(target.form ?? "main form").first()).toBeVisible();
      expect(await visibleEmptyCards(page)).toEqual([]);
    });
  }
}
