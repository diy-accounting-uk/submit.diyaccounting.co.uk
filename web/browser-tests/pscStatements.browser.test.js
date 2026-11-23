// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/pscStatements.browser.test.js
// The PSC statements page as a reader sees it, in English and in Welsh, at desktop and phone width:
// the company, giving a statement or saying one is no longer true, the statement, the PSC a linked
// statement names, how a restrictions notice ended, the relevant date, the review, and the outcome
// Companies House gives. The API answers come from the routes here.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { PEOPLE, registerCompany } from "@app/http-simulator/fixtures/register.js";
const USER_EMAIL = PEOPLE.samPatel.email;
const COMPANY = registerCompany("00000001");
const CORPORATE_PSC_NAME = COMPANY.pscs.find((psc) => psc.kind === "corporate-entity-person-with-significant-control").name;

const PUBLIC_ROOT = path.join(process.cwd(), "web/public");
const SITE = "http://localhost:3000";
const SCREENSHOT_DIR = path.join(process.cwd(), "target/psc4");

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

const PSCS = [
  {
    name: "Eleanor Bramwell",
    nameElements: { title: "Mrs", forename: "Eleanor", surname: "Bramwell" },
    kind: "individual-person-with-significant-control",
    naturesOfControl: [
      "ownership-of-shares-50-to-75-percent",
      "voting-rights-50-to-75-percent",
      "significant-influence-or-control-as-trust",
    ],
    notifiedOn: "2016-04-06",
    ceasedOn: null,
    dateOfBirth: { month: 1, year: 1970 },
  },
  {
    name: CORPORATE_PSC_NAME,
    kind: "corporate-entity-person-with-significant-control",
    naturesOfControl: ["ownership-of-shares-25-to-50-percent"],
    notifiedOn: "2019-06-01",
    ceasedOn: null,
  },
  {
    name: "Former Holder",
    nameElements: { surname: "Holder" },
    kind: "individual-person-with-significant-control",
    naturesOfControl: [],
    notifiedOn: "2016-04-06",
    ceasedOn: "2020-01-01",
  },
];

// The real site from disk, signed in with the resident Ltd bundle, and the Companies House routes
// answered here. Each filing request's body is recorded.
async function serveSite(page, { filings = [], outcome = { statusCode: "ACCEPT", rejections: [] }, pscs = PSCS } = {}) {
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
    if (pathname === "/api/v1/companies-house/company/00000001") return json({ companyNumber: COMPANY.number, companyName: COMPANY.name });
    if (pathname === "/api/v1/companies-house/company/00000001/persons-with-significant-control") return json({ pscs });
    const filed = pathname.match(/^\/api\/v1\/companies-house\/(psc-statement-notification|psc-statement-withdrawal)$/);
    if (filed && request.method() === "POST") {
      filings.push({ kind: filed[1], ...JSON.parse(request.postData()) });
      return json({ submissionNumber: "000123", pollInterval: 1 }, 201);
    }
    if (/^\/api\/v1\/companies-house\/forms\/psc-statement-(notification|withdrawal)\/000123$/.test(pathname)) {
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

const LOOK_UP = "Look up the company";

async function lookUp(page, button = LOOK_UP) {
  await page.locator("#companyNumber").fill("00000001");
  await page.getByRole("button", { name: button }).click();
}

async function dateAndCode(page, date) {
  await page.locator("#relevantDate").fill(date);
  await page.locator("#companyAuthCode").fill("SIMCS01");
}

for (const width of [1280, 390]) {
  test(`a statement that the company has no PSC is given in English at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const filings = [];
    await serveSite(page, { filings, pscs: PSCS.filter((psc) => psc.ceasedOn) });
    await page.goto(`${SITE}/companies-house/pscStatements.html`, { waitUntil: "networkidle" });

    await expect(page.locator("h1")).toHaveText("Give or withdraw a PSC statement");
    await expect(page.locator("p.hint[data-feature-status]")).toContainText("Status: sandbox.");
    await lookUp(page);
    await page.getByLabel("Give a statement").check();
    await expect(page.locator("#notifySection input")).toHaveCount(5);
    await page.locator("#notify-none").check();
    await dateAndCode(page, "2026-11-01");
    expect(await noSideScroll(page)).toBe(true);
    await shoot(page, "notify");
    await page.getByRole("button", { name: "Continue" }).click();

    const review = page.locator("#reviewList");
    await expect(review).toContainText("there is no registrable person or registrable relevant legal entity");
    await expect(review).toContainText("1 November 2026");
    expect(await noSideScroll(page)).toBe(true);
    await shoot(page, "review");

    await page.getByRole("button", { name: "File with Companies House" }).click();
    await expect(page.locator("#filingResult")).toContainText("Submission 000123 was accepted.", { timeout: 15000 });
    expect(filings).toEqual([
      expect.objectContaining({
        kind: "psc-statement-notification",
        companyNumber: "00000001",
        companyAuthCode: "SIMCS01",
        statement: "NO_INDIVIDUAL_OR_ENTITY_WITH_SIGNFICANT_CONTROL",
        relevantDate: "2026-11-01",
      }),
    ]);
    expect(filings[0]).not.toHaveProperty("pscKind");
    expect(await noSideScroll(page)).toBe(true);
    await shoot(page, "accepted");
  });

  test(`a restrictions notice ended by a court order is withdrawn in Welsh at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const filings = [];
    await serveSite(page, { filings });
    await page.goto(`${SITE}/cy/companies-house/pscStatements.html`, { waitUntil: "networkidle" });

    await expect(page.locator("html")).toHaveAttribute("lang", "cy");
    await expect(page.locator("h1")).toHaveText("Rhoi datganiad PRhA neu ei dynnu’n ôl");
    await lookUp(page, "Chwilio am y cwmni");
    await page.getByLabel("Nid yw datganiad ar y gofrestr yn wir mwyach").check();
    await expect(page.locator("#withdrawSection input")).toHaveCount(8);
    await page.locator("#withdraw-restrictions").check();
    await expect(page.locator("#reasonSection")).toBeVisible();
    await page.locator("#reason-court").check();
    await dateAndCode(page, "2026-11-05");
    expect(await noSideScroll(page)).toBe(true);
    await shoot(page, "withdraw-cy");
    await page.getByRole("button", { name: "Parhau" }).click();

    const review = page.locator("#reviewList");
    await expect(review).toContainText("Mae’r llys wedi gwneud gorchymyn");
    await expect(review).toContainText("5 Tachwedd 2026");
    expect(await noSideScroll(page)).toBe(true);
    await shoot(page, "review-cy");

    await page.getByRole("button", { name: "Ffeilio gyda Thŷ’r Cwmnïau" }).click();
    await expect(page.locator("#filingResult")).toContainText("Statws cyflwyniad 000123:", { timeout: 15000 });
    expect(filings[0]).toMatchObject({
      kind: "psc-statement-withdrawal",
      statement: "RESTRICTIONS_NOTICE_ISSUED_TO_PSC",
      restrictionsWithdrawalReason: "RESTRICTIONS_NOTICE_WITHDRAWN_BY_COURT_ORDER",
      withdrawalDate: "2026-11-05",
    });
    expect(filings[0]).not.toHaveProperty("relevantDate");
    expect(await noSideScroll(page)).toBe(true);
    await shoot(page, "accepted-cy");
  });
}

for (const [id, statement] of [
  ["notify-none", "NO_INDIVIDUAL_OR_ENTITY_WITH_SIGNFICANT_CONTROL"],
  ["notify-awaiting", "AWAITING_CONFIRMATION_FROM_PSC"],
  ["notify-790d", "PSC_CONTACTED_BUT_NO_RESPONSE"],
  ["notify-restrictions", "RESTRICTIONS_NOTICE_ISSUED_TO_PSC"],
]) {
  test(`the statement ${statement} is sent as given, naming no PSC`, async ({ page }) => {
    const filings = [];
    // A company with no PSC has none on the register that has not ceased.
    const pscs = statement === "NO_INDIVIDUAL_OR_ENTITY_WITH_SIGNFICANT_CONTROL" ? PSCS.filter((psc) => psc.ceasedOn) : PSCS;
    await serveSite(page, { filings, pscs });
    await page.goto(`${SITE}/companies-house/pscStatements.html`, { waitUntil: "networkidle" });
    await lookUp(page);
    await page.getByLabel("Give a statement").check();
    await page.locator(`#${id}`).check();
    await expect(page.locator("#pscSection")).toBeHidden();
    await dateAndCode(page, "2026-11-01");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "File with Companies House" }).click();
    await expect(page.locator("#filingResult")).toContainText("was accepted.", { timeout: 15000 });
    expect(filings[0]).toMatchObject({ kind: "psc-statement-notification", statement, relevantDate: "2026-11-01" });
    expect(filings[0]).not.toHaveProperty("surname");
  });
}

test("a statement that a PSC failed to comply with a section 790E notice names the PSC chosen", async ({ page }) => {
  const filings = [];
  await serveSite(page, { filings });
  await page.goto(`${SITE}/companies-house/pscStatements.html`, { waitUntil: "networkidle" });
  await lookUp(page);
  await page.getByLabel("Give a statement").check();
  await page.locator("#notify-790e").check();
  await expect(page.locator("#pscSection")).toBeVisible();
  await expect(page.locator("#pscChoices label")).toHaveText([
    "Eleanor Bramwell (Individual)",
    `${CORPORATE_PSC_NAME} (Legal entity or other registrable person)`,
  ]);
  await dateAndCode(page, "2026-11-01");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#statusMessagesContainer")).toContainText(
    "Choose the person with significant control the notice was given to.",
  );
  await page.getByLabel("Eleanor Bramwell (Individual)").check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#reviewList")).toContainText("Eleanor Bramwell (Individual)");
  await page.getByRole("button", { name: "File with Companies House" }).click();
  await expect(page.locator("#filingResult")).toContainText("was accepted.", { timeout: 15000 });
  expect(filings[0]).toMatchObject({
    kind: "psc-statement-notification",
    statement: "PSC_HAS_FAILED_TO_CONFIRM_CHANGED_DETAILS",
    pscKind: "individual-person-with-significant-control",
    title: "Mrs",
    surname: "Bramwell",
    dobMonth: 1,
    dobYear: 1970,
  });
});

test("two PSCs of one name are told apart by their month and year of birth, and the one chosen is named", async ({ page }) => {
  const filings = [];
  const namesake = (month, year) => ({
    name: "Owen Prys",
    nameElements: { forename: "Owen", surname: "Prys" },
    kind: "individual-person-with-significant-control",
    naturesOfControl: ["ownership-of-shares-25-to-50-percent"],
    notifiedOn: "2016-04-06",
    ceasedOn: null,
    dateOfBirth: { month, year },
  });
  await serveSite(page, { filings, pscs: [namesake(1, 1970), namesake(6, 1985)] });
  await page.goto(`${SITE}/companies-house/pscStatements.html`, { waitUntil: "networkidle" });
  await lookUp(page);
  await page.getByLabel("Give a statement").check();
  await page.locator("#notify-790e").check();
  await expect(page.locator("#pscChoices label")).toHaveText([
    "Owen Prys, born January 1970 (Individual)",
    "Owen Prys, born June 1985 (Individual)",
  ]);
  await page.getByLabel("Owen Prys, born June 1985 (Individual)").check();
  await dateAndCode(page, "2026-11-01");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#reviewList")).toContainText("Owen Prys, born June 1985 (Individual)");
  await page.getByRole("button", { name: "File with Companies House" }).click();
  await expect(page.locator("#filingResult")).toContainText("was accepted.", { timeout: 15000 });
  expect(filings[0]).toMatchObject({ surname: "Prys", dobMonth: 6, dobYear: 1985 });
});

test("a withdrawal of a statement given before the present rules is sent with its date", async ({ page }) => {
  const filings = [];
  await serveSite(page, { filings });
  await page.goto(`${SITE}/companies-house/pscStatements.html`, { waitUntil: "networkidle" });
  await lookUp(page);
  await page.getByLabel("A statement on the register is no longer true").check();
  await expect(page.locator("#withdrawDateHint")).toBeVisible();
  await page.locator("#withdraw-steps").check();
  await expect(page.locator("#reasonSection")).toBeHidden();
  await dateAndCode(page, "2026-11-05");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "File with Companies House" }).click();
  await expect(page.locator("#filingResult")).toContainText("was accepted.", { timeout: 15000 });
  expect(filings[0]).toEqual(
    expect.objectContaining({
      kind: "psc-statement-withdrawal",
      statement: "STEPS_TO_FIND_PSC_NOT_YET_COMPLETED",
      withdrawalDate: "2026-11-05",
    }),
  );
  expect(filings[0]).not.toHaveProperty("restrictionsWithdrawalReason");
});

test("a statement that the company has no PSC is refused while the register shows a PSC who has not ceased", async ({ page }) => {
  const filings = [];
  await serveSite(page, { filings });
  await page.goto(`${SITE}/companies-house/pscStatements.html`, { waitUntil: "networkidle" });
  await lookUp(page);
  await page.getByLabel("Give a statement").check();
  await page.locator("#notify-none").check();
  await dateAndCode(page, "2026-11-01");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#statusMessagesContainer")).toContainText(
    `The register shows a person with significant control who has not ceased: Eleanor Bramwell; ${CORPORATE_PSC_NAME}.`,
  );
  await expect(page.locator("#formView")).toBeVisible();
  expect(filings).toHaveLength(0);
});

test("the refusal of a statement that the company has no PSC names a protected PSC by what it is, as the register gives it no name", async ({
  page,
}) => {
  const filings = [];
  const protectedPsc = { kind: "super-secure-person-with-significant-control", notifiedOn: "2021-03-01", ceasedOn: null };
  await serveSite(page, { filings, pscs: [protectedPsc, PSCS[2]] });
  await page.goto(`${SITE}/companies-house/pscStatements.html`, { waitUntil: "networkidle" });
  await lookUp(page);
  await page.getByLabel("Give a statement").check();
  await page.locator("#notify-none").check();
  await dateAndCode(page, "2026-11-01");
  await page.getByRole("button", { name: "Continue" }).click();

  const status = page.locator("#statusMessagesContainer");
  await expect(status).toContainText(
    "The register shows a person with significant control who has not ceased: a person whose details Companies House keeps protected.",
  );
  await expect(status).not.toContainText("undefined");
  expect(filings).toHaveLength(0);
});

test("no choice, or a restrictions withdrawal without how it ended, is refused before anything is sent", async ({ page }) => {
  const filings = [];
  await serveSite(page, { filings });
  await page.goto(`${SITE}/companies-house/pscStatements.html`, { waitUntil: "networkidle" });
  await lookUp(page);
  await dateAndCode(page, "2026-11-05");
  const status = page.locator("#statusMessagesContainer");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(status).toContainText("Choose whether you are giving a statement or saying one is no longer true.");
  await page.getByLabel("A statement on the register is no longer true").check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(status).toContainText("Choose the statement.");
  await page.locator("#withdraw-restrictions").check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(status).toContainText("Choose how the restrictions ended.");
  await expect(page.locator("#formView")).toBeVisible();
  expect(filings).toHaveLength(0);
});

test("a rejection shows Companies House's reason", async ({ page }) => {
  await serveSite(page, {
    outcome: { statusCode: "REJECT", rejections: [{ rejectCode: "9998", description: "The statement does not match the register." }] },
    pscs: PSCS.filter((psc) => psc.ceasedOn),
  });
  await page.goto(`${SITE}/companies-house/pscStatements.html`, { waitUntil: "networkidle" });
  await lookUp(page);
  await page.getByLabel("Give a statement").check();
  await page.locator("#notify-none").check();
  await dateAndCode(page, "2026-11-01");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "File with Companies House" }).click();
  const result = page.locator("#filingResult");
  await expect(result).toContainText("Submission 000123 was rejected.", { timeout: 15000 });
  await expect(result).toContainText("9998: The statement does not match the register.");
});

test("a relevant date after today is refused before anything is sent, for a statement given and one withdrawn", async ({ page }) => {
  const filings = [];
  await serveSite(page, { filings, pscs: PSCS.filter((psc) => psc.ceasedOn) });
  await page.goto(`${SITE}/companies-house/pscStatements.html`, { waitUntil: "networkidle" });
  await lookUp(page);
  await page.getByLabel("Give a statement").check();
  await dateAndCode(page, "2099-01-01");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#statusMessagesContainer")).toContainText("Choose the statement.");
  await page.locator("#notify-none").check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#statusMessagesContainer")).toContainText("The relevant date cannot be after today.");
  await expect(page.locator("#statusMessagesContainer .status-message")).toHaveCount(1);
  await expect(page.locator("#formView")).toBeVisible();

  await page.reload({ waitUntil: "networkidle" });
  await lookUp(page);
  await page.getByLabel("A statement on the register is no longer true").check();
  await page.locator("#withdraw-steps").check();
  await dateAndCode(page, "2099-01-01");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#statusMessagesContainer")).toContainText("The relevant date cannot be after today.");
  await expect(page.locator("#formView")).toBeVisible();
  expect(filings).toHaveLength(0);
});
