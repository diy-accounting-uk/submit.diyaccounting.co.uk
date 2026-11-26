// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/fileMicroEntityAccounts.fillFromFiling.browser.test.js
// The micro-entity form fills from a filing the person made: the books card lists their accounts and
// Company Tax Return receipts for the company looked up, and the chosen one fills the form from the
// accounts document it filed.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { microInputFromTestServiceCase, onRegisterCompany } from "@app/test-helpers/accountsDocumentCases.js";
import { buildMicroEntityAccounts } from "@app/services/microEntityAccountsIxbrl.js";
import { PEOPLE, registerCompany } from "@app/http-simulator/fixtures/register.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const PUBLIC_DIR = path.join(process.cwd(), "web/public");
const PAGE_PATH = "companies-house/fileMicroEntityAccounts.html";
const JOINERY = registerCompany("00000001");
const OTHER = registerCompany("00000003");
const MICRO_CASE = onRegisterCompany(
  JSON.parse(fs.readFileSync(path.join(process.cwd(), "scripts/fixtures/companies-house-test-service-cases.json"), "utf8")).find(
    (testCase) => testCase.name === "micro-entity-accounts",
  ),
  JOINERY,
  PEOPLE.eleanorBramwell,
  { addressLine1: "3 Church Street", cityOrTown: "Whitby", postalCode: "YO22 4DE", country: "England" },
);
const MICRO_INPUT = microInputFromTestServiceCase(MICRO_CASE);
const ACCOUNTS_NAME = "2026-10-24T10:15:00.000Z-00001A.json";

const RECEIPT_LIST = [
  {
    name: ACCOUNTS_NAME,
    kind: "companies-house-accounts",
    companyNumber: JOINERY.number,
    periodStart: MICRO_INPUT.periodStart,
    periodEnd: MICRO_INPUT.periodEnd,
    timestamp: "2026-10-24T10:15:00.000Z",
  },
  {
    name: "2026-10-25T10:15:00.000Z-00009Z.json",
    kind: "companies-house-accounts",
    companyNumber: OTHER.number,
    periodStart: MICRO_INPUT.periodStart,
    periodEnd: MICRO_INPUT.periodEnd,
    timestamp: "2026-10-25T10:15:00.000Z",
  },
];
const ACCOUNTS_RECORD = {
  kind: "companies-house-accounts",
  statusCode: "ACCEPT",
  submissionNumber: "00001A",
  companyNumber: JOINERY.number,
  rejections: [],
  filedDocument: buildMicroEntityAccounts(MICRO_INPUT),
};

const CONTENT_TYPES = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".toml": "text/x-toml",
  ".json": "application/json",
};

// The real site from disk, signed in, with the receipts and the company answered here.
async function openForm(page, requestedUrls = []) {
  await page.addInitScript((email) => {
    localStorage.setItem("cognitoIdToken", "mock-id-token");
    localStorage.setItem("userInfo", JSON.stringify({ sub: "user1", email }));
  }, PEOPLE.eleanorBramwell.email);
  const json = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "localhost") return route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
    const pathname = decodeURIComponent(url.pathname);
    if (pathname.startsWith("/api/")) requestedUrls.push(pathname);
    if (pathname === "/api/v1/hmrc/receipt") return json(route, { receipts: RECEIPT_LIST, filingsInProgress: [] });
    if (pathname === `/api/v1/hmrc/receipt/${ACCOUNTS_NAME}`) return json(route, ACCOUNTS_RECORD);
    if (pathname === `/api/v1/companies-house/company/${JOINERY.number}`) {
      return json(route, { companyNumber: JOINERY.number, companyName: JOINERY.name, jurisdiction: "england-wales" });
    }
    if (pathname === "/api/v1/bundle") return json(route, { bundles: [], tokensRemaining: 0 });
    if (pathname.startsWith("/api/")) return json(route, {});
    const filePath = path.join(PUBLIC_DIR, pathname === "/" ? "index.html" : pathname);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      return route.fulfill({
        status: 200,
        contentType: CONTENT_TYPES[path.extname(filePath)] || "application/octet-stream",
        body: fs.readFileSync(filePath),
      });
    }
    return route.fulfill({ status: 404, contentType: "text/plain", body: "Not found" });
  });
  await page.goto(`http://localhost:3000/${PAGE_PATH}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("#booksImportFile")).toBeAttached();
  await page.locator("#companyNumber").fill(JOINERY.number);
  await page.locator("#companyLookupBtn").click();
  await expect(page.locator("#formView")).toBeVisible();
}

test.describe("File micro-entity accounts page - fill from a filing you made", () => {
  test("lists the company's accounts filing and no other company's, and fills the form from the document it filed", async ({ page }) => {
    const requestedUrls = [];
    await openForm(page, requestedUrls);
    const choice = page.locator("#filedReceipts");
    await expect(choice).toBeVisible();
    await expect(choice.locator("label")).toHaveText("Or fill from a filing you made");
    await expect(page.locator("#filedReceiptsSelect option")).toHaveText([
      "Accounts filed at Companies House, 1 April 2025 to 31 March 2026, filed 24 October 2026",
    ]);

    await page.locator("#filedReceiptsUse").click();

    await expect(page.locator("#booksImportStatus")).toContainText(
      "your accounts filed at Companies House for 1 April 2025 to 31 March 2026",
      { timeout: 60_000 },
    );
    expect(requestedUrls).toContain(`/api/v1/hmrc/receipt/${ACCOUNTS_NAME}`);
    await expect(page.locator("#periodStart")).toHaveValue("2025-04-01");
    await expect(page.locator("#periodEnd")).toHaveValue("2026-03-31");
    await expect(page.locator("#currentFixedAssets")).toHaveValue(String(MICRO_INPUT.balanceSheet.current.fixedAssets));
    await expect(page.locator("#currentCurrentAssets")).toHaveValue(String(MICRO_INPUT.balanceSheet.current.currentAssets));
    await expect(page.locator("#currentProfitAndLossAccount")).toHaveValue(String(MICRO_INPUT.balanceSheet.current.profitAndLossAccount));
  });

  test("a company with no filing of its own shows no filing choice", async ({ page }) => {
    await openForm(page);
    await page.evaluate(() => window.booksImport.showFilingsFor("00000005"));
    await expect(page.locator("#filedReceipts")).toBeHidden();
  });
});
