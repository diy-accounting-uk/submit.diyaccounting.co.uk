// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/changePscParticulars.browser.test.js
// The PSC change of details page's other changes as a reader sees them, in English and in Welsh, at
// desktop and phone width: an individual's name, usual residential address, nationality and country
// of residence, and an entity's name, legal form, governing law and register. The usual residential
// address is on no page once the filing is sent. The API answers come from the routes here.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { PEOPLE, registerCompanies, registerCompany } from "@app/http-simulator/fixtures/register.js";
const USER_EMAIL = PEOPLE.samPatel.email;
const COMPANY = registerCompany("00000001");
const CORPORATE_PSC_NAME = COMPANY.pscs.find((psc) => psc.kind === "corporate-entity-person-with-significant-control").name;
const CORPORATE_PSC_NUMBER = registerCompanies().find((company) => company.name === CORPORATE_PSC_NAME).number;
const NEW_ENTITY_NAME = registerCompany("00000010").name;

const PUBLIC_ROOT = path.join(process.cwd(), "web/public");
const SITE = "http://localhost:3000";
const SCREENSHOT_DIR = path.join(process.cwd(), "target/psc2b");

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
async function serveSite(page, { filings = [], outcome = { statusCode: "ACCEPT", rejections: [] } } = {}) {
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
    if (pathname === "/api/v1/companies-house/company/00000001/persons-with-significant-control") return json({ pscs: PSCS });
    if (pathname === "/api/v1/companies-house/psc-change-details" && request.method() === "POST") {
      filings.push(JSON.parse(request.postData()));
      return json({ submissionNumber: "000123", pollInterval: 1 }, 201);
    }
    if (pathname === "/api/v1/companies-house/forms/psc-change-details/000123") return json({ submissionNumber: "000123", ...outcome });
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

const LOOK_UP = "Look up the persons with significant control";

async function choose(page, psc, button = LOOK_UP) {
  await page.locator("#companyNumber").fill("00000001");
  await page.getByRole("button", { name: button }).click();
  await page.getByLabel(psc).check();
}

async function dates(page) {
  await page.locator("#dateOfChange").fill("2026-11-01");
  await page.locator("#confirmationDate").fill("2026-11-03");
  await page.locator("#companyAuthCode").fill("SIMCS01");
}

for (const width of [1280, 390]) {
  test(`an individual's name, home address, nationality and residence are filed in English at ${width}px, and the home address is then on no page`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const filings = [];
    await serveSite(page, { filings });
    await page.goto(`${SITE}/companies-house/changePscDetails.html`, { waitUntil: "networkidle" });
    await choose(page, "Eleanor Bramwell (Individual)");
    await expect(page.getByLabel("Their legal form or governing law")).toBeHidden();

    await page.getByLabel("Their name").check();
    await page.locator("#newTitle").fill("Dr");
    await page.locator("#newForename").fill("Eleanor");
    await page.locator("#newSurname").fill("Hale");
    await page.getByLabel("Their usual residential address").check();
    await expect(page.locator("#residenceSection")).toContainText("It is not on the public register");
    await page.locator("#resPremise").fill("7");
    await page.locator("#resStreet").fill("Orchard Close");
    await page.locator("#resPostTown").fill("Bristol");
    await page.locator("#resPostcode").fill("BS1 4AA");
    await page.locator("#resCountry").selectOption("GB-ENG");
    await page.getByLabel("Their nationality").check();
    await page.locator("#newNationality").fill("Irish");
    await page.getByLabel("Their country or state of residence").check();
    await page.locator("#newCountryOfResidence").fill("Ireland");
    await dates(page);
    expect(await noSideScroll(page)).toBe(true);
    await shoot(page, "individual");
    await page.getByRole("button", { name: "Continue" }).click();

    const review = page.locator("#reviewList");
    await expect(review).toContainText("Dr ELEANOR HALE");
    await expect(review).toContainText("7, Orchard Close, Bristol, BS1 4AA, England");
    await expect(review).toContainText("Irish");
    await expect(review).toContainText("Ireland");
    expect(await noSideScroll(page)).toBe(true);
    await shoot(page, "individual-review");

    await page.getByRole("button", { name: "File with Companies House" }).click();
    await expect(page.locator("#filingResult")).toContainText("Submission 000123 was accepted.", { timeout: 15000 });
    expect(filings[0]).toMatchObject({
      pscKind: "individual-person-with-significant-control",
      surname: "Bramwell",
      newName: { title: "Dr", forename: "Eleanor", surname: "Hale" },
      residentialAddress: { premise: "7", street: "Orchard Close", postTown: "Bristol", postcode: "BS1 4AA", country: "GB-ENG" },
      nationality: "Irish",
      countryOfResidence: "Ireland",
    });
    const pageText = await page.evaluate(() => document.body.innerHTML);
    expect(pageText).not.toContain("Orchard Close");
    expect(await page.locator("#resStreet").inputValue()).toBe("");
    expect(await noSideScroll(page)).toBe(true);
    await shoot(page, "individual-accepted");
  });

  test(`a corporate PSC's new name and legal form, governing law and register are filed in Welsh at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const filings = [];
    await serveSite(page, { filings });
    await page.goto(`${SITE}/cy/companies-house/changePscDetails.html`, { waitUntil: "networkidle" });
    await choose(
      page,
      `${CORPORATE_PSC_NAME} (Endid cyfreithiol neu berson cofrestradwy arall)`,
      "Chwilio am y personau â rheolaeth arwyddocaol",
    );
    await expect(page.getByLabel("Eu cenedligrwydd")).toBeHidden();
    await page.getByLabel("Eu henw").check();
    await page.locator("#newEntityName").fill(NEW_ENTITY_NAME);
    await page.getByLabel("Eu ffurf gyfreithiol neu’r gyfraith sy’n eu llywodraethu").check();
    // The gateway takes few lower-case accented letters, so the register and the Act go in under the names Companies House gives them.
    await page.locator("#legalForm").fill("Cwmni preifat cyfyngedig");
    await page.locator("#lawGoverned").fill("Companies Act 2006");
    await page.locator("#placeRegistered").fill("Companies House");
    await page.locator("#countryOrState").fill("Cymru a Lloegr");
    await page.locator("#registrationNumber").fill(CORPORATE_PSC_NUMBER);
    await dates(page);
    expect(await noSideScroll(page)).toBe(true);
    await shoot(page, "entity-cy");
    await page.getByRole("button", { name: "Parhau" }).click();

    const review = page.locator("#reviewList");
    await expect(review).toContainText(NEW_ENTITY_NAME);
    await expect(review).toContainText("Ffurf gyfreithiol: Cwmni preifat cyfyngedig");
    await expect(review).toContainText(CORPORATE_PSC_NUMBER);
    expect(await noSideScroll(page)).toBe(true);
    await shoot(page, "entity-review-cy");

    await page.getByRole("button", { name: "Ffeilio gyda Thŷ’r Cwmnïau" }).click();
    await expect(page.locator("#filingResult")).toContainText("Statws cyflwyniad 000123:", { timeout: 15000 });
    expect(filings[0]).toMatchObject({
      pscKind: "corporate-entity-person-with-significant-control",
      name: CORPORATE_PSC_NAME,
      newName: NEW_ENTITY_NAME,
      identification: {
        legalForm: "Cwmni preifat cyfyngedig",
        lawGoverned: "Companies Act 2006",
        placeRegistered: "Companies House",
        countryOrState: "Cymru a Lloegr",
        registrationNumber: CORPORATE_PSC_NUMBER,
      },
    });
    expect(filings[0]).not.toHaveProperty("nationality");
    expect(await noSideScroll(page)).toBe(true);
    await shoot(page, "entity-accepted-cy");
  });
}

test("a home address the same as the service address is sent as that, with no address", async ({ page }) => {
  const filings = [];
  await serveSite(page, { filings });
  await page.goto(`${SITE}/companies-house/changePscDetails.html`, { waitUntil: "networkidle" });
  await choose(page, "Eleanor Bramwell (Individual)");
  await page.getByLabel("Their usual residential address").check();
  await page.locator("#sameAsService").check();
  await expect(page.locator("#residenceFields")).toBeHidden();
  await dates(page);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "File with Companies House" }).click();
  await expect(page.locator("#filingResult")).toContainText("was accepted.", { timeout: 15000 });
  expect(filings[0].residentialAddress).toEqual({ sameAsServiceAddress: true });
});

test("a missing surname, home address, legal form or registration number is refused before anything is sent", async ({ page }) => {
  const filings = [];
  await serveSite(page, { filings });
  await page.goto(`${SITE}/companies-house/changePscDetails.html`, { waitUntil: "networkidle" });
  const status = page.locator("#statusMessagesContainer");
  await choose(page, "Eleanor Bramwell (Individual)");
  await dates(page);
  await page.getByLabel("Their name").check();
  await page.locator("#newForename").fill("Eleanor");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(status).toContainText("Give the new name.");
  await page.getByLabel("Their name").uncheck();
  await page.getByLabel("Their usual residential address").check();
  await page.locator("#resPremise").fill("7");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(status).toContainText("Give the new usual residential address's building name or number, its post town and its country.");

  await page.getByLabel(`${CORPORATE_PSC_NAME} (Legal entity or other registrable person)`).check();
  await expect(page.locator("#residenceSection")).toBeHidden();
  await page.getByLabel("Their legal form or governing law").check();
  await page.locator("#legalForm").fill("Private limited company");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(status).toContainText("Give the legal form and the governing law.");
  await page.locator("#lawGoverned").fill("Companies Act 2006");
  await page.locator("#placeRegistered").fill("Companies House");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(status).toContainText("Give the registration number in the register named.");
  await expect(page.locator("#formView")).toBeVisible();
  expect(filings).toHaveLength(0);
});
