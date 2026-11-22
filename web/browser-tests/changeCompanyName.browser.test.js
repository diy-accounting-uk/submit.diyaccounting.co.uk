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

const PROFILE = { companyNumber: "00000001", companyName: "SIMULATOR EXAMPLE COMPANY LIMITED" };
const LETTER = {
  name: "permission-letter.pdf",
  mimeType: "application/pdf",
  buffer: Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n"),
};

// The real site from disk, signed in with the resident Ltd bundle, and the Companies House routes
// answered here. Each filing request's body is recorded, and an accepted filing gives the company
// its new name in the profile the next read answers.
async function serveSite(page, { filings = [], outcome = { statusCode: "ACCEPT", rejections: [] }, filingAnswer } = {}) {
  let registerProfile = { ...PROFILE };
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
    if (pathname === "/api/v1/companies-house/company/00000001") return json(registerProfile);
    if (pathname === "/api/v1/companies-house/change-of-name" && request.method() === "POST") {
      filings.push(JSON.parse(request.postData()));
      if (filingAnswer) return json(filingAnswer.body, filingAnswer.status);
      return json({ submissionNumber: "000123", pollInterval: 1 }, 201);
    }
    if (pathname === "/api/v1/companies-house/forms/change-of-name/000123") {
      if (outcome.statusCode === "ACCEPT") registerProfile = { ...registerProfile, companyName: filings.at(-1).proposedName };
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

    await expect(page.locator("#formView")).toContainText("SIMULATOR EXAMPLE COMPANY LIMITED");
    await expect(page.locator("#formView")).toContainText(
      "Your company name will not officially change until Companies House registers it.",
    );
    await expect(page.locator("#formView")).toContainText("It costs £20 to file a change of name online, or £85 for the same-day service.");
    await expect(page.locator("#formView")).toContainText("This site does not file a real change of name until it can take the fee.");
    await expect(page.getByLabel("By a special resolution")).toBeChecked();
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
    await expect(review).toContainText("Standard service, £20");
    await expect(review).toContainText("None");
    expect(await noSideScroll(page)).toBe(true);
    await shoot(page, "review");

    await page.getByRole("button", { name: "File with Companies House" }).click();
    await expect(page.locator("#filingResult")).toContainText("Submission 000123 was accepted.", { timeout: 15000 });
    await expect(page.locator("#registerNow")).toContainText("The register now shows the company as BRAMWELL TENNANT TRADING LIMITED.");
    await expect(page.locator("#registerNow a")).toHaveAttribute("href", "companySearch.html?companyNumber=00000001");
    expect(filings[0]).toMatchObject({
      companyNumber: "00000001",
      companyName: "SIMULATOR EXAMPLE COMPANY LIMITED",
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
    await expect(page.locator("#reviewList")).toContainText("Gwasanaeth safonol, £20");
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
  await page.getByLabel("Ask for the same-day service (£85 in place of £20)").check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#reviewList")).toContainText("Same-day service, £85");
  await page.getByRole("button", { name: "File with Companies House" }).click();
  await expect(page.locator("#filingResult")).toContainText("Submission 000123 was accepted.", { timeout: 15000 });
  expect(filings[0]).toMatchObject({ sameDay: true });
});

test("a change by the articles asks for no resolution date and sends none", async ({ page }) => {
  const filings = [];
  await serveSite(page, { filings });
  await page.goto(`${SITE}/companies-house/changeCompanyName.html`, { waitUntil: "networkidle" });
  await lookUpAndFill(page, { lookUp: "Look up the company", proposedName: "BRAMWELL TENNANT TRADING LIMITED", meetingDate: null });
  await page.getByLabel("By permission given in the company's articles of association").check();
  await expect(page.locator("#meetingDateGroup")).toBeHidden();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#reviewList")).toContainText("By permission given in the company's articles of association");
  await expect(page.locator("#reviewList")).not.toContainText("Date the resolution was passed");
  await page.getByRole("button", { name: "File with Companies House" }).click();
  await expect(page.locator("#filingResult")).toContainText("Submission 000123 was accepted.", { timeout: 15000 });
  expect(filings[0]).toMatchObject({ method: "articles" });
  expect(filings[0]).not.toHaveProperty("meetingDate");
});

test("a letter of no objection to a same-as name is sent as that kind", async ({ page }) => {
  const filings = [];
  await serveSite(page, { filings });
  await page.goto(`${SITE}/companies-house/changeCompanyName.html`, { waitUntil: "networkidle" });
  await lookUpAndFill(page, { lookUp: "Look up the company", proposedName: "SIMULATOR TEST COMPANY (SCOTLAND) LIMITED" });
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

test("the fee refusal of the route is shown in its own words, and no name is shown as registered", async ({ page }) => {
  const message =
    "Companies House charges a fee for a change of company name, and this site cannot take that fee yet, so it has not filed it";
  await serveSite(page, {
    filingAnswer: { status: 402, body: { message, code: "fee-path-not-wired", fee: { standard: 20, sameDay: 85 } } },
  });
  await page.goto(`${SITE}/companies-house/changeCompanyName.html`, { waitUntil: "networkidle" });
  await lookUpAndFill(page, { lookUp: "Look up the company", proposedName: "BRAMWELL TENNANT TRADING LIMITED" });
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "File with Companies House" }).click();
  await expect(page.locator("#filingResult")).toContainText(message, { timeout: 15000 });
  await expect(page.locator("#registerNow")).toBeHidden();
  await shoot(page, "fee-refused");
});

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

  await page.locator("#proposedName").fill("simulator example company limited");
  await proceed.click();
  await expect(messages).toContainText("The new name is the name the company already has.");

  await page.locator("#proposedName").fill("AB");
  await proceed.click();
  await expect(messages).toContainText("The new name must be 3 to 160 characters.");

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
