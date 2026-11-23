// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/fileSmallCompanyAccounts.revisionRoundTrip.browser.test.js
// A revision opened from a receipt and filed without a change refiles the notes the form carries as
// they were filed: the original is built by the route's builder, opened in the amend form, filed, and
// the revised document is built from the request the form sends.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { SMALL_COMPANY_NOTES_CASE_INPUT } from "@app/test-helpers/accountsDocumentCases.js";
import { buildSmallCompanyAccounts } from "@app/services/smallCompanyAccountsIxbrl.js";
import { inAccountsLanguage } from "@app/services/accountsLanguage.js";
import { buildAccountsIxbrl, extractAndValidateAccountsParameters } from "@app/functions/companies-house/companiesHouseAccountsPost.js";
import { notesOf, registeredOfficeOf, accountantsReportOf } from "../public/lib/accounts-revision.js";
import { serveMoneyInput, servePageScripts, serveSiteStyles } from "./hmrcFieldTableAssets.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const PUBLIC_DIR = path.join(process.cwd(), "web/public");
const PAGE_PATH = "companies-house/fileSmallCompanyAccounts.html";
const RECEIPT_NAME = "2026-10-24T10:15:00.000Z-00001A.json";

function serveFile(page, pattern, file) {
  return page.route(pattern, (route) =>
    route.fulfill({ status: 200, contentType: "application/javascript", body: fs.readFileSync(path.join(PUBLIC_DIR, file), "utf-8") }),
  );
}

async function openAmend(page, receipt) {
  const pagePath = PAGE_PATH;
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.addInitScript((receiptBody) => {
    window.__submitReady__ = true;
    localStorage.setItem("cognitoIdToken", "token");
    window.sentAccounts = [];
    window.fetchWithIdToken = async () => ({ ok: true, json: async () => receiptBody });
    window.showLoading = () => {};
    window.hideLoading = () => {};
    window.showStatus = (text, type) => {
      const message = document.createElement("div");
      message.className = `status-message status-${type}`;
      message.textContent = text;
      document.getElementById("statusMessagesContainer").replaceChildren(message);
    };
    window.hideStatus = () => document.getElementById("statusMessagesContainer")?.replaceChildren();
    window.getCompanyProfile = async (companyNumber) => ({
      companyNumber,
      companyName: receiptBody.companyNameForProfile,
      jurisdiction: receiptBody.jurisdictionForProfile,
      registeredOffice: { addressLine1: "22 While Road", cityOrTown: "Sutton Coldfield", postalCode: "B72 1ND" },
    });
    window.submitMicroEntityAccounts = async (accounts) => {
      window.sentAccounts.push(accounts);
      return { submissionNumber: "00002B", gatewayTimestamp: "2026-11-22T10:00:00Z", pollInterval: 0 };
    };
    window.pollMicroEntityAccounts = async () => ({ statusCode: "ACCEPT", submissionNumber: "00002B", receiptId: "r", rejections: [] });
    window.renderMicroEntityAccounts = async () => ({ ixbrl: "<html><body>Preview</body></html>" });
  }, receipt);
  await page.route("**/*.js", async (route) => {
    if (route.request().resourceType() === "script") await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
    else await route.continue();
  });
  await servePageScripts(page);
  await serveMoneyInput(page);
  await serveSiteStyles(page);
  await serveFile(page, "**/widgets/books-import.js", "widgets/books-import.js");
  await serveFile(page, "**/lib/books-bundle.js", "lib/books-bundle.js");
  await serveFile(page, "**/lib/accounts-revision.js", "lib/accounts-revision.js");
  await serveFile(page, "**/lib/approval-date-check.js", "lib/approval-date-check.js");
  await page.route("**/lib/companies-house-gateway-poll.js", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: `${fs.readFileSync(path.join(PUBLIC_DIR, "lib/companies-house-gateway-poll.js"), "utf-8")}
        Object.assign(window.companiesHouseGatewayPoll, { pollGatewayUntilSettled: async ({ poll }) => poll() });`,
    }),
  );
  await page.route("**/lib/services/catalog-service.js", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: `export const fetchCatalogText = async () => "";
        export const fetchCurrentEnvironmentName = async () => "ci";
        export const parseCatalogueText = () => ({ activities: [{ id: "file-revised-accounts", name: "File Revised Accounts (Companies House, preview)" }] });
        export const activityStatus = (activity) => (activity?.id === "file-revised-accounts" ? "preview" : null);
        export const isRevisedAccountsOffered = () => true;`,
    }),
  );
  await page.route("**/lib/services/viewer-settings.js", (route) =>
    route.fulfill({ status: 200, contentType: "application/javascript", body: "export const fetchViewer = async () => ({});" }),
  );
  const html = fs.readFileSync(path.join(PUBLIC_DIR, pagePath), "utf-8");
  await page.route(`http://localhost:3000/${pagePath}**`, (route) => route.fulfill({ status: 200, contentType: "text/html", body: html }));
  await page.goto(`http://localhost:3000/${pagePath}?amend=${encodeURIComponent(RECEIPT_NAME)}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("#revisionSection")).toBeVisible({ timeout: 15000 });
}

async function fileUnchanged(page, input, reviseAs) {
  if (reviseAs) await page.check(reviseAs === "filleted" ? "#copyFilleted" : "#copyFull");
  if (input.filleted && reviseAs !== "filleted" && input.profitAndLoss) {
    for (const [line, amount] of Object.entries(input.profitAndLoss.current)) {
      const box = page.locator(`#current${line[0].toUpperCase()}${line.slice(1)}`);
      if ((await box.count()) && (await box.isEditable())) await box.fill(String(amount));
    }
  }
  await page.evaluate(() => {
    for (const box of document.querySelectorAll('input[type="checkbox"][id^="statement"]')) box.checked = true;
  });
  await page.fill("#revisionNonCompliance", "Nothing changes in the notes.");
  await page.fill("#revisionAmendments", "Nothing changes.");
  await page.fill("#directorDateApproved", "2026-11-20");
  await page.evaluate(() => {
    document.getElementById("companyAuthCode").value = "ABC123";
    return handleSubmitFiling();
  });
  await expect(page.locator("#filingResult")).toContainText("accepted the revised accounts", { timeout: 15000 });
  const [sent] = await page.evaluate(() => window.sentAccounts);
  return sent;
}

// The original accounts, opened for revision and filed as the form shows them: the request the form
// sends, and the revised document the route builds from it.
async function refileUnchanged(page, input, { language = "en", reviseAs } = {}) {
  const original = inAccountsLanguage(language, () => buildSmallCompanyAccounts(input));
  await openAmend(page, {
    kind: "companies-house-accounts",
    statusCode: "ACCEPT",
    submissionNumber: "00001A",
    companyNumber: input.companyNumber,
    companyNameForProfile: input.companyName,
    jurisdictionForProfile: language === "cy" ? "wales" : "england-wales",
    rejections: [],
    filedDocument: original,
  });
  const sent = await fileUnchanged(page, input, reviseAs);
  const errors = [];
  const accounts = extractAndValidateAccountsParameters({ body: JSON.stringify(sent), headers: {} }, errors, {
    requireCompanyAuthCode: false,
  });
  expect(errors).toEqual([]);
  return { original, sent, revised: buildAccountsIxbrl(accounts) };
}

const carriedNotes = ({ policies, controllingParty, debtors, directorsAdvances, intangibleAssetNote, shareCapital }) => ({
  policies,
  controllingParty,
  debtors,
  directorsAdvances,
  intangibleAssetNote,
  shareCapital,
});

// Every note the small company form can file: the notes case with an accountants' report, a tangible
// fixed asset note beside its intangible one, the share capital note and an advance to each director.
const EVERY_NOTE = {
  ...SMALL_COMPANY_NOTES_CASE_INPUT,
  accountantsReport: {
    accountantsName: "Hughes & Partners",
    statement: "We compiled these accounts from the company's records and the explanations given to us.",
  },
  fixedAssetNote: {
    computerEquipment: {
      costAtStart: 0,
      additions: 1000,
      disposals: 0,
      depreciationAtStart: 0,
      depreciationCharge: 0,
      depreciationOnDisposals: 0,
    },
  },
  directorsAdvances: [
    {
      name: "Alex Jones",
      terms: "Interest free & repayable on demand",
      balanceAtStart: 300,
      advanced: 400,
      repaid: 200,
      balanceAtEnd: 500,
    },
    { name: "Alan James Morgan", terms: "Interest at 2.25% a year", balanceAtStart: 0, advanced: 300, repaid: 0, balanceAtEnd: 300 },
  ],
  balanceSheet: {
    ...SMALL_COMPANY_NOTES_CASE_INPUT.balanceSheet,
    current: {
      ...SMALL_COMPANY_NOTES_CASE_INPUT.balanceSheet.current,
      fixedAssets: 11000,
      profitAndLossAccount: 20900,
      capitalAndReserves: 21000,
    },
  },
};

// The tangible fixed asset facts of each class as the document states them.
const fixedAssetFacts = (document) =>
  Array.from(
    document.matchAll(/<ix:nonFraction name="(core:[A-Za-z]*PropertyPlantEquipment[A-Za-z]*)" contextRef="([^"]+)"[^>]*>([^<]*)</g),
    ([, name, context, text]) => [name, context, text],
  );

// The current tax of each year as the document states it, in the profit and loss account or the tax note.
const taxFacts = (document) =>
  Array.from(
    document.matchAll(/<ix:nonFraction name="core:CurrentTaxForPeriod" contextRef="([^"]+)"[^>]*>([^<]*)</g),
    ([, context, text]) => [context, text],
  );

test.describe("Revising small company accounts without a change", () => {
  for (const [label, input, options] of [
    ["full accounts", EVERY_NOTE, {}],
    ["a filleted copy", { ...EVERY_NOTE, filleted: true }, {}],
    ["accounts filed in Welsh", EVERY_NOTE, { language: "cy" }],
    ["a filleted copy revised as a full copy", { ...EVERY_NOTE, filleted: true }, { reviseAs: "full" }],
  ]) {
    test(`refiles every note the form carries as filed, for ${label}`, async ({ page }) => {
      const { original, revised } = await refileUnchanged(page, input, options);
      const filedNotes = notesOf(original);
      expect(filedNotes.shareCapital).toEqual(EVERY_NOTE.shareCapital);
      expect(filedNotes.directorsAdvances).toEqual(EVERY_NOTE.directorsAdvances);
      expect(carriedNotes(notesOf(revised))).toEqual(carriedNotes(filedNotes));
      expect(accountantsReportOf(revised)).toEqual(EVERY_NOTE.accountantsReport);
      expect(fixedAssetFacts(revised)).toEqual(fixedAssetFacts(original));
      expect(taxFacts(revised)).toEqual(taxFacts(original));
      await expect(page.locator("#revisionNotesNote")).toBeHidden();
    });
  }

  test("opens with the registered office the filed accounts state, so the revision refiles it", async ({ page }) => {
    const registeredOffice = {
      addressLine1: "5 Old Street",
      cityOrTown: "Lichfield",
      countyRegion: "Staffordshire",
      postalCode: "WS13 6AA",
    };
    const { original, revised } = await refileUnchanged(page, { ...SMALL_COMPANY_NOTES_CASE_INPUT, registeredOffice });
    await expect(page.locator("#officeAddressLine1")).toHaveValue("5 Old Street");
    expect(registeredOfficeOf(revised)).toEqual(registeredOfficeOf(original));
    await expect(page.locator("#officeDiffersHint")).toContainText("register gives the registered office today as 22 While Road");
  });

  test("gives no office hint when the filed office is the register's office today", async ({ page }) => {
    const registeredOffice = { addressLine1: "22 While Road", cityOrTown: "Sutton Coldfield", postalCode: "b72 1nd" };
    await refileUnchanged(page, { ...SMALL_COMPANY_NOTES_CASE_INPUT, registeredOffice });
    await expect(page.locator("#officeDiffersHint")).toBeHidden();
  });

  for (const [label, typePriorYear, warned] of [
    ["types no prior-year profit and loss line is warned at the preview", false, true],
    ["types the prior-year profit and loss lines is not warned", true, false],
  ]) {
    test(`a filleted copy revised as a full copy that ${label}`, async ({ page }) => {
      const input = { ...SMALL_COMPANY_NOTES_CASE_INPUT, filleted: true };
      await openAmend(page, {
        kind: "companies-house-accounts",
        statusCode: "ACCEPT",
        submissionNumber: "00001A",
        companyNumber: input.companyNumber,
        companyNameForProfile: input.companyName,
        jurisdictionForProfile: "england-wales",
        rejections: [],
        filedDocument: buildSmallCompanyAccounts(input),
      });
      await expect(page.locator("#revisionCopyFilleted")).toContainText("type the profit and loss lines of both years");
      await page.check("#copyFull");
      for (const year of typePriorYear ? ["current", "prior"] : ["current"]) {
        for (const [line, amount] of Object.entries(input.profitAndLoss[year])) {
          const box = page.locator(`#${year}${line[0].toUpperCase()}${line.slice(1)}`);
          if ((await box.count()) && (await box.isEditable())) await box.fill(String(amount));
        }
      }
      await page.evaluate(() => {
        for (const box of document.querySelectorAll('input[type="checkbox"][id^="statement"]')) box.checked = true;
      });
      await page.fill("#revisionNonCompliance", "The profit and loss account was left out.");
      await page.fill("#revisionAmendments", "The full copy is filed.");
      await page.fill("#directorDateApproved", "2026-11-20");
      await page.evaluate(() => document.getElementById("accountsForm").requestSubmit());
      await expect(page.locator("#previewView")).toBeVisible();
      const warning = page.locator(".status-warning", {
        hasText: "This full copy states the prior year's profit and loss lines as nothing",
      });
      if (warned) await expect(warning).toBeVisible();
      else await expect(warning).toHaveCount(0);
      if (warned) {
        await page.click("#backToFormBtn");
        const [line, amount] = Object.entries(input.profitAndLoss.prior).find(([name]) => name !== "tax");
        await page.fill(`#prior${line[0].toUpperCase()}${line.slice(1)}`, String(amount));
        await expect(warning).toHaveCount(0);
      }
    });
  }

  test("at phone width the advances table of the previewed document ends inside the preview frame", async ({ page }) => {
    const original = buildSmallCompanyAccounts(EVERY_NOTE);
    await openAmend(page, {
      kind: "companies-house-accounts",
      statusCode: "ACCEPT",
      submissionNumber: "00001A",
      companyNumber: EVERY_NOTE.companyNumber,
      companyNameForProfile: EVERY_NOTE.companyName,
      jurisdictionForProfile: "england-wales",
      rejections: [],
      filedDocument: original,
    });
    await page.evaluate((ixbrl) => {
      window.renderMicroEntityAccounts = async () => ({ ixbrl });
      for (const box of document.querySelectorAll('input[type="checkbox"][id^="statement"]')) box.checked = true;
    }, original);
    await page.fill("#revisionNonCompliance", "The interest rate of an advance was stated wrongly.");
    await page.fill("#revisionAmendments", "The advances note states the rate charged.");
    await page.fill("#directorDateApproved", "2026-11-20");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => document.getElementById("accountsForm").requestSubmit());
    await expect(page.locator("#previewView")).toBeVisible();

    // The whole row, from the director's name to the amount owed at the end, is no wider than the frame,
    // and with the name at the frame's left the last amount is inside its right edge.
    const frame = await page.locator("#previewRendered").boundingBox();
    const row = page.frameLocator("#previewRendered").locator("tr", { hasText: "Alan James Morgan" });
    await row.locator("td.label").scrollIntoViewIfNeeded();
    const [name, closing] = [await row.locator("td.label").boundingBox(), await row.locator("td.figure").last().boundingBox()];
    expect(name.x).toBeGreaterThanOrEqual(frame.x);
    expect(closing.x + closing.width).toBeLessThanOrEqual(frame.x + frame.width);
  });

  test("a line break in a filed name or the advance's terms comes back as a space in its one-line box", async ({ page }) => {
    const input = {
      ...SMALL_COMPANY_NOTES_CASE_INPUT,
      controllingParty: { name: "Morgan\nHoldings Limited", ultimate: true },
      directorsAdvances: [{ ...SMALL_COMPANY_NOTES_CASE_INPUT.directorsAdvances[0], terms: "Interest free\nand repayable on demand" }],
    };
    const { revised } = await refileUnchanged(page, input);
    const notes = notesOf(revised);
    expect(notes.controllingParty.name).toBe("Morgan Holdings Limited");
    expect(notes.directorsAdvances[0].terms).toBe("Interest free and repayable on demand");
  });

  test("a filleted copy whose advance names a director other than the signer keeps that director among the directors", async ({ page }) => {
    const { sent } = await refileUnchanged(page, { ...SMALL_COMPANY_NOTES_CASE_INPUT, filleted: true });
    expect(sent.smallCompany.directors).toEqual(["Alan James Morgan", "Alex Jones"]);
  });

  test("a filleted copy with advances to two directors other than the signer keeps both among the directors", async ({ page }) => {
    const [advance] = SMALL_COMPANY_NOTES_CASE_INPUT.directorsAdvances;
    const { sent } = await refileUnchanged(page, {
      ...SMALL_COMPANY_NOTES_CASE_INPUT,
      filleted: true,
      directors: ["Alan James Morgan", "Alex Jones", "Pat Third"],
      directorsAdvances: [
        { ...advance, advanced: 400, balanceAtEnd: 500 },
        { name: "Pat Third", terms: "Interest at 2.25% a year", balanceAtStart: 0, advanced: 300, repaid: 0, balanceAtEnd: 300 },
      ],
    });
    expect(sent.smallCompany.directors).toEqual(["Alan James Morgan", "Alex Jones", "Pat Third"]);
  });
});
