// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/recordsLocation.browser.test.js
// The records location page as a reader sees it, in English and in Welsh, at desktop and phone
// width: the company, the three notices to choose from, the inspection location's address or the
// records that moved, the review, and the outcome Companies House gives. The API answers come from
// the routes here.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { PEOPLE, registerCompany, REGISTER_COMPANY_NUMBERS } from "@app/http-simulator/fixtures/register.js";

const PUBLIC_ROOT = path.join(process.cwd(), "web/public");
const SITE = "http://localhost:3000";
const SCREENSHOT_DIR = path.join(process.cwd(), "target/loc1");

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

// A company of the register in each jurisdiction: England and Wales, Scotland, Wales, Northern Ireland.
const JOINERY = registerCompany(REGISTER_COMPANY_NUMBERS[0]);
const GLENMORE = registerCompany(REGISTER_COMPANY_NUMBERS[10]);
const TEIFI = registerCompany(REGISTER_COMPANY_NUMBERS[5]);
const LOUGH_ERNE = registerCompany(REGISTER_COMPANY_NUMBERS[11]);
const COMPANIES = Object.fromEntries(
  [JOINERY, GLENMORE, TEIFI, LOUGH_ERNE].map((company) => [
    company.number,
    { companyNumber: company.number, companyName: company.name, jurisdiction: company.jurisdiction },
  ]),
);

// The real site from disk, signed in with the resident Ltd bundle, and the Companies House routes
// answered here. Each filing request is recorded with the route it went to.
async function serveSite(page, { filings = [], outcome = { statusCode: "ACCEPT", rejections: [] } } = {}) {
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
    const company = /^\/api\/v1\/companies-house\/company\/([A-Z0-9]{8})$/.exec(pathname);
    if (company) return COMPANIES[company[1]] ? json(COMPANIES[company[1]]) : json({ message: "Not found" }, 404);
    const filed = /^\/api\/v1\/companies-house\/(sail-address|record-location)$/.exec(pathname);
    if (filed && request.method() === "POST") {
      filings.push({ route: filed[1], body: JSON.parse(request.postData()) });
      return json({ submissionNumber: "000123", pollInterval: 1 }, 201);
    }
    if (/^\/api\/v1\/companies-house\/forms\/(sail-address|record-location)\/000123$/.test(pathname)) {
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

async function lookUp(page, { companyNumber = JOINERY.number, button = "Look up the company" } = {}) {
  await page.locator("#companyNumber").fill(companyNumber);
  await page.getByRole("button", { name: button }).click();
  await expect(page.locator("#formView")).toBeVisible();
}

for (const width of [1280, 390]) {
  test(`the address of the inspection location is filed in English at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const filings = [];
    await serveSite(page, { filings });
    await page.goto(`${SITE}/companies-house/recordsLocation.html`, { waitUntil: "networkidle" });

    await expect(page.locator("h1")).toHaveText("Tell Companies House where the company keeps its records");
    await expect(page.locator("p.hint[data-feature-status]")).toContainText("Status: sandbox.");
    await lookUp(page);
    await expect(page.locator("#formView")).toContainText(JOINERY.name);
    await expect(page.locator("#formView")).toContainText("Companies House charges no fee for these filings.");
    await expect(page.locator("#change-sail")).toBeChecked();
    await expect(page.locator("#addressFields")).toBeVisible();
    await expect(page.locator("#recordFields")).toBeHidden();
    await expect(page.locator("#sailCountry option:not([hidden])")).toHaveText(["England", "Wales"]);

    await page.locator("#sailPremise").fill("Unit 4, Harbour House");
    await page.locator("#sailStreet").fill("12 Quay Street");
    await page.locator("#sailThoroughfare").fill("Harbourside");
    await page.locator("#sailPostTown").fill("Bristol");
    await page.locator("#sailCounty").fill("Somerset");
    await page.locator("#sailPostcode").fill("BS1 4DJ");
    await page.locator("#sailCareOf").fill("Bramwell & Co Accountants");
    await page.locator("#sailPoBox").fill("PO Box 12");
    await page.locator("#companyAuthCode").fill("SIMCS01");
    expect(await noSideScroll(page)).toBe(true);
    await shoot(page, "sail-address-form");
    await page.getByRole("button", { name: "Continue" }).click();

    const review = page.locator("#reviewList");
    await expect(review).toContainText("The address of the inspection location (form AD02)");
    await expect(review).toContainText(
      "Bramwell & Co Accountants, PO Box 12, Unit 4, Harbour House, 12 Quay Street, Harbourside, Bristol, Somerset, England, BS1 4DJ",
    );
    expect(await noSideScroll(page)).toBe(true);
    await shoot(page, "sail-address-review");

    await page.getByRole("button", { name: "File with Companies House" }).click();
    await expect(page.locator("#filingResult")).toContainText("Submission 000123 was accepted.", { timeout: 15000 });
    expect(filings).toHaveLength(1);
    expect(filings[0].route).toBe("sail-address");
    expect(filings[0].body).toMatchObject({
      companyNumber: JOINERY.number,
      companyName: JOINERY.name,
      companyAuthCode: "SIMCS01",
      address: {
        premise: "Unit 4, Harbour House",
        street: "12 Quay Street",
        thoroughfare: "Harbourside",
        postTown: "Bristol",
        county: "Somerset",
        country: "GB-ENG",
        postcode: "BS1 4DJ",
        careOfName: "Bramwell & Co Accountants",
        poBox: "PO Box 12",
      },
    });
    expect(filings[0].body).not.toHaveProperty("records");
    expect(await noSideScroll(page)).toBe(true);
    await shoot(page, "sail-address-accepted");
  });

  test(`records moved to the inspection location are filed in Welsh at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const filings = [];
    await serveSite(page, { filings });
    await page.goto(`${SITE}/cy/companies-house/recordsLocation.html`, { waitUntil: "networkidle" });

    await expect(page.locator("html")).toHaveAttribute("lang", "cy");
    await expect(page.locator("h1")).toHaveText("Dweud wrth Dŷ’r Cwmnïau ble mae’r cwmni’n cadw ei gofnodion");
    await expect(page.locator("p.hint[data-feature-status]")).toContainText("Statws: amgylchedd prawf (sandbox).");
    await lookUp(page, { button: "Chwilio am y cwmni" });
    await page.getByLabel("Mae cofnodion bellach yn cael eu cadw yn y lleoliad arolygu amgen (ffurflen AD03)").check();
    await expect(page.locator("#addressFields")).toBeHidden();
    await expect(page.locator("#recordsLegend")).toHaveText("Cofnodion sydd bellach yn cael eu cadw yn y lleoliad arolygu amgen");
    await expect(page.locator("#recordChoices label")).toHaveCount(10);
    await page.getByLabel("Cofrestr aelodau").check();
    await page.getByLabel("Contractau gwasanaeth cyfarwyddwyr").check();
    await page.getByLabel("Copïau o offerynnau sy’n creu ac yn diwygio arwystlon").check();
    await page.locator("#companyAuthCode").fill("SIMCS01");
    expect(await noSideScroll(page)).toBe(true);
    await shoot(page, "records-to-sail-form-cy");
    await page.getByRole("button", { name: "Parhau" }).click();

    await expect(page.locator("#reviewList")).toContainText(
      "Cofrestr aelodau; Contractau gwasanaeth cyfarwyddwyr; Copïau o offerynnau sy’n creu ac yn diwygio arwystlon",
    );
    expect(await noSideScroll(page)).toBe(true);
    await shoot(page, "records-to-sail-review-cy");

    await page.getByRole("button", { name: "Ffeilio gyda Thŷ’r Cwmnïau" }).click();
    await expect(page.locator("#filingResult")).toContainText("Statws cyflwyniad 000123:", { timeout: 15000 });
    expect(filings[0].route).toBe("record-location");
    expect(filings[0].body).toMatchObject({ destination: "sail", records: ["MEMBER", "DIRCONTRACT", "CHARGEEWNI"] });
    expect(filings[0].body).not.toHaveProperty("address");
    expect(filings[0].body).not.toHaveProperty("removeSailAddress");
    expect(await noSideScroll(page)).toBe(true);
    await shoot(page, "records-to-sail-accepted-cy");
  });
}

test("one record moved back to the registered office is filed with that record alone", async ({ page }) => {
  const filings = [];
  await serveSite(page, { filings });
  await page.goto(`${SITE}/companies-house/recordsLocation.html`, { waitUntil: "networkidle" });
  await lookUp(page);
  await page.getByLabel("Records are now kept at the registered office (form AD04)").check();
  await expect(page.locator("#recordsLegend")).toHaveText("Records now kept at the registered office");
  await expect(page.locator("#removeSailChoice")).toBeVisible();
  const box = await page.locator("#removeSail").boundingBox();
  const labelBox = await page.locator('label[for="removeSail"]').boundingBox();
  expect(labelBox.x).toBeGreaterThan(box.x + box.width);
  expect(labelBox.y).toBeLessThan(box.y + box.height);
  await page.getByLabel("Register of debenture holders").check();
  await page.locator("#companyAuthCode").fill("SIMCS01");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#reviewList")).toContainText("Records are now kept at the registered office (form AD04)");
  await expect(page.locator("#reviewList")).toContainText("Register of debenture holders");
  await page.getByRole("button", { name: "File with Companies House" }).click();
  await expect(page.locator("#filingResult")).toContainText("Submission 000123 was accepted.", { timeout: 15000 });
  expect(filings[0]).toMatchObject({ route: "record-location", body: { destination: "registered-office", records: ["DEB"] } });
});

for (const width of [1280, 390]) {
  test(`every record back at the registered office takes the inspection location off the register, at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const filings = [];
    await serveSite(page, { filings });
    await page.goto(`${SITE}/companies-house/recordsLocation.html`, { waitUntil: "networkidle" });
    await lookUp(page);
    await page.getByLabel("Records are now kept at the registered office (form AD04)").check();
    await page.getByLabel("Register of members").check();
    await page.getByLabel("Every record is back at the registered office: take the inspection location off the register").check();
    await expect(page.locator("#recordChoices")).toBeHidden();
    await page.locator("#companyAuthCode").fill("SIMCS01");
    expect(await noSideScroll(page)).toBe(true);
    await shoot(page, "records-to-office-remove-form");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.locator("#reviewList")).toContainText(
      "Every record is back at the registered office, and the inspection location comes off the register",
    );
    await shoot(page, "records-to-office-remove-review");
    await page.getByRole("button", { name: "File with Companies House" }).click();
    await expect(page.locator("#filingResult")).toContainText("Submission 000123 was accepted.", { timeout: 15000 });
    expect(filings[0].route).toBe("record-location");
    expect(filings[0].body).toMatchObject({ destination: "registered-office", removeSailAddress: true });
    expect(filings[0].body).not.toHaveProperty("records");
  });
}

test("a company registered in Scotland is offered Scotland alone, and its charge instruments go under the Scottish code", async ({
  page,
}) => {
  const filings = [];
  await serveSite(page, { filings });
  await page.goto(`${SITE}/companies-house/recordsLocation.html`, { waitUntil: "networkidle" });
  await lookUp(page, { companyNumber: GLENMORE.number });
  await expect(page.locator("#sailCountry option:not([hidden])")).toHaveText(["Scotland"]);
  await expect(page.locator("#sailCountry")).toHaveValue("GB-SCT");
  await page.getByLabel("Records are now kept at the inspection location (form AD03)").check();
  await page.getByLabel("Copies of instruments creating and amending charges").check();
  await page.locator("#companyAuthCode").fill("SIMCS01");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "File with Companies House" }).click();
  await expect(page.locator("#filingResult")).toContainText("Submission 000123 was accepted.", { timeout: 15000 });
  expect(filings[0].body).toMatchObject({ destination: "sail", records: ["CHARGESC"] });
});

for (const [companyNumber, countries] of [
  [TEIFI.number, ["England", "Wales"]],
  [LOUGH_ERNE.number, ["Northern Ireland"]],
]) {
  test(`company ${companyNumber} is offered the countries of the part of the United Kingdom it is registered in`, async ({ page }) => {
    await serveSite(page, { filings: [] });
    await page.goto(`${SITE}/companies-house/recordsLocation.html`, { waitUntil: "networkidle" });
    await lookUp(page, { companyNumber });
    await expect(page.locator("#sailCountry option:not([hidden])")).toHaveText(countries);
  });
}

test("the records are in the words and the order of form AD03", async ({ page }) => {
  await serveSite(page);
  await page.goto(`${SITE}/companies-house/recordsLocation.html`, { waitUntil: "networkidle" });
  await lookUp(page);
  await page.getByLabel("Records are now kept at the inspection location (form AD03)").check();
  await expect(page.locator("#recordChoices label")).toHaveText([
    "Register of members",
    "Directors’ service contracts",
    "Directors’ indemnities",
    "Records of resolutions etc.",
    "Contracts relating to purchase of own shares",
    "Documents relating to redemption or purchase of own share out of capital by private company",
    "Register of debenture holders",
    "Report to members of outcome of investigation by public company into interests in its shares",
    "Register of interests in shares disclosed to public company",
    "Copies of instruments creating and amending charges",
  ]);
});

test("a link from the company lookup chooses its notice", async ({ page }) => {
  await serveSite(page);
  await page.goto(`${SITE}/companies-house/recordsLocation.html?companyNumber=${JOINERY.number}&change=to-office`, {
    waitUntil: "networkidle",
  });
  await expect(page.locator("#companyNumber")).toHaveValue(JOINERY.number);
  await page.getByRole("button", { name: "Look up the company" }).click();
  await expect(page.locator("#change-to-office")).toBeChecked();
  await expect(page.locator("#recordFields")).toBeVisible();
  await expect(page.locator("#addressFields")).toBeHidden();
});

test("a move that names no record, or an address with no building, is refused before anything is sent", async ({ page }) => {
  const filings = [];
  await serveSite(page, { filings });
  await page.goto(`${SITE}/companies-house/recordsLocation.html`, { waitUntil: "networkidle" });
  await lookUp(page);
  await page.locator("#sailPostTown").fill("Bristol");
  await page.locator("#companyAuthCode").fill("SIMCS01");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#formView")).toBeVisible();
  await expect(page.locator("#reviewView")).toBeHidden();

  await page.getByLabel("Records are now kept at the inspection location (form AD03)").check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#statusMessagesContainer")).toContainText("Tick at least one record that has moved.");
  await expect(page.locator("#formView")).not.toContainText("Enter Building name or number");
  await expect(page.locator("#formView")).toBeVisible();
  expect(filings).toHaveLength(0);
});

test("a rejection shows Companies House's reason", async ({ page }) => {
  await serveSite(page, {
    outcome: { statusCode: "REJECT", rejections: [{ rejectCode: "9998", description: "The company has no inspection location." }] },
  });
  await page.goto(`${SITE}/companies-house/recordsLocation.html`, { waitUntil: "networkidle" });
  await lookUp(page);
  await page.getByLabel("Records are now kept at the inspection location (form AD03)").check();
  await page.getByLabel("Register of members").check();
  await page.locator("#companyAuthCode").fill("SIMCS01");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "File with Companies House" }).click();
  const result = page.locator("#filingResult");
  await expect(result).toContainText("Submission 000123 was rejected.", { timeout: 15000 });
  await expect(result).toContainText("9998: The company has no inspection location.");
});

test("a company Submit could not read from Companies House before sending shows the failure panel as a fault in Submit", async ({
  page,
}) => {
  await serveSite(page);
  await page.route("**/api/v1/companies-house/record-location", (route) =>
    route.fulfill({
      status: 502,
      contentType: "application/json",
      body: JSON.stringify({
        message: "Could not read the company from Companies House to check the filing, so it has not been sent",
        code: "company-unread",
      }),
    }),
  );
  await page.goto(`${SITE}/companies-house/recordsLocation.html`, { waitUntil: "networkidle" });
  await lookUp(page);
  await page.getByLabel("Records are now kept at the registered office (form AD04)").check();
  await page.getByLabel("Register of debenture holders").check();
  await page.locator("#companyAuthCode").fill("SIMCS01");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "File with Companies House" }).click();
  const panel = page.locator("#statusMessagesContainer + #failureDetail");
  await expect(panel).toHaveAttribute("data-kind", "submit-fault", { timeout: 15000 });
  await expect(panel.locator('[data-part="next"] a')).toHaveText("Help");
  await shoot(page, "failure-submit-fault");
});
