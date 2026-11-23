// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/allotShares.browser.test.js
// The return of allotment of shares page as a reader sees it, in English and in Welsh, at desktop
// and phone width: the company and its code, the capital the register holds, the shares allotted,
// the statement of capital the page adds up, the review, and the outcome Companies House gives. The
// API answers come from the routes here.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { TEST_COMPANY_DATA } from "@app/http-simulator/scenarios/confirmation-statement.js";

const PUBLIC_ROOT = path.join(process.cwd(), "web/public");
const SITE = "http://localhost:3000";
const SCREENSHOT_DIR = path.join(process.cwd(), "target/sh1");

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

// The capital the simulator's register holds for the test company 00000001, so these tests and the
// simulator read the same company.
const REGISTER_CAPITAL = TEST_COMPANY_DATA["00000001"].statementOfCapital;
const RIGHTS = REGISTER_CAPITAL.shares[0].prescribedParticulars;

// The real site from disk, signed in with the resident Ltd bundle, and the Companies House routes
// answered here. Each filing request's body and each filing-data read's body is recorded.
async function serveSite(
  page,
  {
    filings = [],
    reads = [],
    capitals = [REGISTER_CAPITAL],
    filingData = 200,
    outcome = { statusCode: "ACCEPT", rejections: [] },
    refuseUnconfirmed = null,
  } = {},
) {
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
    if (pathname === "/api/v1/companies-house/company/00000001") {
      return json({
        companyNumber: "00000001",
        companyName: "SIMULATOR EXAMPLE COMPANY LIMITED",
        companyType: "ltd",
        confirmationStatementNextMadeUpTo: "2027-04-16",
      });
    }
    if (pathname === "/api/v1/companies-house/company/00000001/filing-data") {
      reads.push(JSON.parse(request.postData()));
      if (filingData === 400) return json({ message: "Companies House does not accept this company authentication code." }, 400);
      if (filingData !== 200) return json({ message: "Companies House did not answer in time" }, filingData);
      return json({ statementOfCapital: capitals[0], statementsOfCapital: capitals });
    }
    if (pathname === "/api/v1/companies-house/allotment-of-shares" && request.method() === "POST") {
      const body = JSON.parse(request.postData());
      filings.push(body);
      // The route's refusal of a capital before the allotment that differs from the register's.
      if (refuseUnconfirmed && body.capitalDifferenceConfirmed !== true) return json(refuseUnconfirmed, 400);
      return json({ submissionNumber: "000123", pollInterval: 1 }, 201);
    }
    if (pathname === "/api/v1/companies-house/forms/allotment-of-shares/000123") return json({ submissionNumber: "000123", ...outcome });
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

// The statement after the allotment in one currency: its class rows, its totals row and its unpaid line.
const afterCapital = (page, currency = "GBP") => page.locator(`#afterTables .after-capital[data-currency="${currency}"]`);
const afterRows = (page, currency) => afterCapital(page, currency).locator("tbody tr:not(.after-totals)");
const afterTotals = (page, currency) => afterCapital(page, currency).locator("tbody tr.after-totals td");
const afterUnpaid = (page, currency) => afterCapital(page, currency).locator(".after-unpaid");

async function lookUp(page, { button = "Look up the company's shares" } = {}) {
  await page.locator("#companyNumber").fill("00000001");
  await page.locator("#companyAuthCode").fill("SIMCS01");
  await page.getByRole("button", { name: button }).click();
  await expect(page.locator("#formView")).toBeVisible();
}

// The first allotment row's fields, by the part of their id after the row's prefix.
const allotmentField = (page, part, row = 0) =>
  page
    .locator("#allotmentRows .allotment-row")
    .nth(row)
    .locator(`input[id^="allot-${part}-"], textarea[id^="allot-${part}-"], select[id^="allot-${part}-"]`);

async function fillAllotment(page, { shareClass, number, nominal, paid, unpaid = "0", consideration }, row = 0) {
  await allotmentField(page, "class", row).fill(shareClass);
  await allotmentField(page, "number", row).fill(number);
  await allotmentField(page, "nominal", row).fill(nominal);
  await allotmentField(page, "paid", row).fill(paid);
  await allotmentField(page, "unpaid", row).fill(unpaid);
  if (consideration) await allotmentField(page, "consideration", row).fill(consideration);
}

for (const width of [1280, 390]) {
  test(`an allotment for cash is filed in English at ${width}px, with the capital the register holds added up`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const filings = [];
    const reads = [];
    await serveSite(page, { filings, reads });
    await page.goto(`${SITE}/companies-house/allotShares.html`, { waitUntil: "networkidle" });

    await expect(page.locator("h1")).toHaveText("Return an allotment of shares");
    await expect(page.locator("p.hint[data-feature-status]")).toContainText("Status: sandbox.");
    await lookUp(page);
    expect(reads[0]).toMatchObject({ companyAuthCode: "SIMCS01" });
    await expect(page.locator("#formView")).toContainText("SIMULATOR EXAMPLE COMPANY LIMITED");
    await expect(page.locator("#formView")).toContainText("Companies House charges no fee for this filing.");
    await expect(page.locator("#beforeSource")).toHaveText(
      "This is the share capital Companies House holds for the company. The return must start from it: Submit checks it against the register again when you file and sends no return that differs. File an earlier allotment that is not on the register yet first.",
    );
    await expect(page.locator('#beforeTables input[id^="before-class-"]')).toHaveValue("Ordinary");
    await expect(page.locator('#beforeTables input[id^="before-number-"]')).toHaveValue("100");

    await page.locator("#startDate").fill("2026-11-02");
    await fillAllotment(page, { shareClass: "Ordinary", number: "50", nominal: "1", paid: "2.5" });
    await expect(afterRows(page)).toHaveCount(1);
    await expect(afterRows(page).locator("td")).toHaveText(["Ordinary", "150", "150"]);
    await expect(afterTotals(page).nth(1)).toHaveText("150");
    await expect(afterUnpaid(page)).toHaveText("Total aggregate amount unpaid: 0");
    await expect(page.locator("#newClassParticulars textarea")).toHaveCount(0);
    expect(await noSideScroll(page)).toBe(true);
    await shoot(page, "cash-form");
    await page.getByRole("button", { name: "Continue" }).click();

    const review = page.locator("#reviewList");
    await expect(review).toContainText("2 November 2026");
    await expect(review).toContainText("50 Ordinary shares of GBP 1 each; 2.5 paid and 0 unpaid on each share");
    await expect(review).toContainText("150 shares, aggregate nominal value GBP 150, total aggregate amount unpaid GBP 0");
    await expect(review).not.toContainText("Non-cash consideration");
    expect(await noSideScroll(page)).toBe(true);
    await shoot(page, "cash-review");

    await page.getByRole("button", { name: "File with Companies House" }).click();
    await expect(page.locator("#filingResult")).toContainText("Submission 000123 was accepted.", { timeout: 15000 });
    expect(filings).toHaveLength(1);
    expect(filings[0]).toMatchObject({
      companyNumber: "00000001",
      companyName: "SIMULATOR EXAMPLE COMPANY LIMITED",
      companyAuthCode: "SIMCS01",
      startDate: "2026-11-02",
      allotments: [
        {
          shareClass: "Ordinary",
          numShares: "50",
          nominalValue: "1",
          amountPaidPerShare: "2.5",
          amountUnpaidPerShare: "0",
          currency: "GBP",
        },
      ],
      statementOfCapital: [
        {
          currency: "GBP",
          totalAmountUnpaid: "0",
          shares: [{ shareClass: "Ordinary", prescribedParticulars: RIGHTS, numShares: "150", aggregateNominalValue: "150" }],
        },
      ],
    });
    expect(filings[0]).not.toHaveProperty("endDate");
    expect(filings[0].allotments[0]).not.toHaveProperty("consideration");
    expect(filings[0].allotments[0]).not.toHaveProperty("row");
    expect(await noSideScroll(page)).toBe(true);
    await shoot(page, "cash-accepted");
  });

  test(`a new class of shares, part paid, is filed in Welsh at ${width}px with its own particulars`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const filings = [];
    await serveSite(page, { filings });
    await page.goto(`${SITE}/cy/companies-house/allotShares.html`, { waitUntil: "networkidle" });

    await expect(page.locator("html")).toHaveAttribute("lang", "cy");
    await expect(page.locator("h1")).toHaveText("Dychwelyd cyfrannau a glustnodwyd");
    await expect(page.locator("p.hint[data-feature-status]")).toContainText("Statws: amgylchedd prawf (sandbox).");
    await lookUp(page, { button: "Chwilio am gyfrannau’r cwmni" });
    await expect(page.locator("#allotmentRows label").first()).toHaveText("Dosbarth o gyfrannau");
    await expect(page.locator("#allotmentRows")).toContainText("Nifer y cyfrannau a glustnodwyd");
    await expect(page.locator("#allotmentRows")).toContainText(
      "Y swm (os oes un) na thalwyd (gan gynnwys y premiwm cyfrannau) ar bob cyfran",
    );

    await page.locator("#startDate").fill("2026-11-02");
    await page.locator("#endDate").fill("2026-11-09");
    await fillAllotment(page, { shareClass: "A Preference", number: "25", nominal: "0.1", paid: "0", unpaid: "0.1" });
    await expect(afterRows(page)).toHaveCount(2);
    await expect(afterRows(page).nth(1).locator("td")).toHaveText(["A Preference", "25", "2.5"]);
    await expect(afterTotals(page).nth(1)).toHaveText("125");
    await expect(afterRows(page).nth(1).locator("td").nth(1)).toHaveAttribute("data-label", "Nifer y cyfrannau");
    await expect(afterTotals(page).nth(2)).toHaveAttribute("data-label", "Gwerth nominal agregedig");
    await expect(afterTotals(page).nth(2)).toHaveText("102.5");
    await expect(afterUnpaid(page)).toHaveText("Cyfanswm y swm agregedig heb ei dalu: 2.5");
    const rights = page.locator("#newClassParticulars textarea");
    await expect(rights).toHaveCount(1);
    await expect(page.locator("#newClassParticulars label")).toHaveText(
      "Manylion rhagnodedig yr hawliau sydd ynghlwm wrth y dosbarth newydd A Preference (GBP)",
    );
    expect(await noSideScroll(page)).toBe(true);

    await page.getByRole("button", { name: "Parhau" }).click();
    await expect(page.locator("#statusMessagesContainer")).toContainText(
      "Rhowch fanylion rhagnodedig yr hawliau sydd ynghlwm wrth y cyfrannau A Preference.",
    );
    await expect(page.locator("#formView")).toBeVisible();

    await rights.fill("No vote. A fixed dividend of 5 pence a share each year, paid before any ordinary dividend.");
    await shoot(page, "new-class-form-cy");
    await page.getByRole("button", { name: "Parhau" }).click();
    await expect(page.locator("#reviewList")).toContainText("Cyfalaf wedyn: A Preference");
    await expect(page.locator("#reviewList")).toContainText("2 Tachwedd 2026 i 9 Tachwedd 2026");
    expect(await noSideScroll(page)).toBe(true);
    await shoot(page, "new-class-review-cy");

    await page.getByRole("button", { name: "Ffeilio gyda Thŷ’r Cwmnïau" }).click();
    await expect(page.locator("#filingResult")).toContainText("Statws cyflwyniad 000123:", { timeout: 15000 });
    expect(filings[0]).toMatchObject({
      startDate: "2026-11-02",
      endDate: "2026-11-09",
      allotments: [
        {
          shareClass: "A Preference",
          numShares: "25",
          nominalValue: "0.1",
          amountPaidPerShare: "0",
          amountUnpaidPerShare: "0.1",
          currency: "GBP",
        },
      ],
      statementOfCapital: [
        {
          currency: "GBP",
          totalAmountUnpaid: "2.5",
          shares: [
            { shareClass: "Ordinary", prescribedParticulars: RIGHTS, numShares: "100", aggregateNominalValue: "100" },
            {
              shareClass: "A Preference",
              prescribedParticulars: "No vote. A fixed dividend of 5 pence a share each year, paid before any ordinary dividend.",
              numShares: "25",
              aggregateNominalValue: "2.5",
            },
          ],
        },
      ],
    });
    expect(await noSideScroll(page)).toBe(true);
    await shoot(page, "new-class-accepted-cy");
  });

  test(`an allotment for non-cash consideration states the consideration, at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const filings = [];
    await serveSite(page, { filings });
    await page.goto(`${SITE}/companies-house/allotShares.html`, { waitUntil: "networkidle" });
    await lookUp(page);
    await page.locator("#startDate").fill("2026-11-02");
    await fillAllotment(page, {
      shareClass: "Ordinary",
      number: "50",
      nominal: "1",
      paid: "2.5",
      consideration: "The transfer to the company of a delivery van, valued at 125 pounds.",
    });
    await shoot(page, "non-cash-form");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.locator("#reviewList")).toContainText("Non-cash consideration");
    await expect(page.locator("#reviewList")).toContainText("The transfer to the company of a delivery van, valued at 125 pounds.");
    expect(await noSideScroll(page)).toBe(true);
    await shoot(page, "non-cash-review");
    await page.getByRole("button", { name: "File with Companies House" }).click();
    await expect(page.locator("#filingResult")).toContainText("Submission 000123 was accepted.", { timeout: 15000 });
    expect(filings[0].allotments[0].consideration).toBe("The transfer to the company of a delivery van, valued at 125 pounds.");
  });
}

test("two allotments, one of a class held and one of a new class, add up in the statement and both are sent", async ({ page }) => {
  const filings = [];
  await serveSite(page, { filings });
  await page.goto(`${SITE}/companies-house/allotShares.html`, { waitUntil: "networkidle" });
  await lookUp(page);
  await page.locator("#startDate").fill("2026-11-02");
  await fillAllotment(page, { shareClass: "ordinary", number: "0.5", nominal: "1", paid: "1" });
  await page.getByRole("button", { name: "Add another allotment" }).click();
  await fillAllotment(page, { shareClass: "B Ordinary", number: "10", nominal: "0.01", paid: "0.01" }, 1);
  await expect(afterRows(page).nth(0).locator("td")).toHaveText(["Ordinary", "100.5", "100.5"]);
  await expect(afterRows(page).nth(1).locator("td")).toHaveText(["B Ordinary", "10", "0.1"]);
  await expect(afterTotals(page).nth(2)).toHaveText("100.6");
  await page.locator("#newClassParticulars textarea").fill("One vote a share.");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "File with Companies House" }).click();
  await expect(page.locator("#filingResult")).toContainText("Submission 000123 was accepted.", { timeout: 15000 });
  expect(filings[0].allotments).toHaveLength(2);
  expect(filings[0].statementOfCapital[0].shares).toEqual([
    { shareClass: "Ordinary", prescribedParticulars: RIGHTS, numShares: "100.5", aggregateNominalValue: "100.5" },
    { shareClass: "B Ordinary", prescribedParticulars: "One vote a share.", numShares: "10", aggregateNominalValue: "0.1" },
  ]);
});

test("a removed allotment leaves the statement, and the reader's correction of the capital before changes it", async ({ page }) => {
  await serveSite(page);
  await page.goto(`${SITE}/companies-house/allotShares.html`, { waitUntil: "networkidle" });
  await lookUp(page);
  await fillAllotment(page, { shareClass: "Ordinary", number: "50", nominal: "1", paid: "1" });
  await page.getByRole("button", { name: "Add another allotment" }).click();
  await fillAllotment(page, { shareClass: "B Ordinary", number: "10", nominal: "1", paid: "1" }, 1);
  await expect(afterRows(page)).toHaveCount(2);
  await page.locator("#allotmentRows .allotment-row").nth(1).getByRole("button", { name: "Remove" }).click();
  await expect(afterRows(page)).toHaveCount(1);
  await page.locator('#beforeTables input[id^="before-number-"]').fill("200");
  await page.locator('#beforeTables input[id^="before-nominal-"]').fill("200");
  await expect(afterRows(page).locator("td")).toHaveText(["Ordinary", "250", "250"]);
});

test("a company whose capital the register does not give files only the shares it allots", async ({ page }) => {
  const filings = [];
  await serveSite(page, { filings, capitals: [] });
  await page.goto(`${SITE}/companies-house/allotShares.html`, { waitUntil: "networkidle" });
  await lookUp(page);
  await expect(page.locator("#beforeSource")).toHaveText(
    "Companies House holds no share capital for this company, so the return starts from none. Enter only the shares allotted below.",
  );
  await expect(page.locator('#beforeTables input[id^="before-class-"]')).toHaveValue("");
  await page.locator("#startDate").fill("2026-11-02");
  await fillAllotment(page, { shareClass: "Ordinary", number: "50", nominal: "1", paid: "1" });
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#statusMessagesContainer")).toContainText(
    "Give the prescribed particulars of rights attached to the Ordinary shares.",
  );
  await page.locator('textarea[id^="new-rights-"]').fill("One vote a share.");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#reviewView")).toBeVisible();
  await page.getByRole("button", { name: "File with Companies House" }).click();
  await expect(page.locator("#filingResult")).toContainText("Submission 000123 was accepted.", { timeout: 15000 });
  expect(filings[0].statementOfCapital[0].shares).toEqual([
    { shareClass: "Ordinary", prescribedParticulars: "One vote a share.", numShares: "50", aggregateNominalValue: "50" },
  ]);
});

for (const filingData of [500, 504]) {
  test(`a read of the register's capital that fails with ${filingData} says Submit could not read it, not that the register has none`, async ({
    page,
  }) => {
    await serveSite(page, { filingData });
    await page.goto(`${SITE}/companies-house/allotShares.html`, { waitUntil: "networkidle" });
    await lookUp(page);
    await expect(page.locator("#beforeSource")).toHaveText(
      "Submit could not read the company's share capital from Companies House. Enter each class of shares the company had before the allotment as the register holds it: Submit checks it against the register when you file and sends no return that differs.",
    );
    await expect(page.locator('#beforeTables input[id^="before-class-"]')).toHaveValue("");
  });
}

test("the failed read's sentence is in Welsh on the Welsh page", async ({ page }) => {
  await serveSite(page, { filingData: 500 });
  await page.goto(`${SITE}/cy/companies-house/allotShares.html`, { waitUntil: "networkidle" });
  await page.locator("#companyNumber").fill("00000001");
  await page.locator("#companyAuthCode").fill("SIMCS01");
  await page.locator("#companyForm button[type=submit]").click();
  await expect(page.locator("#formView")).toBeVisible();
  await expect(page.locator("#beforeSource")).toContainText("Nid oedd Submit yn gallu darllen cyfalaf cyfrannau’r cwmni");
});

for (const [language, prefix, cont, sentence] of [
  ["English", "", "Continue", "has characters Companies House does not accept: ŵ"],
  ["Welsh", "/cy", "Parhau", "nodau nad yw Tŷ’r Cwmnïau yn eu derbyn: ŵ"],
]) {
  test(`a consideration with a lower-case ŵ is stopped before anything is sent, in ${language}`, async ({ page }) => {
    const filings = [];
    await serveSite(page, { filings });
    await page.goto(`${SITE}${prefix}/companies-house/allotShares.html`, { waitUntil: "networkidle" });
    await page.locator("#companyNumber").fill("00000001");
    await page.locator("#companyAuthCode").fill("SIMCS01");
    await page.locator("#companyForm button[type=submit]").click();
    await expect(page.locator("#formView")).toBeVisible();
    await page.locator("#startDate").fill("2026-11-02");
    await fillAllotment(page, {
      shareClass: "Ordinary",
      number: "50",
      nominal: "1",
      paid: "2.5",
      consideration: "Fan o Glyndŵr, valued at 125 pounds.",
    });
    await page.getByRole("button", { name: cont }).click();
    const status = page.locator("#statusMessagesContainer");
    await expect(status).toContainText(sentence);
    await expect(status).not.toContainText("valued at");
    await expect(page.locator("#formView")).toBeVisible();
    expect(filings).toHaveLength(0);
  });
}

test("rights attached to shares take any text, a lower-case ŵ and a line break among it", async ({ page }) => {
  const filings = [];
  await serveSite(page, { filings });
  await page.goto(`${SITE}/companies-house/allotShares.html`, { waitUntil: "networkidle" });
  await lookUp(page);
  await page.locator("#startDate").fill("2026-11-02");
  await fillAllotment(page, { shareClass: "Ordinary", number: "50", nominal: "1", paid: "2.5" });
  await page.locator('#beforeTables textarea[id^="before-rights-"]').fill("Un bleidlais — ŵyr a wyres.\nNo redemption.");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#reviewView")).toBeVisible();
  await page.getByRole("button", { name: "File with Companies House" }).click();
  await expect.poll(() => filings.length).toBe(1);
  expect(filings[0].statementOfCapital[0].shares[0].prescribedParticulars).toBe("Un bleidlais — ŵyr a wyres.\nNo redemption.");
});

test("a company authentication code Companies House does not accept stops at the company step with its sentence", async ({ page }) => {
  await serveSite(page, { filingData: 400 });
  await page.goto(`${SITE}/companies-house/allotShares.html`, { waitUntil: "networkidle" });
  await page.locator("#companyNumber").fill("00000001");
  await page.locator("#companyAuthCode").fill("WRONG01");
  await page.getByRole("button", { name: "Look up the company's shares" }).click();
  await expect(page.locator("#statusMessagesContainer")).toContainText("Companies House does not accept this company authentication code.");
  await expect(page.locator("#companyView")).toBeVisible();
  await expect(page.locator("#formView")).toBeHidden();
});

test("shares paid and unpaid below their nominal value, and a to date before the from date, are refused before anything is sent", async ({
  page,
}) => {
  const filings = [];
  await serveSite(page, { filings });
  await page.goto(`${SITE}/companies-house/allotShares.html`, { waitUntil: "networkidle" });
  await lookUp(page);
  await page.locator("#startDate").fill("2026-11-02");
  await fillAllotment(page, { shareClass: "Ordinary", number: "50", nominal: "1", paid: "0.5" });
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#statusMessagesContainer")).toContainText(
    "The amount paid and the amount unpaid on each Ordinary share add up to less than its nominal value of 1.",
  );
  await allotmentField(page, "paid").fill("1");
  await page.locator("#endDate").fill("2026-11-01");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#statusMessagesContainer")).toContainText("The to date cannot be before the from date.");
  await expect(page.locator("#formView")).toBeVisible();
  expect(filings).toHaveLength(0);
});

test("an allotment whose aggregate nominal value or amount unpaid has more than 6 decimal places is refused before anything is sent", async ({
  page,
}) => {
  const filings = [];
  await serveSite(page, { filings });
  await page.goto(`${SITE}/companies-house/allotShares.html`, { waitUntil: "networkidle" });
  await lookUp(page);
  await page.locator("#startDate").fill("2026-11-02");
  const refusal =
    "The number of Ordinary shares times the nominal value or the amount unpaid on each share has more than 6 decimal places. Companies House takes amounts to 6 decimal places.";
  await fillAllotment(page, { shareClass: "Ordinary", number: "0.5", nominal: "0.000001", paid: "0.000001" });
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#statusMessagesContainer")).toContainText(refusal);
  await fillAllotment(page, { shareClass: "Ordinary", number: "0.5", nominal: "1", paid: "0", unpaid: "1.000001" });
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#statusMessagesContainer")).toContainText(refusal);
  await expect(page.locator("#formView")).toBeVisible();
  expect(filings).toHaveLength(0);
});

test("a rejection shows Companies House's reason", async ({ page }) => {
  await serveSite(page, {
    outcome: {
      statusCode: "REJECT",
      rejections: [{ rejectCode: "9998", description: "The statement of capital does not match the register." }],
    },
  });
  await page.goto(`${SITE}/companies-house/allotShares.html`, { waitUntil: "networkidle" });
  await lookUp(page);
  await page.locator("#startDate").fill("2026-11-02");
  await fillAllotment(page, { shareClass: "Ordinary", number: "50", nominal: "1", paid: "1" });
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "File with Companies House" }).click();
  const result = page.locator("#filingResult");
  await expect(result).toContainText("Submission 000123 was rejected.", { timeout: 15000 });
  await expect(result).toContainText("9998: The statement of capital does not match the register.");
});

test("a test company whose shares are in two currencies starts with a capital table for each", async ({ page }) => {
  await serveSite(page, { capitals: TEST_COMPANY_DATA["00000003"].statementOfCapital });
  await page.goto(`${SITE}/companies-house/allotShares.html`, { waitUntil: "networkidle" });
  await lookUp(page);
  await expect(page.locator("#beforeTables .capital-table")).toHaveCount(2);
  await expect(page.locator("#beforeTables .capital-table select").nth(0)).toHaveValue("GBP");
  await expect(page.locator("#beforeTables .capital-table select").nth(1)).toHaveValue("EUR");
  const classes = page.locator('#beforeTables input[id^="before-class-"]');
  const numbers = page.locator('#beforeTables input[id^="before-number-"]');
  await expect(classes).toHaveCount(2);
  await expect(classes.nth(0)).toHaveValue("Ordinary");
  await expect(classes.nth(1)).toHaveValue("A Preference");
  await expect(numbers.nth(0)).toHaveValue("1000");
  await expect(numbers.nth(1)).toHaveValue("500");
});

const USD_CAPITAL = {
  totalAmountUnpaid: "0",
  totalNumberOfIssuedShares: "10",
  shareCurrency: "USD",
  totalAggregateNominalValue: "10",
  shares: [{ shareClass: "Dollar Ordinary", prescribedParticulars: RIGHTS, numShares: "10", aggregateNominalValue: "10" }],
};

for (const width of [1280, 390]) {
  test(`a company with pounds capital that allots dollar shares keeps its pound classes in pounds, in English at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const filings = [];
    await serveSite(page, { filings });
    await page.goto(`${SITE}/companies-house/allotShares.html`, { waitUntil: "networkidle" });
    await lookUp(page);
    await page.locator("#startDate").fill("2026-11-02");
    await fillAllotment(page, { shareClass: "Ordinary", number: "50", nominal: "1", paid: "1" });
    await allotmentField(page, "currency").selectOption("USD");
    await expect(afterRows(page, "GBP").locator("td")).toHaveText(["Ordinary", "100", "100"]);
    await expect(afterRows(page, "USD").locator("td")).toHaveText(["Ordinary", "50", "50"]);
    await expect(afterCapital(page, "USD").locator("h4")).toHaveText("US dollar (USD)");
    await page.locator("#newClassParticulars textarea").fill("One vote a share.");
    expect(await noSideScroll(page)).toBe(true);
    await shoot(page, "pounds-company-allots-dollars-form");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.locator("#reviewList")).toContainText("50 Ordinary shares of USD 1 each");
    await expect(page.locator("#reviewList")).toContainText("Capital after: totals in GBP");
    await expect(page.locator("#reviewList")).toContainText("Capital after: totals in USD");
    await shoot(page, "pounds-company-allots-dollars-review");
    await page.getByRole("button", { name: "File with Companies House" }).click();
    await expect(page.locator("#filingResult")).toContainText("Submission 000123 was accepted.", { timeout: 15000 });
    expect(filings[0].allotments[0]).toMatchObject({ shareClass: "Ordinary", currency: "USD" });
    expect(filings[0].statementOfCapital).toEqual([
      {
        currency: "GBP",
        totalAmountUnpaid: "0",
        shares: [{ shareClass: "Ordinary", prescribedParticulars: RIGHTS, numShares: "100", aggregateNominalValue: "100" }],
      },
      {
        currency: "USD",
        totalAmountUnpaid: "0",
        shares: [{ shareClass: "Ordinary", prescribedParticulars: "One vote a share.", numShares: "50", aggregateNominalValue: "50" }],
      },
    ]);
  });

  test(`a company with pounds and dollar capital shows a table for each and files both, in Welsh at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const filings = [];
    await serveSite(page, { filings, capitals: [REGISTER_CAPITAL, USD_CAPITAL] });
    await page.goto(`${SITE}/cy/companies-house/allotShares.html`, { waitUntil: "networkidle" });
    await lookUp(page, { button: "Chwilio am gyfrannau’r cwmni" });
    await expect(page.locator("#beforeTables .capital-table")).toHaveCount(2);
    await expect(page.locator("#beforeTables .capital-table select").nth(1)).toHaveValue("USD");
    await expect(page.locator("#addCurrencyBtn")).toBeEnabled();
    await page.locator("#startDate").fill("2026-11-02");
    await fillAllotment(page, { shareClass: "Dollar Ordinary", number: "5", nominal: "1", paid: "1" });
    await allotmentField(page, "currency").selectOption("USD");
    await expect(afterRows(page, "GBP").locator("td")).toHaveText(["Ordinary", "100", "100"]);
    await expect(afterRows(page, "USD").locator("td")).toHaveText(["Dollar Ordinary", "15", "15"]);
    await expect(afterCapital(page, "USD").locator("h4")).toHaveText("Doler yr Unol Daleithiau (USD)");
    await expect(afterTotals(page, "USD").nth(1)).toHaveAttribute("data-label", "Nifer y cyfrannau");
    await expect(afterTotals(page, "USD").nth(0)).not.toHaveAttribute("data-label");
    await expect(afterTotals(page, "USD").nth(0)).toHaveText("Cyfansymiau");
    expect(await noSideScroll(page)).toBe(true);
    await shoot(page, "two-currencies-form-cy");
    await page.getByRole("button", { name: "Parhau" }).click();
    await expect(page.locator("#reviewList")).toContainText("Cyfalaf wedyn: cyfansymiau yn USD");
    expect(await noSideScroll(page)).toBe(true);
    await shoot(page, "two-currencies-review-cy");
    await page.getByRole("button", { name: "Ffeilio gyda Thŷ’r Cwmnïau" }).click();
    await expect(page.locator("#filingResult")).toContainText("Statws cyflwyniad 000123:", { timeout: 15000 });
    expect(filings[0].statementOfCapital.map((capital) => [capital.currency, capital.shares.map((share) => share.numShares)])).toEqual([
      ["GBP", ["100"]],
      ["USD", ["15"]],
    ]);
  });
}

test("a currency table is added for shares the register does not show, and a currency given two tables is refused", async ({ page }) => {
  const filings = [];
  await serveSite(page, { filings });
  await page.goto(`${SITE}/companies-house/allotShares.html`, { waitUntil: "networkidle" });
  await lookUp(page);
  await page.getByRole("button", { name: "Add shares in another currency" }).click();
  const euro = page.locator("#beforeTables .capital-table").nth(1);
  await expect(euro.locator("select")).toHaveValue("EUR");
  await euro.locator('input[id^="before-class-"]').fill("Euro Ordinary");
  await euro.locator('input[id^="before-number-"]').fill("10");
  await euro.locator('input[id^="before-nominal-"]').fill("10");
  await euro.locator('textarea[id^="before-rights-"]').fill("One vote a share.");
  await page.getByRole("button", { name: "Add shares in another currency" }).click();
  await expect(page.locator("#addCurrencyBtn")).toBeDisabled();
  await page.locator("#beforeTables .capital-table").nth(2).locator(":scope > .remove-row").click();
  await page.locator("#startDate").fill("2026-11-02");
  await fillAllotment(page, { shareClass: "Ordinary", number: "50", nominal: "1", paid: "1" });
  await expect(afterRows(page, "EUR").locator("td")).toHaveText(["Euro Ordinary", "10", "10"]);
  await euro.locator("select").selectOption("GBP");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#statusMessagesContainer")).toContainText(
    "The shares held before the allotment have two tables in GBP. Put every class in that currency in one table.",
  );
  expect(filings).toHaveLength(0);
});

test("a company with shares in a currency this page does not file stops at the company step with a sentence", async ({ page }) => {
  await serveSite(page, { capitals: [REGISTER_CAPITAL, { ...USD_CAPITAL, shareCurrency: "JPY" }] });
  await page.goto(`${SITE}/companies-house/allotShares.html`, { waitUntil: "networkidle" });
  await page.locator("#companyNumber").fill("00000001");
  await page.locator("#companyAuthCode").fill("SIMCS01");
  await page.getByRole("button", { name: "Look up the company's shares" }).click();
  await expect(page.locator("#statusMessagesContainer")).toContainText(
    "The company has shares in JPY. This page files a return of allotment for shares in pounds sterling, euros and US dollars only.",
  );
  await expect(page.locator("#formView")).toBeHidden();
});

test("the register's capital is read dated today, with no company type", async ({ page }) => {
  const reads = [];
  await serveSite(page, { reads });
  await page.goto(`${SITE}/companies-house/allotShares.html`, { waitUntil: "networkidle" });
  await lookUp(page);
  expect(reads[0].madeUpDate).toBe(new Date().toISOString().slice(0, 10));
  expect(reads[0]).not.toHaveProperty("companyType");
});

const CAPITAL_REFUSAL = {
  message: "Before the allotment the GBP Ordinary shares are 100 shares of aggregate nominal value 100 in this return, and 120 ...",
  reason: "capital-before-differs-from-register",
  mismatches: [
    {
      currency: "GBP",
      shareClass: "Ordinary",
      stated: { numShares: "100", aggregateNominalValue: "100" },
      register: { numShares: "120", aggregateNominalValue: "120" },
    },
    { currency: "GBP", totalAmountUnpaid: true, stated: { totalAmountUnpaid: "0" }, register: { totalAmountUnpaid: "5" } },
  ],
};

async function reviewACashAllotment(page, { lookUpButton, continueButton }) {
  await lookUp(page, lookUpButton ? { button: lookUpButton } : {});
  await page.locator("#startDate").fill("2026-11-02");
  await fillAllotment(page, { shareClass: "Ordinary", number: "50", nominal: "1", paid: "1" });
  await page.getByRole("button", { name: continueButton }).click();
  await expect(page.locator("#reviewView")).toBeVisible();
}

for (const width of [1280, 390]) {
  test(`a capital that differs from the register is shown with both capitals and filed once confirmed, in English at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const filings = [];
    await serveSite(page, { filings, refuseUnconfirmed: CAPITAL_REFUSAL });
    await page.goto(`${SITE}/companies-house/allotShares.html`, { waitUntil: "networkidle" });
    await reviewACashAllotment(page, { continueButton: "Continue" });
    await expect(page.locator("#capitalWarning")).toBeHidden();
    await page.getByRole("button", { name: "File with Companies House" }).click();

    const warning = page.locator("#capitalWarning");
    await expect(warning).toBeVisible();
    await expect(page.locator("#reviewView")).toBeVisible();
    await expect(warning).toContainText("The capital before the allotment differs from the Companies House register");
    await expect(warning).toContainText("Submit compares this return with the Companies House register as it stands today.");
    await expect(warning).not.toContainText("Companies House reads the register");
    await expect(page.locator("#capitalWarningList li")).toHaveText([
      "GBP Ordinary shares before the allotment: 100 shares of aggregate nominal value 100 in this return, 120 shares of aggregate nominal value 120 on the register.",
      "Total amount unpaid in GBP before the allotment: 0 in this return, 5 on the register.",
    ]);
    expect(await noSideScroll(page)).toBe(true);
    await shoot(page, "capital-warning");

    await page.getByRole("button", { name: "File with Companies House" }).click();
    await expect(page.locator("#statusMessagesContainer")).toContainText(
      "Tick the confirmation that the capital this return states is the company's capital at the date the return is made up to.",
    );
    expect(filings).toHaveLength(1);

    await page.getByLabel("The capital this return states is the company's capital at the date the return is made up to").check();
    await page.getByRole("button", { name: "File with Companies House" }).click();
    await expect(page.locator("#filingResult")).toContainText("Submission 000123 was accepted.", { timeout: 15000 });
    expect(filings).toHaveLength(2);
    expect(filings[0]).not.toHaveProperty("capitalDifferenceConfirmed");
    expect(filings[1].capitalDifferenceConfirmed).toBe(true);
    expect(filings[1].statementOfCapital).toEqual(filings[0].statementOfCapital);
  });

  test(`a capital that differs from the register is worded in Welsh from the route's fields, at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const filings = [];
    await serveSite(page, { filings, refuseUnconfirmed: CAPITAL_REFUSAL });
    await page.goto(`${SITE}/cy/companies-house/allotShares.html`, { waitUntil: "networkidle" });
    await reviewACashAllotment(page, { lookUpButton: "Chwilio am gyfrannau’r cwmni", continueButton: "Parhau" });
    await page.getByRole("button", { name: "Ffeilio gyda Thŷ’r Cwmnïau" }).click();
    const warning = page.locator("#capitalWarning");
    await expect(warning).toContainText("Mae’r cyfalaf cyn y clustnodiad yn wahanol i gofrestr Tŷ’r Cwmnïau");
    await expect(warning).toContainText("Mae Submit yn cymharu’r ffurflen hon â chofrestr Tŷ’r Cwmnïau fel y mae heddiw.");
    await expect(page.locator("#capitalWarningList li")).toHaveText([
      "Cyfrannau GBP Ordinary cyn y clustnodiad: 100 o gyfrannau â gwerth nominal agregedig o 100 yn y ffurflen hon, 120 o gyfrannau â gwerth nominal agregedig o 120 ar y gofrestr.",
      "Cyfanswm y swm heb ei dalu yn GBP cyn y clustnodiad: 0 yn y ffurflen hon, 5 ar y gofrestr.",
    ]);
    await expect(warning).not.toContainText("Before the allotment");
    expect(await noSideScroll(page)).toBe(true);
    await shoot(page, "capital-warning-cy");
    await page.locator("#confirmCapital").check();
    await page.getByRole("button", { name: "Ffeilio gyda Thŷ’r Cwmnïau" }).click();
    await expect(page.locator("#filingResult")).toContainText("Statws cyflwyniad 000123:", { timeout: 15000 });
    expect(filings[1].capitalDifferenceConfirmed).toBe(true);
  });
}

test("a changed return after the warning is reviewed afresh, with the warning gone and no confirmation sent", async ({ page }) => {
  const filings = [];
  await serveSite(page, { filings, refuseUnconfirmed: CAPITAL_REFUSAL });
  await page.goto(`${SITE}/companies-house/allotShares.html`, { waitUntil: "networkidle" });
  await reviewACashAllotment(page, { continueButton: "Continue" });
  await page.getByRole("button", { name: "File with Companies House" }).click();
  await expect(page.locator("#capitalWarning")).toBeVisible();
  await page.getByRole("button", { name: "Change" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#capitalWarning")).toBeHidden();
  await page.getByRole("button", { name: "File with Companies House" }).click();
  await expect(page.locator("#capitalWarning")).toBeVisible();
  expect(filings.every((filing) => filing.capitalDifferenceConfirmed !== true)).toBe(true);
});

test("a class held before or an allotment offers Remove only while another of its kind is left", async ({ page }) => {
  await serveSite(page, { filingData: 504 });
  await page.goto(`${SITE}/companies-house/allotShares.html`, { waitUntil: "networkidle" });
  await lookUp(page);
  const beforeRemove = page.locator("#beforeTables .capital-classes .remove-row");
  const allotmentRemove = page.locator("#allotmentRows .remove-row");
  await expect(beforeRemove).toHaveCount(1);
  await expect(beforeRemove.first()).toBeHidden();
  await expect(allotmentRemove.filter({ visible: true })).toHaveCount(0);

  await page.locator("#beforeTables .capital-table > .btn-small:not(.remove-row)").first().click();
  await expect(beforeRemove.filter({ visible: true })).toHaveCount(2);
  await beforeRemove.first().click();
  await expect(beforeRemove).toHaveCount(1);
  await expect(beforeRemove.first()).toBeHidden();

  await page.locator("#addAllotmentBtn").click();
  await expect(allotmentRemove.filter({ visible: true })).toHaveCount(2);
  await allotmentRemove.first().click();
  await expect(page.locator("#allotmentRows .allotment-row")).toHaveCount(1);
  await expect(allotmentRemove.filter({ visible: true })).toHaveCount(0);
});

test("the buttons that add a row keep a gap from the field below them", async ({ page }) => {
  await serveSite(page, { filingData: 504 });
  await page.goto(`${SITE}/companies-house/allotShares.html`, { waitUntil: "networkidle" });
  await lookUp(page);
  const button = await page.locator("#beforeTables .capital-table > .btn-small:not(.remove-row)").first().boundingBox();
  const label = await page.locator('label[for^="capital-unpaid-"]').first().boundingBox();
  expect(label.y - (button.y + button.height)).toBeGreaterThanOrEqual(12);
});

for (const width of [1280, 390]) {
  test(`the totals of the statement line up with the classes above them at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await serveSite(page);
    await page.goto(`${SITE}/companies-house/allotShares.html`, { waitUntil: "networkidle" });
    await lookUp(page);
    await page.locator("#startDate").fill("2026-11-02");
    await fillAllotment(page, { shareClass: "A Preference", number: "25", nominal: "0.1", paid: "0", unpaid: "0.1" });
    const table = page.locator("#afterTables .after-capital table").first();
    const totals = table.locator("tr.after-totals");
    await expect(totals).toBeVisible();
    const right = (locator) => locator.evaluate((element) => Math.round(element.getBoundingClientRect().right));
    const classRow = table.locator("tbody tr").first();
    expect(await right(totals)).toBe(await right(classRow));
    expect(await right(totals.locator("td").last())).toBe(await right(classRow.locator("td").last()));
    const rules = await totals.locator("td").evaluateAll((cells) => cells.map((cell) => getComputedStyle(cell).borderTopWidth));
    expect(new Set(rules).size).toBe(1);
  });
}

test.describe("the allotment dates against today", () => {
  test("an allotment dated after today is refused before anything is sent", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-11-20T12:00:00Z"));
    const filings = [];
    await serveSite(page, { filings });
    await page.goto(`${SITE}/companies-house/allotShares.html`, { waitUntil: "networkidle" });
    await lookUp(page);
    await page.locator("#startDate").fill("2026-11-19");
    await page.locator("#endDate").fill("2026-11-21");
    await fillAllotment(page, { shareClass: "Ordinary", number: "50", nominal: "1", paid: "1" });
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.locator("#statusMessagesContainer")).toContainText(
      "The shares cannot have been allotted after today. Enter the dates they were allotted.",
    );
    await expect(page.locator("#formView")).toBeVisible();
    expect(filings).toHaveLength(0);
  });

  test("a return within one month of the last allotment says nothing of lateness", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-12-02T12:00:00Z"));
    await serveSite(page);
    await page.goto(`${SITE}/companies-house/allotShares.html`, { waitUntil: "networkidle" });
    await reviewACashAllotment(page, { continueButton: "Continue" });
    await expect(page.locator("#lateReturn")).toHaveCount(0);
  });

  test("a late return says it is late with its due date, and files after the capital warning is confirmed", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2027-01-15T12:00:00Z"));
    const filings = [];
    await serveSite(page, { filings, refuseUnconfirmed: CAPITAL_REFUSAL });
    await page.goto(`${SITE}/companies-house/allotShares.html`, { waitUntil: "networkidle" });
    await reviewACashAllotment(page, { continueButton: "Continue" });
    await expect(page.locator("#lateReturn")).toHaveText(
      "This return is late. The law asks for it within one month of the allotment, by 2 December 2026. Companies House still takes it, and a fine can follow.",
    );
    await page.getByRole("button", { name: "File with Companies House" }).click();
    await expect(page.locator("#capitalWarning")).toBeVisible();
    await expect(page.locator("#capitalWarning")).toContainText(
      "A return for an allotment made before another allotment the register already shows states the capital at its own date",
    );
    await expect(page.locator("#lateReturn")).toBeVisible();
    await page.getByLabel("The capital this return states is the company's capital at the date the return is made up to").check();
    await page.getByRole("button", { name: "File with Companies House" }).click();
    await expect(page.locator("#filingResult")).toContainText("Submission 000123 was accepted.", { timeout: 15000 });
    expect(filings.at(-1).capitalDifferenceConfirmed).toBe(true);
  });

  test("a late return says so in Welsh on the Welsh page", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2027-01-15T12:00:00Z"));
    await serveSite(page);
    await page.goto(`${SITE}/cy/companies-house/allotShares.html`, { waitUntil: "networkidle" });
    await reviewACashAllotment(page, { lookUpButton: "Chwilio am gyfrannau’r cwmni", continueButton: "Parhau" });
    await expect(page.locator("#lateReturn")).toContainText("Mae’r ffurflen hon yn hwyr.");
    await expect(page.locator("#lateReturn")).toContainText("2 Rhagfyr 2026");
  });
});
