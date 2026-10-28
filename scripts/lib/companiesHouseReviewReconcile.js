// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/lib/companiesHouseReviewReconcile.js
// Reconciles one accounts case's input against the document we filed: every input field against
// its tagged value and its visible text, and every total recomputed from the tagged figures.
// Pure functions over the case input, the tagged facts and the visible text of the rendered page.

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// Input field -> [concept, context suffix]. The context of a balance sheet fact is e<year> + suffix.
const BALANCE_SHEET = {
  fixedAssets: ["FixedAssets", ""],
  currentAssets: ["CurrentAssets", ""],
  creditorsWithinOneYear: ["Creditors", "-within-one-year"],
  creditorsAfterOneYear: ["Creditors", "-after-one-year"],
  calledUpShareCapital: ["Equity", "-share-capital"],
  profitAndLossAccount: ["Equity", "-profit-and-loss-account"],
  capitalAndReserves: ["Equity", ""],
  stocks: ["TotalInventories", ""],
  debtors: ["Debtors", ""],
  tradeDebtors: ["TradeDebtorsTradeReceivables", ""],
  otherDebtors: ["OtherDebtors", ""],
  prepayments: ["PrepaymentsAccruedIncome", ""],
  amountsOwedToDirectors: ["AmountsOwedToDirectors", "-after-one-year"],
  amountsOwedToGroupUndertakings: ["AmountsOwedToGroupUndertakings", "-after-one-year"],
  cashAtBank: ["CashBankOnHand", ""],
  tradeCreditors: ["TradeCreditorsTradePayables", "-within-one-year"],
  corporationTax: ["CorporationTaxPayable", "-within-one-year"],
  otherCreditors: ["OtherCreditors", "-within-one-year"],
  bankLoansOverdrafts: ["BankBorrowingsOverdrafts", "-within-one-year"],
  taxationSocialSecurity: ["TaxationSocialSecurityPayable", "-within-one-year"],
  accruals: ["AccruedLiabilities", "-accruals"],
  bankLoansAfterOneYear: ["BankBorrowingsOverdrafts", "-after-one-year"],
  calledUpShareCapitalNotPaid: ["CalledUpShareCapitalNotPaidNotExpressedAsCurrentAsset", ""],
  prepaymentsAccruedIncome: ["PrepaymentsAccruedIncomeNotExpressedWithinCurrentAssetSubtotal", ""],
  provisionsForLiabilities: ["ProvisionsForLiabilitiesBalanceSheetSubtotal", ""],
  accrualsDeferredIncome: ["AccruedLiabilitiesNotExpressedWithinCreditorsSubtotal", ""],
};
const NOT_PAID = BALANCE_SHEET.calledUpShareCapitalNotPaid[0];
const PREPAYMENTS = BALANCE_SHEET.prepaymentsAccruedIncome[0];
const PROVISIONS = BALANCE_SHEET.provisionsForLiabilities[0];
const ACCRUALS_DEFERRED = BALANCE_SHEET.accrualsDeferredIncome[0];
// Lines checked only when the input carries a figure for them.
const OPTIONAL_BALANCE_SHEET_LINES = new Set([
  "bankLoansOverdrafts",
  "taxationSocialSecurity",
  "accruals",
  "bankLoansAfterOneYear",
  "calledUpShareCapitalNotPaid",
  "prepaymentsAccruedIncome",
  "provisionsForLiabilities",
  "accrualsDeferredIncome",
]);
// Small company lines that split debtors and creditors after one year, checked only when the input carries a figure.
const SMALL_SPLIT_LINES = new Set([
  "tradeDebtors",
  "otherDebtors",
  "prepayments",
  "amountsOwedToDirectors",
  "amountsOwedToGroupUndertakings",
]);
// Policy input field -> concept, all on the current period context.
const POLICIES = {
  goingConcernStatement: "DescriptionGoing-concernStatus",
  revenueRecognitionPolicy: "RevenueRecognitionPolicy",
  tangibleFixedAssetsPolicy: "DescriptionMeasurementBasisForPropertyPlantEquipment",
  impairmentPolicy: "ImpairmentNon-financialAssetsPolicy",
  financialInstrumentsPolicy: "FinancialInstrumentsRecognitionMeasurementPolicy",
  taxPolicy: "TaxPolicy",
  currentIncomeTaxPolicy: "CurrentIncomeTaxPolicy",
  dividendPolicy: "DividendPolicy",
};
const PROFIT_AND_LOSS = {
  turnover: "TurnoverRevenue",
  costOfSales: "CostSales",
  grossProfit: "GrossProfitLoss",
  administrativeExpenses: "AdministrativeExpenses",
  operatingProfit: "OperatingProfitLoss",
  interestReceivable: "OtherInterestReceivableSimilarIncomeFinanceIncome",
  profitBeforeTax: "ProfitLossOnOrdinaryActivitiesBeforeTax",
  tax: "TaxTaxCreditOnProfitOrLossOnOrdinaryActivities",
  profit: "ProfitLoss",
};
// Fixed asset note field -> [concept, context kind (e = balance sheet date, y = the period), year offset].
const FIXED_ASSET_NOTE = {
  costAtStart: ["PropertyPlantEquipmentGrossCost", "e", -1],
  additions: ["AdditionsOtherThanThroughBusinessCombinationsPropertyPlantEquipment", "y", 0],
  disposals: ["DisposalsPropertyPlantEquipment", "y", 0],
  depreciationAtStart: ["AccumulatedDepreciationImpairmentPropertyPlantEquipment", "e", -1],
  depreciationCharge: ["IncreaseFromDepreciationChargeForYearPropertyPlantEquipment", "y", 0],
  depreciationOnDisposals: ["DisposalsDecreaseInDepreciationImpairmentPropertyPlantEquipment", "y", 0],
};

// "1,234" -> 1234, "(5)" -> -5, "-" -> 0, "" or text -> null.
export function parseFigure(text) {
  let trimmed = (text ?? "").trim().replaceAll(",", "").replaceAll("£", "");
  const negative = trimmed.startsWith("(") && trimmed.endsWith(")");
  trimmed = trimmed.replace(/^\(+|\)+$/g, "");
  if (trimmed === "-" || trimmed === "–" || trimmed === "") return trimmed ? 0 : null;
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return negative ? -value : value;
}

export function longDate(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

export function formatFigure(value) {
  return typeof value === "number" && Number.isInteger(value) ? value.toLocaleString("en-GB") : String(value);
}

const REGISTERED_OFFICE_TAGS = [
  ["addressLine1", "AddressLine1"],
  ["addressLine2", "AddressLine2"],
  ["addressLine3", "AddressLine3"],
  ["cityOrTown", "PrincipalLocation-CityOrTown"],
  ["countyRegion", "CountyRegion"],
  ["postalCode", "PostalCodeZip"],
];

export function reconcile(input, ours) {
  const { facts, visibleText: visible } = ours;
  const year = Number(input.periodEnd.slice(0, 4));
  const current = String(year);
  const prior = String(year - 1);
  const find = (concept, context) => facts.find((fact) => fact.concept === concept && fact.context === context) ?? null;
  const valueOf = (concept, context) => {
    const fact = find(concept, context);
    return fact ? parseFigure(fact.text) : null;
  };

  const rows = [];
  const check = (field, value, concept, context, isNumber = true, hidden = false) => {
    const fact = find(concept, context);
    const tagged = fact ? fact.text : null;
    let ok;
    let shown;
    if (isNumber) {
      ok = fact !== null && parseFigure(tagged) !== null && Math.abs(parseFigure(tagged)) === Math.abs(Number(value));
      shown = value !== 0 ? visible.includes(formatFigure(value)) : true;
    } else {
      ok = fact !== null && tagged.trim() === String(value).trim();
      shown = hidden || visible.includes(String(value));
    }
    rows.push({
      field,
      input: isNumber ? formatFigure(value) : value,
      taggedAs: `${concept} @ ${context}`,
      tagged: tagged ?? "not tagged",
      shown: shown ? "yes" : "no",
      result: ok && shown ? "match" : ok ? "match (tag); not found as text" : "MISMATCH",
    });
  };

  check("companyNumber", input.companyNumber, "UKCompaniesHouseRegisteredNumber", `y${current}`, false);
  check("companyName", input.companyName, "EntityCurrentLegalOrRegisteredName", `y${current}`, false);
  check("periodStart", longDate(input.periodStart), "StartDateForPeriodCoveredByReport", `p${current}`, false);
  check("periodEnd", longDate(input.periodEnd), "EndDateForPeriodCoveredByReport", `e${current}`, false);
  check("averageEmployees", input.averageEmployees, "AverageNumberEmployeesDuringPeriod", `y${current}`);
  check("director.name", input.director.name, "NameEntityOfficer", `y${current}-director-1`, false);
  check(
    "director.dateApproved",
    longDate(input.director.dateApproved),
    "DateAuthorisationFinancialStatementsForIssue",
    `e${current}`,
    false,
  );

  for (const [field, concept] of REGISTERED_OFFICE_TAGS) {
    if (input.registeredOffice?.[field])
      check(`registeredOffice.${field}`, input.registeredOffice[field], concept, `y${current}-registered-office`, false);
  }

  if (input.accountantsReport) {
    check("accountantsReport.accountantsName", input.accountantsReport.accountantsName, "NameEntityAccountants", `y${current}`, false);
    check("accountantsReport.statement", input.accountantsReport.statement, "StatementOnScopeAccountantsReport", `y${current}`, false);
  }

  const small = input.smallCompany;
  const balanceSheet = small ? small.balanceSheet : input.balanceSheet;
  for (const [yearKey, y] of [
    ["currentYear", current],
    ["priorYear", prior],
  ]) {
    for (const [key, value] of Object.entries(balanceSheet[yearKey])) {
      if (key in BALANCE_SHEET && (value !== 0 || !(OPTIONAL_BALANCE_SHEET_LINES.has(key) || SMALL_SPLIT_LINES.has(key)))) {
        const [concept, suffix] = BALANCE_SHEET[key];
        check(`balanceSheet.${yearKey}.${key}`, value, concept, `e${y}${suffix}`);
      }
    }
  }
  if (small) {
    for (const [field, concept] of Object.entries(POLICIES)) {
      if (small[field]) check(`smallCompany.${field}`, small[field], concept, `y${current}`, false);
    }
    if (small.controllingParty) {
      const context = `y${current}-controlling-party-1`;
      check(
        "smallCompany.controllingParty.ultimate",
        String(small.controllingParty.ultimate),
        "ControllingPartyUltimateControllingPartyTruefalse",
        context,
        false,
        true,
      );
      if (small.controllingParty.name)
        check("smallCompany.controllingParty.name", small.controllingParty.name, "NameControllingParty", context, false);
    }
    if (small.principalActivity) {
      check("smallCompany.principalActivity", small.principalActivity, "DescriptionPrincipalActivities", `y${current}`, false);
    }
    for (const [yearKey, y] of [
      ["currentYear", current],
      ["priorYear", prior],
    ]) {
      const tax = small.profitAndLoss[yearKey]?.tax;
      if (tax) check(`smallCompany.currentTax.${yearKey}`, tax, "CurrentTaxForPeriod", `y${y}-uk-tax`);
    }
    if (!small.filleted) {
      for (const [yearKey, y] of [
        ["currentYear", current],
        ["priorYear", prior],
      ]) {
        for (const [key, value] of Object.entries(small.profitAndLoss[yearKey])) {
          if (key in PROFIT_AND_LOSS) check(`profitAndLoss.${yearKey}.${key}`, value, PROFIT_AND_LOSS[key], `y${y}`);
        }
      }
    }
    for (const [assetClass, note] of Object.entries(small.fixedAssetNote ?? {})) {
      for (const [key, value] of Object.entries(note)) {
        const [concept, kind, offset] = FIXED_ASSET_NOTE[key];
        check(`fixedAssetNote.${assetClass}.${key}`, value, concept, `${kind}${year + offset}-ppe-${assetClass}`);
      }
    }
  }

  const totals = [];
  const add = (label, rule, tagged, recomputed) => {
    const ok = tagged !== null && recomputed !== null && Math.abs(tagged - recomputed) < 0.5;
    totals.push({
      label,
      rule,
      tagged: tagged !== null ? formatFigure(tagged) : "—",
      recomputed: recomputed !== null ? formatFigure(recomputed) : "—",
      result: ok ? "match" : "MISMATCH",
    });
  };
  const sum = (...values) => values.reduce((total, value) => total + (value || 0), 0);
  for (const y of [current, prior]) {
    const currentAssets = valueOf("CurrentAssets", `e${y}`);
    if (small) {
      add(
        `Current assets ${y}`,
        "stocks + debtors + cash",
        currentAssets,
        sum(valueOf("TotalInventories", `e${y}`), valueOf("Debtors", `e${y}`), valueOf("CashBankOnHand", `e${y}`)),
      );
      const debtorsSplit = ["TradeDebtorsTradeReceivables", "OtherDebtors", "PrepaymentsAccruedIncome"].map((concept) =>
        valueOf(concept, `e${y}`),
      );
      if (debtorsSplit.some((value) => value)) {
        add(`Debtors ${y}`, "trade debtors + other debtors + prepayments", valueOf("Debtors", `e${y}`), sum(...debtorsSplit));
      }
      add(
        `Creditors within one year ${y}`,
        "bank loans and overdrafts + trade + corporation tax + taxation and social security + other + accruals",
        valueOf("Creditors", `e${y}-within-one-year`),
        sum(
          valueOf("BankBorrowingsOverdrafts", `e${y}-within-one-year`),
          valueOf("TradeCreditorsTradePayables", `e${y}-within-one-year`),
          valueOf("CorporationTaxPayable", `e${y}-within-one-year`),
          valueOf("TaxationSocialSecurityPayable", `e${y}-within-one-year`),
          valueOf("OtherCreditors", `e${y}-within-one-year`),
          valueOf("AccruedLiabilities", `e${y}-accruals`),
        ),
      );
    }
    const within = valueOf("Creditors", `e${y}-within-one-year`) || 0;
    add(
      `Net current assets ${y}`,
      "current assets + prepayments and accrued income − creditors within one year",
      valueOf("NetCurrentAssetsLiabilities", `e${y}`),
      (currentAssets || 0) + (valueOf(PREPAYMENTS, `e${y}`) || 0) - within,
    );
    add(
      `Total assets less current liabilities ${y}`,
      "called up share capital not paid + fixed assets + net current assets",
      valueOf("TotalAssetsLessCurrentLiabilities", `e${y}`),
      sum(valueOf(NOT_PAID, `e${y}`), valueOf("FixedAssets", `e${y}`), valueOf("NetCurrentAssetsLiabilities", `e${y}`)),
    );
    add(
      `Net assets ${y}`,
      "total assets less current liabilities − creditors after one year − provisions − accruals and deferred income",
      valueOf("NetAssetsLiabilities", `e${y}`),
      (valueOf("TotalAssetsLessCurrentLiabilities", `e${y}`) || 0) -
        (valueOf("Creditors", `e${y}-after-one-year`) || 0) -
        (valueOf(PROVISIONS, `e${y}`) || 0) -
        (valueOf(ACCRUALS_DEFERRED, `e${y}`) || 0),
    );
    add(
      `Capital and reserves ${y}`,
      "share capital + profit and loss account",
      valueOf("Equity", `e${y}`),
      sum(valueOf("Equity", `e${y}-share-capital`), valueOf("Equity", `e${y}-profit-and-loss-account`)),
    );
    add(
      `Balance sheet balances ${y}`,
      "net assets = capital and reserves",
      valueOf("NetAssetsLiabilities", `e${y}`),
      valueOf("Equity", `e${y}`),
    );
    if (small && !small.filleted) {
      const turnover = valueOf("TurnoverRevenue", `y${y}`);
      const costOfSales = valueOf("CostSales", `y${y}`);
      add(
        `Gross profit ${y}`,
        "turnover − cost of sales",
        valueOf("GrossProfitLoss", `y${y}`),
        (turnover || 0) - Math.abs(costOfSales || 0),
      );
      add(
        `Operating profit ${y}`,
        "gross profit − administrative expenses",
        valueOf("OperatingProfitLoss", `y${y}`),
        (valueOf("GrossProfitLoss", `y${y}`) || 0) - Math.abs(valueOf("AdministrativeExpenses", `y${y}`) || 0),
      );
      add(
        `Profit before tax ${y}`,
        "operating profit + interest receivable",
        valueOf("ProfitLossOnOrdinaryActivitiesBeforeTax", `y${y}`),
        sum(valueOf("OperatingProfitLoss", `y${y}`), valueOf("OtherInterestReceivableSimilarIncomeFinanceIncome", `y${y}`)),
      );
      add(
        `Profit for the year ${y}`,
        "profit before tax − tax",
        valueOf("ProfitLoss", `y${y}`),
        (valueOf("ProfitLossOnOrdinaryActivitiesBeforeTax", `y${y}`) || 0) -
          Math.abs(valueOf("TaxTaxCreditOnProfitOrLossOnOrdinaryActivities", `y${y}`) || 0),
      );
    }
  }
  if (small?.fixedAssetNote) {
    for (const assetClass of Object.keys(small.fixedAssetNote)) {
      const context = (kind, y) => `${kind}${y}-ppe-${assetClass}`;
      const concept = (key) => FIXED_ASSET_NOTE[key][0];
      add(
        `${assetClass}: cost at ${current} end`,
        "cost at start + additions − disposals",
        valueOf("PropertyPlantEquipmentGrossCost", context("e", current)),
        (valueOf("PropertyPlantEquipmentGrossCost", context("e", prior)) || 0) +
          (valueOf(concept("additions"), context("y", current)) || 0) -
          (valueOf(concept("disposals"), context("y", current)) || 0),
      );
      add(
        `${assetClass}: depreciation at ${current} end`,
        "at start + charge − on disposals",
        valueOf(concept("depreciationAtStart"), context("e", current)),
        (valueOf(concept("depreciationAtStart"), context("e", prior)) || 0) +
          (valueOf(concept("depreciationCharge"), context("y", current)) || 0) -
          (valueOf(concept("depreciationOnDisposals"), context("y", current)) || 0),
      );
      add(
        `${assetClass}: net book value ${current}`,
        "cost − depreciation",
        valueOf("PropertyPlantEquipment", context("e", current)),
        (valueOf("PropertyPlantEquipmentGrossCost", context("e", current)) || 0) -
          (valueOf(concept("depreciationAtStart"), context("e", current)) || 0),
      );
    }
    add(
      `Fixed assets ${current}`,
      "total net book value of the classes = balance sheet fixed assets",
      valueOf("FixedAssets", `e${current}`),
      valueOf("PropertyPlantEquipment", `e${current}`),
    );
  }

  const mismatches = rows.filter((row) => row.result === "MISMATCH").length + totals.filter((total) => total.result === "MISMATCH").length;
  return { rows, totals, mismatches };
}

export function reconciliationMarkdown(directory, input, reconciliation, fixturePath, fixtureLine) {
  const lines = [
    `# ${directory}: our input against our output`,
    "",
    `Input: \`source/case-input.json\` (case \`${input.name}\`, \`${fixturePath}\` line ${fixtureLine}). ` +
      "Output: the facts tagged in `filed.xhtml` (`facts.json`) and the text a reader sees in `rendered.png` (`visible-text.txt`).",
    "",
    "| Input field | Input | Tagged as | Tagged value | Shown as text | Result |",
    "|---|---|---|---|---|---|",
    ...reconciliation.rows.map((r) => `| ${r.field} | ${r.input} | ${r.taggedAs} | ${r.tagged} | ${r.shown} | ${r.result} |`),
    "",
    "## The totals, recomputed from the tagged figures",
    "",
    "| Total | Rule | Tagged | Recomputed | Result |",
    "|---|---|---|---|---|",
    ...reconciliation.totals.map((t) => `| ${t.label} | ${t.rule} | ${t.tagged} | ${t.recomputed} | ${t.result} |`),
    "",
    `${reconciliation.rows.length} input fields and ${reconciliation.totals.length} totals checked; ${reconciliation.mismatches} mismatches.`,
  ];
  return `${lines.join("\n")}\n`;
}
