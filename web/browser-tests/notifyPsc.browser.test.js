// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/notifyPsc.browser.test.js
// The new PSC notice page as a reader sees it, in English and in Welsh, at desktop and phone width:
// the company, the kind of PSC, the particulars PSC01, PSC02 and PSC03 ask for, how the PSC controls
// the company, the two dates, the review, and the outcome Companies House gives. The API answers come
// from the routes here.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { PEOPLE, registerCompany } from "@app/http-simulator/fixtures/register.js";

const PUBLIC_ROOT = path.join(process.cwd(), "web/public");
const SITE = "http://localhost:3000";
const COMPANY = registerCompany("00000001");
const SIGNED_IN_EMAIL = PEOPLE.eleanorBramwell.email;
const SCREENSHOT_DIR = path.join(process.cwd(), "target/psc1");

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

// The real site from disk, signed in with the resident Ltd bundle, and the Companies House routes
// answered here. Each filing request's body is recorded.
async function serveSite(page, { filings = [], outcome = { statusCode: "ACCEPT", rejections: [] } } = {}) {
  await page.addInitScript((email) => {
    try {
      localStorage.setItem("consent.analytics", "declined");
      localStorage.setItem("cognitoIdToken", "mock-id-token");
      localStorage.setItem("userInfo", JSON.stringify({ sub: "user1", email }));
    } catch {}
  }, SIGNED_IN_EMAIL);
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname !== "localhost") return route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
    const pathname = decodeURIComponent(url.pathname);
    const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (pathname === "/api/v1/bundle") return json({ bundles: [{ bundleId: "resident-ltd", allocated: true }], tokensRemaining: 10 });
    if (pathname === "/api/v1/companies-house/company/00000001") return json({ companyNumber: "00000001", companyName: COMPANY.name });
    if (pathname === "/api/v1/companies-house/psc-notification" && request.method() === "POST") {
      filings.push(JSON.parse(request.postData()));
      return json({ submissionNumber: "000123", pollInterval: 1 }, 201);
    }
    if (pathname === "/api/v1/companies-house/forms/psc-notification/000123") return json({ submissionNumber: "000123", ...outcome });
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

async function fillAddress(page, prefix, { premise, street, postTown, postcode, country }) {
  await page.locator(`#${prefix}Premise`).fill(premise);
  if (street) await page.locator(`#${prefix}Street`).fill(street);
  await page.locator(`#${prefix}PostTown`).fill(postTown);
  if (postcode) await page.locator(`#${prefix}Postcode`).fill(postcode);
  await page.locator(`#${prefix}Country`).selectOption(country);
}

async function openForm(page, { welsh = false } = {}) {
  await page.goto(`${SITE}${welsh ? "/cy" : ""}/companies-house/notifyPsc.html`, { waitUntil: "networkidle" });
  await page.locator("#companyNumber").fill("00000001");
  await page.locator("#companyLookupBtn").click();
  await expect(page.locator("#formView")).toBeVisible();
}

async function fillDates(page, notificationDate = "2026-10-28", confirmationDate = "2026-11-04") {
  await page.locator("#notificationDate").fill(notificationDate);
  await page.locator("#confirmationDate").fill(confirmationDate);
  await page.locator("#companyAuthCode").fill("SIMCS01");
}

async function fillIndividual(page) {
  await page.locator("#title").fill("Dr");
  await page.locator("#forename").fill("Gwenllian");
  await page.locator("#surname").fill("Pryce");
  await page.locator("#dateOfBirth").fill("1978-03-14");
  await page.locator("#nationality").fill("British");
  await page.locator("#countryOfResidence").fill("Wales");
  await fillAddress(page, "home", {
    premise: "14",
    street: "Heol y Bont",
    postTown: "Aberystwyth",
    postcode: "SY23 1PZ",
    country: "GB-WLS",
  });
}

for (const width of [1280, 390]) {
  test(`an individual's notice is filed in English at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const filings = [];
    await serveSite(page, { filings });
    await page.goto(`${SITE}/companies-house/notifyPsc.html`, { waitUntil: "networkidle" });
    await expect(page.locator("h1")).toHaveText("Tell Companies House about a new PSC");
    await expect(page.locator("p.hint[data-feature-status]")).toContainText("Status: sandbox.");
    await page.locator("#companyNumber").fill("00000001");
    await page.getByRole("button", { name: "Look up the company" }).click();

    await expect(page.locator("#formCompanyName")).toHaveText(COMPANY.name);
    await expect(page.locator("#individualSection")).toBeVisible();
    await expect(page.locator("#entitySection")).toBeHidden();
    await expect(page.locator("#serviceAddress")).toBeHidden();
    await fillIndividual(page);
    await page.getByLabel("The person notified as a PSC has verified their identity in accordance with the Companies Act 2006").check();
    await page.locator("#personalCode").fill("abcde123456");
    await page.locator("#nameMismatchReason").selectOption("PREFERRED_NAME");
    await page.getByRole("group", { name: "Ownership of shares" }).getByLabel("More than 50% but less than 75%").check();
    await page.getByRole("group", { name: "Ownership of voting rights" }).getByLabel("More than 50% but less than 75%").check();
    await fillDates(page);
    expect(await noSideScroll(page)).toBe(true);
    await shoot(page, "individual");
    await page.getByRole("button", { name: "Continue" }).click();

    const review = page.locator("#reviewList");
    await expect(review).toContainText("Dr Gwenllian Pryce");
    await expect(review).toContainText("14 March 1978");
    await expect(review).toContainText("The company's registered office");
    await expect(review).toContainText("14, Heol y Bont, Aberystwyth, SY23 1PZ, Wales");
    await expect(review).toContainText("Shares: more than 50% but less than 75%");
    await expect(review).toContainText("28 October 2026");
    expect(await noSideScroll(page)).toBe(true);
    await shoot(page, "review");

    await page.getByRole("button", { name: "File with Companies House" }).click();
    await expect(page.locator("#filingResult")).toContainText("Submission 000123 was accepted.", { timeout: 15000 });
    expect(filings[0]).toEqual({
      companyNumber: "00000001",
      companyName: COMPANY.name,
      companyAuthCode: "SIMCS01",
      dateSigned: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      pscKind: "individual-person-with-significant-control",
      title: "Dr",
      forename: "Gwenllian",
      surname: "Pryce",
      dateOfBirth: "1978-03-14",
      nationality: "British",
      countryOfResidence: "Wales",
      serviceAddress: { sameAsRegisteredOffice: true },
      residentialAddress: {
        address: { premise: "14", street: "Heol y Bont", postTown: "Aberystwyth", postcode: "SY23 1PZ", country: "GB-WLS" },
      },
      personalCode: "ABCDE123456",
      nameMismatchReason: "PREFERRED_NAME",
      naturesOfControl: ["OWNERSHIPOFSHARES_50TO75PERCENT", "VOTINGRIGHTS_50TO75PERCENT"],
      notificationDate: "2026-10-28",
      confirmationDate: "2026-11-04",
    });
    expect(await noSideScroll(page)).toBe(true);
    await shoot(page, "accepted");
  });

  test(`a relevant legal entity's notice is filed in Welsh at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const filings = [];
    await serveSite(page, { filings });
    await page.goto(`${SITE}/cy/companies-house/notifyPsc.html`, { waitUntil: "networkidle" });
    await expect(page.locator("html")).toHaveAttribute("lang", "cy");
    await expect(page.locator("h1")).toHaveText("Dweud wrth Dŷ’r Cwmnïau am PRhA newydd");
    await page.locator("#companyNumber").fill("00000001");
    await page.getByRole("button", { name: "Chwilio am y cwmni" }).click();
    await page.getByLabel("Endid cyfreithiol perthnasol, fel cwmni").check();
    await expect(page.locator("#entitySection")).toBeVisible();
    await expect(page.locator("#registerSection")).toBeVisible();
    await expect(page.locator("#individualSection")).toBeHidden();
    await page.locator("#entityName").fill("TEIFI VALLEY HOLDINGS LIMITED");
    await fillAddress(page, "office", {
      premise: "Ty Teifi",
      street: "Stryd Fawr",
      postTown: "Aberteifi",
      postcode: "SA43 1HJ",
      country: "GB-WLS",
    });
    await page.locator("#legalForm").fill("Private company limited by shares");
    await page.locator("#lawGoverned").fill("Companies Act 2006");
    await page.locator("#placeRegistered").fill("Companies House");
    await page.locator("#registrationNumber").fill("00000006");
    await page.locator("#directors").check();
    await page.getByRole("group", { name: "Perchnogaeth cyfranddaliadau" }).locator('input[value="75TO100PERCENT"]').check();
    await fillDates(page);
    await page.getByRole("button", { name: "Parhau" }).click();
    await expect(page.locator("#statusMessagesContainer")).toContainText(
      "Os rhowch y gofrestr y mae’r endid wedi’i gofnodi ynddi a’i rif yno, rhowch wlad neu dalaith y gofrestr honno hefyd.",
    );
    expect(filings).toHaveLength(0);
    await page.locator("#countryOrState").fill("UNITED KINGDOM");
    expect(await noSideScroll(page)).toBe(true);
    await shoot(page, "entity-cy");
    await page.getByRole("button", { name: "Parhau" }).click();

    const review = page.locator("#reviewList");
    await expect(review).toContainText("Endid cyfreithiol perthnasol");
    await expect(review).toContainText("Ty Teifi, Stryd Fawr, Aberteifi, SA43 1HJ, Cymru");
    await expect(review).toContainText("Companies House, UNITED KINGDOM, 00000006");
    expect(await noSideScroll(page)).toBe(true);
    await shoot(page, "review-cy");

    await page.getByRole("button", { name: "Ffeilio gyda Thŷ’r Cwmnïau" }).click();
    await expect(page.locator("#filingResult")).toContainText("Statws cyflwyniad 000123:", { timeout: 15000 });
    expect(filings[0]).toMatchObject({
      pscKind: "corporate-entity-person-with-significant-control",
      name: "TEIFI VALLEY HOLDINGS LIMITED",
      address: { premise: "Ty Teifi", street: "Stryd Fawr", postTown: "Aberteifi", postcode: "SA43 1HJ", country: "GB-WLS" },
      legalForm: "Private company limited by shares",
      lawGoverned: "Companies Act 2006",
      placeRegistered: "Companies House",
      countryOrState: "UNITED KINGDOM",
      registrationNumber: "00000006",
      naturesOfControl: ["OWNERSHIPOFSHARES_75TO100PERCENT", "RIGHTTOAPPOINTANDREMOVEDIRECTORS"],
    });
    expect(filings[0]).not.toHaveProperty("surname");
    expect(await noSideScroll(page)).toBe(true);
    await shoot(page, "accepted-cy");
  });
}

test("an other registrable person's notice sends its legal form and governing law, and no register", async ({ page }) => {
  const filings = [];
  await serveSite(page, { filings });
  await openForm(page);
  await page.getByLabel("An other registrable person", { exact: true }).check();
  await expect(page.locator("#registerSection")).toBeHidden();
  await page.locator("#entityName").fill("Ceredigion County Council");
  await fillAddress(page, "office", { premise: "Canolfan Rheidol", postTown: "Aberystwyth", country: "GB-WLS" });
  await page.locator("#legalForm").fill("Local authority");
  await page.locator("#lawGoverned").fill("Local Government (Wales) Act 1994");
  await page.locator("#influence").check();
  await fillDates(page);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#reviewList")).toContainText("An other registrable person");
  await page.getByRole("button", { name: "File with Companies House" }).click();
  await expect(page.locator("#filingResult")).toContainText("Submission 000123 was accepted.", { timeout: 15000 });
  expect(filings[0]).toMatchObject({
    pscKind: "legal-person-person-with-significant-control",
    name: "Ceredigion County Council",
    legalForm: "Local authority",
    lawGoverned: "Local Government (Wales) Act 1994",
    naturesOfControl: ["SIGINFLUENCECONTROL"],
  });
  expect(filings[0]).not.toHaveProperty("placeRegistered");
});

test("an individual with a service address and a home abroad sends both addresses", async ({ page }) => {
  const filings = [];
  await serveSite(page, { filings });
  await openForm(page);
  await fillIndividual(page);
  await page.getByLabel("Another address").check();
  await expect(page.locator("#serviceAddress")).toBeVisible();
  await fillAddress(page, "service", { premise: "Unit 3", postTown: "Aberystwyth", country: "GB-WLS" });
  await fillAddress(page, "home", { premise: "7", postTown: "Galway", country: "OTHER" });
  await page.locator("#homeOtherForeignCountry").fill("Ireland");
  await page.locator("#influence").check();
  await fillDates(page);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#reviewList")).toContainText("Unit 3, Aberystwyth, Wales");
  await page.getByRole("button", { name: "File with Companies House" }).click();
  await expect(page.locator("#filingResult")).toContainText("Submission 000123 was accepted.", { timeout: 15000 });
  expect(filings[0].serviceAddress).toEqual({ address: { premise: "Unit 3", postTown: "Aberystwyth", country: "GB-WLS" } });
  expect(filings[0].residentialAddress.address).toMatchObject({ premise: "7", postTown: "Galway", otherForeignCountry: "Ireland" });
  expect(filings[0]).not.toHaveProperty("personalCode");
});

test("what PSC01 refuses is refused before anything is sent", async ({ page }) => {
  const filings = [];
  await serveSite(page, { filings });
  await openForm(page);
  const status = page.locator("#statusMessagesContainer");
  const next = () => page.getByRole("button", { name: "Continue" }).click();

  await fillDates(page);
  await next();
  await expect(status).toContainText("Give the individual's surname, date of birth, nationality and country of residence.");

  await fillIndividual(page);
  await page.getByLabel("The same as the service address").check();
  await next();
  await expect(status).toContainText(
    "The usual residential address cannot be the service address when the service address is the company's registered office.",
  );

  await page.getByLabel("Give the address").check();
  await next();
  await expect(status).toContainText("Choose at least one way the person controls the company.");

  await page.locator("#directors").check();
  await page.locator("#influence").check();
  await next();
  await expect(status).toContainText("Choose significant influence or control only if none of the other ways in the same section applies.");

  await page.locator("#influence").uncheck();
  await fillDates(page, "2016-04-05", "2016-04-05");
  await next();
  await expect(status).toContainText("The date they became a person with significant control cannot be before 6 April 2016.");

  await fillDates(page, "2026-11-04", "2026-11-01");
  await next();
  await expect(status).toContainText("The date of confirmation cannot be before the date they became a person with significant control.");
  await expect(page.locator("#formView")).toBeVisible();
  expect(filings).toHaveLength(0);
});

test("a date after today is refused before anything is sent, and the date fields stop at today", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-20T12:00:00Z"));
  const filings = [];
  await serveSite(page, { filings });
  await openForm(page);
  await expect(page.locator("#notificationDate")).toHaveAttribute("max", "2026-11-20");
  await expect(page.locator("#confirmationDate")).toHaveAttribute("max", "2026-11-20");
  const status = page.locator("#statusMessagesContainer");
  const next = () => page.getByRole("button", { name: "Continue" }).click();
  await fillIndividual(page);
  await page.getByLabel("Give the address").check();
  await page.locator("#directors").check();

  await fillDates(page, "2026-11-21", "2026-11-21");
  await next();
  await expect(status).toContainText("The date they became a person with significant control cannot be after today.");

  await fillDates(page, "2026-11-19", "2026-11-21");
  await next();
  await expect(status).toContainText("The date of confirmation cannot be after today.");
  await expect(page.locator("#formView")).toBeVisible();
  expect(filings).toHaveLength(0);
});

test("the Welsh page's date fields stop at today", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-20T12:00:00Z"));
  await serveSite(page, {});
  await openForm(page, { welsh: true });
  await expect(page.locator("#notificationDate")).toHaveAttribute("max", "2026-11-20");
});

test("a rejection shows Companies House's reason", async ({ page }) => {
  await serveSite(page, {
    outcome: { statusCode: "REJECT", rejections: [{ rejectCode: "9998", description: "The nationality is not on the standard list." }] },
  });
  await openForm(page);
  await fillIndividual(page);
  await page.locator("#directors").check();
  await fillDates(page);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "File with Companies House" }).click();
  const result = page.locator("#filingResult");
  await expect(result).toContainText("Submission 000123 was rejected.", { timeout: 15000 });
  await expect(result).toContainText("9998: The nationality is not on the standard list.");
});

test("a link from the company lookup fills the company number", async ({ page }) => {
  await serveSite(page);
  await page.goto(`${SITE}/companies-house/notifyPsc.html?companyNumber=00000001`, { waitUntil: "networkidle" });
  await expect(page.locator("#companyNumber")).toHaveValue("00000001");
});

test("the home address and full date of birth are on no page once the filing is sent", async ({ page }) => {
  await serveSite(page);
  await page.goto(`${SITE}/companies-house/notifyPsc.html`, { waitUntil: "networkidle" });
  await page.locator("#companyNumber").fill("00000001");
  await page.getByRole("button", { name: "Look up the company" }).click();
  await fillIndividual(page);
  await page.getByRole("group", { name: "Ownership of shares" }).getByLabel("75% or more").check();
  await fillDates(page);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#reviewList")).toContainText("Heol y Bont");
  await page.getByRole("button", { name: "File with Companies House" }).click();
  await expect(page.locator("#filingResult")).toContainText("Submission 000123 was accepted.", { timeout: 15000 });
  const held = await page.evaluate(() => ({
    html: document.body.innerHTML,
    values: [...document.querySelectorAll("input")].map((input) => input.value).join(" "),
  }));
  expect(held.html).not.toContain("Heol y Bont");
  expect(held.values).not.toContain("Heol y Bont");
  expect(held.values).not.toContain("1978-03-14");
});

const FIRM_TRUST_DIR = path.join(process.cwd(), "target/psc1-firm-trust");

async function shootFirmTrust(page, name) {
  fs.mkdirSync(FIRM_TRUST_DIR, { recursive: true });
  await page.screenshot({ path: path.join(FIRM_TRUST_DIR, `${name}-${page.viewportSize().width}.png`), fullPage: true });
}

for (const width of [1280, 390]) {
  test(`an individual who controls the company through a firm and a trust is filed in English at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const filings = [];
    await serveSite(page, { filings });
    await openForm(page);
    await fillIndividual(page);
    const firm = page.locator("#firmControls");
    const trust = page.locator("#trustControls");
    await expect(firm.locator("legend").first()).toHaveText("Control through a firm");
    await expect(trust.locator("legend").first()).toHaveText("Control through a trust");
    await firm.locator('input[name="shares-firm"][value="25TO50PERCENT"]').check();
    await firm.locator("#directors-firm").check();
    await trust.locator("#influence-trust").check();
    await fillDates(page);
    expect(await noSideScroll(page)).toBe(true);
    await shootFirmTrust(page, "controls");
    await page.getByRole("button", { name: "Continue" }).click();
    const review = page.locator("#reviewList");
    await expect(review).toContainText("Shares: more than 25% but not more than 50%, through a firm");
    await expect(review).toContainText("The right to appoint or remove a majority of the board of directors, through a firm");
    await expect(review).toContainText("Significant influence or control, through a trust");
    expect(await noSideScroll(page)).toBe(true);
    await shootFirmTrust(page, "review");
    await page.getByRole("button", { name: "File with Companies House" }).click();
    await expect(page.locator("#filingResult")).toContainText("Submission 000123 was accepted.", { timeout: 15000 });
    expect(filings[0].naturesOfControl).toEqual([
      "OWNERSHIPOFSHARES_25TO50PERCENT_AS_FIRM",
      "RIGHTTOAPPOINTANDREMOVEDIRECTORS_AS_FIRM",
      "SIGINFLUENCECONTROL_AS_TRUST",
    ]);
  });

  test(`a relevant legal entity's control through a trust is filed in Welsh at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const filings = [];
    await serveSite(page, { filings });
    await openForm(page, { welsh: true });
    await page.getByLabel("Endid cyfreithiol perthnasol, fel cwmni").check();
    await page.locator("#entityName").fill("TEIFI VALLEY HOLDINGS LIMITED");
    await fillAddress(page, "office", { premise: "Ty Teifi", postTown: "Aberteifi", country: "GB-WLS" });
    await page.locator("#legalForm").fill("Private company limited by shares");
    await page.locator("#lawGoverned").fill("Companies Act 2006");
    const trust = page.locator("#trustControls");
    await expect(trust.locator("legend").first()).toHaveText("Rheolaeth drwy ymddiriedolaeth");
    await trust.locator('input[name="votes-trust"][value="75TO100PERCENT"]').check();
    await fillDates(page);
    expect(await noSideScroll(page)).toBe(true);
    await shootFirmTrust(page, "controls-cy");
    await page.getByRole("button", { name: "Parhau" }).click();
    await expect(page.locator("#reviewList")).toContainText("drwy ymddiriedolaeth");
    expect(await noSideScroll(page)).toBe(true);
    await shootFirmTrust(page, "review-cy");
    await page.getByRole("button", { name: "Ffeilio gyda Thŷ’r Cwmnïau" }).click();
    await expect(page.locator("#filingResult")).toContainText("Statws cyflwyniad 000123:", { timeout: 15000 });
    expect(filings[0].naturesOfControl).toEqual(["VOTINGRIGHTS_75TO100PERCENT_AS_TRUST"]);
  });
}

test("significant influence through a firm or a trust may stand beside other controls held the same way, and held directly may not", async ({
  page,
}) => {
  const filings = [];
  await serveSite(page, { filings });
  await openForm(page);
  await fillIndividual(page);
  await fillDates(page);
  await page.locator("#influence").check();
  await page.locator("#directors").check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#statusMessagesContainer")).toContainText(
    "Choose significant influence or control only if none of the other ways in the same section applies.",
  );
  await page.locator("#influence").uncheck();
  await page.locator("#directors").uncheck();
  await page.locator("#influence-firm").check();
  await page.locator("#directors-firm").check();
  await page.locator('#trustControls input[name="shares-trust"][value="25TO50PERCENT"]').check();
  await page.locator("#influence-trust").check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#reviewView")).toBeVisible();
  await page.getByRole("button", { name: "File with Companies House" }).click();
  await expect(page.locator("#filingResult")).toContainText("Submission 000123 was accepted.", { timeout: 15000 });
  expect(filings[0].naturesOfControl).toEqual([
    "RIGHTTOAPPOINTANDREMOVEDIRECTORS_AS_FIRM",
    "SIGINFLUENCECONTROL_AS_FIRM",
    "OWNERSHIPOFSHARES_25TO50PERCENT_AS_TRUST",
    "SIGINFLUENCECONTROL_AS_TRUST",
  ]);
});

test("a personal code typed in its printed groups with spaces or a slash is taken and sent as eleven characters", async ({ page }) => {
  const filings = [];
  await serveSite(page, { filings });
  await openForm(page);
  await fillIndividual(page);
  await page.getByLabel("The person notified as a PSC has verified their identity in accordance with the Companies Act 2006").check();
  await page.locator("#personalCode").fill("abcd e123/456");
  await page.locator("#influence").check();
  await fillDates(page);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#reviewList")).toContainText("ABCDE123456");
  await page.getByRole("button", { name: "File with Companies House" }).click();
  await expect(page.locator("#filingResult")).toContainText("Submission 000123 was accepted.", { timeout: 15000 });
  expect(filings[0].personalCode).toBe("ABCDE123456");
});

test("an individual's Welsh surname with a lower-case ŷ is stopped before sending, naming the box", async ({ page }) => {
  const filings = [];
  await serveSite(page, { filings });
  await page.goto(`${SITE}/companies-house/notifyPsc.html`, { waitUntil: "networkidle" });
  await page.locator("#companyNumber").fill("00000001");
  await page.getByRole("button", { name: "Look up the company" }).click();
  await fillIndividual(page);
  await page.locator("#surname").fill("Prŷs");
  await page.getByRole("group", { name: "Ownership of shares" }).getByLabel("75% or more").check();
  await fillDates(page);
  await page.getByRole("button", { name: "Continue" }).click();
  const status = page.locator("#statusMessagesContainer");
  await expect(status).toContainText("Surname has characters Companies House does not accept: ŷ");
  await expect(status).not.toContainText("Prŷs");
  expect(filings).toHaveLength(0);
});

test("a personal code typed as PSC01 prints it, with a space either side of each slash, is taken whole", async ({ page }) => {
  const filings = [];
  await serveSite(page, { filings });
  await openForm(page);
  await fillIndividual(page);
  await page.getByLabel("The person notified as a PSC has verified their identity in accordance with the Companies Act 2006").check();
  await page.locator("#personalCode").fill("cwm / ps83 / 2223");
  await expect(page.locator("#personalCode")).toHaveValue("cwm / ps83 / 2223");
  await page.locator("#influence").check();
  await fillDates(page);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#reviewList")).toContainText("CWMPS832223");
  await page.getByRole("button", { name: "File with Companies House" }).click();
  await expect(page.locator("#filingResult")).toContainText("Submission 000123 was accepted.", { timeout: 15000 });
  expect(filings[0].personalCode).toBe("CWMPS832223");
});

test("a personal code that is too long once its groups are joined is refused before anything is sent", async ({ page }) => {
  const filings = [];
  await serveSite(page, { filings });
  await openForm(page);
  await fillIndividual(page);
  await page.getByLabel("The person notified as a PSC has verified their identity in accordance with the Companies Act 2006").check();
  await page.locator("#personalCode").fill("CWM PS83 22234");
  await page.locator("#influence").check();
  await fillDates(page);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#statusMessagesContainer")).toContainText(
    "A Companies House personal code is 11 characters: letters, then numbers.",
  );
  expect(filings).toHaveLength(0);
});
