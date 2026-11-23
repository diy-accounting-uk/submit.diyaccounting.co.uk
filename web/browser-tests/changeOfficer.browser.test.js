// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/changeOfficer.browser.test.js
// The officer change of details page as a reader sees it, in English and in Welsh, at desktop and
// phone width: the company, the choice of a current director or secretary from the register, what has
// changed (a name, a service address, a home address), the review, and the outcome Companies House
// gives. The API answers come from the routes here.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { PEOPLE, registerCompany, REGISTER_COMPANY_NUMBERS } from "@app/http-simulator/fixtures/register.js";

const JOINERY = registerCompany(REGISTER_COMPANY_NUMBERS[0]);
const SECRETARIES = registerCompany(REGISTER_COMPANY_NUMBERS[8]).name;
const NEW_SECRETARIES_NAME = "OAKWAY SECRETARIAL SERVICES LIMITED";

const PUBLIC_ROOT = path.join(process.cwd(), "web/public");
const SITE = "http://localhost:3000";
const SCREENSHOT_DIR = path.join(process.cwd(), "target/off3");

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
    name: SECRETARIES,
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
async function serveSite(page, { filings = [], outcome = { statusCode: "ACCEPT", rejections: [] }, officers = OFFICERS } = {}) {
  await page.addInitScript((email) => {
    try {
      localStorage.setItem("consent.analytics", "declined");
      localStorage.setItem("cognitoIdToken", "mock-id-token");
      localStorage.setItem("userInfo", JSON.stringify({ sub: "user1", email }));
    } catch {}
  }, PEOPLE.eleanorBramwell.email);
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname !== "localhost") return route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
    const pathname = decodeURIComponent(url.pathname);
    const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (pathname === "/api/v1/bundle") return json({ bundles: [{ bundleId: "resident-ltd", allocated: true }], tokensRemaining: 10 });
    if (pathname === `/api/v1/companies-house/company/${JOINERY.number}`)
      return json({ companyNumber: JOINERY.number, companyName: JOINERY.name });
    if (pathname === `/api/v1/companies-house/company/${JOINERY.number}/officers`) return json({ officers });
    if (pathname === "/api/v1/companies-house/officer-change" && request.method() === "POST") {
      filings.push(JSON.parse(request.postData()));
      return json({ submissionNumber: "000123", pollInterval: 1 }, 201);
    }
    if (pathname === "/api/v1/companies-house/forms/officer-change/000123") return json({ submissionNumber: "000123", ...outcome });
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
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `changeOfficer-${name}-${page.viewportSize().width}.png`), fullPage: true });
}

const noSideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

const CHANGED = "2026-11-02";
const TENNANT = `${SITE}/companies-house/changeOfficer.html?companyNumber=${JOINERY.number}&officerName=TENNANT%2C%20Marcus%20John`;

async function fillAddress(page, prefix, { premise, street, postTown, country, postcode }) {
  await page.locator(`#${prefix}Premise`).fill(premise);
  if (street) await page.locator(`#${prefix}Street`).fill(street);
  await page.locator(`#${prefix}PostTown`).fill(postTown);
  await page.locator(`#${prefix}Country`).selectOption(country);
  if (postcode) await page.locator(`#${prefix}Postcode`).fill(postcode);
}

for (const width of [1280, 390]) {
  test(`a director's name change is filed in English at ${width}px, found by the register's name and the full date of birth`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const filings = [];
    await serveSite(page, { filings });
    await page.goto(TENNANT, { waitUntil: "networkidle" });

    await expect(page.locator("h1")).toHaveText("Change a director's or secretary's details");
    await expect(page.locator("p.hint[data-feature-status]")).toContainText("Status: sandbox.");
    await expect(page.locator("#companyNumber")).toHaveValue(JOINERY.number);
    await page.getByRole("button", { name: "Look up the company" }).click();

    await expect(page.getByLabel("TENNANT, Marcus John (Director)")).toBeChecked();
    await expect(page.getByLabel("FORMER, Director (Director)")).toHaveCount(0);
    await expect(page.locator("#officerSurname")).toHaveValue("TENNANT");
    await expect(page.locator("#officerForename")).toHaveValue("Marcus");
    await expect(page.locator("#officerOtherForenames")).toHaveValue("John");
    await expect(page.locator("#dobMonth")).toHaveValue("2");
    await expect(page.locator("#dobYear")).toHaveValue("1975");
    await expect(page.locator("#directorChanges")).toBeVisible();
    await expect(page.locator("#corporateChanges")).toBeHidden();
    await expect(page.locator("#newNameFields")).toBeHidden();
    await expect(page.locator("#formView")).toContainText(
      "“Please note that all information on this form will appear on the public record, apart from information relating to usual residential addresses.”",
    );
    await page.locator("#dobDay").fill("14");
    await page.locator("#dateOfChange").fill(CHANGED);
    await page.getByLabel("Their name", { exact: true }).check();
    await expect(page.locator("#newNameFields")).toBeVisible();
    await page.locator("#newTitle").fill("Dr");
    await page.locator("#newForename").fill("Marcus");
    await page.locator("#newOtherForenames").fill("John");
    await page.locator("#newSurname").fill("TENNANT-HUGHES");
    await page.locator("#companyAuthCode").fill("SIMCS01");
    expect(await noSideScroll(page)).toBe(true);
    await shoot(page, "en");

    await page.getByRole("button", { name: "Continue" }).click();
    const review = page.locator("#reviewList");
    await expect(review).toContainText("Director");
    await expect(review).toContainText("MARCUS JOHN TENNANT");
    await expect(review).toContainText("14 February 1975");
    await expect(review).toContainText("2 November 2026");
    await expect(review).toContainText("Dr MARCUS JOHN TENNANT-HUGHES");
    expect(await noSideScroll(page)).toBe(true);
    await shoot(page, "en-review");

    await page.getByRole("button", { name: "File with Companies House" }).click();
    await expect(page.locator("#filingResult")).toContainText("Submission 000123 was accepted.", { timeout: 15000 });
    expect(filings[0]).toEqual({
      companyNumber: JOINERY.number,
      companyName: JOINERY.name,
      companyAuthCode: "SIMCS01",
      dateSigned: expect.any(String),
      officerRole: "director",
      corporate: false,
      dateOfChange: CHANGED,
      forename: "Marcus",
      otherForenames: "John",
      surname: "TENNANT",
      dateOfBirth: "1975-02-14",
      newName: { title: "Dr", forename: "Marcus", otherForenames: "John", surname: "TENNANT-HUGHES" },
    });
    expect(page.url()).not.toContain("1975");
    expect(await noSideScroll(page)).toBe(true);
  });

  test(`a director's home address change is filed in Welsh at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const filings = [];
    await serveSite(page, { filings });
    await page.goto(
      `${SITE}/cy/companies-house/changeOfficer.html?companyNumber=${JOINERY.number}&officerName=TENNANT%2C%20Marcus%20John`,
      {
        waitUntil: "networkidle",
      },
    );

    await expect(page.locator("html")).toHaveAttribute("lang", "cy");
    await expect(page.locator("h1")).toHaveText("Newid manylion cyfarwyddwr neu ysgrifennydd");
    await expect(page.locator("p.hint[data-feature-status]")).toContainText("Statws: amgylchedd prawf (sandbox).");
    await page.getByRole("button", { name: "Chwilio am y cwmni" }).click();
    await expect(page.getByLabel("TENNANT, Marcus John (Cyfarwyddwr)")).toBeChecked();
    await page.locator("#dobDay").fill("14");
    await page.locator("#dateOfChange").fill(CHANGED);
    await page.getByLabel("Cyfeiriad eu cartref", { exact: true }).check();
    await expect(page.locator("#newResidentialFields")).toBeVisible();
    await expect(page.locator("#residentialCountry option[value='GB-WLS']")).toHaveText("Cymru");
    await fillAddress(page, "residential", {
      premise: "22",
      street: "Ffordd y Brenin",
      postTown: "Abertawe",
      country: "GB-WLS",
      postcode: "SA1 8PP",
    });
    await page.locator("#companyAuthCode").fill("SIMCS01");
    expect(await noSideScroll(page)).toBe(true);
    await shoot(page, "cy");

    await page.getByRole("button", { name: "Parhau" }).click();
    const review = page.locator("#reviewList");
    await expect(review).toContainText("Cyfarwyddwr");
    await expect(review).toContainText("Cyfeiriad cartref newydd");
    await expect(review).toContainText("22, Ffordd y Brenin, Abertawe, SA1 8PP, Cymru");
    expect(await noSideScroll(page)).toBe(true);
    await shoot(page, "cy-review");

    await page.getByRole("button", { name: "Ffeilio gyda Thŷ’r Cwmnïau" }).click();
    await expect(page.locator("#filingResult")).toContainText("Statws cyflwyniad 000123:", { timeout: 15000 });
    expect(filings[0]).toMatchObject({
      officerRole: "director",
      corporate: false,
      surname: "TENNANT",
      dateOfBirth: "1975-02-14",
      dateOfChange: CHANGED,
      residentialAddress: {
        address: { premise: "22", street: "Ffordd y Brenin", postTown: "Abertawe", country: "GB-WLS", postcode: "SA1 8PP" },
      },
    });
    expect(filings[0]).not.toHaveProperty("serviceAddress");
    expect(filings[0]).not.toHaveProperty("newName");
    expect(page.url()).not.toContain("Ffordd");
    expect(await noSideScroll(page)).toBe(true);
  });
}

test("a director's service address change needs the home address confirmed unchanged, then is filed with the indicator", async ({
  page,
}) => {
  const filings = [];
  await serveSite(page, { filings });
  await page.goto(TENNANT, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Look up the company" }).click();
  await page.locator("#dobDay").fill("14");
  await page.locator("#dateOfChange").fill(CHANGED);
  await page.getByLabel("Their service address", { exact: true }).check();
  await expect(page.locator("#residentialUnchangedGroup")).toBeVisible();
  await fillAddress(page, "service", {
    premise: "Unit 3",
    street: "Temple Way",
    postTown: "Bristol",
    country: "GB-ENG",
    postcode: "BS2 0BY",
  });
  await page.locator("#companyAuthCode").fill("SIMCS01");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#formView")).toContainText(
    "Confirm the director's home address has not changed, or choose their home address as a detail that has changed.",
  );
  expect(filings).toHaveLength(0);

  await page.locator("#residentialUnchanged").check();
  await page.getByRole("button", { name: "Continue" }).click();
  const review = page.locator("#reviewList");
  await expect(review).toContainText("Unit 3, Temple Way, Bristol, BS2 0BY, England");
  await expect(review).toContainText("Not changed");
  await page.getByRole("button", { name: "File with Companies House" }).click();
  await expect(page.locator("#filingResult")).toContainText("Submission 000123 was accepted.", { timeout: 15000 });
  expect(filings[0]).toMatchObject({
    officerRole: "director",
    dateOfBirth: "1975-02-14",
    serviceAddress: { address: { premise: "Unit 3", street: "Temple Way", postTown: "Bristol", country: "GB-ENG", postcode: "BS2 0BY" } },
    residentialAddressUnchanged: true,
  });
  expect(filings[0]).not.toHaveProperty("residentialAddress");
});

test("a secretary's service address change to the registered office is filed with no date of birth", async ({ page }) => {
  const filings = [];
  await serveSite(page, { filings });
  await page.goto(`${SITE}/companies-house/changeOfficer.html?companyNumber=${JOINERY.number}&officerName=BRAMWELL%2C%20Eleanor`, {
    waitUntil: "networkidle",
  });
  await page.getByRole("button", { name: "Look up the company" }).click();
  await expect(page.getByLabel("BRAMWELL, Eleanor (Secretary)")).toBeChecked();
  await expect(page.locator("#dobFields")).toBeHidden();
  await expect(page.locator("#directorChanges")).toBeHidden();
  await page.locator("#dateOfChange").fill(CHANGED);
  await page.getByLabel("Their service address", { exact: true }).check();
  await expect(page.locator("#residentialUnchangedGroup")).toBeHidden();
  await page.locator("#serviceSameAsOffice").check();
  await expect(page.locator("#serviceAddressFields")).toBeHidden();
  await page.locator("#companyAuthCode").fill("SIMCS01");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#reviewList")).toContainText("The company's registered office");
  await page.getByRole("button", { name: "File with Companies House" }).click();
  await expect(page.locator("#filingResult")).toContainText("Submission 000123 was accepted.", { timeout: 15000 });
  expect(filings[0]).toMatchObject({
    officerRole: "secretary",
    corporate: false,
    surname: "BRAMWELL",
    forename: "Eleanor",
    serviceAddress: { sameAsRegisteredOffice: true },
  });
  expect(filings[0]).not.toHaveProperty("dateOfBirth");
  expect(filings[0]).not.toHaveProperty("residentialAddressUnchanged");
});

test("a corporate secretary's new name is filed against the name the register holds", async ({ page }) => {
  const filings = [];
  await serveSite(page, { filings });
  await page.goto(`${SITE}/companies-house/changeOfficer.html`, { waitUntil: "networkidle" });
  await page.locator("#companyNumber").fill(JOINERY.number);
  await page.getByRole("button", { name: "Look up the company" }).click();
  await page.getByLabel(`${SECRETARIES} (Corporate secretary)`).check();
  await expect(page.locator("#corporateName")).toHaveValue(SECRETARIES);
  await expect(page.locator("#personChanges")).toBeHidden();
  await page.locator("#dateOfChange").fill(CHANGED);
  await page.getByLabel("Its name", { exact: true }).check();
  await page.locator("#newCorporateName").fill(NEW_SECRETARIES_NAME);
  await page.locator("#companyAuthCode").fill("SIMCS01");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#reviewList")).toContainText(NEW_SECRETARIES_NAME);
  await page.getByRole("button", { name: "File with Companies House" }).click();
  await expect(page.locator("#filingResult")).toContainText("Submission 000123 was accepted.", { timeout: 15000 });
  expect(filings[0]).toMatchObject({
    officerRole: "secretary",
    corporate: true,
    corporateName: SECRETARIES,
    newCorporateName: NEW_SECRETARIES_NAME,
  });
  expect(filings[0]).not.toHaveProperty("address");
});

test("nothing ticked, a missing day of birth and a home address the same as a registered office service address are refused before anything is sent", async ({
  page,
}) => {
  const filings = [];
  await serveSite(page, { filings });
  await page.goto(TENNANT, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Look up the company" }).click();
  await page.locator("#dateOfChange").fill(CHANGED);
  await page.locator("#companyAuthCode").fill("SIMCS01");
  await page.locator("#dobDay").fill("14");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#statusMessagesContainer")).toContainText("Choose at least one detail that has changed.");

  await page.getByLabel("Their service address", { exact: true }).check();
  await page.locator("#serviceSameAsOffice").check();
  await page.getByLabel("Their home address", { exact: true }).check();
  await page.locator("#residentialSameAsService").check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#statusMessagesContainer")).toContainText(
    "The home address cannot be the same as a service address that is the registered office. Enter the home address in full.",
  );

  await page.locator("#dobDay").fill("31");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#statusMessagesContainer")).toContainText("Enter the director's date of birth as a day, month and year.");
  await expect(page.locator("#formView")).toBeVisible();
  expect(filings).toHaveLength(0);
});

test("a rejection shows Companies House's reason", async ({ page }) => {
  await serveSite(page, {
    outcome: { statusCode: "REJECT", rejections: [{ rejectCode: "9999", description: "Officer not found on the register" }] },
  });
  await page.goto(TENNANT, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Look up the company" }).click();
  await page.locator("#dobDay").fill("14");
  await page.locator("#dateOfChange").fill(CHANGED);
  await page.getByLabel("Their nationality", { exact: true }).check();
  await page.locator("#nationality").fill("Welsh");
  await page.locator("#companyAuthCode").fill("SIMCS01");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "File with Companies House" }).click();
  const result = page.locator("#filingResult");
  await expect(result).toContainText("Submission 000123 was rejected.", { timeout: 15000 });
  await expect(result).toContainText("9999: Officer not found on the register");
});

test("two directors of one name are told apart by birth month, and the link's appointment date chooses one", async ({ page }) => {
  const filings = [];
  const namesakes = [
    { name: "TENNANT, Marcus John", officerRole: "director", appointedOn: "2015-01-01", dateOfBirth: { month: 2, year: 1975 } },
    { name: "TENNANT, Marcus John", officerRole: "director", appointedOn: "2021-06-01", dateOfBirth: { month: 9, year: 1999 } },
    { name: "BRAMWELL, Eleanor", officerRole: "secretary", appointedOn: "2016-01-01" },
  ];
  await serveSite(page, { filings, officers: namesakes });
  await page.goto(
    `${SITE}/companies-house/changeOfficer.html?companyNumber=00000001&officerName=TENNANT%2C%20Marcus%20John&officerRole=director&appointedOn=2021-06-01`,
    { waitUntil: "networkidle" },
  );
  await page.getByRole("button", { name: "Look up the company" }).click();

  await expect(page.locator("#officerChoices label")).toHaveText([
    "TENNANT, Marcus John (Director, born February 1975)",
    "TENNANT, Marcus John (Director, born September 1999)",
    "BRAMWELL, Eleanor (Secretary)",
  ]);
  await expect(page.getByLabel("TENNANT, Marcus John (Director, born September 1999)")).toBeChecked();
  await expect(page.locator("#dobYear")).toHaveValue("1999");
  await page.locator("#dobDay").fill("12");
  await page.locator("#dateOfChange").fill(CHANGED);
  await page.getByLabel("Their service address", { exact: true }).check();
  await page.locator("#serviceSameAsOffice").check();
  await page.locator("#residentialUnchanged").check();
  await page.locator("#companyAuthCode").fill("SIMCS01");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.locator("#reviewList")).toContainText("TENNANT, Marcus John (Director, born September 1999)");
});
