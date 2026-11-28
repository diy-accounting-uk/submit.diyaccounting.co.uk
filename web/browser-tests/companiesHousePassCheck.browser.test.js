// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/companiesHousePassCheck.browser.test.js
//
// The Companies House filing pages check for a pass before they send. With no pass they send nothing
// and offer a day pass; a refusal for want of a pass is shown as one, not as a fault.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";

const PUBLIC_ROOT = path.join(process.cwd(), "web/public");
const SITE = "http://localhost:3000";

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

const HELD_BUNDLE = [{ bundleId: "resident-ltd", allocated: true }];
const ENTITLEMENT_REFUSAL = {
  message: "Forbidden - missing or insufficient bundle entitlement",
  error: { code: "BUNDLE_ENTITLEMENT_REQUIRED" },
};
const PSCS = [
  {
    name: "Eleanor Bramwell",
    nameElements: { title: "Mrs", forename: "Eleanor", surname: "Bramwell" },
    kind: "individual-person-with-significant-control",
    naturesOfControl: ["ownership-of-shares-50-to-75-percent"],
    notifiedOn: "2016-04-06",
    ceasedOn: null,
    dateOfBirth: { month: 1, year: 1970 },
  },
];

// The real page with the API answered here. Returns the filing requests that would reach Companies House.
async function openPage(page, pagePath, { bundles = [], filingAnswer } = {}) {
  const filings = [];
  await page.addInitScript(() => {
    try {
      localStorage.setItem("siteLanguage", "en");
      localStorage.setItem("consent.analytics", "declined");
      localStorage.setItem("cognitoIdToken", "mock-id-token");
      localStorage.setItem("userInfo", JSON.stringify({ sub: "user1", email: "person@example.com" }));
    } catch {}
  });
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname !== "localhost") return route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
    const pathname = decodeURIComponent(url.pathname);
    const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (pathname === "/api/v1/bundle") return json({ bundles, tokensRemaining: 10 });
    if (pathname === "/api/v1/companies-house/company/00000001")
      return json({ companyNumber: "00000001", companyName: "Test Company Ltd" });
    if (pathname === "/api/v1/companies-house/company/00000001/persons-with-significant-control") return json({ pscs: PSCS });
    if (
      request.method() === "POST" &&
      /^\/api\/v1\/companies-house\/(psc-cessation|sail-address|record-location|accounts|confirmation-statement)/.test(pathname)
    ) {
      filings.push(pathname);
      return json(filingAnswer.body, filingAnswer.status);
    }
    if (request.method() === "POST" && pathname.startsWith("/api/v1/hmrc/ct/")) {
      filings.push(pathname);
      return json(filingAnswer.body, filingAnswer.status);
    }
    if (pathname.startsWith("/api/")) return json({});
    if (pathname === "/companies-house/fileCompanyTaxReturn.page.js") {
      // The page script is a module, so the test reaches its send handler and request builder through this hook.
      const hook = `
window.__ctPage = { sending, handleSubmitReturn, useAccountsRequest(build) { companiesHouseRequest = build; } };`;
      return route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: fs.readFileSync(path.join(PUBLIC_ROOT, pathname), "utf-8") + hook,
      });
    }
    const filePath = path.join(PUBLIC_ROOT, pathname === "/" ? "index.html" : pathname);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      return route.fulfill({
        status: 200,
        contentType: CONTENT_TYPES[path.extname(filePath)] || "application/octet-stream",
        body: fs.readFileSync(filePath),
      });
    }
    return route.fulfill({ status: 404, contentType: "text/plain", body: "Not found" });
  });
  await page.goto(`${SITE}${pagePath}`, { waitUntil: "networkidle" });
  return filings;
}

async function fileCeasePsc(page) {
  await page.locator("#companyNumber").fill("00000001");
  await page.getByRole("button", { name: "Look up the persons with significant control" }).click();
  await page.getByLabel("Eleanor Bramwell (Individual)").check();
  await page.locator("#cessationDate").fill("2026-11-01");
  await page.locator("#confirmationDate").fill("2026-11-03");
  await page.locator("#companyAuthCode").fill("SIMCS01");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "File with Companies House" }).click();
}

async function fileRecordsLocation(page) {
  await page.locator("#companyNumber").fill("00000001");
  await page.getByRole("button", { name: "Look up the company" }).click();
  await page.locator("#change-to-office").check();
  await page.locator("#removeSail").check();
  await page.locator("#companyAuthCode").fill("SIMCS01");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "File with Companies House" }).click();
}

async function expectPassNeeded(page, service = "Companies House") {
  const message = page.locator("#statusMessagesContainer .status-message.status-error");
  await expect(message).toContainText("You need a pass for this");
  await expect(message).toContainText(`Nothing has been sent to ${service}.`);
  await expect(message.getByRole("link", { name: "Get a day pass" })).toHaveAttribute("href", "/bundles.html");
}

// The accounts and confirmation statement pages are built over several steps from register data; the
// test opens the step that holds the Submit button and gives the page's own payload builder a fixed answer.
async function fileAccounts(page) {
  await page.evaluate(() => {
    company = { companyNumber: "00000001", companyName: "Test Company Ltd" };
    buildAccountsPayload = () => ({ companyNumber: "00000001" });
    showView("previewView");
  });
  await page.locator("#companyAuthCode").fill("SIMCS01");
  await page.locator("#submitFilingBtn").click();
}

async function fileConfirmationStatement(page) {
  await page.evaluate(() => {
    company = { companyNumber: "00000001", companyName: "Test Company Ltd" };
    companyAuthCode = "SIMCS01";
    buildStatementPayload = () => ({ companyNumber: "00000001", reviewDate: "2026-11-01" });
    showView("previewView");
  });
  await page.locator("#submitFilingBtn").click();
}

const FORMS = [
  { name: "PSC cessation", path: "/companies-house/ceasePsc.html", file: fileCeasePsc },
  { name: "records location", path: "/companies-house/recordsLocation.html", file: fileRecordsLocation },
  { name: "micro-entity accounts", path: "/companies-house/fileMicroEntityAccounts.html", file: fileAccounts },
  { name: "small company accounts", path: "/companies-house/fileSmallCompanyAccounts.html", file: fileAccounts },
  { name: "confirmation statement", path: "/companies-house/fileConfirmationStatement.html", file: fileConfirmationStatement },
];

test.describe("Companies House form pass check", () => {
  for (const form of FORMS) {
    test(`${form.name}: with no pass, the filing sends nothing and offers a day pass`, async ({ page }) => {
      const filings = await openPage(page, form.path);
      await form.file(page);

      await expectPassNeeded(page);
      expect(filings).toEqual([]);
    });

    test(`${form.name}: a filing refused for want of a pass offers a day pass`, async ({ page }) => {
      const filings = await openPage(page, form.path, { bundles: HELD_BUNDLE, filingAnswer: { status: 403, body: ENTITLEMENT_REFUSAL } });
      await form.file(page);

      await expectPassNeeded(page);
      await expect(page.locator("#filingResult")).not.toContainText("Forbidden");
      expect(filings).toHaveLength(1);
    });
  }
});

test.describe("Company Tax Return pass check", () => {
  const CT_PAGE = "/companies-house/fileCompanyTaxReturn.html";

  // Sets the send step as the review leaves it and presses Submit.
  async function submitReturn(page, mode) {
    await page.waitForFunction(() => window.__ctPage);
    await page.evaluate((chosenMode) => {
      window.__ctPage.sending.mode = chosenMode;
      window.__ctPage.useAccountsRequest(() => ({ companyNumber: "00000001" }));
      document.getElementById("gatewayUserId").value = "gateway-user";
      document.getElementById("gatewayPassword").value = "gateway-password";
      document.getElementById("companyAuthCode").value = "SIMCS01";
      window.__ctPage.handleSubmitReturn();
    }, mode);
  }

  test("with no pass, a return filed with HMRC alone sends nothing and offers a day pass", async ({ page }) => {
    const filings = await openPage(page, CT_PAGE);
    await submitReturn(page, "hmrc");

    await expectPassNeeded(page, "HMRC");
    expect(filings).toEqual([]);
  });

  test("with no pass, accounts and return filed together send nothing and offer a day pass", async ({ page }) => {
    const filings = await openPage(page, CT_PAGE);
    await submitReturn(page, "both");

    await expectPassNeeded(page, "Companies House");
    expect(filings).toEqual([]);
  });

  test("accounts refused for want of a pass offer a day pass, not the raw refusal", async ({ page }) => {
    const filings = await openPage(page, CT_PAGE, {
      bundles: HELD_BUNDLE,
      filingAnswer: { status: 403, body: ENTITLEMENT_REFUSAL },
    });
    await submitReturn(page, "both");

    await expectPassNeeded(page, "Companies House");
    await expect(page.locator("#statusMessagesContainer")).not.toContainText("Forbidden");
    expect(filings).toEqual(["/api/v1/companies-house/accounts"]);
  });
});
