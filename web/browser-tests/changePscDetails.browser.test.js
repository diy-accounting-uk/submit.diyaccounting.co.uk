// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/changePscDetails.browser.test.js
// The PSC change of details page as a reader sees it, in English and in Welsh, at desktop and phone
// width: the company, the register's current PSCs to choose from with their present controls ticked,
// the change of control or of address, the two dates, the review, and the outcome Companies House
// gives. The API answers come from the routes here.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { PEOPLE, registerCompany } from "@app/http-simulator/fixtures/register.js";

const COMPANY = registerCompany("00000001");
const CORPORATE_PSC = COMPANY.pscs.find((psc) => psc.kind === "corporate-entity-person-with-significant-control").name;
const SIGNED_IN_EMAIL = PEOPLE.eleanorBramwell.email;

const PUBLIC_ROOT = path.join(process.cwd(), "web/public");
const SITE = "http://localhost:3000";
const SCREENSHOT_DIR = path.join(process.cwd(), "target/psc2");

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
    name: CORPORATE_PSC,
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
  }, SIGNED_IN_EMAIL);
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname !== "localhost") return route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
    const pathname = decodeURIComponent(url.pathname);
    const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (pathname === "/api/v1/bundle") return json({ bundles: [{ bundleId: "resident-ltd", allocated: true }], tokensRemaining: 10 });
    if (pathname === "/api/v1/companies-house/company/00000001") return json({ companyNumber: "00000001", companyName: COMPANY.name });
    if (pathname === "/api/v1/companies-house/company/00000001/persons-with-significant-control") return json({ pscs });
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

for (const width of [1280, 390]) {
  test(`an individual's change of nature of control is filed in English at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const filings = [];
    await serveSite(page, { filings });
    await page.goto(`${SITE}/companies-house/changePscDetails.html`, { waitUntil: "networkidle" });

    await expect(page.locator("h1")).toHaveText("Tell Companies House a PSC's details have changed");
    await expect(page.locator("p.hint[data-feature-status]")).toContainText("Status: sandbox.");
    await page.locator("#companyNumber").fill("00000001");
    await page.getByRole("button", { name: LOOK_UP }).click();

    await expect(page.locator("#pscChoices label")).toHaveText([
      "Eleanor Bramwell (Individual)",
      `${CORPORATE_PSC} (Legal entity or other registrable person)`,
    ]);
    await page.getByLabel("Eleanor Bramwell (Individual)").check();
    await page.getByLabel("How they control the company").check();
    const control = page.locator("#controlSection");
    await expect(control.getByRole("group", { name: "Ownership of shares" }).getByLabel("More than 50% but less than 75%")).toBeChecked();
    await expect(
      control.getByRole("group", { name: "Ownership of voting rights" }).getByLabel("More than 50% but less than 75%"),
    ).toBeChecked();
    await expect(page.locator("#heldOther")).toHaveText(
      "Also kept as the register holds them: Significant influence or control, through a trust.",
    );
    expect(await noSideScroll(page)).toBe(true);
    await shoot(page, "control");

    await control.getByRole("group", { name: "Ownership of shares" }).getByLabel("75% or more").check();
    await control.getByRole("group", { name: "Ownership of voting rights" }).getByLabel("75% or more").check();
    await page.locator("#dateOfChange").fill("2026-11-01");
    await page.locator("#confirmationDate").fill("2026-11-03");
    await page.locator("#companyAuthCode").fill("SIMCS01");
    await page.getByRole("button", { name: "Continue" }).click();

    const review = page.locator("#reviewList");
    await expect(review).toContainText("Eleanor Bramwell (Individual)");
    await expect(review).toContainText("Shares: 75% or more");
    await expect(review).toContainText("Voting rights: 75% or more");
    await expect(review).toContainText("1 November 2026");
    expect(await noSideScroll(page)).toBe(true);
    await shoot(page, "review");

    await page.getByRole("button", { name: "File with Companies House" }).click();
    await expect(page.locator("#filingResult")).toContainText("Submission 000123 was accepted.", { timeout: 15000 });
    expect(filings[0]).toMatchObject({
      companyNumber: "00000001",
      companyAuthCode: "SIMCS01",
      pscKind: "individual-person-with-significant-control",
      title: "Mrs",
      surname: "Bramwell",
      dobMonth: 1,
      dobYear: 1970,
      naturesOfControl: ["OWNERSHIPOFSHARES_75TO100PERCENT", "VOTINGRIGHTS_75TO100PERCENT", "SIGINFLUENCECONTROL_AS_TRUST"],
      dateOfChange: "2026-11-01",
      confirmationDate: "2026-11-03",
    });
    expect(filings[0]).not.toHaveProperty("address");
    expect(await noSideScroll(page)).toBe(true);
    await shoot(page, "accepted");
  });

  test(`a corporate PSC's change of address is filed in Welsh at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const filings = [];
    await serveSite(page, { filings });
    await page.goto(`${SITE}/cy/companies-house/changePscDetails.html`, { waitUntil: "networkidle" });

    await expect(page.locator("html")).toHaveAttribute("lang", "cy");
    await expect(page.locator("h1")).toHaveText("Dweud wrth Dŷ’r Cwmnïau fod manylion PRhA wedi newid");
    await page.locator("#companyNumber").fill("00000001");
    await page.getByRole("button", { name: "Chwilio am y personau â rheolaeth arwyddocaol" }).click();
    await page.getByLabel(`${CORPORATE_PSC} (Endid cyfreithiol neu berson cofrestradwy arall)`).check();
    await page.getByLabel("Eu cyfeiriad", { exact: true }).check();
    await expect(page.locator("#addressLegend")).toHaveText("Cyfeiriad newydd y brif swyddfa");
    await page.locator("#premise").fill("Unit 4");
    await page.locator("#street").fill("Harbour Road");
    await page.locator("#postTown").fill("Caerdydd");
    await page.locator("#postcode").fill("CF10 1AA");
    await page.locator("#country").selectOption("GB-WLS");
    await page.locator("#dateOfChange").fill("2026-11-01");
    await page.locator("#confirmationDate").fill("2026-11-03");
    await page.locator("#companyAuthCode").fill("SIMCS01");
    expect(await noSideScroll(page)).toBe(true);
    await shoot(page, "address-cy");
    await page.getByRole("button", { name: "Parhau" }).click();

    const review = page.locator("#reviewList");
    await expect(review).toContainText("Unit 4, Harbour Road, Caerdydd, CF10 1AA, Cymru");
    await expect(review).toContainText("Dyddiad y newid");
    expect(await noSideScroll(page)).toBe(true);
    await shoot(page, "review-cy");

    await page.getByRole("button", { name: "Ffeilio gyda Thŷ’r Cwmnïau" }).click();
    await expect(page.locator("#filingResult")).toContainText("Statws cyflwyniad 000123:", { timeout: 15000 });
    expect(filings[0]).toMatchObject({
      pscKind: "corporate-entity-person-with-significant-control",
      name: CORPORATE_PSC,
      address: { premise: "Unit 4", street: "Harbour Road", postTown: "Caerdydd", postcode: "CF10 1AA", country: "GB-WLS" },
    });
    expect(filings[0]).not.toHaveProperty("naturesOfControl");
    expect(filings[0]).not.toHaveProperty("surname");
    expect(await noSideScroll(page)).toBe(true);
    await shoot(page, "accepted-cy");
  });
}

test("a link from the company lookup chooses its PSC and words the address for it", async ({ page }) => {
  await serveSite(page);
  await page.goto(`${SITE}/companies-house/changePscDetails.html?companyNumber=00000001&pscName=${encodeURIComponent(CORPORATE_PSC)}`, {
    waitUntil: "networkidle",
  });
  await expect(page.locator("#companyNumber")).toHaveValue("00000001");
  await page.getByRole("button", { name: LOOK_UP }).click();
  await expect(page.getByLabel(`${CORPORATE_PSC} (Legal entity or other registrable person)`)).toBeChecked();
  await page.getByLabel("Their address").check();
  await expect(page.locator("#addressLegend")).toHaveText("The new principal office address");
});

test("a link naming a PSC whose name two current PSCs share chooses neither, so the reader chooses", async ({ page }) => {
  const namesake = (month) => ({
    name: "Owen Prys",
    nameElements: { forename: "Owen", surname: "Prys" },
    kind: "individual-person-with-significant-control",
    naturesOfControl: ["ownership-of-shares-25-to-50-percent"],
    notifiedOn: "2016-04-06",
    ceasedOn: null,
    dateOfBirth: { month, year: 1970 },
  });
  await serveSite(page, { pscs: [namesake(1), namesake(2)] });
  await page.goto(`${SITE}/companies-house/changePscDetails.html?companyNumber=00000001&pscName=Owen%20Prys`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: LOOK_UP }).click();
  await expect(page.locator('#pscChoices input[name="psc"]')).toHaveCount(2);
  await expect(page.locator('#pscChoices input[name="psc"]:checked')).toHaveCount(0);
});

test("an address abroad is sent with its country named", async ({ page }) => {
  const filings = [];
  await serveSite(page, { filings });
  await page.goto(`${SITE}/companies-house/changePscDetails.html`, { waitUntil: "networkidle" });
  await page.locator("#companyNumber").fill("00000001");
  await page.getByRole("button", { name: LOOK_UP }).click();
  await page.getByLabel("Eleanor Bramwell (Individual)").check();
  await page.getByLabel("Their address").check();
  await expect(page.locator("#addressLegend")).toHaveText("The new service address");
  await page.locator("#premise").fill("10");
  await page.locator("#postTown").fill("Geneva");
  await page.locator("#country").selectOption("OTHER");
  await page.locator("#otherForeignCountry").fill("Switzerland");
  await page.locator("#dateOfChange").fill("2026-11-01");
  await page.locator("#confirmationDate").fill("2026-11-01");
  await page.locator("#companyAuthCode").fill("SIMCS01");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#reviewList")).toContainText("10, Geneva, Switzerland");
  await page.getByRole("button", { name: "File with Companies House" }).click();
  await expect(page.locator("#filingResult")).toContainText("Submission 000123 was accepted.", { timeout: 15000 });
  expect(filings[0].address).toEqual({ premise: "10", postTown: "Geneva", otherForeignCountry: "Switzerland" });
});

test("significant influence beside another control, no change, or a confirmation before the change is refused before anything is sent", async ({
  page,
}) => {
  const filings = [];
  await serveSite(page, { filings });
  await page.goto(`${SITE}/companies-house/changePscDetails.html`, { waitUntil: "networkidle" });
  await page.locator("#companyNumber").fill("00000001");
  await page.getByRole("button", { name: LOOK_UP }).click();
  await page.getByLabel("Eleanor Bramwell (Individual)").check();
  await page.locator("#dateOfChange").fill("2026-11-03");
  await page.locator("#confirmationDate").fill("2026-11-01");
  await page.locator("#companyAuthCode").fill("SIMCS01");
  const status = page.locator("#statusMessagesContainer");

  await page.getByRole("button", { name: "Continue" }).click();
  await expect(status).toContainText("Choose what has changed.");

  await page.getByLabel("How they control the company").check();
  await page.getByLabel("Significant influence or control (only if none of the above apply)").check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(status).toContainText("Choose significant influence or control only if none of the other ways applies.");

  await page.getByLabel("Significant influence or control (only if none of the above apply)").uncheck();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(status).toContainText("The date of confirmation cannot be before the date of change.");
  await expect(page.locator("#formView")).toBeVisible();
  expect(filings).toHaveLength(0);
});

for (const [language, prefix, lookUp, cont, refusal] of [
  ["English", "", LOOK_UP, "Continue", "The date of change cannot be after today."],
  ["Welsh", "/cy", "Chwilio am y personau â rheolaeth arwyddocaol", "Parhau", "Ni all dyddiad y newid fod ar ôl heddiw."],
]) {
  test(`a date of change after today is refused in ${language} before anything is sent`, async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-11-20T12:00:00Z"));
    const filings = [];
    await serveSite(page, { filings });
    await page.goto(`${SITE}${prefix}/companies-house/changePscDetails.html`, { waitUntil: "networkidle" });
    await expect(page.locator("#dateOfChange")).toHaveAttribute("max", "2026-11-20");
    await expect(page.locator("#confirmationDate")).toHaveAttribute("max", "2026-11-20");
    await page.locator("#companyNumber").fill("00000001");
    await page.getByRole("button", { name: lookUp }).click();
    await page.locator("#pscChoices input").first().check();
    await page.locator("#changeAddress").check();
    await page.locator("#premise").fill("7");
    await page.locator("#street").fill("Mill Lane");
    await page.locator("#postTown").fill("Leeds");
    await page.locator("#postcode").fill("LS12 3AB");
    await page.locator("#country").selectOption("GB-ENG");
    await page.locator("#dateOfChange").fill("2026-11-21");
    await page.locator("#confirmationDate").fill("2026-11-21");
    await page.locator("#companyAuthCode").fill("SIMCS01");
    await page.getByRole("button", { name: cont }).click();

    await expect(page.locator("#statusMessagesContainer")).toContainText(refusal);
    await expect(page.locator("#formView")).toBeVisible();
    expect(filings).toHaveLength(0);
  });
}

test("a corporate PSC's register and number without the register's country or state is refused before anything is sent", async ({
  page,
}) => {
  const filings = [];
  await serveSite(page, { filings });
  await page.goto(`${SITE}/companies-house/changePscDetails.html`, { waitUntil: "networkidle" });
  await page.locator("#companyNumber").fill("00000001");
  await page.getByRole("button", { name: LOOK_UP }).click();
  await page.getByLabel(`${CORPORATE_PSC} (Legal entity or other registrable person)`).check();
  await page.getByLabel("Their legal form or governing law").check();
  await page.locator("#legalForm").fill("Private company limited by shares");
  await page.locator("#lawGoverned").fill("Companies Act 2006");
  await page.locator("#placeRegistered").fill("Companies House");
  await page.locator("#registrationNumber").fill("00000006");
  await page.locator("#dateOfChange").fill("2026-11-01");
  await page.locator("#confirmationDate").fill("2026-11-03");
  await page.locator("#companyAuthCode").fill("SIMCS01");

  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#statusMessagesContainer")).toContainText("Give the country or state of the register named.");
  await expect(page.locator("#formView")).toBeVisible();
  expect(filings).toHaveLength(0);

  await page.locator("#countryOrState").fill("UNITED KINGDOM");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#reviewList")).toContainText("UNITED KINGDOM");
});

test("a rejection shows Companies House's reason", async ({ page }) => {
  await serveSite(page, {
    outcome: { statusCode: "REJECT", rejections: [{ rejectCode: "9998", description: "The person named does not match the register." }] },
  });
  await page.goto(`${SITE}/companies-house/changePscDetails.html`, { waitUntil: "networkidle" });
  await page.locator("#companyNumber").fill("00000001");
  await page.getByRole("button", { name: LOOK_UP }).click();
  await page.getByLabel("Eleanor Bramwell (Individual)").check();
  await page.getByLabel("How they control the company").check();
  await page.locator("#dateOfChange").fill("2026-11-01");
  await page.locator("#confirmationDate").fill("2026-11-03");
  await page.locator("#companyAuthCode").fill("SIMCS01");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "File with Companies House" }).click();
  const result = page.locator("#filingResult");
  await expect(result).toContainText("Submission 000123 was rejected.", { timeout: 15000 });
  await expect(result).toContainText("9998: The person named does not match the register.");
});

// Two current PSCs of one name, told apart only by the month and year of birth the register gives.
const NAMESAKES = [
  {
    name: "Owen Prys",
    nameElements: { forename: "Owen", surname: "Prys" },
    kind: "individual-person-with-significant-control",
    naturesOfControl: ["ownership-of-shares-25-to-50-percent"],
    notifiedOn: "2016-04-06",
    ceasedOn: null,
    dateOfBirth: { month: 6, year: 1985 },
  },
  {
    name: "Owen Prys",
    nameElements: { forename: "Owen", surname: "Prys" },
    kind: "individual-person-with-significant-control",
    naturesOfControl: ["ownership-of-shares-25-to-50-percent"],
    notifiedOn: "2019-09-01",
    ceasedOn: null,
    dateOfBirth: { month: 2, year: 1990 },
  },
];

async function changeShares(page) {
  await page.getByLabel("How they control the company").check();
  await page.locator("#controlSection").getByRole("group", { name: "Ownership of shares" }).getByLabel("75% or more").check();
}

test("two PSCs of one name and one month of birth are told apart by the date each was notified", async ({ page }) => {
  const twins = NAMESAKES.map((psc) => ({ ...psc, dateOfBirth: { month: 6, year: 1985 } }));
  await serveSite(page, { filings: [], pscs: twins });
  await page.goto(`${SITE}/companies-house/changePscDetails.html?companyNumber=00000001`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Look up the persons with significant control" }).click();
  await expect(page.locator("#pscChoices label")).toHaveText([
    "Owen Prys, born June 1985, notified 6 April 2016 (Individual)",
    "Owen Prys, born June 1985, notified 1 September 2019 (Individual)",
  ]);
});

test("two PSCs of one name are told apart by month and year of birth, and a link naming that name chooses neither", async ({ page }) => {
  const filings = [];
  await serveSite(page, { filings, pscs: NAMESAKES });
  await page.goto(`${SITE}/companies-house/changePscDetails.html?companyNumber=00000001&pscName=Owen%20Prys`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: LOOK_UP }).click();
  await expect(page.locator("#pscChoices label")).toHaveText([
    "Owen Prys, born June 1985 (Individual)",
    "Owen Prys, born February 1990 (Individual)",
  ]);
  await expect(page.locator('#pscChoices input[name="psc"]:checked')).toHaveCount(0);
  await page.getByLabel("Owen Prys, born June 1985 (Individual)").check();
  await changeShares(page);
  await page.locator("#dateOfChange").fill("2026-11-01");
  await page.locator("#confirmationDate").fill("2026-11-03");
  await page.locator("#companyAuthCode").fill("SIMCS01");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#reviewList")).toContainText("Owen Prys, born June 1985 (Individual)");
  await page.getByRole("button", { name: "File with Companies House" }).click();
  await expect.poll(() => filings.length).toBe(1);
  expect(filings[0]).toMatchObject({ surname: "Prys", dobMonth: 6, dobYear: 1985 });
});

test("a date of change, or a date of confirmation, after today is refused before anything is sent", async ({ page }) => {
  const filings = [];
  await serveSite(page, { filings });
  await page.goto(`${SITE}/companies-house/changePscDetails.html`, { waitUntil: "networkidle" });
  await page.locator("#companyNumber").fill("00000001");
  await page.getByRole("button", { name: LOOK_UP }).click();
  await page.getByLabel("Eleanor Bramwell (Individual)").check();
  await changeShares(page);
  await page.locator("#dateOfChange").fill("2099-01-01");
  await page.locator("#confirmationDate").fill("2099-01-02");
  await page.locator("#companyAuthCode").fill("SIMCS01");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#statusMessagesContainer")).toContainText("The date of change cannot be after today.");
  await page.locator("#dateOfChange").fill("2026-11-01");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#statusMessagesContainer")).toContainText("The date of confirmation cannot be after today.");
  await expect(page.locator("#statusMessagesContainer .status-message")).toHaveCount(1);
  await expect(page.locator("#formView")).toBeVisible();
  expect(filings).toHaveLength(0);
});

for (const [language, prefix, lookUp, address, cont, expected] of [
  [
    "English",
    "",
    "Look up the persons with significant control",
    "Their address",
    "Continue",
    "The new service address: Street has characters Companies House does not accept: ŵ",
  ],
  ["Welsh", "/cy", "Chwilio am y personau â rheolaeth arwyddocaol", "Eu cyfeiriad", "Parhau", "nodau nad yw Tŷ’r Cwmnïau yn eu derbyn: ŵ"],
]) {
  test(`a Welsh street with a lower-case ŵ is stopped before sending, in ${language}`, async ({ page }) => {
    const filings = [];
    await serveSite(page, { filings });
    await page.goto(`${SITE}${prefix}/companies-house/changePscDetails.html`, { waitUntil: "networkidle" });
    await page.locator("#companyNumber").fill("00000001");
    await page.getByRole("button", { name: lookUp }).click();
    await page.locator("#pscChoices input").first().check();
    await page.getByLabel(address, { exact: true }).check();
    await page.locator("#premise").fill("3");
    await page.locator("#street").fill("Ffordd Glyndŵr");
    await page.locator("#postTown").fill("Machynlleth");
    await page.locator("#dateOfChange").fill("2026-11-01");
    await page.locator("#confirmationDate").fill("2026-11-03");
    await page.locator("#companyAuthCode").fill("SIMCS01");
    await page.getByRole("button", { name: cont }).click();
    const status = page.locator("#statusMessagesContainer");
    await expect(status).toContainText(expected);
    await expect(status).not.toContainText("Ffordd");
    await expect(page.locator("#formView")).toBeVisible();
    expect(filings).toHaveLength(0);

    await page.locator("#street").fill("Ffordd Glyndwr");
    await page.getByRole("button", { name: cont }).click();
    await expect(page.locator("#reviewView")).toBeVisible();
  });
}
