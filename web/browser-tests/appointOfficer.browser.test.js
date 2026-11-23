// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/appointOfficer.browser.test.js
// The officer appointment page as a reader sees it, in English and in Welsh, at desktop and phone
// width: the company, the choice of a director or a secretary, a person or a corporate body, the
// fields each needs (a director's personal code among them), the review, and the outcome Companies
// House gives. The API answers come from the routes here.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { PEOPLE, registerCompany } from "@app/http-simulator/fixtures/register.js";

const PUBLIC_ROOT = path.join(process.cwd(), "web/public");
const SITE = "http://localhost:3000";
const COMPANY = registerCompany("00000001");
const SIGNED_IN_EMAIL = PEOPLE.eleanorBramwell.email;
const SCREENSHOT_DIR = path.join(process.cwd(), "target/off1");

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
    if (pathname === "/api/v1/companies-house/company/00000001")
      return json({ companyNumber: "00000001", companyName: COMPANY.name });
    if (pathname === "/api/v1/companies-house/officer-appointment" && request.method() === "POST") {
      filings.push(JSON.parse(request.postData()));
      return json({ submissionNumber: "000123", pollInterval: 1 }, 201);
    }
    if (pathname === "/api/v1/companies-house/forms/officer-appointment/000123") return json({ submissionNumber: "000123", ...outcome });
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
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `appointOfficer-${name}-${page.viewportSize().width}.png`), fullPage: true });
}

const noSideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

async function lookUp(page, button) {
  await page.locator("#companyNumber").fill("00000001");
  await page.getByRole("button", { name: button }).click();
}

const APPOINTED = "2025-11-03";

async function fillAddress(page, prefix, { premise, street, postTown, country, postcode }) {
  await page.locator(`#${prefix}Premise`).fill(premise);
  if (street) await page.locator(`#${prefix}Street`).fill(street);
  await page.locator(`#${prefix}PostTown`).fill(postTown);
  await page.locator(`#${prefix}Country`).selectOption(country);
  if (postcode) await page.locator(`#${prefix}Postcode`).fill(postcode);
}

async function finishAndReview(page, continueName) {
  await page.locator("#consentToAct").check();
  await page.locator("#companyAuthCode").fill("SIMCS01");
  await page.getByRole("button", { name: continueName }).click();
}

for (const width of [1280, 390]) {
  test(`a director who is a person is appointed in English at ${width}px, with the personal code and the identity confirmed`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const filings = [];
    await serveSite(page, { filings });
    await page.goto(`${SITE}/companies-house/appointOfficer.html`, { waitUntil: "networkidle" });

    await expect(page.locator("h1")).toHaveText("Appoint a director or secretary");
    await expect(page.locator("p.hint[data-feature-status]")).toContainText("Status: sandbox.");
    await lookUp(page, "Look up the company");

    await expect(page.getByLabel("A director who is a person")).toBeChecked();
    await expect(page.locator("#directorFields")).toBeVisible();
    await expect(page.locator("#corporateFields")).toBeHidden();
    await expect(page.locator("#formView")).toContainText(
      "“All directors must verify their identity to prove who they are. You’ll need to give the Companies House personal code for the director and confirm they have verified their identity.”",
    );
    await page.locator("#appointmentDate").fill(APPOINTED);
    await page.locator("#officerTitle").fill("Mrs");
    await page.locator("#officerForename").fill("Carys");
    await page.locator("#officerOtherForenames").fill("Mair");
    await page.locator("#officerSurname").fill("Llewelyn");
    await page.locator("#formerSurname").fill("Rees");
    await page.locator("#serviceSameAsOffice").check();
    await expect(page.locator("#serviceAddressFields")).toBeHidden();
    await page.locator("#dateOfBirth").fill("1981-06-23");
    await page.locator("#nationality").fill("Welsh");
    await page.locator("#countryOfResidence").fill("Wales");
    await fillAddress(page, "residential", {
      premise: "16",
      street: "Heol y Bont",
      postTown: "Cardiff",
      country: "GB-WLS",
      postcode: "CF10 1AA",
    });
    await page.locator("#personalCode").fill("cwmps-832223");
    await page.locator("#identityVerified").check();
    await page.locator("#consentToAct").check();
    await page.locator("#companyAuthCode").fill("SIMCS01");
    expect(await noSideScroll(page)).toBe(true);
    await shoot(page, "en");

    await page.getByRole("button", { name: "Continue" }).click();
    const review = page.locator("#reviewList");
    await expect(review).toContainText("Director");
    await expect(review).toContainText("Mrs Carys Mair Llewelyn");
    await expect(review).toContainText("23 June 1981");
    await expect(review).toContainText("3 November 2025");
    await expect(review).toContainText("CWMPS832223");
    await expect(review).toContainText("The company's registered office");
    await expect(review).toContainText("16, Heol y Bont, Cardiff, CF10 1AA, Wales");
    expect(await noSideScroll(page)).toBe(true);
    await shoot(page, "en-review");

    await page.getByRole("button", { name: "File with Companies House" }).click();
    await expect(page.locator("#filingResult")).toContainText("Submission 000123 was accepted.", { timeout: 15000 });
    expect(filings[0]).toMatchObject({
      companyNumber: "00000001",
      companyName: COMPANY.name,
      companyAuthCode: "SIMCS01",
      officerRole: "director",
      corporate: false,
      appointmentDate: APPOINTED,
      consentToAct: true,
      title: "Mrs",
      forename: "Carys",
      otherForenames: "Mair",
      surname: "Llewelyn",
      previousNames: [{ surname: "Rees" }],
      serviceAddress: { sameAsRegisteredOffice: true },
      dateOfBirth: "1981-06-23",
      nationality: "Welsh",
      countryOfResidence: "Wales",
      residentialAddress: {
        address: { premise: "16", street: "Heol y Bont", postTown: "Cardiff", country: "GB-WLS", postcode: "CF10 1AA" },
      },
      personalCode: "CWMPS832223",
      identityVerified: true,
    });
    expect(page.url()).not.toContain("CWMPS832223");
    expect(page.url()).not.toContain("1981");
    expect(await noSideScroll(page)).toBe(true);
  });

  test(`a corporate director registered in the UK is appointed in Welsh at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const filings = [];
    await serveSite(page, { filings });
    await page.goto(`${SITE}/cy/companies-house/appointOfficer.html`, { waitUntil: "networkidle" });

    await expect(page.locator("html")).toHaveAttribute("lang", "cy");
    await expect(page.locator("h1")).toHaveText("Penodi cyfarwyddwr neu ysgrifennydd");
    await expect(page.locator("p.hint[data-feature-status]")).toContainText("Statws: amgylchedd prawf (sandbox).");
    await lookUp(page, "Chwilio am y cwmni");
    await page.getByLabel("Cyfarwyddwr corfforaethol (cwmni neu ffyrm)").check();
    await expect(page.locator("#personFields")).toBeHidden();
    await expect(page.locator("#corporateFields")).toBeVisible();
    await expect(page.locator("#corporateCountry option[value='GB-WLS']")).toHaveText("Cymru");
    await page.locator("#appointmentDate").fill(APPOINTED);
    await page.locator("#corporateName").fill("DIRECTORCO LIMITED");
    await fillAddress(page, "corporate", {
      premise: "1",
      street: "Station Road",
      postTown: "Leeds",
      country: "GB-ENG",
      postcode: "LS1 4AP",
    });
    await page.locator("#ukRegistrationNumber").fill("01234567");
    await page.locator("#consentToAct").check();
    await page.locator("#companyAuthCode").fill("SIMCS01");
    expect(await noSideScroll(page)).toBe(true);
    await shoot(page, "cy");

    await page.getByRole("button", { name: "Parhau" }).click();
    const review = page.locator("#reviewList");
    await expect(review).toContainText("Cyfarwyddwr corfforaethol");
    await expect(review).toContainText("1, Station Road, Leeds, LS1 4AP, Lloegr");
    await expect(review).toContainText("Rhif cofrestru’r cwmni");
    expect(await noSideScroll(page)).toBe(true);
    await shoot(page, "cy-review");

    await page.getByRole("button", { name: "Ffeilio gyda Thŷ’r Cwmnïau" }).click();
    await expect(page.locator("#filingResult")).toContainText("Statws cyflwyniad 000123:", { timeout: 15000 });
    expect(filings[0]).toMatchObject({
      officerRole: "director",
      corporate: true,
      corporateName: "DIRECTORCO LIMITED",
      address: { premise: "1", street: "Station Road", postTown: "Leeds", country: "GB-ENG", postcode: "LS1 4AP" },
      companyIdentification: { uk: { registrationNumber: "01234567" } },
      consentToAct: true,
    });
    expect(filings[0]).not.toHaveProperty("personalCode");
    expect(filings[0]).not.toHaveProperty("surname");
    expect(await noSideScroll(page)).toBe(true);
  });
}

test("a secretary who is a person is filed with a service address and no date of birth or personal code", async ({ page }) => {
  const filings = [];
  await serveSite(page, { filings });
  await page.goto(`${SITE}/companies-house/appointOfficer.html?companyNumber=00000001`, { waitUntil: "networkidle" });
  await expect(page.locator("#companyNumber")).toHaveValue("00000001");
  await page.getByRole("button", { name: "Look up the company" }).click();
  await page.getByLabel("A secretary who is a person").check();
  await expect(page.locator("#directorFields")).toBeHidden();
  await page.locator("#appointmentDate").fill(APPOINTED);
  await page.locator("#officerForename").fill("Eleanor");
  await page.locator("#officerSurname").fill("Bramwell");
  await fillAddress(page, "service", { premise: "The Old Rectory", postTown: "York", country: "GB-ENG", postcode: "YO1 7HH" });
  await finishAndReview(page, "Continue");
  await expect(page.locator("#reviewList")).toContainText("The Old Rectory, York, YO1 7HH, England");
  await page.getByRole("button", { name: "File with Companies House" }).click();
  await expect(page.locator("#filingResult")).toContainText("Submission 000123 was accepted.", { timeout: 15000 });
  expect(filings[0]).toMatchObject({
    officerRole: "secretary",
    corporate: false,
    forename: "Eleanor",
    surname: "Bramwell",
    serviceAddress: { address: { premise: "The Old Rectory", postTown: "York", country: "GB-ENG", postcode: "YO1 7HH" } },
    previousNames: [],
  });
  expect(filings[0]).not.toHaveProperty("dateOfBirth");
  expect(filings[0]).not.toHaveProperty("personalCode");
});

test("a corporate secretary registered outside the UK is filed with its legal form, governing law and register", async ({ page }) => {
  const filings = [];
  await serveSite(page, { filings });
  await page.goto(`${SITE}/companies-house/appointOfficer.html`, { waitUntil: "networkidle" });
  await lookUp(page, "Look up the company");
  await page.getByLabel("A corporate secretary (a company or firm)").check();
  await page.locator("#appointmentDate").fill(APPOINTED);
  await page.locator("#corporateName").fill("SECRETARIAT B.V.");
  await fillAddress(page, "corporate", {
    premise: "12",
    street: "Keizersgracht",
    postTown: "Amsterdam",
    country: "NLD",
    postcode: "1015 CJ",
  });
  await page.getByLabel("No", { exact: true }).check();
  await expect(page.locator("#ukRegistrationFields")).toBeHidden();
  await page.locator("#legalForm").fill("Besloten vennootschap");
  await page.locator("#lawGoverned").fill("Netherlands");
  await page.locator("#placeRegistered").fill("Netherlands Chamber of Commerce");
  await page.locator("#nonUkRegistrationNumber").fill("34298765");
  await finishAndReview(page, "Continue");
  await expect(page.locator("#reviewList")).toContainText("Besloten vennootschap");
  await page.getByRole("button", { name: "File with Companies House" }).click();
  await expect(page.locator("#filingResult")).toContainText("Submission 000123 was accepted.", { timeout: 15000 });
  expect(filings[0]).toMatchObject({
    officerRole: "secretary",
    corporate: true,
    corporateName: "SECRETARIAT B.V.",
    address: { premise: "12", postTown: "Amsterdam", country: "NLD" },
    companyIdentification: {
      nonUk: {
        placeRegistered: "Netherlands Chamber of Commerce",
        registrationNumber: "34298765",
        lawGoverned: "Netherlands",
        legalForm: "Besloten vennootschap",
      },
    },
  });
});

test("a malformed personal code, an unconfirmed identity and a missing consent are refused before anything is sent", async ({ page }) => {
  const filings = [];
  await serveSite(page, { filings });
  await page.goto(`${SITE}/companies-house/appointOfficer.html`, { waitUntil: "networkidle" });
  await lookUp(page, "Look up the company");
  await page.locator("#appointmentDate").fill(APPOINTED);
  await page.locator("#officerSurname").fill("Llewelyn");
  await page.locator("#serviceSameAsOffice").check();
  await page.locator("#residentialSameAsService").check();
  await page.locator("#dateOfBirth").fill("1981-06-23");
  await page.locator("#nationality").fill("Welsh");
  await page.locator("#personalCode").fill("C1W2M3P4S5X");
  await page.locator("#companyAuthCode").fill("SIMCS01");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#statusMessagesContainer")).toContainText(
    "Enter the director's Companies House personal code: 11 characters, letters then numbers.",
  );

  await page.locator("#personalCode").fill("CWMPS832223");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#formView")).toContainText("Confirm the director has verified their identity with Companies House.");

  await page.locator("#identityVerified").check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#formView")).toContainText("Confirm the company has the officer's consent to act in this appointment.");
  await expect(page.locator("#formView")).toBeVisible();
  expect(filings).toHaveLength(0);
});

test("a rejection shows Companies House's reason", async ({ page }) => {
  await serveSite(page, {
    outcome: { statusCode: "REJECT", rejections: [{ rejectCode: "9999", description: "Invalid CompaniesHousePersonalCode format" }] },
  });
  await page.goto(`${SITE}/companies-house/appointOfficer.html`, { waitUntil: "networkidle" });
  await lookUp(page, "Look up the company");
  await page.getByLabel("A corporate director (a company or firm)").check();
  await page.locator("#appointmentDate").fill(APPOINTED);
  await page.locator("#corporateName").fill("DIRECTORCO LIMITED");
  await fillAddress(page, "corporate", { premise: "1", postTown: "Leeds", country: "GB-ENG" });
  await page.locator("#ukRegistrationNumber").fill("01234567");
  await finishAndReview(page, "Continue");
  await page.getByRole("button", { name: "File with Companies House" }).click();
  const result = page.locator("#filingResult");
  await expect(result).toContainText("Submission 000123 was rejected.", { timeout: 15000 });
  await expect(result).toContainText("9999: Invalid CompaniesHousePersonalCode format");
});

test("an appointment made just after midnight in London during summer time is dated and signed that London day", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-06-15T23:30:00Z"));
  const filings = [];
  await serveSite(page, { filings });
  await page.goto(`${SITE}/companies-house/appointOfficer.html?companyNumber=00000001`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Look up the company" }).click();
  await page.getByLabel("A secretary who is a person").check();
  await page.locator("#appointmentDate").fill("2026-06-16");
  await page.locator("#officerForename").fill("Eleanor");
  await page.locator("#officerSurname").fill("Bramwell");
  await fillAddress(page, "service", { premise: "The Old Rectory", postTown: "York", country: "GB-ENG", postcode: "YO1 7HH" });
  await finishAndReview(page, "Continue");
  await expect(page.locator("#reviewView")).toBeVisible();
  await page.getByRole("button", { name: "File with Companies House" }).click();
  await expect(page.locator("#filingResult")).toContainText("Submission 000123 was accepted.", { timeout: 15000 });
  expect(filings[0]).toMatchObject({ appointmentDate: "2026-06-16", dateSigned: "2026-06-16" });
});

test("a corporate director's Welsh street with a lower-case ŵ is stopped before sending, in Welsh", async ({ page }) => {
  const filings = [];
  await serveSite(page, { filings });
  await page.goto(`${SITE}/cy/companies-house/appointOfficer.html`, { waitUntil: "networkidle" });
  await lookUp(page, "Chwilio am y cwmni");
  await page.getByLabel("Cyfarwyddwr corfforaethol (cwmni neu ffyrm)").check();
  await page.locator("#appointmentDate").fill(APPOINTED);
  await page.locator("#corporateName").fill("DIRECTORCO LIMITED");
  await fillAddress(page, "corporate", {
    premise: "1",
    street: "Ffordd Glyndŵr",
    postTown: "Machynlleth",
    country: "GB-WLS",
    postcode: "SY20 8AA",
  });
  await page.locator("#ukRegistrationNumber").fill("01234567");
  await page.locator("#consentToAct").check();
  await page.locator("#companyAuthCode").fill("SIMCS01");
  await page.getByRole("button", { name: "Parhau" }).click();
  const status = page.locator("#statusMessagesContainer");
  await expect(status).toContainText("nodau nad yw Tŷ’r Cwmnïau yn eu derbyn: ŵ");
  await expect(status).not.toContainText("Ffordd");
  await expect(page.locator("#formView")).toBeVisible();
  expect(filings).toHaveLength(0);
});
