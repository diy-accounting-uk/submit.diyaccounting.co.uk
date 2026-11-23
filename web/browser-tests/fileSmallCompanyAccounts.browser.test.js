// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/fileSmallCompanyAccounts.browser.test.js

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { serveMoneyInput, servePageScripts, serveSiteStyles } from "./hmrcFieldTableAssets.js";
import {
  accountsDocumentCases,
  SMALL_COMPANY_CASE_INPUT,
  SMALL_COMPANY_NOTES_CASE_INPUT,
  SMALL_COMPANY_EVERY_LINE_CASE_INPUT,
} from "@app/test-helpers/accountsDocumentCases.js";
import { buildSmallCompanyAccounts, SMALL_COMPANY_POLICY_FIELDS } from "@app/services/smallCompanyAccountsIxbrl.js";
import { notesOf } from "../public/lib/accounts-revision.js";
import { inAccountsLanguage } from "@app/services/accountsLanguage.js";
import { readSubmitCss } from "./submitCss.js";
import { screenshotAtBothWidths } from "./revisedAccountsScreenshots.js";
import { NOT_HELD_COMPANY_NUMBER, registerCompany } from "@app/http-simulator/fixtures/register.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const PAGE_PATH = "companies-house/fileSmallCompanyAccounts.html";

// The company the form opens: its first accounts by default, so the form leaves out the prior year;
// a company with accounts on the register already shows the prior year.
const FIRST_ACCOUNTS_COMPANY = { companyNumber: "00000001", companyName: registerCompany("00000001").name, dateOfCreation: "2025-04-01" };
const ESTABLISHED_COMPANY = { ...FIRST_ACCOUNTS_COMPANY, dateOfCreation: "2019-04-01", accountsLastPeriodStart: "2024-04-01" };

async function openFormView(page, { established = false } = {}) {
  const url = `http://localhost:3000/${PAGE_PATH}`;
  await page.route("**/*.js", async (route) => {
    if (route.request().resourceType() === "script") {
      await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
    } else {
      await route.continue();
    }
  });
  await servePageScripts(page);
  await serveMoneyInput(page);
  const html = fs.readFileSync(path.join(process.cwd(), "web/public", PAGE_PATH), "utf-8");
  await page.route(url, async (route) => {
    await route.fulfill({ status: 200, contentType: "text/html", body: html });
  });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.evaluate(
    (openedCompany) => {
      company = openedCompany;
      showView("formView");
    },
    established ? ESTABLISHED_COMPANY : FIRST_ACCOUNTS_COMPANY,
  );
  await page.fill("#periodStart", "2025-04-01");
}

const CURRENT_BALANCE_SHEET = {
  FixedAssets: "1000",
  Stocks: "500",
  Debtors: "2500",
  CashAtBank: "2000",
  TradeCreditors: "1000",
  CorporationTax: "700",
  OtherCreditors: "300",
  CreditorsAfterOneYear: "0",
  CalledUpShareCapital: "100",
  ProfitAndLossAccount: "3900",
};

const CURRENT_PROFIT_AND_LOSS = {
  Turnover: "20000",
  CostOfSales: "5000",
  AdministrativeExpenses: "12000",
  InterestReceivable: "0",
  Tax: "600",
};

async function fillCurrentYear(page) {
  for (const [field, value] of Object.entries({ ...CURRENT_BALANCE_SHEET, ...CURRENT_PROFIT_AND_LOSS })) {
    await page.fill(`#current${field}`, value);
  }
}

test.describe("File small company accounts page", () => {
  test("first accounts leave out the prior year and say why, and the fixed asset note stays hidden until chosen", async ({ page }) => {
    await openFormView(page);
    await expect(page.locator("#includeComparatives")).not.toBeChecked();
    await expect(page.locator("#includeComparatives")).toBeDisabled();
    await expect(page.locator("#comparativeFields")).toBeHidden();
    await expect(page.locator("#firstAccountsLine")).toHaveText(
      "These are the company's first accounts: the period starts on the day it was incorporated, 1 April 2025, so there is no prior year.",
    );
    await expect(page.locator("#fixedAssetNoteFields")).toBeHidden();
    await page.check("#includeFixedAssetNote");
    await expect(page.locator("#fixedAssetNoteFields")).toBeVisible();
    const payload = await page.evaluate(() => buildAccountsPayload());
    expect(payload.smallCompany.dateOfIncorporation).toBe("2025-04-01");
  });

  test("accounts that are not the company's first show the prior year, and the reader cannot leave it out", async ({ page }) => {
    await openFormView(page, { established: true });
    await expect(page.locator("#includeComparatives")).toBeChecked();
    await expect(page.locator("#includeComparatives")).toBeDisabled();
    await expect(page.locator("#comparativeFields")).toBeVisible();
    await expect(page.locator("#firstAccountsLine")).toContainText("These are not the company's first accounts");
    const payload = await page.evaluate(() => buildAccountsPayload());
    expect(payload.smallCompany.dateOfIncorporation).toBeUndefined();
    expect(payload.smallCompany.balanceSheet.priorYear).toBeDefined();
  });

  test("a period that does not start on the day of incorporation is not first accounts", async ({ page }) => {
    await openFormView(page);
    await page.fill("#periodStart", "2025-05-01");
    await expect(page.locator("#includeComparatives")).toBeChecked();
    await expect(page.locator("#firstAccountsLine")).toContainText("These are not the company's first accounts");
    await page.fill("#periodStart", "2025-04-01");
    await expect(page.locator("#includeComparatives")).not.toBeChecked();
  });

  test("on a phone the format 2 lines stay out of sight in format 1", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await openFormView(page);
    await page.addStyleTag({ content: readSubmitCss() });
    await expect(page.locator("#currentTurnover")).toBeVisible();
    await expect(page.locator("#currentChangeInStocks")).toBeHidden();
    await expect(page.locator("#currentInterestPayable")).toBeHidden();
  });

  test("the profit and loss subtotals and the balance sheet check follow what is typed", async ({ page }) => {
    await openFormView(page);
    await fillCurrentYear(page);
    await expect(page.locator("#currentProfitAndLossTotals")).toContainText("Gross profit: 15000");
    await expect(page.locator("#currentProfitAndLossTotals")).toContainText("Operating profit: 3000");
    await expect(page.locator("#currentProfitAndLossTotals")).toContainText("Profit for the year: 2400");
    await expect(page.locator("#currentBalanceSheetTotals")).toContainText("Net assets: £4,000. Matches");
    await page.fill("#currentProfitAndLossAccount", "3000");
    await expect(page.locator("#currentBalanceSheetTotals")).toContainText("Does not match");
  });

  test("the request is full accounts with no comparatives and no fixed asset note by default", async ({ page }) => {
    await openFormView(page);
    await fillCurrentYear(page);
    await page.fill("#principalActivity", "Software consultancy");
    await page.fill("#accountingPolicies", "Historical cost convention.");
    await page.fill("#directors", "Jo Director\nAlex Jones\n");
    const payload = await page.evaluate(() => buildAccountsPayload());
    expect(payload.smallCompany.filleted).toBe(false);
    expect(payload.smallCompany.directors).toEqual(["Jo Director", "Alex Jones"]);
    expect(payload.smallCompany.balanceSheet.priorYear).toBeUndefined();
    expect(payload.smallCompany.profitAndLoss.priorYear).toBeUndefined();
    expect(payload.smallCompany.fixedAssetNote).toBeUndefined();
    expect(payload.smallCompany.profitAndLoss.currentYear).toMatchObject({ grossProfit: 15000, operatingProfit: 3000, profit: 2400 });
    expect(payload.smallCompany.balanceSheet.currentYear.capitalAndReserves).toBe(4000);
  });

  test("choosing the filleted copy, comparatives and a fixed asset class changes the request", async ({ page }) => {
    await openFormView(page, { established: true });
    await fillCurrentYear(page);
    await page.check("#copyFilleted");
    await page.fill("#priorTurnover", "10000");
    await page.fill("#priorCostOfSales", "4000");
    await page.fill("#priorAdministrativeExpenses", "5000");
    await page.check("#includeFixedAssetNote");
    await page.fill("#noteComputerEquipmentCostAtStart", "1500");
    await page.fill("#noteComputerEquipmentDepreciationAtStart", "500");
    const payload = await page.evaluate(() => buildAccountsPayload());
    expect(payload.smallCompany.filleted).toBe(true);
    expect(payload.smallCompany.profitAndLoss.priorYear).toMatchObject({ turnover: 10000, grossProfit: 6000, operatingProfit: 1000 });
    expect(payload.smallCompany.balanceSheet.priorYear).toBeDefined();
    expect(Object.keys(payload.smallCompany.fixedAssetNote)).toEqual(["computerEquipment"]);
    await expect(page.locator("#fixedAssetNoteTotals")).toContainText("Net book value: 1000. Matches fixed assets");
  });

  test("the form refuses a fixed asset note that does not match the fixed assets", async ({ page }) => {
    await openFormView(page);
    await fillCurrentYear(page);
    await page.check("#includeFixedAssetNote");
    await page.fill("#noteLandBuildingsCostAtStart", "999");
    const problem = await page.evaluate(() => formProblem());
    expect(problem).toContain("net book value must equal the fixed assets");
  });

  test("the pounds boxes carry the money markup", async ({ page }) => {
    await openFormView(page);
    const report = await page.evaluate(() =>
      Array.from(document.querySelectorAll("input[data-money]")).map((input) => ({
        id: input.id,
        prefix: input.parentElement.querySelector(".prefix")?.textContent,
        label: document.querySelector(`label[for="${input.id}"]`)?.textContent,
        inLedger: Boolean(input.closest(".ledger")),
        hint: document.getElementById(input.getAttribute("aria-describedby"))?.textContent,
      })),
    );
    expect(report.length).toBeGreaterThan(50);
    for (const entry of report) {
      expect(entry.prefix, entry.id).toBe("£");
      expect(entry.label, entry.id).toBeTruthy();
      expect(entry.inLedger, entry.id).toBe(true);
      expect(entry.hint, entry.id).toContain("For example");
    }
  });

  test("bank loans, taxation and social security and bank loans after one year change the totals and the request", async ({ page }) => {
    await openFormView(page);
    await fillCurrentYear(page);
    await page.fill("#currentCreditorsAfterOneYear", "800");
    await page.fill("#currentBankLoansAfterOneYear", "500");
    await page.fill("#currentBankLoansOverdrafts", "200");
    await page.fill("#currentTaxationSocialSecurity", "150");
    await page.fill("#currentProfitAndLossAccount", "2750");
    await expect(page.locator("#currentBalanceSheetTotals")).toContainText("Net assets: £2,850. Matches");
    const year = await page.evaluate(() => buildAccountsPayload().smallCompany.balanceSheet.currentYear);
    expect(year).toMatchObject({ bankLoansOverdrafts: 200, taxationSocialSecurity: 150, bankLoansAfterOneYear: 500 });
    await page.fill("#currentBankLoansAfterOneYear", "900");
    expect(await page.evaluate(() => formProblem())).toContain("Bank loans due after one year");
  });

  test("the new creditor lines sit in the balance sheet table in both years, next to the lines they split", async ({ page }) => {
    await openFormView(page, { established: true });
    for (const prefix of ["current", "prior"]) {
      const labels = await page
        .locator(`#${prefix}BankLoansOverdrafts, #${prefix}TaxationSocialSecurity, #${prefix}BankLoansAfterOneYear`)
        .evaluateAll((inputs) => inputs.map((input) => input.closest("tr").querySelector("th").textContent.trim()));
      expect(labels).toEqual([
        "Bank loans and overdrafts (due within one year)",
        "Taxation and social security (due within one year)",
        "Of which, bank loans",
      ]);
    }
  });

  test("the debtors split, the directors loan and the provisions change the totals and the request", async ({ page }) => {
    await openFormView(page);
    await fillCurrentYear(page);
    await page.fill("#currentTradeDebtors", "1800");
    await page.fill("#currentOtherDebtors", "400");
    await page.fill("#currentPrepayments", "300");
    await page.fill("#currentCreditorsAfterOneYear", "800");
    await page.fill("#currentAmountsOwedToDirectors", "500");
    await page.fill("#currentAmountsOwedToGroupUndertakings", "100");
    await page.fill("#currentProvisionsForLiabilities", "250");
    await page.fill("#currentProfitAndLossAccount", "2850");
    await expect(page.locator("#currentBalanceSheetTotals")).toContainText("Net assets: £2,950. Matches");
    const year = await page.evaluate(() => buildAccountsPayload().smallCompany.balanceSheet.currentYear);
    expect(year).toMatchObject({
      tradeDebtors: 1800,
      otherDebtors: 400,
      prepayments: 300,
      amountsOwedToDirectors: 500,
      amountsOwedToGroupUndertakings: 100,
      provisionsForLiabilities: 250,
    });
    expect(await page.evaluate(() => formProblem())).toBeNull();
    await page.fill("#currentPrepayments", "200");
    expect(await page.evaluate(() => formProblem())).toContain("must add up to the debtors");
    await page.fill("#currentPrepayments", "300");
    await page.fill("#currentAmountsOwedToGroupUndertakings", "400");
    expect(await page.evaluate(() => formProblem())).toContain("amounts owed to group undertakings cannot be more than");
  });

  test("the debtors, creditors and provisions lines sit in the balance sheet table in both years, next to the lines they split", async ({
    page,
  }) => {
    await openFormView(page, { established: true });
    for (const prefix of ["current", "prior"]) {
      const labels = await page
        .locator(
          `#${prefix}TradeDebtors, #${prefix}OtherDebtors, #${prefix}Prepayments, #${prefix}AmountsOwedToDirectors, #${prefix}AmountsOwedToGroupUndertakings, #${prefix}ProvisionsForLiabilities`,
        )
        .evaluateAll((inputs) => inputs.map((input) => input.closest("tr").querySelector("th").textContent.trim()));
      expect(labels).toEqual([
        "Of which, trade debtors",
        "Of which, other debtors",
        "Of which, prepayments and accrued income",
        "Of which, amounts owed to directors",
        "Of which, amounts owed to group undertakings",
        "Provisions for liabilities",
      ]);
    }
  });

  test("the intangible assets note shows when ticked, adds to the tangible note and reaches the request", async ({ page }) => {
    await openFormView(page);
    await fillCurrentYear(page);
    await expect(page.locator("#intangibleAssetNoteFields")).toBeHidden();
    expect(await page.evaluate(() => buildAccountsPayload().smallCompany.intangibleAssetNote)).toBeUndefined();
    await page.check("#includeIntangibleAssetNote");
    await expect(page.locator("#intangibleAssetNoteFields")).toBeVisible();
    await page.check("#includeFixedAssetNote");
    await page.fill("#noteLandBuildingsCostAtStart", "700");
    await page.fill("#intangibleNoteCostAtStart", "400");
    await page.fill("#intangibleNoteAmortisationAtStart", "100");
    await expect(page.locator("#intangibleAssetNoteTotals")).toContainText(
      "Net book value: 300. With the tangible fixed assets note, matches",
    );
    expect(await page.evaluate(() => formProblem())).toBeNull();
    const note = await page.evaluate(() => buildAccountsPayload().smallCompany.intangibleAssetNote);
    expect(note).toMatchObject({ costAtStart: 400, amortisationAtStart: 100, additions: 0 });
    await page.fill("#intangibleNoteAdditions", "50");
    expect(await page.evaluate(() => formProblem())).toContain("net book value must equal the fixed assets");
    await page.locator("#morePolicies summary").click();
    await page.fill("#intangibleAssetsPolicy", "Goodwill is amortised over five years.");
    expect(await page.evaluate(() => buildAccountsPayload().smallCompany.intangibleAssetsPolicy)).toBe(
      "Goodwill is amortised over five years.",
    );
  });

  test("the registered office parts fill from the company record, can be edited and reach the request", async ({ page }) => {
    await openFormView(page);
    await page.evaluate(() =>
      window.accountsFormSections.fillRegisteredOffice({
        addressLine1: "Unit 4 Morgan Court",
        cityOrTown: "Cardiff",
        postalCode: "CF10 1AA",
      }),
    );
    await expect(page.locator("#officeAddressLine1")).toHaveValue("Unit 4 Morgan Court");
    await page.fill("#officeCountry", "Wales");
    const office = await page.evaluate(() => buildAccountsPayload().registeredOffice);
    expect(office).toEqual({ addressLine1: "Unit 4 Morgan Court", cityOrTown: "Cardiff", postalCode: "CF10 1AA", country: "Wales" });
  });

  test("the accountants' report fields show only when ticked", async ({ page }) => {
    await openFormView(page);
    await expect(page.locator("#accountantsReportFields")).toBeHidden();
    expect(await page.evaluate(() => buildAccountsPayload().accountantsReport)).toBeUndefined();
    await page.check("#includeAccountantsReport");
    await expect(page.locator("#accountantsReportFields")).toBeVisible();
    await page.fill("#accountantsName", "Calder Brook Accountants LLP");
    const report = await page.evaluate(() => buildAccountsPayload().accountantsReport);
    expect(report.accountantsName).toBe("Calder Brook Accountants LLP");
    expect(report.statement).toContain("compiled these unaudited financial statements");
  });

  test("the share capital note shows when ticked, reaches the request, and the accounts it builds carry it back", async ({ page }) => {
    await serveSiteStyles(page);
    await openFormView(page);
    await expect(page.locator("#shareCapitalNoteFields")).toBeHidden();
    expect(await page.evaluate(() => buildAccountsPayload().smallCompany.shareCapital)).toBeUndefined();
    await page.check("#includeShareCapitalNote");
    await expect(page.locator("#shareCapitalNoteFields")).toBeVisible();
    await page.selectOption("#shareCapitalClass", "preferenceShares");
    await page.fill("#shareCapitalNominalValue", "0.5");
    const shareCapital = await page.evaluate(() => buildAccountsPayload().smallCompany.shareCapital);
    expect(shareCapital).toEqual({ shareClass: "preferenceShares", nominalValue: 0.5 });
    expect(notesOf(buildSmallCompanyAccounts({ ...SMALL_COMPANY_CASE_INPUT, shareCapital })).shareCapital).toEqual(shareCapital);
    await page.evaluate(() => {
      document.getElementById("formCompanyName").textContent = company.companyName;
      document.getElementById("formCompanyNumber").textContent = company.companyNumber;
    });
    await expect(page.locator("#formCompanyName")).toHaveText("HARBOUR LANE JOINERY LIMITED");
    await screenshotAtBothWidths(page, "small-original-share-capital");
  });

  test("each advance row states its number, and any row can be removed while another is left", async ({ page }) => {
    await serveSiteStyles(page);
    await openFormView(page);
    const rows = page.locator(".directors-advance-row");
    const titles = page.locator(".directors-advance-row__title");
    const removeButtons = page.getByRole("button", { name: "Remove this advance" });
    await expect(titles).toHaveText(["Advance 1"]);
    await expect(removeButtons).toHaveCount(0);

    await page.click("#addDirectorsAdvance");
    await page.click("#addDirectorsAdvance");
    await expect(titles).toHaveText(["Advance 1", "Advance 2", "Advance 3"]);
    await expect(removeButtons).toHaveCount(3);
    for (const [index, name] of ["Alex Jones", "Alan James Morgan", "Bethan Price"].entries()) {
      await rows.nth(index).locator('[data-advance-field="name"]').fill(name);
      await rows
        .nth(index)
        .locator('[data-advance-field="balanceAtEnd"]')
        .fill(String((index + 1) * 100));
    }

    await rows.nth(0).getByRole("button", { name: "Remove this advance" }).click();
    await expect(titles).toHaveText(["Advance 1", "Advance 2"]);
    await expect(rows.nth(0).locator('[data-advance-field="name"]')).toHaveValue("Alan James Morgan");
    await expect(rows.nth(0).locator('[data-advance-field="balanceAtEnd"]')).toHaveValue("200");
    await expect(rows.nth(1).locator('[data-advance-field="name"]')).toHaveValue("Bethan Price");
    await expect(page.locator("#directorsAdvanceName")).toHaveValue("Alan James Morgan");

    await rows.nth(0).getByRole("button", { name: "Remove this advance" }).click();
    await expect(titles).toHaveText(["Advance 1"]);
    await expect(rows.nth(0).locator('[data-advance-field="name"]')).toHaveValue("Bethan Price");
    await expect(removeButtons).toHaveCount(0);
  });

  test("a second director's advance takes its own row, reaches the request, and the accounts it builds carry both back", async ({
    page,
  }) => {
    await serveSiteStyles(page);
    await openFormView(page);
    const rows = page.locator(".directors-advance-row");
    await expect(rows).toHaveCount(1);
    await page.click("#addDirectorsAdvance");
    await expect(rows).toHaveCount(2);
    const advances = [
      {
        name: "Alex Jones",
        terms: "Interest free & repayable on demand",
        balanceAtStart: 300,
        advanced: 400,
        repaid: 200,
        balanceAtEnd: 500,
      },
      { name: "Alan James Morgan", terms: "Interest at 2.25% a year", balanceAtStart: 0, advanced: 300, repaid: 0, balanceAtEnd: 300 },
    ];
    for (const [index, advance] of advances.entries()) {
      for (const [field, value] of Object.entries(advance)) {
        await rows.nth(index).locator(`[data-advance-field="${field}"]`).fill(String(value));
      }
    }
    expect(await page.evaluate(() => buildAccountsPayload().smallCompany.directorsAdvances)).toEqual(advances);
    const ids = await page.evaluate(() => Array.from(document.querySelectorAll("[id]"), (element) => element.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(
      notesOf(buildSmallCompanyAccounts({ ...SMALL_COMPANY_EVERY_LINE_CASE_INPUT, directorsAdvances: advances })).directorsAdvances,
    ).toEqual(advances);
    await page.evaluate(() => {
      document.getElementById("formCompanyName").textContent = company.companyName;
      document.getElementById("formCompanyNumber").textContent = company.companyNumber;
    });
    await screenshotAtBothWidths(page, "small-original-two-advances");
    await rows.nth(1).getByRole("button", { name: "Remove this advance" }).click();
    await expect(rows).toHaveCount(1);
    expect(await page.evaluate(() => buildAccountsPayload().smallCompany.directorsAdvances)).toEqual([advances[0]]);
  });

  test("the advances and the share capital note are checked on the page by the rules the route applies, each in a sentence", async ({
    page,
  }) => {
    await openFormView(page);
    await fillCurrentYear(page);
    await page.fill("#directors", "Alan James Morgan\nAlex Jones");
    await page.fill("#currentTradeDebtors", "0");
    const row = (index) => page.locator(".directors-advance-row").nth(index);
    const fillRow = async (index, advance) => {
      for (const [field, value] of Object.entries(advance)) await row(index).locator(`[data-advance-field="${field}"]`).fill(String(value));
    };
    await fillRow(0, { name: "Alex Jones", terms: "Interest free", balanceAtStart: 300, advanced: 400, repaid: 200, balanceAtEnd: 600 });
    expect(await page.evaluate(() => notesProblem())).toBe(
      "The advance to Alex Jones does not add up: owed at the start, plus advanced, less repaid is £500, so owed at the end is £500.",
    );
    await fillRow(0, { balanceAtEnd: 500 });
    await page.click("#addDirectorsAdvance");
    await fillRow(1, { name: "Alex Jones", terms: "Interest at 2%", balanceAtStart: 0, advanced: 100, repaid: 0, balanceAtEnd: 100 });
    expect(await page.evaluate(() => notesProblem())).toBe(
      "Alex Jones has two advance rows. Give each director one row, with the amounts of all their advances added together.",
    );
    await fillRow(1, { name: "Alan James Morgan" });
    expect(await page.evaluate(() => notesProblem())).toMatch(
      /^The amounts owed at the end of the advances add up to £600, but the balance sheet shows £\d+ owed by directors\.$/,
    );
    await page.click(".directors-advance-row >> nth=1 >> text=Remove this advance");
    await fillRow(0, { name: "", terms: "", balanceAtStart: "", advanced: "", repaid: "", balanceAtEnd: "" });
    await page.check("#includeShareCapitalNote");
    await page.fill("#shareCapitalNominalValue", "0.3");
    expect(await page.evaluate(() => notesProblem())).toMatch(
      /^The nominal value of each share must divide the called up share capital of £\d+ into whole shares\.$/,
    );
  });

  test("amounts owed by directors with no advance row are refused on the page, as the route refuses them", async ({ page }) => {
    await openFormView(page);
    await fillCurrentYear(page);
    await page.fill("#directors", "Alex Jones");
    await page.fill("#currentAmountsOwedByDirectors", "100");
    expect(await page.evaluate(() => notesProblem())).toBe(
      "The balance sheet shows amounts owed by directors. Give each director who owes the company money a row in the note on advances.",
    );
    await page.fill("#currentAmountsOwedByDirectors", "0");
    expect(await page.evaluate(() => notesProblem())).toBeNull();
  });

  test("an advance to someone who is not among the directors is refused on the page, in a sentence", async ({ page }) => {
    await openFormView(page);
    await fillCurrentYear(page);
    await page.fill("#directors", "Alan James Morgan\nAlex Jones");
    const row = page.locator(".directors-advance-row").first();
    await row.locator('[data-advance-field="name"]').fill("Pat Other");
    await row.locator('[data-advance-field="terms"]').fill("Interest free");
    expect(await page.evaluate(() => notesProblem())).toBe(
      "Pat Other is named for an advance, but is not among the directors listed. Add them to the directors, or correct the name.",
    );
    await row.locator('[data-advance-field="name"]').fill("Alex Jones");
    expect(await page.evaluate(() => notesProblem())).toBeNull();
  });

  test("the policy boxes sit under a closed disclosure and only the filled ones reach the request", async ({ page }) => {
    await openFormView(page);
    await expect(page.locator("#morePolicies")).not.toHaveAttribute("open", "");
    await expect(page.locator("#morePolicies summary")).toHaveText("More accounting policies (optional)");
    expect(
      await page.evaluate(() => Object.keys(buildAccountsPayload().smallCompany).filter((key) => /Policy|Statement/.test(key))),
    ).toEqual([]);
    await page.locator("#morePolicies summary").click();
    await page.fill("#goingConcernStatement", "  The company is a going concern.  ");
    await page.fill("#impairmentPolicy", "Assets are reviewed for impairment each year.");
    const smallCompany = await page.evaluate(() => buildAccountsPayload().smallCompany);
    expect(smallCompany.goingConcernStatement).toBe("The company is a going concern.");
    expect(smallCompany.impairmentPolicy).toBe("Assets are reviewed for impairment each year.");
    expect(smallCompany.revenueRecognitionPolicy).toBeUndefined();
    await page.fill("#propertyPlantEquipmentPolicy", "Cost less depreciation.");
    await page.fill("#depreciationMethodPolicy", "Straight line over four years.");
    await page.fill("#deferredTaxPolicy", "Deferred tax is not provided.");
    await page.fill("#functionalPresentationCurrencyPolicy", "Pounds sterling.");
    const second = await page.evaluate(() => buildAccountsPayload().smallCompany);
    expect(second).toMatchObject({
      propertyPlantEquipmentPolicy: "Cost less depreciation.",
      depreciationMethodPolicy: "Straight line over four years.",
      deferredTaxPolicy: "Deferred tax is not provided.",
      functionalPresentationCurrencyPolicy: "Pounds sterling.",
    });
    expect(await page.locator("#morePolicies textarea").evaluateAll((boxes) => boxes.map((box) => box.id))).toEqual([
      "goingConcernStatement",
      "revenueRecognitionPolicy",
      "tangibleFixedAssetsPolicy",
      "propertyPlantEquipmentPolicy",
      "depreciationMethodPolicy",
      "intangibleAssetsPolicy",
      "impairmentPolicy",
      "inventoriesPolicy",
      "cashCashEquivalentsPolicy",
      "financialInstrumentsPolicy",
      "financialInstrumentsClassificationPolicy",
      "employeeBenefitsPolicy",
      "definedContributionPensionsPolicy",
      "foreignCurrencyTranslationPolicy",
      "functionalPresentationCurrencyPolicy",
      "leasesPolicy",
      "taxPolicy",
      "currentIncomeTaxPolicy",
      "deferredTaxPolicy",
      "dividendPolicy",
    ]);
  });

  test("the controlling party is none by default, can state there is no ultimate party, or can name one", async ({ page }) => {
    await openFormView(page);
    await expect(page.locator("#controllingPartyFields")).toBeHidden();
    expect(await page.evaluate(() => buildAccountsPayload().smallCompany.controllingParty)).toBeUndefined();
    await page.check("#controllingPartyNoUltimate");
    expect(await page.evaluate(() => buildAccountsPayload().smallCompany.controllingParty)).toEqual({ ultimate: false });
    await page.check("#controllingPartyNamed");
    await expect(page.locator("#controllingPartyFields")).toBeVisible();
    await page.fill("#controllingPartyName", "Jo Director");
    expect(await page.evaluate(() => buildAccountsPayload().smallCompany.controllingParty)).toEqual({
      name: "Jo Director",
      ultimate: true,
    });
    await page.uncheck("#controllingPartyUltimate");
    expect(await page.evaluate(() => buildAccountsPayload().smallCompany.controllingParty)).toEqual({
      name: "Jo Director",
      ultimate: false,
    });
  });

  test("the directors' report consistency flag says not applicable, read only, explained and sent nowhere", async ({ page }) => {
    await openFormView(page);
    await expect(page.locator("#directorsReportConsistent")).toHaveValue("Not applicable");
    await expect(page.locator("#directorsReportConsistent")).toHaveJSProperty("readOnly", true);
    await expect(page.locator("#directorsReportConsistent-hint")).toContainText(
      "These accounts are unaudited, so this statement does not apply",
    );
    expect(JSON.stringify(await page.evaluate(() => buildAccountsPayload()))).not.toContain("onsistent");
  });
});

const PUBLIC_DIR = path.join(process.cwd(), "web/public");
const RECEIPT_NAME = "2026-10-24T10:15:00.000Z-00001A.json";
const REVISED_COMPANY = registerCompany("00000003");
const REVISED_COMPANY_OFFICE = {
  addressLine1: `${REVISED_COMPANY.address.premises} ${REVISED_COMPANY.address.street}`,
  cityOrTown: REVISED_COMPANY.address.locality,
  postalCode: REVISED_COMPANY.address.postalCode,
};
const SCREENSHOT_DIR = path.join(process.cwd(), "target/browser-test-results/revised-accounts");
const documentCases = accountsDocumentCases();
const fullCase = documentCases.find((candidate) => candidate.name === "small-company-accounts");
const filletedCase = documentCases.find((candidate) => candidate.name === "small-company-accounts-filleted");
const microCase = documentCases.find((candidate) => candidate.name === "micro-entity-accounts");

function accountsReceipt(document, overrides = {}) {
  return {
    kind: "companies-house-accounts",
    statusCode: "ACCEPT",
    submissionNumber: "00001A",
    companyNumber: "04549236",
    rejections: [],
    filedDocument: document,
    ...overrides,
  };
}

function serveFile(page, pattern, file) {
  return page.route(pattern, (route) =>
    route.fulfill({ status: 200, contentType: "application/javascript", body: fs.readFileSync(path.join(PUBLIC_DIR, file), "utf-8") }),
  );
}

const ACCOUNTANTS_REPORT = { accountantsName: "Jones & Partners", statement: "We compiled these accounts from the company's records." };

function smallDocument({ language = "en", accountantsReport } = {}) {
  return inAccountsLanguage(language, () =>
    buildSmallCompanyAccounts({ ...SMALL_COMPANY_CASE_INPUT, ...(accountantsReport ? { accountantsReport } : {}) }),
  );
}

async function openAmend(
  page,
  receipt,
  { width = 1280, outcome = "ACCEPT", jurisdiction = "england-wales", profileFails = false, welsh = false, offered = true } = {},
) {
  await page.setViewportSize({ width, height: 900 });
  await page.addInitScript(
    ({ receiptBody, outcomeCode, companyJurisdiction, lookupFails, companyName, registeredOffice }) => {
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
      window.getCompanyProfile = async (companyNumber) => {
        if (lookupFails) throw new TypeError("Cannot read properties of undefined (reading 'companyNumber')");
        return {
          companyNumber,
          companyName,
          jurisdiction: companyJurisdiction,
          registeredOffice,
        };
      };
      window.submitMicroEntityAccounts = async (accounts) => {
        window.sentAccounts.push(accounts);
        return { submissionNumber: "00002B", gatewayTimestamp: "2026-11-22T10:00:00Z", pollInterval: 0 };
      };
      window.pollMicroEntityAccounts = async () => ({
        statusCode: outcomeCode,
        submissionNumber: "00002B",
        receiptId: "2026-11-22T10:00:00.000Z-00002B",
        rejections: [],
      });
    },
    {
      receiptBody: receipt,
      outcomeCode: outcome,
      companyJurisdiction: jurisdiction,
      lookupFails: profileFails,
      companyName: REVISED_COMPANY.name,
      registeredOffice: REVISED_COMPANY_OFFICE,
    },
  );
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
        export const isRevisedAccountsOffered = () => ${offered};`,
    }),
  );
  await page.route("**/lib/services/viewer-settings.js", (route) =>
    route.fulfill({ status: 200, contentType: "application/javascript", body: "export const fetchViewer = async () => ({});" }),
  );
  if (welsh) {
    await serveFile(page, "**/lib/welsh-text.js", "lib/welsh-text.js");
    await serveFile(page, "**/widgets/page-chrome.js", "widgets/page-chrome.js");
  }
  const pagePath = welsh ? `cy/${PAGE_PATH}` : PAGE_PATH;
  // The site's own failure message, which the page script gets from the shared dom utilities.
  await serveFile(page, "**/lib/utils/dom-utils.js", "lib/utils/dom-utils.js");
  const html = fs
    .readFileSync(path.join(PUBLIC_DIR, pagePath), "utf-8")
    .replace("</head>", '<script type="module" src="/lib/utils/dom-utils.js"></script></head>');
  await page.route(`http://localhost:3000/${pagePath}**`, (route) => route.fulfill({ status: 200, contentType: "text/html", body: html }));
  await page.goto(`http://localhost:3000/${pagePath}?amend=${encodeURIComponent(RECEIPT_NAME)}`, { waitUntil: "domcontentloaded" });
}

async function screenshot(page, name, width) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}-${width}.png`), fullPage: true });
}

test.describe("File small company accounts page - revising accounts from a receipt", () => {
  for (const width of [1280, 390]) {
    test(`fills full accounts from the document filed and shows the revision section (${width})`, async ({ page }) => {
      await openAmend(page, accountsReceipt(fullCase.xhtml), { width });

      await expect(page.locator("#formView")).toBeVisible();
      await expect(page.locator("#revisionBanner")).toContainText("You are revising the accounts filed at Companies House");
      await expect(page.locator("#revisionSection")).toBeVisible();
      await expect(page.locator("#revisionOriginalDate")).toHaveValue("2026-09-15");
      await expect(page.locator("#formCompanyNumber")).toHaveText("04549236");
      await expect(page.locator("#copyFull")).toBeChecked();
      await expect(page.locator("#currentTurnover")).not.toHaveValue("");
      await expect(page.locator("#currentCalledUpShareCapital")).not.toHaveValue("");
      expect((await page.locator("#revisionCopyNote").innerText()).trim()).toBe(
        "The accounts filed were a full copy. You can file the revision as a full or a filleted copy below.",
      );
      await expect(page.locator("#changeCompanyLink")).toBeHidden();
      await expect(page.locator("[data-feature-status]")).toHaveText(
        "Status: preview. Revised accounts are a preview here: nothing you file reaches the live Companies House register.",
      );
      expect((await page.locator("#formCompanyName").locator("..").innerText()).trim()).toBe(`Company ${REVISED_COMPANY.name} (04549236).`);
      await expect(page.locator("#revisionDownloads")).toBeEmpty();
      await screenshot(page, "small-amend-banner-and-revision-section", width);
    });
  }

  test("says a filleted copy holds no profit and loss account and leaves those lines to the customer", async ({ page }) => {
    await openAmend(page, accountsReceipt(filletedCase.xhtml));
    await expect(page.locator("#revisionSection")).toBeVisible();
    await expect(page.locator("#copyFilleted")).toBeChecked();
    await expect(page.locator("#revisionCopyNote")).toBeVisible();
    const statement = (await page.locator("#revisionCopyNote").innerText()).trim();
    expect(statement).toMatch(/^The accounts filed were a filleted copy, which holds no profit and loss account\./);
    expect(statement).not.toContain("were a full copy");
    await expect(page.locator("#currentTurnover")).toHaveValue("");
    await expect(page.locator("#currentCalledUpShareCapital")).not.toHaveValue("");
    // The filed tax note fills the tax line; with it emptied the profit and loss account holds no figure.
    await expect(page.locator("#currentTax")).not.toHaveValue("");
    await page.fill("#currentTax", "");
    await page.locator("#currentTurnover").dispatchEvent("input");
    await expect(page.locator("#currentProfitAndLossTotals")).toBeHidden();
    await page.fill("#currentTurnover", "50000");
    await page.locator("#currentTurnover").dispatchEvent("input");
    await expect(page.locator("#currentProfitAndLossTotals")).toBeVisible();
    await expect(page.locator("#currentProfitAndLossTotals")).toContainText("Gross profit: 50000");
    await page.fill("#currentTurnover", "");
    await page.locator("#currentTurnover").dispatchEvent("input");
    await screenshot(page, "small-amend-filleted-note", 1280);
    await screenshotAtBothWidths(page, "small-amend-copy-filleted");
  });

  test("keeps the page's own status line where revised accounts are not offered", async ({ page }) => {
    await openAmend(page, accountsReceipt(fullCase.xhtml), { offered: false });
    await expect(page.locator("#statusMessagesContainer .status-error")).toContainText("Revised accounts cannot be filed here yet");
    const statusLine = page.locator("[data-feature-status]");
    await expect(statusLine).toBeVisible();
    await expect(statusLine).toHaveAttribute("data-feature-status", "production");
    await expect(statusLine).toHaveText("Status: production. Accounts you file here reach the live Companies House register.");
  });

  for (const width of [1280, 390]) {
    test(`refuses micro-entity accounts, which revise on the micro-entity page (${width})`, async ({ page }) => {
      await openAmend(page, accountsReceipt(microCase.xhtml, { companyNumber: "00000003" }), { width });
      await expect(page.locator("#statusMessagesContainer .status-error")).toContainText("micro-entity accounts page");
      await expect(page.locator("#statusMessagesContainer .status-message-next")).toHaveAttribute(
        "href",
        `fileMicroEntityAccounts.html?amend=${encodeURIComponent(RECEIPT_NAME)}`,
      );
      await expect(page.locator("#formView")).toBeHidden();
      await screenshot(page, "small-amend-refusal-micro-entity", width);
    });
  }

  test("asks for the original approval date when the filed accounts do not give it, and restores the field after", async ({ page }) => {
    const undated = fullCase.xhtml.replace(
      /<ix:nonNumeric name="core:DateAuthorisationFinancialStatementsForIssue"[^>]*>[^<]*<\/ix:nonNumeric>/,
      "",
    );
    await openAmend(page, accountsReceipt(undated));
    await expect(page.locator("#revisionSection")).toBeVisible();
    await expect(page.locator("#revisionOriginalDate")).toHaveJSProperty("readOnly", false);
    await expect(page.locator("#revisionOriginalDate")).toHaveJSProperty("required", true);
    await page.fill("#revisionNonCompliance", "The original accounts left out the stocks held at the year end.");
    await page.fill("#revisionAmendments", "Stocks are now shown.");
    expect(await page.evaluate(() => reportRevisionProblems())).toBe(true);
    await expect(page.locator("#revisionOriginalDate-error")).toContainText("Enter the date the original accounts were approved");

    await expect(page.locator("#periodStart")).toHaveJSProperty("readOnly", true);
    await page.evaluate(() => startAgain());
    await expect(page.locator("#periodStart")).toHaveJSProperty("readOnly", false);
    await expect(page.locator("[data-feature-status]")).toHaveAttribute("data-feature-status", "production");
    await expect(page.locator("[data-feature-status]")).toContainText("Status: production.");
    await expect(page.locator("#revisionOriginalDate")).toHaveJSProperty("readOnly", true);
    await expect(page.locator("#revisionOriginalDate")).toHaveJSProperty("required", false);
  });

  test("refuses a date approved after today, with the date in the sentence", async ({ page }) => {
    await openAmend(page, accountsReceipt(fullCase.xhtml));
    await expect(page.locator("#revisionSection")).toBeVisible();
    await page.fill("#revisionNonCompliance", "The original accounts left out the stocks held at the year end.");
    await page.fill("#revisionAmendments", "Stocks are now shown.");
    const tomorrow = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await page.fill("#directorDateApproved", tomorrow);
    await page.fill("#accountingPolicies", "The accounts are prepared under the historical cost convention.");
    await page.evaluate(() => document.getElementById("accountsForm").requestSubmit());
    await expect(page.locator(".error-summary")).toContainText(
      `The date approved, ${tomorrow}, is after today. Enter the date the directors approved the accounts.`,
    );
  });

  test("ticks the accountants' report and fills it as the accounts were filed", async ({ page }) => {
    await openAmend(page, accountsReceipt(smallDocument({ accountantsReport: ACCOUNTANTS_REPORT })));
    await expect(page.locator("#formView")).toBeVisible();
    await expect(page.locator("#includeAccountantsReport")).toBeChecked();
    await expect(page.locator("#accountantsName")).toHaveValue(ACCOUNTANTS_REPORT.accountantsName);
    await expect(page.locator("#accountantsStatement")).toHaveValue(ACCOUNTANTS_REPORT.statement);
    await expect(page.locator("#revisionAccountantsNote")).toBeHidden();
    await screenshotAtBothWidths(page, "small-amend-accountants-report");
  });

  for (const filleted of [false, true]) {
    const copy = filleted ? "filleted" : "full";
    test(`opens a ${copy} copy with each note filled as filed and files them unchanged`, async ({ page }) => {
      const notesCase = SMALL_COMPANY_NOTES_CASE_INPUT;
      await openAmend(page, accountsReceipt(buildSmallCompanyAccounts({ ...notesCase, filleted })));
      await expect(page.locator("#revisionSection")).toBeVisible();
      for (const field of ["accountingPolicies", ...SMALL_COMPANY_POLICY_FIELDS.map((policy) => policy.field)]) {
        await expect(page.locator(`#${field}`)).toHaveValue(notesCase[field]);
      }
      await expect(page.locator("#morePolicies")).toHaveAttribute("open", "");
      await expect(page.locator("#controllingPartyNamed")).toBeChecked();
      await expect(page.locator("#controllingPartyName")).toHaveValue("Morgan Holdings Limited");
      await expect(page.locator("#controllingPartyUltimate")).toBeChecked();
      await expect(page.locator("#directorsAdvanceName")).toHaveValue("Alex Jones");
      await expect(page.locator("#directorsAdvanceTerms")).toHaveValue("Interest free & repayable on demand");
      await expect(page.locator("#directorsAdvanceAtStart")).toHaveValue("300");
      await expect(page.locator("#directorsAdvanceMade")).toHaveValue("700");
      await expect(page.locator("#directorsAdvanceRepaid")).toHaveValue("200");
      await expect(page.locator("#includeIntangibleAssetNote")).toBeChecked();
      await expect(page.locator("#intangibleAssetNoteFields")).toBeVisible();
      await expect(page.locator("#intangibleNoteCostAtStart")).toHaveValue("11000");
      await expect(page.locator("#intangibleNoteAmortisationOnDisposals")).toHaveValue("200");
      await expect(page.locator("#revisionNotesNote")).toBeHidden();
      await expect(page.locator("#includeShareCapitalNote")).toBeChecked();
      await expect(page.locator("#shareCapitalClass")).toHaveValue("ordinaryShares");
      await expect(page.locator("#shareCapitalNominalValue")).toHaveValue("1");
      await screenshotAtBothWidths(page, `small-amend-notes-${copy}`);

      if (filleted) {
        for (const [line, value] of Object.entries(notesCase.profitAndLoss.current)) {
          const box = page.locator(`#current${line[0].toUpperCase()}${line.slice(1)}`);
          if ((await box.count()) && (await box.isEditable())) await box.fill(String(value));
        }
      }
      await page.fill("#revisionNonCompliance", "The original accounts left out the stocks held at the year end.");
      await page.fill("#revisionAmendments", "Stocks are now shown.");
      await page.fill("#directorDateApproved", "2026-11-20");
      await page.evaluate(() => {
        document.getElementById("companyAuthCode").value = "ABC123";
        return handleSubmitFiling();
      });
      await expect(page.locator("#filingResult")).toContainText("Companies House accepted the revised accounts.");
      const [sent] = await page.evaluate(() => window.sentAccounts);
      expect(sent.smallCompany.controllingParty).toEqual(notesCase.controllingParty);
      expect(sent.smallCompany.directorsAdvances).toEqual(notesCase.directorsAdvances);
      expect(sent.smallCompany.intangibleAssetNote).toEqual(notesCase.intangibleAssetNote);
      expect(sent.smallCompany.dividendPolicy).toBe(notesCase.dividendPolicy);
      expect(sent.smallCompany.accountingPolicies).toBe(notesCase.accountingPolicies);
      expect(sent.smallCompany.shareCapital).toEqual(notesCase.shareCapital);
    });
  }

  for (const filleted of [false, true]) {
    const copy = filleted ? "filleted" : "full";
    test(`opens a ${copy} copy with every balance sheet line of both years filled and files it with nothing retyped`, async ({ page }) => {
      const input = SMALL_COMPANY_EVERY_LINE_CASE_INPUT;
      await openAmend(page, accountsReceipt(buildSmallCompanyAccounts({ ...input, filleted })));
      await expect(page.locator("#revisionSection")).toBeVisible();
      for (const [year, figures] of Object.entries(input.balanceSheet)) {
        for (const [line, value] of Object.entries(figures)) {
          if (line === "capitalAndReserves") continue;
          await expect(page.locator(`#${year}${line[0].toUpperCase()}${line.slice(1)}`)).toHaveValue(String(value));
        }
      }
      await expect(page.locator("#revisionNotesNote")).toBeHidden();
      await expect(page.locator("#includeShareCapitalNote")).toBeChecked();
      await expect(page.locator("#shareCapitalClass")).toHaveValue("ordinaryShares");
      await expect(page.locator("#shareCapitalNominalValue")).toHaveValue("1");
      if (filleted) {
        for (const [line, value] of Object.entries(input.profitAndLoss.current)) {
          const box = page.locator(`#current${line[0].toUpperCase()}${line.slice(1)}`);
          if ((await box.count()) && (await box.isEditable())) await box.fill(String(value));
        }
      }
      await page.fill("#revisionNonCompliance", "The original accounts left out the stocks held at the year end.");
      await page.fill("#revisionAmendments", "Stocks are now shown.");
      await page.fill("#directorDateApproved", "2026-11-20");
      await page.evaluate(() => {
        document.getElementById("companyAuthCode").value = "ABC123";
        return handleSubmitFiling();
      });
      await expect(page.locator("#filingResult")).toContainText("Companies House accepted the revised accounts.");
      const [sent] = await page.evaluate(() => window.sentAccounts);
      for (const [year, figures] of Object.entries(input.balanceSheet)) {
        const sentYear = sent.smallCompany.balanceSheet[`${year}Year`];
        for (const [line, value] of Object.entries(figures)) expect([year, line, sentYear[line]]).toEqual([year, line, value]);
      }
    });
  }

  test("opens accounts with two directors' advances in two rows and files them unchanged", async ({ page }) => {
    const advances = [
      {
        name: "Alex Jones",
        terms: "Interest free & repayable on demand",
        balanceAtStart: 300,
        advanced: 400,
        repaid: 200,
        balanceAtEnd: 500,
      },
      { name: "Alan James Morgan", terms: "Interest at 2.25% a year", balanceAtStart: 0, advanced: 300, repaid: 0, balanceAtEnd: 300 },
    ];
    await openAmend(
      page,
      accountsReceipt(buildSmallCompanyAccounts({ ...SMALL_COMPANY_EVERY_LINE_CASE_INPUT, directorsAdvances: advances })),
    );
    await expect(page.locator("#revisionSection")).toBeVisible();
    await expect(page.locator(".directors-advance-row")).toHaveCount(2);
    await expect(page.locator("#revisionNotesNote")).toBeHidden();
    await expect(page.locator(".directors-advance-row").nth(1).locator('[data-advance-field="name"]')).toHaveValue("Alan James Morgan");
    await screenshotAtBothWidths(page, "small-amend-two-advances");
    await page.fill("#revisionNonCompliance", "The original accounts left out the stocks held at the year end.");
    await page.fill("#revisionAmendments", "Stocks are now shown.");
    await page.fill("#directorDateApproved", "2026-11-20");
    await page.evaluate(() => {
      document.getElementById("companyAuthCode").value = "ABC123";
      return handleSubmitFiling();
    });
    await expect(page.locator("#filingResult")).toContainText("Companies House accepted the revised accounts.");
    const [sent] = await page.evaluate(() => window.sentAccounts);
    expect(sent.smallCompany.directorsAdvances).toEqual(advances);
  });

  test("names a note whose facts the filed accounts carry and cannot be read back", async ({ page }) => {
    const filed = buildSmallCompanyAccounts(SMALL_COMPANY_NOTES_CASE_INPUT).replace(
      /(<ix:nonNumeric name="core:TaxPolicy"[^>]*>)([^<]*)/,
      "$1<span>$2</span>",
    );
    await openAmend(page, accountsReceipt(filed));
    await expect(page.locator("#revisionSection")).toBeVisible();
    await expect(page.locator("#revisionNotesNote")).toHaveText(
      "The filed accounts carry these notes, which you must enter again: accounting policies.",
    );
  });

  test("opens accounts that state no ultimate controlling party with that choice made, and names no note to enter", async ({ page }) => {
    await openAmend(
      page,
      accountsReceipt(buildSmallCompanyAccounts({ ...SMALL_COMPANY_CASE_INPUT, controllingParty: { ultimate: false } })),
    );
    await expect(page.locator("#revisionSection")).toBeVisible();
    await expect(page.locator("#controllingPartyNoUltimate")).toBeChecked();
    await expect(page.locator("#revisionNotesNote")).toBeHidden();
  });

  test("asks for the accountants' report again when the filed report cannot be read", async ({ page }) => {
    const document = smallDocument({ accountantsReport: ACCOUNTANTS_REPORT }).replace(/bus:NameEntityAccountants/g, "bus:SomethingElse");
    await openAmend(page, accountsReceipt(document));
    await expect(page.locator("#formView")).toBeVisible();
    await expect(page.locator("#revisionAccountantsNote")).toBeVisible();
    await expect(page.locator("#includeAccountantsReport")).not.toBeChecked();
  });

  test("sets the language choice to Welsh for accounts filed in Welsh", async ({ page }) => {
    await openAmend(page, accountsReceipt(smallDocument({ language: "cy" })), { jurisdiction: "wales" });
    await expect(page.locator("#formView")).toBeVisible();
    await expect(page.locator("#documentLanguageCy")).toBeChecked();
  });

  test("shows its own sentence, and no technical message, when the accounts cannot be opened", async ({ page }) => {
    await openAmend(page, accountsReceipt(fullCase.xhtml), { profileFails: true });
    await expect(page.locator("#statusMessagesContainer .status-message-cause")).toHaveText(
      "We could not open those accounts to revise. Open the filing again from your receipts.",
    );
    await expect(page.locator("#statusMessagesContainer .status-message-next")).toHaveAttribute("href", "../hmrc/receipt/receipts.html");
    await expect(page.locator("#formView")).toBeHidden();
    await screenshotAtBothWidths(page, "small-amend-refusal-cannot-open");
  });

  test("the status line ships hidden, so an amend address never paints the page's own status", () => {
    for (const language of ["", "cy/"]) {
      const html = fs.readFileSync(
        path.join(process.cwd(), `web/public/${language}companies-house/fileSmallCompanyAccounts.html`),
        "utf-8",
      );
      expect(html).toMatch(/<p[^>]*\sdata-feature-status="production"[^>]*\shidden\s*>/);
    }
  });

  test("an original filing shows the page's own status line", async ({ page }) => {
    await openFormView(page);
    await expect(page.locator("[data-feature-status]")).toBeVisible();
    await expect(page.locator("[data-feature-status]")).toContainText("Status: production.");
  });

  test("states the revised accounts activity's status on a refusal too", async ({ page }) => {
    await openAmend(page, accountsReceipt(fullCase.xhtml, { statusCode: "REJECT" }));
    await expect(page.locator("#statusMessagesContainer .status-error")).toContainText("did not accept those accounts");
    await expect(page.locator("[data-feature-status]")).toBeVisible();
    await expect(page.locator("[data-feature-status]")).toHaveText(
      "Status: preview. Revised accounts are a preview here: nothing you file reaches the live Companies House register.",
    );
  });

  test("refuses accounts filed with a Company Tax Return", async ({ page }) => {
    await openAmend(page, accountsReceipt(fullCase.xhtml, { jointFilingId: "joint-1" }));
    await expect(page.locator("#statusMessagesContainer .status-error")).toContainText("revise them on the Company Tax Return page");
    await expect(page.locator("#statusMessagesContainer .status-message-next")).toHaveAttribute(
      "href",
      `filings.html?receipt=${encodeURIComponent(RECEIPT_NAME)}`,
    );
    await expect(page.locator("#revisionBanner")).toBeHidden();
    await screenshotAtBothWidths(page, "small-amend-refusal-joint-filing");
  });

  test("asks for both revision texts before the preview", async ({ page }) => {
    await openAmend(page, accountsReceipt(fullCase.xhtml));
    await expect(page.locator("#revisionSection")).toBeVisible();
    await page.fill("#directorDateApproved", "2026-11-20");
    expect(await page.evaluate(() => reportRevisionProblems())).toBe(true);
    await expect(page.locator(".error-summary")).toContainText("Say what was wrong with the original accounts");
    await page.fill("#revisionNonCompliance", "   ");
    await expect(page.locator(".error-summary")).toContainText("Say what was wrong with the original accounts");
    await page.fill("#revisionNonCompliance", "The original accounts left out the stocks held at the year end.");
    await expect(page.locator(".error-summary")).not.toContainText("Say what was wrong with the original accounts");
    await expect(page.locator(".error-summary")).toContainText("Say what the revised accounts change");
    await page.fill("#revisionAmendments", "Stocks are now shown.");
    await expect(page.locator(".error-summary")).toHaveCount(0);
  });

  const registerRefusals = [
    [
      "the company",
      "English",
      "revision-company-not-on-register",
      `Companies House holds no company with the number ${NOT_HELD_COMPANY_NUMBER}, so there are no accounts to revise.`,
    ],
    [
      "the company",
      "Welsh",
      "revision-company-not-on-register",
      `Nid oes gan Dŷ’r Cwmnïau gwmni â’r rhif ${NOT_HELD_COMPANY_NUMBER}, felly nid oes cyfrifon i’w diwygio.`,
    ],
    [
      "accounts for the period",
      "English",
      "revision-period-not-on-register",
      "Companies House holds no accounts for this company made up to 31 March 2026, so there are no accounts for revised accounts to replace.",
    ],
    [
      "accounts for the period",
      "Welsh",
      "revision-period-not-on-register",
      "Nid oes gan Dŷ’r Cwmnïau gyfrifon ar gyfer y cwmni hwn hyd at 31 Mawrth 2026, felly nid oes cyfrifon i gyfrifon diwygiedig gymryd eu lle.",
    ],
  ];
  for (const [missing, language, reason, sentence] of registerRefusals) {
    test(`says in ${language} that the register does not hold ${missing} when the route refuses the filing for that`, async ({ page }) => {
      await openAmend(page, accountsReceipt(fullCase.xhtml), { welsh: language === "Welsh" });
      await serveFile(page, "**/lib/accounts-revision-register.js", "lib/accounts-revision-register.js");
      await expect(page.locator("#revisionSection")).toBeVisible();
      await page.fill("#revisionNonCompliance", "The original accounts left out the stocks held at the year end.");
      await page.fill("#revisionAmendments", "Stocks are now shown, and the profit and loss reserve rises by the same amount.");
      await page.fill("#directorDateApproved", "2026-11-20");
      await page.evaluate(
        ({ refusalReason, notHeldCompanyNumber }) => {
          window.submitMicroEntityAccounts = async () => {
            const error = new Error("the route's English sentence");
            error.status = 400;
            error.reason = refusalReason;
            error.body = { reason: error.reason, companyNumber: notHeldCompanyNumber, periodEnd: "2026-03-31" };
            throw error;
          };
          document.getElementById("companyAuthCode").value = "ABC123";
          return handleSubmitFiling();
        },
        { refusalReason: reason, notHeldCompanyNumber: NOT_HELD_COMPANY_NUMBER },
      );
      await expect(page.locator("#statusMessagesContainer .status-error")).toContainText(sentence);
    });
  }

  for (const width of [1280, 390]) {
    test(`files the revision and names the revised accounts in the result (${width})`, async ({ page }) => {
      await openAmend(page, accountsReceipt(fullCase.xhtml), { width });
      await expect(page.locator("#revisionSection")).toBeVisible();
      await page.fill("#revisionNonCompliance", "The original accounts left out the stocks held at the year end.");
      await page.fill("#revisionAmendments", "Stocks are now shown, and the profit and loss reserve rises by the same amount.");
      await page.fill("#directorDateApproved", "2026-11-20");
      await page.evaluate(() => {
        document.getElementById("companyAuthCode").value = "ABC123";
        return handleSubmitFiling();
      });

      await expect(page.locator("#filingResult")).toContainText("Companies House accepted the revised accounts.");
      const [sent] = await page.evaluate(() => window.sentAccounts);
      expect(sent.revision).toEqual({
        originalDateOfApproval: "2026-09-15",
        nonCompliance: "The original accounts left out the stocks held at the year end.",
        amendments: "Stocks are now shown, and the profit and loss reserve rises by the same amount.",
        revisesReceipt: RECEIPT_NAME,
      });
      expect(sent.smallCompany.filleted).toBe(false);
      await screenshot(page, "small-amend-result-accepted", width);
    });
  }
});
