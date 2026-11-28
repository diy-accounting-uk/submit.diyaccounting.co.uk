// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/itsaPeriodPassCheck.browser.test.js
//
// The Income Tax period pages check for a pass before they send anything to HMRC or leave for its
// sign-in. With no pass they send nothing and offer a day pass; a refusal for want of a pass keeps
// the HMRC grant for the retry.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";

const PUBLIC_ROOT = path.join(process.cwd(), "web/public");
const GRANT_ID = "0a1b2c3d-0a1b-4a1b-8a1b-0a1b2c3d4e5f";
const ITSA_SCOPES = "write:self-assessment read:self-assessment read:self-assessment-assist write:self-assessment-assist";

const CONTENT_TYPES = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".toml": "text/x-toml",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

const HELD_PRO = [{ bundleId: "resident-pro", allocated: true, tokensGranted: 3, tokensRemaining: 3 }];
const ENTITLEMENT_REFUSAL = {
  message: "Forbidden - missing or insufficient bundle entitlement",
  error: { code: "BUNDLE_ENTITLEMENT_REQUIRED" },
};

// The real page with the API answered here. Returns the requests that would reach HMRC.
async function openPage(page, pagePath, { bundles = [], filingAnswer, session = {} } = {}) {
  const hmrcRequests = [];
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "localhost") {
      await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      let answer = { status: 200, body: {} };
      if (url.pathname === "/api/v1/bundle") answer = { status: 200, body: { bundles } };
      if (url.pathname.startsWith("/api/v1/hmrc/")) {
        hmrcRequests.push(`${route.request().method()} ${url.pathname}`);
        answer = filingAnswer || answer;
      }
      await route.fulfill({ status: answer.status, contentType: "application/json", body: JSON.stringify(answer.body) });
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
  await page.addInitScript((stored) => {
    localStorage.setItem("siteLanguage", "en");
    localStorage.setItem("cognitoIdToken", "test-id-token");
    for (const [key, value] of Object.entries(stored)) sessionStorage.setItem(key, value);
  }, session);
  await page.goto(`http://localhost:3000${pagePath}`, { waitUntil: "load" });
  return hmrcRequests;
}

const grantSession = () => ({ hmrcGrantId: GRANT_ID, hmrcTokenScope: ITSA_SCOPES });

async function fillIdentifiers(page) {
  await page.fill("#nino", "QQ123456C");
  await page.fill("#businessId", "XAIS12345678901");
  await page.selectOption("#taxYear", "2024-25");
}

async function expectPassNeeded(page) {
  const message = page.locator("#statusMessagesContainer .status-message.status-error");
  await expect(message).toContainText("You need a pass for this");
  await expect(message).toContainText("Nothing has been sent to HMRC.");
  await expect(message.getByRole("link", { name: "Get a day pass" })).toHaveAttribute("href", "/bundles.html");
}

const FOREIGN_CRITERIA = { nino: "QQ123456C", businessId: "XAIS12345678901", taxYear: "2024-25" };

// Each page: where it lives, how its form is filled and sent, and what it stores before the HMRC sign-in.
const PAGES = [
  {
    name: "self-employment quarterly update",
    path: "/hmrc/itsa/selfEmploymentPeriod.html",
    submit: "#itsaSelfEmploymentPeriodForm button[type=submit]",
    async fill(page) {
      await fillIdentifiers(page);
      await page.fill("#periodStartDate", "2024-04-06");
      await page.fill("#periodEndDate", "2024-07-05");
      await page.fill("#turnover", "1000");
    },
    pendingKey: "pendingSelfEmploymentPeriodRequest",
    pending: {
      periodData: {
        nino: "QQ123456C",
        businessId: "XAIS12345678901",
        taxYear: "2024-25",
        periodStartDate: "2024-04-06",
        periodEndDate: "2024-07-05",
        periodIncome: { turnover: 1000, other: 0 },
        periodExpenses: {},
        periodDisallowableExpenses: {},
      },
      testScenario: "",
      runFraudPreventionHeaderValidation: false,
    },
  },
  {
    name: "self-employment period amendment",
    path: "/hmrc/itsa/selfEmploymentPeriodAmend.html",
    submit: "#itsaSelfEmploymentPeriodAmendForm button[type=submit]",
    async fill(page) {
      await fillIdentifiers(page);
      await page.fill("#periodId", "2024-04-06_2024-07-05");
      await page.fill("#turnover", "1000");
    },
    pendingKey: "pendingSelfEmploymentPeriodAmendRequest",
    pending: {
      amendData: {
        nino: "QQ123456C",
        businessId: "XAIS12345678901",
        taxYear: "2024-25",
        periodId: "2024-04-06_2024-07-05",
        periodIncome: { turnover: 1000, other: 0 },
        periodExpenses: {},
      },
      testScenario: "",
      runFraudPreventionHeaderValidation: false,
    },
  },
  {
    name: "UK property quarterly update",
    path: "/hmrc/itsa/ukPropertyPeriod.html",
    submit: "#itsaUkPropertyPeriodForm button[type=submit]",
    async fill(page) {
      await fillIdentifiers(page);
      await page.fill("#fromDate", "2024-04-06");
      await page.fill("#toDate", "2024-07-05");
      await page.fill("#periodAmount", "1000");
    },
    pendingKey: "pendingUkPropertyPeriodRequest",
    pending: {
      periodData: {
        nino: "QQ123456C",
        businessId: "XAIS12345678901",
        taxYear: "2024-25",
        fromDate: "2024-04-06",
        toDate: "2024-07-05",
        ukNonFhlProperty: { income: { periodAmount: 1000 }, expenses: {} },
      },
      testScenario: "",
      runFraudPreventionHeaderValidation: false,
    },
  },
  {
    name: "UK property period amendment",
    path: "/hmrc/itsa/ukPropertyPeriodAmend.html",
    submit: "#itsaUkPropertyPeriodAmendForm button[type=submit]",
    async fill(page) {
      await fillIdentifiers(page);
      await page.fill("#submissionId", "4557ecb5-fd32-48cc-81f5-e6acd1099f3c");
      await page.fill("#periodAmount", "1000");
    },
    pendingKey: "pendingUkPropertyPeriodAmendRequest",
    pending: {
      amendData: {
        nino: "QQ123456C",
        businessId: "XAIS12345678901",
        taxYear: "2024-25",
        submissionId: "4557ecb5-fd32-48cc-81f5-e6acd1099f3c",
        ukNonFhlProperty: { income: { periodAmount: 1000 }, expenses: {} },
      },
      testScenario: "",
      runFraudPreventionHeaderValidation: false,
    },
  },
  {
    name: "foreign property quarterly update",
    path: "/hmrc/itsa/foreignPropertyPeriod.html",
    submit: "#itsaForeignPropertyPeriodForm button[type=submit]",
    async fill(page) {
      await fillIdentifiers(page);
      await page.fill("#fromDate", "2024-04-06");
      await page.fill("#toDate", "2024-07-05");
      await page.fill("#fhl-rentAmount", "1000");
    },
    pendingKey: "pendingForeignPropertyPeriodRequest",
    pending: {
      action: "submit",
      criteria: { ...FOREIGN_CRITERIA, fromDate: "2024-04-06", toDate: "2024-07-05" },
      period: {
        ...FOREIGN_CRITERIA,
        fromDate: "2024-04-06",
        toDate: "2024-07-05",
        foreignFhlEea: { income: { rentAmount: 1000 }, expenses: {} },
      },
    },
  },
  {
    name: "foreign property period amendment",
    path: "/hmrc/itsa/foreignPropertyPeriodAmend.html",
    submit: "#itsaForeignPropertyPeriodAmendForm button[type=submit]",
    async fill(page) {
      await fillIdentifiers(page);
      await page.fill("#submissionId", "4557ecb5-fd32-48cc-81f5-e6acd1099f3c");
      await page.fill("#fhl-rentAmount", "1000");
    },
    pendingKey: "pendingForeignPropertyPeriodAmendRequest",
    pending: {
      action: "submit",
      criteria: { ...FOREIGN_CRITERIA, submissionId: "4557ecb5-fd32-48cc-81f5-e6acd1099f3c" },
      period: {
        ...FOREIGN_CRITERIA,
        submissionId: "4557ecb5-fd32-48cc-81f5-e6acd1099f3c",
        foreignFhlEea: { income: { rentAmount: 1000 }, expenses: {} },
      },
    },
  },
];

test.describe("Income Tax period pages pass check", () => {
  for (const spec of PAGES) {
    test(`${spec.name}: with no pass, the submit sends nothing and leaves for no HMRC sign-in`, async ({ page }) => {
      const hmrcRequests = await openPage(page, spec.path);
      await spec.fill(page);
      await page.locator(spec.submit).click();

      await expectPassNeeded(page);
      expect(page.url()).toBe(`http://localhost:3000${spec.path}`);
      expect(hmrcRequests).toEqual([]);
      expect(await page.evaluate((key) => sessionStorage.getItem(key), spec.pendingKey)).toBeNull();
    });

    test(`${spec.name}: with no pass, a request stored before the HMRC sign-in is not sent and the grant stays`, async ({ page }) => {
      const hmrcRequests = await openPage(page, spec.path, {
        session: { ...grantSession(), [spec.pendingKey]: JSON.stringify(spec.pending) },
      });

      await expectPassNeeded(page);
      expect(hmrcRequests).toEqual([]);
      expect(await page.evaluate(() => sessionStorage.getItem("hmrcGrantId"))).toBe(GRANT_ID);
      expect(await page.evaluate((key) => sessionStorage.getItem(key), spec.pendingKey)).toBeNull();
    });

    test(`${spec.name}: a submit refused for want of a pass offers a day pass and keeps the HMRC grant`, async ({ page }) => {
      const hmrcRequests = await openPage(page, spec.path, {
        bundles: HELD_PRO,
        session: { ...grantSession(), [spec.pendingKey]: JSON.stringify(spec.pending) },
        filingAnswer: { status: 403, body: ENTITLEMENT_REFUSAL },
      });

      await expectPassNeeded(page);
      expect(hmrcRequests.length).toBeGreaterThan(0);
      expect(await page.evaluate(() => sessionStorage.getItem("hmrcGrantId"))).toBe(GRANT_ID);
    });
  }
});
