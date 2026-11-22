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
import { notesOf } from "../public/lib/accounts-revision.js";
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
      body: `window.companiesHouseGatewayPoll = { pollGatewayUntilSettled: async ({ poll }) => poll(), isSettled: () => true, pendingNote: () => "", mayCheckAgain: () => false };`,
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

const carriedNotes = ({ policies, controllingParty, debtors, directorsAdvances, intangibleAssetNote }) => ({
  policies,
  controllingParty,
  debtors,
  directorsAdvances,
  intangibleAssetNote,
});

// The current tax of each year as the document states it, in the profit and loss account or the tax note.
const taxFacts = (document) =>
  Array.from(
    document.matchAll(/<ix:nonFraction name="core:CurrentTaxForPeriod" contextRef="([^"]+)"[^>]*>([^<]*)</g),
    ([, context, text]) => [context, text],
  );

test.describe("Revising small company accounts without a change", () => {
  for (const [label, input, options] of [
    ["full accounts", SMALL_COMPANY_NOTES_CASE_INPUT, {}],
    ["a filleted copy", { ...SMALL_COMPANY_NOTES_CASE_INPUT, filleted: true }, {}],
    ["accounts filed in Welsh", SMALL_COMPANY_NOTES_CASE_INPUT, { language: "cy" }],
    ["a filleted copy revised as a full copy", { ...SMALL_COMPANY_NOTES_CASE_INPUT, filleted: true }, { reviseAs: "full" }],
  ]) {
    test(`refiles every note the form carries as filed, for ${label}`, async ({ page }) => {
      const { original, revised } = await refileUnchanged(page, input, options);
      expect(carriedNotes(notesOf(revised))).toEqual(carriedNotes(notesOf(original)));
      expect(taxFacts(revised)).toEqual(taxFacts(original));
    });
  }

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
});
