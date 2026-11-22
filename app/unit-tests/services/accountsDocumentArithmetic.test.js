// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/services/accountsDocumentArithmetic.test.js
// Every sample and case accounts document this repository builds holds its own arithmetic: each
// balance sheet adds up in both years, capital and reserves equal the classes under them, the profit
// and loss reserve moves by the profit for the year, and the fixed asset note agrees with the balance
// sheet and with the depreciation in the profit and loss account.

import { readFileSync } from "node:fs";
import { describe, test, expect } from "vitest";
import { readIxbrl } from "@diy-accounting-uk/diya-gl/dist/app/lib/ixbrl-reader.js";
import { accountsDocumentCases, SMALL_COMPANY_BANK_LINES_CASE_INPUT } from "@app/test-helpers/accountsDocumentCases.js";
import { buildSmallCompanyAccounts } from "@app/services/smallCompanyAccountsIxbrl.js";
import { buildAccountsIxbrl, extractAndValidateAccountsParameters } from "@app/functions/companies-house/companiesHouseAccountsPost.js";
import { validationSamples } from "../../../scripts/validate-accounts-ixbrl.js";

// eslint-disable-next-line sonarjs/no-clear-text-protocols -- taxonomy namespace, not a fetch
const CORE_NAMESPACE = "http://xbrl.frc.org.uk/fr/2026-01-01/core";
const CORE = `${CORE_NAMESPACE}#`;
const MATURITY = `${CORE}MaturitiesOrExpirationPeriodsDimension`;
const EQUITY_CLASS = `${CORE}EquityClassesDimension`;
const WITHIN_ONE_YEAR = { [MATURITY]: `${CORE}WithinOneYear` };
const AFTER_ONE_YEAR = { [MATURITY]: `${CORE}AfterOneYear` };
const PROFIT_AND_LOSS_RESERVE = { [EQUITY_CLASS]: `${CORE}RetainedEarningsAccumulatedLosses` };
const CURRENT_ASSET_LINES = ["TotalInventories", "Debtors", "CashBankOnHand"];
const CASE_ONLY_FIELDS = ["name", "type", "govTestScenario", "expectedOutcome"];

function testServiceDocuments() {
  return JSON.parse(readFileSync("scripts/fixtures/companies-house-test-service-cases.json", "utf8"))
    .filter((testCase) => testCase.type === "accounts")
    .map((testCase) => {
      const { name } = testCase;
      const requestBody = Object.fromEntries(Object.entries(testCase).filter(([key]) => !CASE_ONLY_FIELDS.includes(key)));
      const errors = [];
      const accounts = extractAndValidateAccountsParameters({ body: JSON.stringify(requestBody) }, errors);
      if (errors.length > 0) throw new Error(`${name}: ${errors.join("; ")}`);
      return [`test-service ${name}`, buildAccountsIxbrl(accounts)];
    });
}

const DOCUMENTS = [
  ...validationSamples().map(([label, xhtml]) => [`validation sample ${label}`, xhtml]),
  ...testServiceDocuments(),
  ...accountsDocumentCases().map(({ name, xhtml }) => [`document case ${name}`, xhtml]),
  ["document case small-company-accounts-bank-lines", buildSmallCompanyAccounts(SMALL_COMPANY_BANK_LINES_CASE_INPUT)],
];

function sameDimensions(fact, dimensions) {
  const keys = Object.keys(fact.dimensions);
  return keys.length === Object.keys(dimensions).length && keys.every((key) => fact.dimensions[key] === dimensions[key]);
}

// The numeric facts of a document, read by concept, date and dimensions.
function factsOf(xhtml) {
  const numeric = readIxbrl(xhtml).facts.filter((fact) => fact.namespace === CORE_NAMESPACE && typeof fact.value === "number");
  const atDate = (fact) => fact.period.instant ?? fact.period.endDate;
  return {
    value(localName, date, dimensions = {}) {
      return numeric.find((fact) => fact.localName === localName && atDate(fact) === date && sameDimensions(fact, dimensions))?.value;
    },
    classes(localName, date, dimension) {
      return numeric.filter(
        (fact) => fact.localName === localName && atDate(fact) === date && Object.keys(fact.dimensions).join() === dimension,
      );
    },
    linesWithin(date) {
      return numeric.filter(
        (fact) => fact.localName !== "Creditors" && atDate(fact) === date && fact.dimensions[MATURITY] === WITHIN_ONE_YEAR[MATURITY],
      );
    },
    balanceSheetDates() {
      return [...new Set(numeric.filter((fact) => fact.localName === "NetAssetsLiabilities").map((fact) => fact.period.instant))]
        .sort()
        .reverse();
    },
  };
}

// The arithmetic a document breaks, one line per break; an empty list when it holds.
function arithmeticProblems(xhtml) {
  const facts = factsOf(xhtml);
  const problems = [];
  const expectEqual = (what, actual, expected) => {
    if (actual !== expected) problems.push(`${what}: ${actual} where the lines give ${expected}`);
  };
  const dates = facts.balanceSheetDates();
  for (const date of dates) {
    const at = (localName, dimensions) => facts.value(localName, date, dimensions) ?? 0;
    const lines = CURRENT_ASSET_LINES.filter((line) => facts.value(line, date) !== undefined);
    if (lines.length > 0) {
      expectEqual(
        `current assets at ${date}`,
        at("CurrentAssets"),
        lines.reduce((sum, line) => sum + at(line), 0),
      );
    }
    const creditorLines = facts.linesWithin(date);
    if (creditorLines.length > 0) {
      expectEqual(
        `creditors due within one year at ${date}`,
        at("Creditors", WITHIN_ONE_YEAR),
        creditorLines.reduce((sum, fact) => sum + fact.value, 0),
      );
    }
    expectEqual(`net current assets at ${date}`, at("NetCurrentAssetsLiabilities"), at("CurrentAssets") - at("Creditors", WITHIN_ONE_YEAR));
    expectEqual(
      `total assets less current liabilities at ${date}`,
      at("TotalAssetsLessCurrentLiabilities"),
      at("FixedAssets") + at("NetCurrentAssetsLiabilities"),
    );
    expectEqual(
      `net assets at ${date}`,
      at("NetAssetsLiabilities"),
      at("TotalAssetsLessCurrentLiabilities") - at("Creditors", AFTER_ONE_YEAR),
    );
    expectEqual(`capital and reserves at ${date}`, at("Equity"), at("NetAssetsLiabilities"));
    const equityClasses = facts.classes("Equity", date, EQUITY_CLASS);
    expectEqual(
      `capital and reserves at ${date}, by class`,
      at("Equity"),
      equityClasses.reduce((sum, fact) => sum + fact.value, 0),
    );
    const noteBookValue = facts.value("PropertyPlantEquipment", date);
    if (noteBookValue !== undefined) expectEqual(`fixed asset note's net book value at ${date}`, at("FixedAssets"), noteBookValue);
  }
  if (dates.length === 2) {
    const [end, start] = dates;
    const profit = facts.value("ProfitLoss", end);
    if (profit !== undefined) {
      expectEqual(
        `profit and loss reserve's movement to ${end}`,
        facts.value("Equity", end, PROFIT_AND_LOSS_RESERVE) - facts.value("Equity", start, PROFIT_AND_LOSS_RESERVE),
        profit,
      );
    }
    const costAtStart = facts.value("PropertyPlantEquipmentGrossCost", start);
    if (costAtStart !== undefined) {
      const charge = facts.value("IncreaseFromDepreciationChargeForYearPropertyPlantEquipment", end);
      expectEqual(
        `fixed asset cost at ${end}`,
        facts.value("PropertyPlantEquipmentGrossCost", end),
        costAtStart +
          facts.value("AdditionsOtherThanThroughBusinessCombinationsPropertyPlantEquipment", end) -
          facts.value("DisposalsPropertyPlantEquipment", end),
      );
      expectEqual(
        `accumulated depreciation at ${end}`,
        facts.value("AccumulatedDepreciationImpairmentPropertyPlantEquipment", end),
        facts.value("AccumulatedDepreciationImpairmentPropertyPlantEquipment", start) +
          charge -
          facts.value("DisposalsDecreaseInDepreciationImpairmentPropertyPlantEquipment", end),
      );
      for (const date of dates) {
        expectEqual(
          `fixed asset note's net book value at ${date}, from cost and depreciation`,
          facts.value("PropertyPlantEquipment", date),
          facts.value("PropertyPlantEquipmentGrossCost", date) -
            facts.value("AccumulatedDepreciationImpairmentPropertyPlantEquipment", date),
        );
      }
      const chargeInProfitAndLoss = facts.value("DepreciationAmortisationImpairmentExpense", end);
      if (chargeInProfitAndLoss !== undefined)
        expectEqual(`depreciation in the profit and loss account to ${end}`, chargeInProfitAndLoss, charge);
    }
  }
  return problems;
}

describe("the arithmetic of every accounts document this repository builds", () => {
  test("covers the validation samples, the test-service accounts cases and the document cases", () => {
    expect(DOCUMENTS.filter(([name]) => name.startsWith("validation sample"))).toHaveLength(9);
    expect(DOCUMENTS.filter(([name]) => name.startsWith("test-service"))).toHaveLength(8);
    expect(DOCUMENTS.filter(([name]) => name.startsWith("document case")).length).toBeGreaterThan(3);
  });

  test.each(DOCUMENTS)("%s adds up", (_name, xhtml) => {
    // First accounts have no preceding year, so they state one balance sheet.
    const firstAccounts = xhtml.includes("bus:DateFormationOrIncorporation");
    expect(factsOf(xhtml).balanceSheetDates()).toHaveLength(firstAccounts ? 1 : 2);
    expect(arithmeticProblems(xhtml)).toEqual([]);
  });
});
