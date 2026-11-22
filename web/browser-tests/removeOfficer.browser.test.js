// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/removeOfficer.browser.test.js
// The officer resignation page as a reader sees it, in English and in Welsh, at desktop and phone
// width: the company, the register's current directors and secretaries to choose from, the name
// split for checking, the day of birth a director needs, the review, and the outcome Companies
// House gives. The API answers come from the routes here.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";

const PUBLIC_ROOT = path.join(process.cwd(), "web/public");
const SITE = "http://localhost:3000";
const SCREENSHOT_DIR = path.join(process.cwd(), "target/off2");

const CONTENT_TYPES = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".toml": "text/x-toml",
  ".txt": "text/plain",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const OFFICERS = [
  {
    name: "TENNANT, Marcus John",
    officerRole: "director",
    appointedOn: "2015-01-01",
    dateOfBirth: { month: 2, year: 1975 },
  },
  {
    name: "SIMULATOR SECRETARIES LIMITED",
    officerRole: "corporate-secretary",
    appointedOn: "2018-03-01",
  },
  {
    name: "BRAMWELL, Eleanor",
    officerRole: "secretary",
    appointedOn: "2016-01-01",
  },
  {
    name: "FORMER, Director",
    officerRole: "director",
    appointedOn: "2010-01-01",
    resignedOn: "2014-01-01",
    dateOfBirth: { month: 5, year: 1960 },
  },
];

// The real site from disk, signed in with the resident Ltd bundle, and the Companies House routes
// answered here. Each filing request's body is recorded.
async function serveSite(page, { filings = [], outcome = { statusCode: "ACCEPT", rejections: [] } } = {}) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("consent.analytics", "declined");
      localStorage.setItem("cognitoIdToken", "mock-id-token");
      localStorage.setItem("userInfo", JSON.stringify({ sub: "user1", email: "pat@example.com" }));
    } catch {}
  });
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname !== "localhost") return route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
    const pathname = decodeURIComponent(url.pathname);
    const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (pathname === "/api/v1/bundle") return json({ bundles: [{ bundleId: "resident-ltd", allocated: true }], tokensRemaining: 10 });
    if (pathname === "/api/v1/companies-house/company/00000001")
      return json({ companyNumber: "00000001", companyName: "SIMULATOR EXAMPLE COMPANY LIMITED" });
    if (pathname === "/api/v1/companies-house/company/00000001/officers") return json({ officers: OFFICERS });
    if (pathname === "/api/v1/companies-house/officer-resignation" && request.method() === "POST") {
      filings.push(JSON.parse(request.postData()));
      return json({ submissionNumber: "000123", pollInterval: 1 }, 201);
    }
    if (pathname === "/api/v1/companies-house/forms/officer-resignation/000123") return json({ submissionNumber: "000123", ...outcome });
    if (pathname.startsWith("/api/")) return json({});
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
}

async function shoot(page, name) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `removeOfficer-${name}-${page.viewportSize().width}.png`), fullPage: true });
}

const noSideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

async function lookUp(page, button) {
  await page.locator("#companyNumber").fill("00000001");
  await page.getByRole("button", { name: button }).click();
}

for (const width of [1280, 390]) {
  test(`a director who is a person is removed in English at ${width}px, with the name split and the day of birth added`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const filings = [];
    await serveSite(page, { filings });
    await page.goto(`${SITE}/companies-house/removeOfficer.html`, { waitUntil: "networkidle" });

    await expect(page.locator("h1")).toHaveText("Remove a director or secretary");
    await expect(page.locator("p.hint[data-feature-status]")).toContainText("Status: sandbox.");
    await lookUp(page, "Look up the directors and secretaries");

    await expect(page.locator("#officerChoices label")).toHaveText([
      "TENNANT, Marcus John (Director)",
      "SIMULATOR SECRETARIES LIMITED (Corporate secretary)",
      "BRAMWELL, Eleanor (Secretary)",
    ]);
    await page.getByLabel("TENNANT, Marcus John (Director)").check();
    await expect(page.locator("#officerSurname")).toHaveValue("TENNANT");
    await expect(page.locator("#officerForename")).toHaveValue("Marcus");
    await expect(page.locator("#officerOtherForenames")).toHaveValue("John");
    await expect(page.locator("#dobMonth")).toHaveValue("2");
    await expect(page.locator("#dobYear")).toHaveValue("1975");
    await expect(page.locator("#dobDay")).toHaveValue("");
    await expect(page.locator("#corporateFields")).toBeHidden();
    await page.locator("#dobDay").fill("14");
    await page.locator("#resignationDate").fill("2026-11-01");
    await page.locator("#companyAuthCode").fill("SIMCS01");
    expect(await noSideScroll(page)).toBe(true);
    await shoot(page, "en");

    await page.getByRole("button", { name: "Continue" }).click();
    const review = page.locator("#reviewList");
    await expect(review).toContainText("Director");
    await expect(review).toContainText("14 February 1975");
    await expect(review).toContainText("1 November 2026");
    expect(await noSideScroll(page)).toBe(true);
    await shoot(page, "en-review");

    await page.getByRole("button", { name: "File with Companies House" }).click();
    await expect(page.locator("#filingResult")).toContainText("Submission 000123 was accepted.", { timeout: 15000 });
    expect(filings[0]).toMatchObject({
      companyNumber: "00000001",
      companyName: "SIMULATOR EXAMPLE COMPANY LIMITED",
      companyAuthCode: "SIMCS01",
      officerRole: "director",
      corporate: false,
      forename: "Marcus",
      otherForenames: "John",
      surname: "TENNANT",
      dateOfBirth: "1975-02-14",
      resignationDate: "2026-11-01",
    });
    expect(await noSideScroll(page)).toBe(true);
  });

  test(`a corporate secretary is removed in Welsh at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const filings = [];
    await serveSite(page, { filings });
    await page.goto(`${SITE}/cy/companies-house/removeOfficer.html`, { waitUntil: "networkidle" });

    await expect(page.locator("html")).toHaveAttribute("lang", "cy");
    await expect(page.locator("h1")).toHaveText("Tynnu cyfarwyddwr neu ysgrifennydd");
    await expect(page.locator("p.hint[data-feature-status]")).toContainText("Statws: amgylchedd prawf (sandbox).");
    await lookUp(page, "Chwilio am y cyfarwyddwyr a’r ysgrifenyddion");
    await page.getByLabel("SIMULATOR SECRETARIES LIMITED (Ysgrifennydd corfforaethol)").check();
    await expect(page.locator("#corporateName")).toHaveValue("SIMULATOR SECRETARIES LIMITED");
    await expect(page.locator("#personFields")).toBeHidden();
    await expect(page.locator("#dobFields")).toBeHidden();
    await page.locator("#resignationDate").fill("2026-11-01");
    await page.locator("#companyAuthCode").fill("SIMCS01");
    expect(await noSideScroll(page)).toBe(true);
    await shoot(page, "cy");

    await page.getByRole("button", { name: "Parhau" }).click();
    await expect(page.locator("#reviewList")).toContainText("Dyddiad y daeth y penodiad i ben");
    expect(await noSideScroll(page)).toBe(true);
    await shoot(page, "cy-review");

    await page.getByRole("button", { name: "Ffeilio gyda Thŷ’r Cwmnïau" }).click();
    await expect(page.locator("#filingResult")).toContainText("Statws cyflwyniad 000123:", { timeout: 15000 });
    expect(filings[0]).toMatchObject({ officerRole: "secretary", corporate: true, corporateName: "SIMULATOR SECRETARIES LIMITED" });
    expect(filings[0]).not.toHaveProperty("surname");
    expect(filings[0]).not.toHaveProperty("dateOfBirth");
    expect(await noSideScroll(page)).toBe(true);
  });
}

test("a secretary who is a person is filed with the name and no date of birth", async ({ page }) => {
  const filings = [];
  await serveSite(page, { filings });
  await page.goto(`${SITE}/companies-house/removeOfficer.html?companyNumber=00000001&officerName=BRAMWELL%2C%20Eleanor`, {
    waitUntil: "networkidle",
  });
  await expect(page.locator("#companyNumber")).toHaveValue("00000001");
  await page.getByRole("button", { name: "Look up the directors and secretaries" }).click();
  await expect(page.getByLabel("BRAMWELL, Eleanor (Secretary)")).toBeChecked();
  await expect(page.locator("#dobFields")).toBeHidden();
  await page.locator("#resignationDate").fill("2026-11-01");
  await page.locator("#companyAuthCode").fill("SIMCS01");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "File with Companies House" }).click();
  await expect(page.locator("#filingResult")).toContainText("Submission 000123 was accepted.", { timeout: 15000 });
  expect(filings[0]).toMatchObject({ officerRole: "secretary", corporate: false, surname: "BRAMWELL", forename: "Eleanor" });
  expect(filings[0]).not.toHaveProperty("dateOfBirth");
});

test("a director's missing day of birth and an end date before the appointment are refused before anything is sent", async ({ page }) => {
  const filings = [];
  await serveSite(page, { filings });
  await page.goto(`${SITE}/companies-house/removeOfficer.html`, { waitUntil: "networkidle" });
  await lookUp(page, "Look up the directors and secretaries");
  await page.getByLabel("TENNANT, Marcus John (Director)").check();
  await page.locator("#resignationDate").fill("2026-11-01");
  await page.locator("#companyAuthCode").fill("SIMCS01");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#statusMessagesContainer")).toContainText("Enter the director's date of birth as a day, month and year.");

  await page.locator("#dobDay").fill("14");
  await page.locator("#resignationDate").fill("2014-12-31");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#statusMessagesContainer")).toContainText(
    "The appointment cannot end before the date it began, 1 January 2015.",
  );
  await expect(page.locator("#formView")).toBeVisible();
  expect(filings).toHaveLength(0);
});

test("a rejection shows Companies House's reason", async ({ page }) => {
  await serveSite(page, {
    outcome: { statusCode: "REJECT", rejections: [{ rejectCode: "9998", description: "The officer named does not match the register." }] },
  });
  await page.goto(`${SITE}/companies-house/removeOfficer.html`, { waitUntil: "networkidle" });
  await lookUp(page, "Look up the directors and secretaries");
  await page.getByLabel("SIMULATOR SECRETARIES LIMITED (Corporate secretary)").check();
  await page.locator("#resignationDate").fill("2026-11-01");
  await page.locator("#companyAuthCode").fill("SIMCS01");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "File with Companies House" }).click();
  const result = page.locator("#filingResult");
  await expect(result).toContainText("Submission 000123 was rejected.", { timeout: 15000 });
  await expect(result).toContainText("9998: The officer named does not match the register.");
});
