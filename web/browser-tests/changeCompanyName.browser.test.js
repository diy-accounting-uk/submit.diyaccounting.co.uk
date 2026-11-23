// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/changeCompanyName.browser.test.js
// The change of company name page as a reader sees it, in English and in Welsh, at desktop and phone
// width: the company, the new name, how it was changed, the same-day service and its fee, a letter
// for a name that needs one, the review, the outcome Companies House gives, and the name the
// register shows after an accepted change. The API answers come from the routes here.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { PEOPLE, registerCompany } from "@app/http-simulator/fixtures/register.js";

const PUBLIC_ROOT = path.join(process.cwd(), "web/public");
const SITE = "http://localhost:3000";
const SCREENSHOT_DIR = path.join(process.cwd(), "target/name1");

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

const COMPANY = registerCompany("00000001");
const PROFILE = { companyNumber: COMPANY.number, companyName: COMPANY.name };
const SIGNED_IN_EMAIL = PEOPLE.eleanorBramwell.email;
const LETTER = {
  name: "permission-letter.pdf",
  mimeType: "application/pdf",
  buffer: Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n"),
};

// The real site from disk, signed in with the resident Ltd bundle, and the Companies House routes
// answered here. Each filing request's body is recorded, and an accepted filing gives the company
// its new name in the profile the next read answers.
async function serveSite(
  page,
  {
    filings = [],
    checkouts = [],
    outcome = { statusCode: "ACCEPT", rejections: [] },
    filingAnswer,
    profile = PROFILE,
    searchItems = [],
    searches = [],
  } = {},
) {
  let registerProfile = { ...profile };
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
    if (pathname === "/api/v1/companies-house/company/00000001") return json(registerProfile);
    if (pathname === "/api/v1/billing/activity-checkout" && request.method() === "POST") {
      checkouts.push(JSON.parse(request.postData()));
      return json({ checkoutUrl: `${SITE}/stripe-checkout-stub.html` });
    }
    if (pathname === "/stripe-checkout-stub.html")
      return route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>Checkout</title>" });
    if (pathname === "/api/v1/companies-house/change-of-name" && request.method() === "POST") {
      filings.push(JSON.parse(request.postData()));
      if (filingAnswer) return json(filingAnswer.body, filingAnswer.status);
      return json({ submissionNumber: "000123", pollInterval: 1 }, 201);
    }
    if (pathname === "/api/v1/companies-house/forms/change-of-name/000123") {
      if (outcome.statusCode === "ACCEPT") registerProfile = { ...registerProfile, companyName: filings.at(-1).proposedName };
      return json({ submissionNumber: "000123", ...outcome });
    }
    if (pathname === "/api/v1/companies-house/search") {
      searches.push(url.searchParams.get("q"));
      return json({ totalResults: searchItems.length, itemsPerPage: 20, startIndex: 0, items: searchItems });
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

async function lookUpAndFill(page, { lookUp, proposedName, meetingDate = "2026-11-20" }) {
  await page.locator("#companyNumber").fill("00000001");
  await page.getByRole("button", { name: lookUp }).click();
  await page.locator("#proposedName").fill(proposedName);
  if (meetingDate) await page.locator("#meetingDate").fill(meetingDate);
  await page.locator("#noticeGiven").check();
  await page.locator("#companyAuthCode").fill("SIMCS01");
}

for (const width of [1280, 390]) {
  test(`a change by resolution is filed in English at ${width}px, and the page then shows the name the register holds`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const filings = [];
    await serveSite(page, { filings });
    await page.goto(`${SITE}/companies-house/changeCompanyName.html`, { waitUntil: "networkidle" });

    await expect(page.locator("h1")).toHaveText("Change the company name");
    await expect(page.locator("p.hint[data-feature-status]")).toContainText("Status: sandbox.");
    await page.locator("#companyNumber").fill("00000001");
    await page.getByRole("button", { name: "Look up the company" }).click();

    await expect(page.locator("#formView")).toContainText(COMPANY.name);
    await expect(page.locator("#formView")).toContainText(
      "Your company name will not officially change until Companies House registers it.",
    );
    await expect(page.locator("#formView")).toContainText("It costs £20 to file a change of name online, or £85 for the same-day service.");
    await expect(page.locator("#formView")).toContainText(
      "You pay that fee and the card charge here before the filing is sent: £24.69 for the standard service, or £104.12 for the same-day service.",
    );
    await expect(page.locator("#methodGroup")).toContainText("This files a change of name by a special resolution.");
    await expect(page.locator("#letterGroup")).toBeHidden();
    expect(await noSideScroll(page)).toBe(true);
    await shoot(page, "form");

    await page.locator("#proposedName").fill("Bramwell Tennant Trading Limited");
    await page.locator("#meetingDate").fill("2026-11-20");
    await page.locator("#noticeGiven").check();
    await page.locator("#companyAuthCode").fill("SIMCS01");
    await page.getByRole("button", { name: "Continue" }).click();

    const review = page.locator("#reviewList");
    await expect(review).toContainText("BRAMWELL TENNANT TRADING LIMITED");
    await expect(review).toContainText("By a special resolution");
    await expect(review).toContainText("20 November 2026");
    await expect(review).toContainText("Standard service: Companies House's fee £20, you pay £24.69");
    await expect(review).toContainText("None");
    expect(await noSideScroll(page)).toBe(true);
    await shoot(page, "review");

    await page.getByRole("button", { name: "File with Companies House" }).click();
    await expect(page.locator("#filingResult")).toContainText("Submission 000123 was accepted.", { timeout: 15000 });
    await expect(page.locator("#registerNow")).toContainText("The register now shows the company as BRAMWELL TENNANT TRADING LIMITED.");
    await expect(page.locator("#registerNow a")).toHaveAttribute("href", "companySearch.html?companyNumber=00000001");
    expect(filings[0]).toMatchObject({
      companyNumber: "00000001",
      companyName: COMPANY.name,
      companyAuthCode: "SIMCS01",
      method: "resolution",
      proposedName: "BRAMWELL TENNANT TRADING LIMITED",
      meetingDate: "2026-11-20",
      sameDay: false,
      noticeGiven: true,
    });
    expect(filings[0]).not.toHaveProperty("supportingDocument");
    expect(await noSideScroll(page)).toBe(true);
    await shoot(page, "accepted");
  });

  test(`a name with a sensitive word is filed in Welsh with its permission letter at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const filings = [];
    await serveSite(page, { filings });
    await page.goto(`${SITE}/cy/companies-house/changeCompanyName.html`, { waitUntil: "networkidle" });

    await expect(page.locator("html")).toHaveAttribute("lang", "cy");
    await expect(page.locator("h1")).toHaveText("Newid enw’r cwmni");
    await expect(page.locator("p.hint[data-feature-status]")).toContainText("Statws: amgylchedd prawf (sandbox).");
    await lookUpAndFill(page, { lookUp: "Chwilio am y cwmni", proposedName: "Bramwell Accredited Training Limited" });
    await page.getByLabel("Mae angen llythyr ategol ar yr enw").check();
    await expect(page.locator("#letterGroup blockquote p").first()).toHaveAttribute("lang", "en-GB");
    await page.locator("#letterFile").setInputFiles(LETTER);
    expect(await noSideScroll(page)).toBe(true);
    await shoot(page, "form-letter-cy");

    await page.getByRole("button", { name: "Parhau" }).click();
    await expect(page.locator("#reviewList")).toContainText("Caniatâd i ddefnyddio gair neu ymadrodd sensitif: permission-letter.pdf");
    await expect(page.locator("#reviewList")).toContainText("Gwasanaeth safonol: ffi Tŷ’r Cwmnïau £20, rydych yn talu £24.69");
    expect(await noSideScroll(page)).toBe(true);
    await shoot(page, "review-letter-cy");

    await page.getByRole("button", { name: "Ffeilio gyda Thŷ’r Cwmnïau" }).click();
    await expect(page.locator("#filingResult")).toContainText("Statws cyflwyniad 000123:", { timeout: 15000 });
    await expect(page.locator("#registerNow")).toContainText(
      "Mae’r gofrestr bellach yn dangos y cwmni fel BRAMWELL ACCREDITED TRAINING LIMITED.",
    );
    expect(filings[0]).toMatchObject({
      proposedName: "BRAMWELL ACCREDITED TRAINING LIMITED",
      supportingDocument: { kind: "sensitive-word-permission", contentBase64: LETTER.buffer.toString("base64") },
    });
    expect(await noSideScroll(page)).toBe(true);
    await shoot(page, "accepted-letter-cy");
  });
}

test("a name with a sensitive word and no letter shows Companies House's rejection, and the page shows no new name", async ({ page }) => {
  await serveSite(page, {
    outcome: {
      statusCode: "REJECT",
      rejections: [
        {
          rejectCode: "9994",
          description: "The proposed name includes a sensitive word or expression, and no supporting document was sent with the form.",
        },
      ],
    },
  });
  await page.goto(`${SITE}/companies-house/changeCompanyName.html`, { waitUntil: "networkidle" });
  await lookUpAndFill(page, { lookUp: "Look up the company", proposedName: "BRAMWELL ACCREDITED TRAINING LIMITED" });
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "File with Companies House" }).click();
  const result = page.locator("#filingResult");
  await expect(result).toContainText("Submission 000123 was rejected.", { timeout: 15000 });
  await expect(result).toContainText("9994: The proposed name includes a sensitive word or expression");
  await expect(page.locator("#registerNow")).toBeHidden();
  await shoot(page, "rejected");
});

test("the same-day service shows its fee on the review and is sent", async ({ page }) => {
  const filings = [];
  await serveSite(page, { filings });
  await page.goto(`${SITE}/companies-house/changeCompanyName.html`, { waitUntil: "networkidle" });
  await lookUpAndFill(page, { lookUp: "Look up the company", proposedName: "BRAMWELL TENNANT TRADING LIMITED" });
  await page.getByLabel("Ask for the same-day service (you pay £104.12 in place of £24.69)").check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#reviewList")).toContainText("Same-day service: Companies House's fee £85, you pay £104.12");
  await page.getByRole("button", { name: "File with Companies House" }).click();
  await expect(page.locator("#filingResult")).toContainText("Submission 000123 was accepted.", { timeout: 15000 });
  expect(filings[0]).toMatchObject({ sameDay: true });
});

test("the page files a change by special resolution only, and quotes GOV.UK on why", async ({ page }) => {
  const filings = [];
  await serveSite(page, { filings });
  await page.goto(`${SITE}/companies-house/changeCompanyName.html`, { waitUntil: "networkidle" });
  await lookUpAndFill(page, { lookUp: "Look up the company", proposedName: "BRAMWELL TENNANT TRADING LIMITED" });
  await expect(page.locator('input[name="method"]')).toHaveCount(0);
  await expect(page.locator("#methodGroup blockquote")).toContainText(
    "You can use the Companies House online service to file changes of name by special resolution only.",
  );
  await expect(page.locator("#methodGroup blockquote a")).toHaveAttribute(
    "href",
    "https://www.gov.uk/make-changes-to-your-limited-company/company-name",
  );
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#reviewList")).toContainText("By a special resolution");
  await page.getByRole("button", { name: "File with Companies House" }).click();
  await expect(page.locator("#filingResult")).toContainText("Submission 000123 was accepted.", { timeout: 15000 });
  expect(filings[0]).toMatchObject({ method: "resolution", meetingDate: "2026-11-20" });
});

test("a letter of no objection to a same-as name is sent as that kind", async ({ page }) => {
  const filings = [];
  await serveSite(page, { filings });
  await page.goto(`${SITE}/companies-house/changeCompanyName.html`, { waitUntil: "networkidle" });
  await lookUpAndFill(page, { lookUp: "Look up the company", proposedName: "GLENMORE ENGINEERING (SCOTLAND) LIMITED" });
  await page.getByLabel("The name needs a supporting letter").check();
  await page.locator("#letterKind").selectOption("same-as-no-objection");
  await page.locator("#letterFile").setInputFiles(LETTER);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#reviewList")).toContainText(
    "No objection from the company or LLP that has the same name: permission-letter.pdf",
  );
  await page.getByRole("button", { name: "File with Companies House" }).click();
  await expect(page.locator("#filingResult")).toContainText("Submission 000123 was accepted.", { timeout: 15000 });
  expect(filings[0].supportingDocument.kind).toBe("same-as-no-objection");
});

for (const [language, prefix, words] of [
  [
    "English",
    "",
    {
      lookUp: "Look up the company",
      cont: "Continue",
      file: "File with Companies House",
      sameDay: "Ask for the same-day service (you pay £104.12 in place of £24.69)",
      service: "Same-day service: Companies House's fee £85, you pay £104.12",
      received: "Payment received for this change of name.",
    },
  ],
  [
    "Welsh",
    "/cy",
    {
      lookUp: "Chwilio am y cwmni",
      cont: "Parhau",
      file: "Ffeilio gyda Thŷ’r Cwmnïau",
      sameDay: "Gofyn am y gwasanaeth yr un diwrnod (rydych yn talu £104.12 yn lle £24.69)",
      service: "Gwasanaeth yr un diwrnod: ffi Tŷ’r Cwmnïau £85, rydych yn talu £104.12",
      received: "Cafwyd y taliad am y newid enw hwn.",
    },
  ],
]) {
  test(`a fee the route asks for opens the checkout for the service chosen, and the return puts the filing back, in ${language}`, async ({
    page,
  }) => {
    const filings = [];
    const checkouts = [];
    const subjectKey = "00000001:same-day:BRAMWELL TENNANT TRADING LIMITED";
    await serveSite(page, {
      filings,
      checkouts,
      filingAnswer: {
        status: 402,
        body: { message: "pay first", code: "fee-due", activityId: "change-company-name", subjectKey, priceKey: "same-day" },
      },
    });
    await page.goto(`${SITE}${prefix}/companies-house/changeCompanyName.html`, { waitUntil: "networkidle" });
    await lookUpAndFill(page, { lookUp: words.lookUp, proposedName: "Bramwell Tennant Trading Limited" });
    await page.getByLabel(words.sameDay).check();
    await page.getByRole("button", { name: words.cont }).click();
    await expect(page.locator("#reviewList")).toContainText(words.service);
    await page.getByRole("button", { name: words.file }).click();

    await page.waitForURL("**/stripe-checkout-stub.html");
    expect(checkouts).toEqual([expect.objectContaining({ activityId: "change-company-name", subjectKey, priceKey: "same-day" })]);
    expect(checkouts[0].returnTo).toBe(`${SITE}${prefix}/companies-house/changeCompanyName.html`);
    const saved = JSON.parse(await page.evaluate(() => sessionStorage.getItem("companiesHouseChangeOfNameResume")));
    expect(saved).toEqual({
      companyNumber: "00000001",
      proposedName: "BRAMWELL TENNANT TRADING LIMITED",
      meetingDate: "2026-11-20",
      sameDay: true,
    });
    expect(JSON.stringify(saved)).not.toContain("SIMCS01");

    await page.goto(`${SITE}${prefix}/companies-house/changeCompanyName.html?checkout=success&session_id=cs_1`, {
      waitUntil: "networkidle",
    });
    await expect(page.locator("#formView")).toBeVisible();
    await expect(page.locator("#proposedName")).toHaveValue("BRAMWELL TENNANT TRADING LIMITED");
    await expect(page.locator("#meetingDate")).toHaveValue("2026-11-20");
    await expect(page.locator("#sameDay")).toBeChecked();
    await expect(page.locator("#companyAuthCode")).toHaveValue("");
    await expect(page.locator("#statusMessagesContainer")).toContainText(words.received);
    expect(new URL(page.url()).search).toBe("");
    await shoot(page, `fee-resumed${prefix ? "-cy" : ""}`);
  });
}

test("the present name, a missing or future resolution date, a letter that is not a PDF and a missing confirmation are refused before anything is sent", async ({
  page,
}) => {
  const filings = [];
  await serveSite(page, { filings });
  await page.goto(`${SITE}/companies-house/changeCompanyName.html`, { waitUntil: "networkidle" });
  const messages = page.locator("#statusMessagesContainer");
  const proceed = page.getByRole("button", { name: "Continue" });

  await page.locator("#companyNumber").fill("00000001");
  await page.getByRole("button", { name: "Look up the company" }).click();
  await page.locator("#companyAuthCode").fill("SIMCS01");

  await page.locator("#proposedName").fill(COMPANY.name.toLowerCase());
  await proceed.click();
  await expect(messages).toContainText("The new name is the name the company already has.");

  for (const refused of ["AB", "BRAMWELL_TENNANT LIMITED", "BRAMWELL TENNANT 🚀 LIMITED"]) {
    await page.locator("#proposedName").fill(refused);
    await proceed.click();
    await expect(messages).toContainText(
      "The new name must be 3 to 160 characters, using only letters, numbers, spaces and the punctuation Companies House allows in a company name.",
    );
  }

  await page.locator("#proposedName").fill("BRAMWELL TENNANT TRADING LIMITED");
  await proceed.click();
  await expect(messages).toContainText("Give the date the resolution was passed.");

  await page.locator("#meetingDate").fill("2999-01-01");
  await proceed.click();
  await expect(messages).toContainText("The date the resolution was passed cannot be in the future.");

  await page.locator("#meetingDate").fill("2026-11-20");
  await page.getByLabel("The name needs a supporting letter").check();
  await proceed.click();
  await expect(messages).toContainText("Choose the letter, as a PDF.");

  await page
    .locator("#letterFile")
    .setInputFiles({ name: "letter.pdf", mimeType: "application/pdf", buffer: Buffer.from("GIF89a not a pdf") });
  await proceed.click();
  await expect(messages).toContainText("The letter is not a PDF.");

  await page.locator("#letterFile").setInputFiles(LETTER);
  await proceed.click();
  await expect(messages).toContainText("Confirm that notice of the change of name has been given.");

  await expect(page.locator("#formView")).toBeVisible();
  expect(filings).toHaveLength(0);
});

test("once the filing is sent the page holds the letter and the authentication code nowhere", async ({ page }) => {
  const filings = [];
  await serveSite(page, { filings });
  await page.goto(`${SITE}/companies-house/changeCompanyName.html`, { waitUntil: "networkidle" });
  await lookUpAndFill(page, { lookUp: "Look up the company", proposedName: "ROYAL HARBOUR JOINERY LIMITED" });
  await page.getByLabel("The name needs a supporting letter").check();
  await page.locator("#letterFile").setInputFiles(LETTER);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "File with Companies House" }).click();
  await expect(page.locator("#filingResult")).toContainText("Submission 000123 was accepted.", { timeout: 15000 });
  const letterBase64 = LETTER.buffer.toString("base64");
  expect(filings[0].supportingDocument.contentBase64).toBe(letterBase64);
  await expect(page.locator("#registerNow")).toBeVisible();
  const held = await page.evaluate(() => ({
    record: JSON.stringify(typeof filing === "undefined" ? null : filing),
    values: [...document.querySelectorAll("input")].map((input) => input.value).join("|"),
    files: document.getElementById("letterFile").files.length,
  }));
  expect(held.record).not.toContain(letterBase64);
  expect(held.record).not.toContain("SIMCS01");
  expect(held.values).not.toContain("SIMCS01");
  expect(held.files).toBe(0);
});

test("a name the route refuses by id shows in the page's language", async ({ page }) => {
  await serveSite(page, {
    filingAnswer: {
      status: 400,
      body: {
        message: "Invalid proposedName - must be 3 to 160 characters that Companies House allows in a company name",
        messageIds: ["ch.name.name-characters"],
      },
    },
  });
  await page.goto(`${SITE}/cy/companies-house/changeCompanyName.html`, { waitUntil: "networkidle" });
  await page.locator("#companyNumber").fill("00000001");
  await page.locator("#companyLookupBtn").click();
  await page.locator("#proposedName").fill("BRAMWELL TENNANT TRADING LIMITED");
  await page.locator("#meetingDate").fill("2026-11-02");
  await page.locator("#noticeGiven").check();
  await page.locator("#companyAuthCode").fill("SIMCS01");
  await page.locator("#continueBtn").click();
  await page.locator("#submitFilingBtn").click();

  await expect(page.locator("#filingResult")).toHaveText(
    "Rhaid i’r enw newydd fod rhwng 3 a 160 nod, gan ddefnyddio llythrennau, rhifau, bylchau a’r atalnodi y mae Tŷ’r Cwmnïau yn ei ganiatáu mewn enw cwmni yn unig.",
  );
});

test("a resolution passed today in the United Kingdom is taken between midnight and 1am in summer", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-07-01T23:30:00Z"));
  const filings = [];
  await serveSite(page, { filings });
  await page.goto(`${SITE}/companies-house/changeCompanyName.html`, { waitUntil: "networkidle" });
  await lookUpAndFill(page, { lookUp: "Look up the company", proposedName: "BRAMWELL TENNANT TRADING LIMITED", meetingDate: "2026-07-02" });
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#reviewView")).toBeVisible();
  await page.locator("#submitFilingBtn").click();

  await expect.poll(() => filings.length).toBe(1);
  expect(filings[0]).toMatchObject({ meetingDate: "2026-07-02", dateSigned: "2026-07-02" });
});

test("a name ending in neither LIMITED nor LTD is filed with a warning, and nothing is refused", async ({ page }) => {
  const filings = [];
  await serveSite(page, { filings });
  await page.goto(`${SITE}/companies-house/changeCompanyName.html`, { waitUntil: "networkidle" });
  await lookUpAndFill(page, { lookUp: "Look up the company", proposedName: "BRAMWELL TENNANT TRADING" });
  await expect(page.locator("#walesNote")).toBeHidden();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#nameEndingWarning")).toHaveText(
    "The new name does not end in LIMITED or LTD. A private limited company's name usually must. Check it before you file.",
  );
  await page.getByRole("button", { name: "File with Companies House" }).click();
  await expect.poll(() => filings.length).toBe(1);
  expect(filings[0]).toMatchObject({ proposedName: "BRAMWELL TENNANT TRADING" });
});

test("a company registered in Wales is told its name may end in CYFYNGEDIG or CYF, and such a name gets no warning", async ({ page }) => {
  await serveSite(page, { profile: { ...PROFILE, jurisdiction: "wales" } });
  await page.goto(`${SITE}/cy/companies-house/changeCompanyName.html`, { waitUntil: "networkidle" });
  await expect(page.locator("#proposedName-hint")).toContainText("CYFYNGEDIG");
  await page.locator("#companyNumber").fill("00000001");
  await page.locator("#companyLookupBtn").click();
  await expect(page.locator("#walesNote")).toBeVisible();
  await page.locator("#proposedName").fill("Masnachu Bramwell Tennant Cyf");
  await page.locator("#meetingDate").fill("2026-11-20");
  await page.locator("#noticeGiven").check();
  await page.locator("#companyAuthCode").fill("SIMCS01");
  await page.locator("#continueBtn").click();
  await expect(page.locator("#reviewView")).toBeVisible();
  await expect(page.locator("#nameEndingWarning")).toBeHidden();
});

test("a name the same as another company's by Companies House's rules is caught, though the words differ", async ({ page }) => {
  const filings = [];
  await serveSite(page, {
    filings,
    searchItems: [{ companyNumber: "00000009", title: "THE BRAMWELL & TENNANT TRADING CO CYF", companyStatus: "active" }],
  });
  await page.goto(`${SITE}/companies-house/changeCompanyName.html`, { waitUntil: "networkidle" });
  await lookUpAndFill(page, { lookUp: "Look up the company", proposedName: "Bramwell and Tennant Trading Limited" });
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#statusMessagesContainer")).toContainText(
    "Companies House lists THE BRAMWELL & TENNANT TRADING CO CYF (00000009) with this name.",
  );
  await expect(page.locator("#letterKind")).toHaveValue("same-as-no-objection");
  expect(filings).toHaveLength(0);
});

test("a name another company holds is caught before sending, and asks for that company's letter of no objection", async ({ page }) => {
  const filings = [];
  const searches = [];
  await serveSite(page, {
    filings,
    searches,
    searchItems: [
      { companyNumber: "00000009", title: "BRAMWELL TENNANT TRADING LTD", companyStatus: "active" },
      { companyNumber: "08888888", title: "BRAMWELL TENNANT TRADING HOLDINGS LIMITED", companyStatus: "active" },
    ],
  });
  await page.goto(`${SITE}/companies-house/changeCompanyName.html`, { waitUntil: "networkidle" });
  await lookUpAndFill(page, { lookUp: "Look up the company", proposedName: "Bramwell Tennant Trading Limited" });
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.locator("#statusMessagesContainer")).toContainText(
    "Companies House lists BRAMWELL TENNANT TRADING LTD (00000009) with this name.",
  );
  await expect(page.locator("#letterGroup")).toBeVisible();
  await expect(page.locator("#letterKind")).toHaveValue("same-as-no-objection");
  await expect(page.locator("#formView")).toBeVisible();

  await page.locator("#letterFile").setInputFiles(LETTER);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#reviewView")).toBeVisible();
  await page.getByRole("button", { name: "File with Companies House" }).click();
  await expect.poll(() => filings.length).toBe(1);
  expect(filings[0].supportingDocument).toMatchObject({ kind: "same-as-no-objection" });
  expect(searches).toEqual(["BRAMWELL TENNANT TRADING LIMITED"]);
});

test("a name written with a number word is caught as the same as one written with the digit", async ({ page }) => {
  const filings = [];
  await serveSite(page, {
    filings,
    searchItems: [{ companyNumber: "08888888", title: "2 TREES LTD", companyStatus: "active" }],
  });
  await page.goto(`${SITE}/companies-house/changeCompanyName.html`, { waitUntil: "networkidle" });
  await lookUpAndFill(page, { lookUp: "Look up the company", proposedName: "Two Trees Limited" });
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#statusMessagesContainer")).toContainText("Companies House lists 2 TREES LTD (08888888) with this name.");
  await expect(page.locator("#letterKind")).toHaveValue("same-as-no-objection");
  expect(filings).toHaveLength(0);
});
