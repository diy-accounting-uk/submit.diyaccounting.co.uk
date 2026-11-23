// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/changeAccountingRefDate.browser.test.js
// The change of accounting reference date page as a reader sees it, in English and in Welsh, at
// desktop and phone width: the company, the two periods the register shows, the new end date, the
// review, the outcome Companies House gives, and the period the register shows after an accepted
// change. The API answers come from the routes here.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { accountsDueNineMonthsAfter } from "../public/lib/accounting-reference-period.js";
import { PEOPLE, registerCompany } from "@app/http-simulator/fixtures/register.js";

const USER_EMAIL = PEOPLE.samPatel.email;
const COMPANY = registerCompany("00000001");

// The company's accounting periods end on 30 April. The current period is the one running today,
// so a shortened, an extended and an over-long period are all ahead of today.
const TODAY = new Date().toISOString().slice(0, 10);
const YEAR = TODAY > `${TODAY.slice(0, 4)}-04-30` ? Number(TODAY.slice(0, 4)) + 1 : Number(TODAY.slice(0, 4));
const PREVIOUS_YEAR = YEAR - 1;
const EARLIER_YEAR = YEAR - 2;
const NEXT_YEAR = YEAR + 1;

const PUBLIC_ROOT = path.join(process.cwd(), "web/public");
const SITE = "http://localhost:3000";
const SCREENSHOT_DIR = path.join(process.cwd(), "target/ard1");

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

const PROFILE = {
  companyNumber: "00000001",
  companyName: COMPANY.name,
  accountsNextPeriodStart: `${PREVIOUS_YEAR}-05-01`,
  accountsNextPeriodEnd: `${YEAR}-04-30`,
  accountsNextDue: `${NEXT_YEAR}-01-31`,
  accountsLastPeriodStart: `${EARLIER_YEAR}-05-01`,
  accountsLastPeriodEnd: `${PREVIOUS_YEAR}-04-30`,
};

// The real site from disk, signed in with the resident Ltd bundle, and the Companies House routes
// answered here. Each filing request's body is recorded, and an accepted filing of the current
// period moves that period's end in the profile the next read answers.
async function serveSite(page, { filings = [], outcome = { statusCode: "ACCEPT", rejections: [] }, profile = PROFILE } = {}) {
  let registerProfile = { ...profile };
  await page.addInitScript((email) => {
    try {
      localStorage.setItem("consent.analytics", "declined");
      localStorage.setItem("cognitoIdToken", "mock-id-token");
      localStorage.setItem("userInfo", JSON.stringify({ sub: "user1", email }));
    } catch {}
  }, USER_EMAIL);
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname !== "localhost") return route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
    const pathname = decodeURIComponent(url.pathname);
    const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (pathname === "/api/v1/bundle") return json({ bundles: [{ bundleId: "resident-ltd", allocated: true }], tokensRemaining: 10 });
    if (pathname === "/api/v1/companies-house/company/00000001") return json(registerProfile);
    if (pathname === "/api/v1/companies-house/accounting-reference-date" && request.method() === "POST") {
      filings.push(JSON.parse(request.postData()));
      return json({ submissionNumber: "000123", pollInterval: 1 }, 201);
    }
    if (pathname === "/api/v1/companies-house/forms/accounting-reference-date/000123") {
      const filed = filings.at(-1);
      if (outcome.statusCode === "ACCEPT" && filed?.currentPeriodEnd === registerProfile.accountsNextPeriodEnd) {
        registerProfile = {
          ...registerProfile,
          accountsNextPeriodEnd: filed.newPeriodEnd,
          accountsNextDue: accountsDueNineMonthsAfter(filed.newPeriodEnd),
        };
      }
      return json({ submissionNumber: "000123", ...outcome });
    }
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
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}-${page.viewportSize().width}.png`), fullPage: true });
}

const noSideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

async function lookUpAndFill(page, { lookUp, newPeriodEnd }) {
  await page.locator("#companyNumber").fill("00000001");
  await page.getByRole("button", { name: lookUp }).click();
  await page.locator("#newPeriodEnd").fill(newPeriodEnd);
  await page.locator("#companyAuthCode").fill("SIMCS01");
}

for (const width of [1280, 390]) {
  test(`a shortened period is filed in English at ${width}px, and the page then shows the period the register holds`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const filings = [];
    await serveSite(page, { filings });
    await page.goto(`${SITE}/companies-house/changeAccountingRefDate.html`, { waitUntil: "networkidle" });

    await expect(page.locator("h1")).toHaveText("Change the accounting reference date");
    await expect(page.locator("p.hint[data-feature-status]")).toContainText("Status: sandbox.");
    await page.locator("#companyNumber").fill("00000001");
    await page.getByRole("button", { name: "Look up the accounting periods" }).click();

    await expect(page.locator("#periodChoices label")).toHaveText([
      `1 May ${PREVIOUS_YEAR} to 30 April ${YEAR} (the current period)`,
      `1 May ${EARLIER_YEAR} to 30 April ${PREVIOUS_YEAR} (the previous period)`,
    ]);
    await expect(page.getByLabel(`1 May ${PREVIOUS_YEAR} to 30 April ${YEAR} (the current period)`)).toBeChecked();
    await expect(page.locator("#formView")).toContainText(COMPANY.name);
    await expect(page.locator("#formView")).toContainText(
      "You cannot extend a period beyond 18 months unless the company is in administration.",
    );
    await expect(page.locator("#extensionGroundGroup")).toBeHidden();
    expect(await noSideScroll(page)).toBe(true);
    await shoot(page, "form");

    await page.locator("#newPeriodEnd").fill(`${YEAR}-03-31`);
    await page.locator("#companyAuthCode").fill("SIMCS01");
    await page.getByRole("button", { name: "Continue" }).click();

    const review = page.locator("#reviewList");
    await expect(review).toContainText(`1 May ${PREVIOUS_YEAR} to 30 April ${YEAR}`);
    await expect(review).toContainText(`Shortened so as to end on 31 March ${YEAR}`);
    await expect(review).toContainText(`1 May ${PREVIOUS_YEAR} to 31 March ${YEAR}`);
    await expect(page.locator("#tooLongWarning")).toBeHidden();
    await expect(page.locator("#reviewView")).toContainText("You must update your accounting period dates with HM Revenue and Customs");
    expect(await noSideScroll(page)).toBe(true);
    await shoot(page, "review");

    await page.getByRole("button", { name: "File with Companies House" }).click();
    await expect(page.locator("#filingResult")).toContainText("Submission 000123 was accepted.", { timeout: 15000 });
    await expect(page.locator("#registerNow")).toContainText(
      `The register now shows the accounting period 1 May ${PREVIOUS_YEAR} to 31 March ${YEAR}, with its accounts due by 31 December ${YEAR}.`,
    );
    await expect(page.locator("#registerNow a")).toHaveAttribute("href", "companySearch.html?companyNumber=00000001");
    expect(filings[0]).toMatchObject({
      companyNumber: "00000001",
      companyName: COMPANY.name,
      companyAuthCode: "SIMCS01",
      currentPeriodEnd: `${YEAR}-04-30`,
      newPeriodEnd: `${YEAR}-03-31`,
    });
    expect(filings[0]).not.toHaveProperty("fiveYearExtensionReason");
    expect(await noSideScroll(page)).toBe(true);
    await shoot(page, "accepted");
  });

  test(`an extended period is filed in Welsh at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const filings = [];
    await serveSite(page, { filings });
    await page.goto(`${SITE}/cy/companies-house/changeAccountingRefDate.html`, { waitUntil: "networkidle" });

    await expect(page.locator("html")).toHaveAttribute("lang", "cy");
    await expect(page.locator("h1")).toHaveText("Newid y dyddiad cyfeirnod cyfrifyddu");
    await expect(page.locator("p.hint[data-feature-status]")).toContainText("Statws: amgylchedd prawf (sandbox).");
    await lookUpAndFill(page, { lookUp: "Chwilio am y cyfnodau cyfrifyddu", newPeriodEnd: `${YEAR}-09-30` });
    await expect(page.locator("#periodChoices label").first()).toHaveText(
      `1 Mai ${PREVIOUS_YEAR} i 30 Ebrill ${YEAR} (y cyfnod presennol)`,
    );
    await expect(page.locator("#formView blockquote p").first()).toHaveAttribute("lang", "en-GB");
    expect(await noSideScroll(page)).toBe(true);
    await shoot(page, "form-cy");

    await page.getByRole("button", { name: "Parhau" }).click();
    await expect(page.locator("#reviewList")).toContainText(`Wedi’i ymestyn i orffen ar 30 Medi ${YEAR}`);
    await expect(page.locator("#tooLongWarning")).toBeHidden();
    expect(await noSideScroll(page)).toBe(true);
    await shoot(page, "review-cy");

    await page.getByRole("button", { name: "Ffeilio gyda Thŷ’r Cwmnïau" }).click();
    await expect(page.locator("#filingResult")).toContainText("Statws cyflwyniad 000123:", { timeout: 15000 });
    await expect(page.locator("#registerNow")).toContainText(
      `Mae’r gofrestr bellach yn dangos y cyfnod cyfrifyddu 1 Mai ${PREVIOUS_YEAR} i 30 Medi ${YEAR}`,
    );
    expect(filings[0]).toMatchObject({ currentPeriodEnd: `${YEAR}-04-30`, newPeriodEnd: `${YEAR}-09-30` });
    expect(await noSideScroll(page)).toBe(true);
    await shoot(page, "accepted-cy");
  });

  test(`an extension past 18 months is warned of, sent, and shows Companies House's rejection at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const filings = [];
    await serveSite(page, {
      filings,
      outcome: {
        statusCode: "REJECT",
        rejections: [
          {
            rejectCode: "9997",
            description: "The accounting reference period cannot be extended beyond 18 months unless the company is in administration.",
          },
        ],
      },
    });
    await page.goto(`${SITE}/companies-house/changeAccountingRefDate.html`, { waitUntil: "networkidle" });
    await lookUpAndFill(page, { lookUp: "Look up the accounting periods", newPeriodEnd: `${YEAR}-12-31` });
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.locator("#reviewList")).toContainText(`Extended so as to end on 31 December ${YEAR}`);
    await expect(page.locator("#tooLongWarning")).toContainText("This makes the period longer than 18 months.");
    expect(await noSideScroll(page)).toBe(true);
    await shoot(page, "too-long-review");

    await page.getByRole("button", { name: "File with Companies House" }).click();
    const result = page.locator("#filingResult");
    await expect(result).toContainText("Submission 000123 was rejected.", { timeout: 15000 });
    await expect(result).toContainText("9997: The accounting reference period cannot be extended beyond 18 months");
    await expect(page.locator("#registerNow")).toBeHidden();
    expect(filings[0]).toMatchObject({ currentPeriodEnd: `${YEAR}-04-30`, newPeriodEnd: `${YEAR}-12-31` });
    expect(await noSideScroll(page)).toBe(true);
    await shoot(page, "too-long-rejected");
  });
}

for (const [language, address] of [
  ["English", "/companies-house/changeAccountingRefDate.html"],
  ["Welsh", "/cy/companies-house/changeAccountingRefDate.html"],
]) {
  test(`the quoted five-year rule is followed by the categories it names, in English on the ${language} page`, async ({ page }) => {
    await serveSite(page);
    await page.goto(`${SITE}${address}`, { waitUntil: "networkidle" });
    const quote = page.locator("blockquote.source-quote", { hasText: "more than once in five years" });
    await expect(quote.locator("li")).toHaveText([
      "The company is in administration.",
      "You have specific approval from the Secretary of State (please enclose a copy).",
      "You are extending the company's accounting reference period to align with that of a parent or subsidiary undertaking established in the United Kingdom.",
      "You are submitting the form on behalf of an overseas company.",
    ]);
    if (language === "Welsh") await expect(quote.locator("ul")).toHaveAttribute("lang", "en-GB");
  });
}

test("the last day within 18 months carries no warning", async ({ page }) => {
  await serveSite(page);
  await page.goto(`${SITE}/companies-house/changeAccountingRefDate.html`, { waitUntil: "networkidle" });
  await lookUpAndFill(page, { lookUp: "Look up the accounting periods", newPeriodEnd: `${YEAR}-10-31` });
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#reviewList")).toContainText(`Extended so as to end on 31 October ${YEAR}`);
  await expect(page.locator("#tooLongWarning")).toBeHidden();
});

test("a second extension in five years sends its ground, and the Secretary of State's approval its code", async ({ page }) => {
  const filings = [];
  await serveSite(page, { filings });
  await page.goto(`${SITE}/companies-house/changeAccountingRefDate.html`, { waitUntil: "networkidle" });
  await lookUpAndFill(page, { lookUp: "Look up the accounting periods", newPeriodEnd: `${YEAR}-09-30` });
  await page.getByLabel("The company has already extended an accounting period in the last five years").check();
  await expect(page.locator("#extensionAuthorisedCodeGroup")).toBeHidden();

  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#statusMessagesContainer")).toContainText("Choose why the company may extend again.");
  await expect(page.locator("#formView")).toBeVisible();

  await page.locator("#fiveYearExtensionReason").selectOption("secretary-of-state-approval");
  await page.locator("#extensionAuthorisedCode").fill("AB12");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#reviewList")).toContainText("The company has specific approval from the Secretary of State");
  await expect(page.locator("#reviewList")).toContainText("AB12");
  await shoot(page, "second-extension-review");

  await page.getByRole("button", { name: "File with Companies House" }).click();
  await expect(page.locator("#filingResult")).toContainText("Submission 000123 was accepted.", { timeout: 15000 });
  expect(filings[0]).toMatchObject({
    newPeriodEnd: `${YEAR}-09-30`,
    fiveYearExtensionReason: "secretary-of-state-approval",
    extensionAuthorisedCode: "AB12",
  });
});

test("a company in administration extends past 18 months with no warning", async ({ page }) => {
  const filings = [];
  await serveSite(page, { filings });
  await page.goto(`${SITE}/companies-house/changeAccountingRefDate.html`, { waitUntil: "networkidle" });
  await lookUpAndFill(page, { lookUp: "Look up the accounting periods", newPeriodEnd: `${YEAR}-12-31` });
  await page.getByLabel("The company has already extended an accounting period in the last five years").check();
  await page.locator("#fiveYearExtensionReason").selectOption("administration");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#reviewList")).toContainText("The company is in administration");
  await expect(page.locator("#tooLongWarning")).toBeHidden();
});

test("a link from the company lookup chooses its period, and the previous period is filed by its own end date", async ({ page }) => {
  const filings = [];
  await serveSite(page, { filings });
  await page.goto(`${SITE}/companies-house/changeAccountingRefDate.html?companyNumber=00000001&currentPeriodEnd=${PREVIOUS_YEAR}-04-30`, {
    waitUntil: "networkidle",
  });
  await expect(page.locator("#companyNumber")).toHaveValue("00000001");
  await page.getByRole("button", { name: "Look up the accounting periods" }).click();
  await expect(page.getByLabel(`1 May ${EARLIER_YEAR} to 30 April ${PREVIOUS_YEAR} (the previous period)`)).toBeChecked();

  await page.locator("#newPeriodEnd").fill(`${PREVIOUS_YEAR}-03-31`);
  await page.locator("#companyAuthCode").fill("SIMCS01");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "File with Companies House" }).click();
  await expect(page.locator("#filingResult")).toContainText("Submission 000123 was accepted.", { timeout: 15000 });
  expect(filings[0]).toMatchObject({ currentPeriodEnd: `${PREVIOUS_YEAR}-04-30`, newPeriodEnd: `${PREVIOUS_YEAR}-03-31` });
  await expect(page.locator("#registerNow")).toContainText("The register does not show the new date yet.");
});

test("an unchanged date, a date before the period starts and a ground on a shortened period are refused before anything is sent", async ({
  page,
}) => {
  const filings = [];
  await serveSite(page, { filings });
  await page.goto(`${SITE}/companies-house/changeAccountingRefDate.html`, { waitUntil: "networkidle" });
  const messages = page.locator("#statusMessagesContainer");

  await lookUpAndFill(page, { lookUp: "Look up the accounting periods", newPeriodEnd: `${YEAR}-04-30` });
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(messages).toContainText("The new end date is the date the period already ends on.");

  await page.locator("#newPeriodEnd").fill(`${PREVIOUS_YEAR}-04-30`);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(messages).toContainText("The new end date must be after the date the period starts.");

  await page.locator("#newPeriodEnd").fill(`${YEAR}-03-31`);
  await page.getByLabel("The company has already extended an accounting period in the last five years").check();
  await page.locator("#fiveYearExtensionReason").selectOption("administration");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(messages).toContainText("A shortened period needs no ground.");

  await expect(page.locator("#formView")).toBeVisible();
  expect(filings).toHaveLength(0);
});

test("a company with no accounting period on the register cannot continue", async ({ page }) => {
  await serveSite(page, { profile: { companyNumber: "00000001", companyName: COMPANY.name } });
  await page.goto(`${SITE}/companies-house/changeAccountingRefDate.html`, { waitUntil: "networkidle" });
  await page.locator("#companyNumber").fill("00000001");
  await page.getByRole("button", { name: "Look up the accounting periods" }).click();
  await expect(page.locator("#noPeriods")).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();
});

// A company whose register shows its next accounts for a period that has already ended: on
// 22 November 2026 the period to 31 March 2026 is the immediately previous one, and the current period
// runs to 31 March 2027.
const ENDED_PERIOD_PROFILE = {
  companyNumber: "00000001",
  companyName: COMPANY.name,
  accountingReferenceDate: { day: "31", month: "03" },
  accountsNextPeriodStart: "2025-04-01",
  accountsNextPeriodEnd: "2026-03-31",
  accountsNextDue: "2026-12-31",
  accountsLastPeriodStart: "2024-04-01",
  accountsLastPeriodEnd: "2025-03-31",
};

test("once the register's next accounts period has ended, the page offers the period running now and that one, and none before", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-11-22T12:00:00Z"));
  const filings = [];
  await serveSite(page, { filings, profile: ENDED_PERIOD_PROFILE });
  await page.goto(`${SITE}/companies-house/changeAccountingRefDate.html`, { waitUntil: "networkidle" });
  await lookUpAndFill(page, { lookUp: "Look up the accounting periods", newPeriodEnd: "2027-01-31" });
  await expect(page.locator("#periodChoices label")).toHaveText([
    "1 April 2026 to 31 March 2027 (the current period)",
    "1 April 2025 to 31 March 2026 (the previous period)",
  ]);
  await expect(page.getByLabel("1 April 2026 to 31 March 2027 (the current period)")).toBeChecked();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "File with Companies House" }).click();
  await expect.poll(() => filings.length).toBe(1);
  expect(filings[0]).toMatchObject({ currentPeriodEnd: "2027-03-31", newPeriodEnd: "2027-01-31" });
});

test("a company whose accounts are overdue is told it cannot change its year end, and nothing is sent", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-22T12:00:00Z"));
  const filings = [];
  await serveSite(page, { filings, profile: { ...ENDED_PERIOD_PROFILE, accountsNextDue: "2026-09-30" } });
  await page.goto(`${SITE}/companies-house/changeAccountingRefDate.html`, { waitUntil: "networkidle" });
  await page.locator("#companyNumber").fill("00000001");
  await page.getByRole("button", { name: "Look up the accounting periods" }).click();
  await expect(page.locator("#accountsOverdue")).toBeVisible();
  await expect(page.locator("#accountsOverdue")).toContainText("You cannot change your company’s year end when its accounts are overdue.");
  await expect(page.locator("#periodChoices input")).toHaveCount(0);
  await expect(page.locator("#noPeriods")).toBeHidden();
  await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();
  expect(filings).toHaveLength(0);
});

test("the page offers the periods the shared rule gives, the rule the simulator applies too", async ({ page }) => {
  await serveSite(page);
  // The shared module with its rule answering one period of its own, so the periods shown can only come from it.
  const shared = fs.readFileSync(path.join(PUBLIC_ROOT, "lib/accounting-reference-period.js"), "utf-8");
  const stubbed = shared.replace(
    "export function changeablePeriods(",
    'export function changeablePeriods() {\n  return { overdue: false, periods: [{ start: "2098-02-01", end: "2099-01-31", current: true }] };\n}\nfunction realChangeablePeriods(',
  );
  expect(stubbed).not.toBe(shared);
  await page.route("**/lib/accounting-reference-period.js", (route) =>
    route.fulfill({ status: 200, contentType: "application/javascript", body: stubbed }),
  );
  await page.goto(`${SITE}/companies-house/changeAccountingRefDate.html`, { waitUntil: "networkidle" });
  await page.locator("#companyNumber").fill("00000001");
  await page.getByRole("button", { name: "Look up the accounting periods" }).click();
  await expect(page.locator("#periodChoices label")).toHaveText(["1 February 2098 to 31 January 2099 (the current period)"]);
});
