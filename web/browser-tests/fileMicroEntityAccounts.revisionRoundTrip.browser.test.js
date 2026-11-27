// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/fileMicroEntityAccounts.revisionRoundTrip.browser.test.js
// A micro-entity revision opened from a receipt and filed without a change refiles the notes the form
// carries as they were filed: the original is built by the route's builder, opened in the amend form,
// filed, and the revised document is built from the request the form sends.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { microInputFromTestServiceCase, onRegisterCompany } from "@app/test-helpers/accountsDocumentCases.js";
import { PEOPLE, registerCompany, REGISTER_COMPANY_NUMBERS } from "@app/http-simulator/fixtures/register.js";
import { buildMicroEntityAccounts } from "@app/services/microEntityAccountsIxbrl.js";
import { inAccountsLanguage } from "@app/services/accountsLanguage.js";
import { buildAccountsIxbrl, extractAndValidateAccountsParameters } from "@app/functions/companies-house/companiesHouseAccountsPost.js";
import { notesOf, registeredOfficeOf, accountantsReportOf } from "../public/lib/accounts-revision.js";
import { serveMoneyInput, servePageScripts, serveSiteStyles } from "./hmrcFieldTableAssets.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const PUBLIC_DIR = path.join(process.cwd(), "web/public");
const PAGE_PATH = "companies-house/fileMicroEntityAccounts.html";
const RECEIPT_NAME = "2026-10-24T10:15:00.000Z-00001A.json";
const CASES = JSON.parse(fs.readFileSync("scripts/fixtures/companies-house-test-service-cases.json", "utf8"));
// The micro-entity case is DIY Accounting Limited's own: a page here shows it on the register's joinery.
const JOINERY = registerCompany(REGISTER_COMPANY_NUMBERS[0]);
const microInput = (name) => {
  const testCase = CASES.find((entry) => entry.name === name);
  return microInputFromTestServiceCase(
    testCase.companyNumber === "06846849" ? onRegisterCompany(testCase, JOINERY, PEOPLE.eleanorBramwell) : testCase,
  );
};

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
    window.narrateStage = (message) => window.showStatus(message, "info");
    window.endStage = () => {};
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

async function fileUnchanged(page) {
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
async function refileUnchanged(page, input, { language = "en" } = {}) {
  const original = inAccountsLanguage(language, () => buildMicroEntityAccounts(input));
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
  const sent = await fileUnchanged(page);
  const errors = [];
  const accounts = extractAndValidateAccountsParameters({ body: JSON.stringify(sent), headers: {} }, errors, {
    requireCompanyAuthCode: false,
  });
  expect(errors).toEqual([]);
  await expect(page.locator("#revisionNotesNote")).toBeHidden();
  return { original, revised: buildAccountsIxbrl(accounts) };
}

// The dormant share note's facts as the document states them.
const shareFacts = (document) =>
  Array.from(
    document.matchAll(
      /<ix:nonFraction name="(core:(?:NumberSharesIssuedFullyPaid|NominalValueAllottedShareCapital))" contextRef="([^"]+)"[^>]*>([^<]*)</g,
    ),
    ([, name, context, text]) => [name, context, text],
  );

// Every note the micro-entity form can file beside the balance sheet: the advance to the director
// approving the accounts and the accountants' report.
const withEveryNote = (input) => ({
  ...input,
  accountantsReport: {
    accountantsName: "Hughes & Partners",
    statement: "We compiled these accounts from the company's records and the explanations given to us.",
  },
  directorsAdvances: [
    { name: input.directorName, terms: "Repayable within nine months", balanceAtStart: 100, advanced: 450, repaid: 50, balanceAtEnd: 500 },
  ],
});

test.describe("Revising micro-entity accounts without a change", () => {
  for (const [label, input, options] of [
    ["micro-entity accounts", withEveryNote(microInput("micro-entity-accounts")), {}],
    ["micro-entity accounts filed in Welsh", withEveryNote(microInput("micro-entity-accounts")), { language: "cy" }],
  ]) {
    test(`refiles the advance and the accountants' report as filed, for ${label}`, async ({ page }) => {
      const { original, revised } = await refileUnchanged(page, input, options);
      expect(notesOf(original).directorsAdvances).toEqual(input.directorsAdvances);
      expect(notesOf(revised).directorsAdvances).toEqual(input.directorsAdvances);
      expect(accountantsReportOf(revised)).toEqual(input.accountantsReport);
      expect(registeredOfficeOf(revised)).toEqual(registeredOfficeOf(original));
    });
  }

  test("opens accounts that hold two advance rows with the first in the form's one row, and says the second is not filled", async ({
    page,
  }) => {
    const input = withEveryNote(microInput("micro-entity-accounts"));
    const [first] = input.directorsAdvances;
    // The builder writes one row for a director, so the second row is the first row's terms stated again.
    const filed = buildMicroEntityAccounts(input);
    const [termsOfTheRow] = /<p>[^<]*: <ix:nonNumeric name="direp:Description[^>]*>[^<]*<\/ix:nonNumeric><\/p>/.exec(filed);
    await openAmend(page, {
      kind: "companies-house-accounts",
      statusCode: "ACCEPT",
      submissionNumber: "00001A",
      companyNumber: input.companyNumber,
      companyNameForProfile: input.companyName,
      jurisdictionForProfile: "england-wales",
      rejections: [],
      filedDocument: filed.replace(termsOfTheRow, termsOfTheRow + termsOfTheRow),
    });
    await expect(page.locator("#directorsAdvanceTerms")).toHaveValue(first.terms);
    await expect(page.locator(".directors-advance-row")).toHaveCount(1);
    await expect(page.locator("#revisionNotesNote")).toHaveText(
      "The filed accounts hold 2 rows of advances to directors and this form takes 1, so the rows after row 1 are not filled.",
    );
  });

  test("refiles a dormant company's share note as filed", async ({ page }) => {
    const { original, revised } = await refileUnchanged(page, microInput("micro-entity-accounts-dormant"));
    expect(shareFacts(original).length).toBeGreaterThan(0);
    expect(shareFacts(revised)).toEqual(shareFacts(original));
  });
});
