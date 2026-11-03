// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/ct600Figures.js
// The CT600 (2026) Version 3 boxes and the computation lines, worked from one object of figures.
// The module has no fs and no Buffer, so it runs in the browser (through the books bundle) for
// live checks and on the server for the preview and the submit, and both charge the same rates.
//
// Box 705 and the annual investment allowance. HMRC's Company Tax Return guide, section
// "Information about capital allowances and balancing charges or disposal values"
// (https://www.gov.uk/guidance/the-company-tax-return-guide), says:
//   Box 690: "Enter the amount of Annual Investment Allowance included in the calculation of
//   trading profits or losses."
//   Box 705: "Enter the total allowances including any Annual Investment Allowance claimed, in
//   respect of the main pool in box 705."
// So box 705 holds the main pool's writing down allowances plus the annual investment allowance
// claimed on the main pool, and box 690 repeats the annual investment allowance. The computation's
// total capital allowances is box 705 less the balancing charges in box 710. HMRC's validation
// rules put no limit on box 705 against box 690, so the transaction engine accepts either way and
// the guide decides.

import {
  apportionCorporationTax,
  financialYearNumber,
  financialYearRatesFor,
  financialYearsInPeriod,
} from "@diy-accounting-uk/diya-gl/dist/app/lib/tax/corporation-tax.js";

export const EARLIEST_PERIOD_START = "2015-04-01";
export const WORKING_SHEET_TOLERANCE_POUNDS = 5;

const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
const DAY_MS = 86_400_000;

export class Ct600RefusedError extends Error {
  constructor(message, field) {
    super(message);
    this.name = "Ct600RefusedError";
    this.field = field;
  }
}

function isoFromSerial(serial) {
  return new Date(EXCEL_EPOCH_MS + serial * DAY_MS).toISOString().slice(0, 10);
}

function utcDate(isoDate) {
  return new Date(`${isoDate}T00:00:00Z`);
}

function isIsoDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && utcDate(value).toISOString().slice(0, 10) === value;
}

function lastDayOfTwelveMonths(isoStart) {
  const date = utcDate(isoStart);
  date.setUTCFullYear(date.getUTCFullYear() + 1);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function toPence(pounds) {
  return Math.round(pounds * 100);
}

function fromPence(pence) {
  return pence / 100;
}

function wholePounds(value) {
  return Math.round(value || 0);
}

// How each computation line moves the profit per accounts: -1 takes from it, 1 adds to it.
const COMPUTATION_ADJUSTMENTS = [
  ["nonTradingLoanRelationshipCredits", -1],
  ["depreciation", 1],
  ["amortisation", 1],
  ["entertaining", 1],
  ["donations", 1],
];

// The figures fields that hold whole pounds and no less than zero, with the label a message uses.
const WHOLE_POUND_FIELDS = [
  ["nonTradingLoanRelationshipCredits", "Non-trading loan relationship credits (bank interest)"],
  ["depreciation", "Depreciation added back"],
  ["amortisation", "Amortisation added back"],
  ["entertaining", "Entertaining added back"],
  ["donations", "Donations added back"],
  ["annualInvestmentAllowance", "Annual investment allowance (box 690)"],
  ["mainPoolAllowances", "Main pool writing down allowances, without the annual investment allowance"],
  ["mainPoolBalancingCharges", "Main pool balancing charges (box 710)"],
  ["fullExpensingAllowances", "Full expensing allowances (box 688)"],
  ["fullExpensingBalancingCharges", "Full expensing balancing charges (box 689)"],
  ["specialRateAllowances", "Special rate allowances (box 693)"],
  ["specialRateBalancingCharges", "Special rate allowance balancing charges (box 694)"],
  ["specialRatePoolAllowances", "Special rate pool writing down allowances, without the annual investment allowance (box 695)"],
  ["specialRatePoolAnnualInvestmentAllowance", "Annual investment allowance claimed on the special rate pool"],
  ["specialRatePoolBalancingCharges", "Special rate pool balancing charges (box 700)"],
  ["annualInvestmentAllowanceOutsideTrade", "Annual investment allowance outside the calculation of trading profits (box 735)"],
  ["firstYearAllowanceExpenditure", "Machinery and plant on which first year allowance is claimed (box 760)"],
  ["specialRateAllowanceExpenditure", "Machinery and plant - special rate allowance, qualifying expenditure (box 773)"],
  ["otherMachineryAndPlantExpenditure", "Other machinery and plant (box 775)"],
  ["lossesBroughtForward", "Trading losses brought forward (box 160)"],
  ["lossAgainstTotalProfits", "Trading loss of this period set against this period's total profits (box 275)"],
  ["lossesBroughtForwardAgainstTotalProfits", "Trading losses brought forward claimed against total profits (box 285)"],
  ["lossCarriedBack", "Trading loss carried back against the previous period's profits"],
  ["priorPeriodChargeableProfits", "The previous period's chargeable profits (box 315 of its return)"],
  ["frankedInvestmentIncome", "Franked investment income or exempt ABGH distributions (box 620)"],
];

const PENCE_FIELDS = [
  ["incomeTaxDeducted", "Income Tax deducted from gross income (box 515)"],
  ["taxAlreadyPaid", "Tax already paid and not repaid (box 595)"],
];

function numberOrZero(value) {
  return value === undefined || value === null ? 0 : value;
}

function validText(value) {
  return typeof value === "string" && value.trim().length >= 2;
}

/**
 * The checks on the figures themselves, before any tax is worked.
 *
 * @param {object} figures
 * @param {object} [options]
 * @param {string} [options.today] - ISO date; when given, the period must end before it
 * @returns {Array<{field: string, message: string, refusal: boolean}>}
 */
function figureProblems(figures, { today } = {}) {
  const problems = [];
  const problem = (field, message, refusal = false) => problems.push({ field, message, refusal });

  if (!/^\d{10}$/.test(figures.utr || "")) problem("utr", "The UTR must be 10 digits");
  if (!/^[A-Z0-9]{2,8}$/.test(figures.companyNumber || ""))
    problem("companyNumber", "The company registration number must be 2 to 8 capital letters or digits");
  if (!validText(figures.companyName)) problem("companyName", "The company name is required (at least 2 characters)");
  const companyType = numberOrZero(figures.companyType);
  if (companyType !== 0) {
    problem("companyType", `Company type ${companyType} is not filed here; only type 0 (none of the listed types) is`, true);
  }
  const associated = numberOrZero(figures.associatedCompanies);
  if (!Number.isInteger(associated) || associated < 0)
    problem("associatedCompanies", "Associated companies must be a whole number, 0 or more");

  if (!isIsoDate(figures.periodStart) || !isIsoDate(figures.periodEnd)) {
    problem("period", "The period start and end must be dates (YYYY-MM-DD)");
  } else if (figures.periodEnd < figures.periodStart) {
    problem("period", "The period cannot end before it starts");
  } else {
    if (figures.periodStart < EARLIEST_PERIOD_START) {
      problem(
        "period",
        `The return period starts ${figures.periodStart}; CT600 Version 3 covers periods starting on or after ${EARLIEST_PERIOD_START}`,
        true,
      );
    }
    if (figures.periodEnd > lastDayOfTwelveMonths(figures.periodStart)) {
      problem(
        "period",
        `The return period ${figures.periodStart} to ${figures.periodEnd} is longer than 12 months; a long period of account files two returns`,
        true,
      );
    }
    if (today && figures.periodEnd >= today) problem("period", "The period must end before today");
  }

  const current = figures.profitAndLoss?.current;
  if (!current || !Number.isFinite(current.turnover) || !Number.isFinite(current.profitBeforeTax)) {
    problem("profitAndLoss", "The profit and loss account needs turnover and profit before tax");
  } else if (current.turnover < 0) {
    problem("profitAndLoss", "The turnover is negative", true);
  }
  const prior = figures.profitAndLoss?.prior;
  if (prior !== undefined && (!Number.isFinite(prior.turnover) || !Number.isFinite(prior.profitBeforeTax))) {
    problem("profitAndLoss", "The prior year's profit and loss account needs turnover and profit before tax");
  }

  for (const [field, label] of WHOLE_POUND_FIELDS) {
    const value = numberOrZero(figures[field]);
    if (!Number.isInteger(value) || value < 0) problem(field, `${label} must be whole pounds, 0 or more`);
  }
  if (
    Number.isFinite(numberOrZero(figures.entertaining)) &&
    current &&
    Number.isFinite(current.costOfSales) &&
    Number.isFinite(current.administrativeExpenses) &&
    numberOrZero(figures.entertaining) > current.costOfSales + current.administrativeExpenses
  ) {
    problem("entertaining", "Entertaining added back is more than the cost of sales and administrative expenses");
  }
  if (
    Number.isFinite(numberOrZero(figures.donations)) &&
    current &&
    Number.isFinite(current.costOfSales) &&
    Number.isFinite(current.administrativeExpenses) &&
    numberOrZero(figures.donations) > current.costOfSales + current.administrativeExpenses
  ) {
    problem("donations", "Donations added back are more than the cost of sales and administrative expenses");
  }
  if (numberOrZero(figures.specialRatePoolAnnualInvestmentAllowance) > numberOrZero(figures.annualInvestmentAllowance)) {
    problem(
      "specialRatePoolAnnualInvestmentAllowance",
      "The annual investment allowance claimed on the special rate pool is more than the annual investment allowance in box 690",
    );
  }
  if (numberOrZero(figures.specialRateAllowances) > 0 && numberOrZero(figures.specialRateAllowanceExpenditure) === 0) {
    problem("specialRateAllowanceExpenditure", "Enter the qualifying expenditure in box 773: HMRC needs it when box 693 is completed");
  }
  if (figures.lossOutsideUk !== undefined && typeof figures.lossOutsideUk !== "boolean") {
    problem("lossOutsideUk", "Whether the trade is carried on wholly outside the UK must be yes or no");
  }
  for (const [field, label] of PENCE_FIELDS) {
    const value = numberOrZero(figures[field]);
    if (!Number.isFinite(value) || value < 0 || Math.abs(value * 100 - Math.round(value * 100)) > 1e-6) {
      problem(field, `${label} must be pounds and pence, 0 or more`);
    }
  }
  if (!validText(figures.declarantName)) problem("declarantName", "The declarant's name is required (at least 2 characters)");
  if (!validText(figures.declarantStatus)) problem("declarantStatus", "The declarant's status is required (at least 2 characters)");
  problems.push(...loansProblems(figures, { today }));
  return problems;
}

/**
 * The full profit and loss account for the financial year, in whole pounds, from the engine's
 * published account. Turnover, cost of sales, administrative expenses, profit before tax and tax
 * are rounded; gross profit, operating profit and the interest line are derived from them so every
 * subtotal holds exactly.
 * @param {Object} sheet - results["PubP&L"]
 */
export function smallCompanyProfitAndLossFromPublishedAccount(sheet) {
  if (!sheet)
    throw new Error(
      "The book's product carries no published profit and loss account; only a Company (ltd) book answers small company accounts",
    );
  const turnover = Math.round(sheet.F9 ?? 0);
  const costOfSales = Math.round(sheet.F16 ?? 0);
  const administrativeExpenses = Math.round(sheet.F44 ?? 0);
  const profitBeforeTax = Math.round(sheet.F49 ?? 0);
  const tax = Math.round(sheet.F50 ?? 0);
  const grossProfit = turnover - costOfSales;
  const operatingProfit = grossProfit - administrativeExpenses;
  return {
    turnover,
    costOfSales,
    grossProfit,
    administrativeExpenses,
    operatingProfit,
    interestReceivable: profitBeforeTax - operatingProfit,
    profitBeforeTax,
    tax,
    profit: profitBeforeTax - tax,
  };
}

/**
 * The capital allowance classes the computation lists beside the annual investment allowance and
 * the main pool: full expensing, the special rate allowance and the special rate pool. The annual
 * investment allowance claimed on the special rate pool counts with that pool's allowances.
 */
function capitalAllowanceClassLines(figures) {
  return {
    fullExpensingAllowances: numberOrZero(figures.fullExpensingAllowances),
    fullExpensingBalancingCharges: numberOrZero(figures.fullExpensingBalancingCharges),
    specialRateAllowances: numberOrZero(figures.specialRateAllowances),
    specialRateBalancingCharges: numberOrZero(figures.specialRateBalancingCharges),
    specialRatePoolAllowances: numberOrZero(figures.specialRatePoolAllowances),
    specialRatePoolBalancingCharges: numberOrZero(figures.specialRatePoolBalancingCharges),
  };
}

/**
 * The computation lines, in whole pounds, from the figures. Each total is summed from the lines
 * above it, so the computation adds up.
 *
 * @param {object} figures
 * @returns {{profitLossPerAccounts: number, nonTradingLoanRelationshipCredits: number, depreciation: number, amortisation: number, entertaining: number, donations: number, adjustedProfitBeforeCapitalAllowances: number, totalCapitalAllowances: number, adjustedProfit: number}} a loss is a negative adjustedProfit
 */
export function computationLinesFromFigures(figures) {
  const lines = {
    profitLossPerAccounts: figures.profitAndLoss.current.profitBeforeTax,
    nonTradingLoanRelationshipCredits: numberOrZero(figures.nonTradingLoanRelationshipCredits),
    depreciation: numberOrZero(figures.depreciation),
    amortisation: numberOrZero(figures.amortisation),
    entertaining: numberOrZero(figures.entertaining),
    donations: numberOrZero(figures.donations),
  };
  lines.adjustedProfitBeforeCapitalAllowances =
    lines.profitLossPerAccounts + COMPUTATION_ADJUSTMENTS.reduce((total, [key, effect]) => total + effect * lines[key], 0);
  Object.assign(lines, capitalAllowanceClassLines(figures));
  lines.totalCapitalAllowances =
    numberOrZero(figures.annualInvestmentAllowance) +
    numberOrZero(figures.mainPoolAllowances) -
    numberOrZero(figures.mainPoolBalancingCharges) +
    lines.fullExpensingAllowances -
    lines.fullExpensingBalancingCharges +
    lines.specialRateAllowances -
    lines.specialRateBalancingCharges +
    lines.specialRatePoolAllowances -
    lines.specialRatePoolBalancingCharges;
  lines.adjustedProfit = lines.adjustedProfitBeforeCapitalAllowances - lines.totalCapitalAllowances;
  return lines;
}

/**
 * The figures a Company book's calculated results give, in the model's shape. The typed company
 * facts (name, number, UTR, company type, declarant, tax already paid) are not in a book; the
 * caller adds them. The book carries no prior-year profit and loss account, so the prior year is
 * the accounts' own when they supply one.
 *
 * @param {object} results - diya-gl calculatedResultsFor output for a Company book
 * @param {{profitAndLoss: {currentYear: object, priorYear?: object}}} smallCompanyAccounts - deriveSmallCompanyAccounts output
 * @returns {object} figures, with workingSheet for the £5 check
 */
export function ct600FiguresFromResults(results, smallCompanyAccounts) {
  const ct600 = results.CT600;
  const workingSheet = results.CorporationTax;
  const admin = results.Admin;
  if (!ct600 || !workingSheet || !admin) {
    throw new Ct600RefusedError("The book carries no CT600 sheet; only a Company (ltd) book files a Company Tax Return");
  }
  if (workingSheet.K24 < 0) {
    throw new Ct600RefusedError(
      "The book has net non-trading loan relationship debits; those boxes have no diya-gl cell yet",
      "nonTradingLoanRelationshipCredits",
    );
  }
  const positive = (value) => (value > 0 ? Math.round(value) : 0);
  const allowances = workingSheet;
  const profitAndLoss = { current: smallCompanyAccounts.profitAndLoss.currentYear };
  if (smallCompanyAccounts.profitAndLoss.priorYear) profitAndLoss.prior = smallCompanyAccounts.profitAndLoss.priorYear;
  const figures = {
    periodStart: isoFromSerial(ct600.B33),
    periodEnd: isoFromSerial(ct600.M33),
    associatedCompanies: admin.P14 ?? 0,
    profitAndLoss,
    nonTradingLoanRelationshipCredits: positive(workingSheet.K24),
    depreciation: positive(workingSheet.I8),
    amortisation: positive(workingSheet.I7),
    entertaining: positive(workingSheet.I9),
    donations: positive(results["MnthP&L"]?.B37),
    directorsLoanOverdrawn: positive(-(results.PubBalSht?.E29 ?? 0)),
    directorsLoanOpeningOverdrawn: positive(-(results.OpenAccounts?.E30 ?? 0)),
    annualInvestmentAllowance: wholePounds(allowances.I15),
    mainPoolAllowances: wholePounds((allowances.I16 ?? 0) + (allowances.I17 ?? 0) + Math.max(allowances.I18 ?? 0, 0)),
    mainPoolBalancingCharges: wholePounds(Math.max(-(allowances.I18 ?? 0), 0)),
    frankedInvestmentIncome: wholePounds(workingSheet.K29),
    incomeTaxDeducted: workingSheet.K37 > 0 ? fromPence(toPence(workingSheet.K37)) : 0,
    workingSheet: {
      tradingProfit: workingSheet.K22 + positive(results["MnthP&L"]?.B37),
      tradingLoss: Math.max((ct600.Q206 ?? 0) - positive(results["MnthP&L"]?.B37), 0),
      corporationTax: workingSheet.K35 ?? 0,
    },
  };
  const lossesBroughtForward = wholePounds(ct600.Z72);
  if (lossesBroughtForward > 0) figures.lossesBroughtForward = lossesBroughtForward;
  return figures;
}

/**
 * Check the figures. Tax is worked only when taxDataByYear is given, so the refusals that depend
 * on the charge (a trading loss, Income Tax deducted or tax paid beyond the charge) show too.
 *
 * @param {object} figures
 * @param {object} [options]
 * @param {string} [options.today] - ISO date; the period must end before it
 * @param {Record<number, object>} [options.taxDataByYear] - parsed ltd-<FY>.toml files by financial year
 * @returns {Array<{field: string, message: string, refusal: boolean}>} empty when the figures stand
 */
export function validateCt600Figures(figures, { today, taxDataByYear } = {}) {
  const problems = figureProblems(figures, { today });
  if (problems.length > 0 || !taxDataByYear) return problems;
  try {
    deriveCt600FromFigures(figures, taxDataByYear, { today });
  } catch (error) {
    if (!(error instanceof Ct600RefusedError)) throw error;
    problems.push({ field: error.field ?? "figures", message: error.message, refusal: true });
  }
  return problems;
}

function workedEntry(sources, rule) {
  return rule ? { sources, rule } : { sources };
}

function refuseLoss(message, field) {
  throw new Ct600RefusedError(message, field);
}

/**
 * The trading losses of the period and the pool brought forward, with each claim checked against
 * what it draws on. A loss that no claim uses is carried forward.
 */
function workLosses({ figures, tradingLoss, profitsBeforeOtherDeductions, lossesBroughtForward, broughtForwardUsedAgainstTrading }) {
  const usedAgainstTotalProfits = numberOrZero(figures.lossAgainstTotalProfits);
  const broughtForwardAgainstTotalProfits = numberOrZero(figures.lossesBroughtForwardAgainstTotalProfits);
  const carriedBack = numberOrZero(figures.lossCarriedBack);
  const broughtForwardPool = lossesBroughtForward - broughtForwardUsedAgainstTrading;
  if (usedAgainstTotalProfits > tradingLoss) {
    refuseLoss(
      `The loss set against this period's total profits ${usedAgainstTotalProfits} is more than the trading loss of the period ${tradingLoss}`,
      "lossAgainstTotalProfits",
    );
  }
  if (broughtForwardAgainstTotalProfits > broughtForwardPool) {
    refuseLoss(
      `Losses brought forward claimed against total profits ${broughtForwardAgainstTotalProfits} are more than the ${broughtForwardPool} the trading profit leaves unused`,
      "lossesBroughtForwardAgainstTotalProfits",
    );
  }
  if (usedAgainstTotalProfits + broughtForwardAgainstTotalProfits > profitsBeforeOtherDeductions) {
    refuseLoss(
      `Losses claimed against total profits ${usedAgainstTotalProfits + broughtForwardAgainstTotalProfits} are more than the profits of the period ${profitsBeforeOtherDeductions}`,
      usedAgainstTotalProfits > 0 ? "lossAgainstTotalProfits" : "lossesBroughtForwardAgainstTotalProfits",
    );
  }
  if (carriedBack > tradingLoss - usedAgainstTotalProfits) {
    refuseLoss(
      `The loss carried back ${carriedBack} is more than the trading loss left after the claim against total profits, ${tradingLoss - usedAgainstTotalProfits}`,
      "lossCarriedBack",
    );
  }
  const carriedForwardFromPeriod = tradingLoss - usedAgainstTotalProfits - carriedBack;
  const broughtForwardCarriedForward = broughtForwardPool - broughtForwardAgainstTotalProfits;
  return {
    arising: tradingLoss,
    usedAgainstTotalProfits,
    carriedBack,
    carriedForwardFromPeriod,
    broughtForward: lossesBroughtForward,
    broughtForwardUsedAgainstTrading,
    broughtForwardAgainstTotalProfits,
    broughtForwardCarriedForward,
    totalCarriedForward: carriedForwardFromPeriod + broughtForwardCarriedForward,
  };
}

function corporationTaxPenceOn(profits, years, totalDays, { taxData, fileFinancialYear, associatedCompanies }) {
  const perYear = years.map((year) => financialYearRatesFor(taxData, year.year, fileFinancialYear, year.days));
  const charge = apportionCorporationTax(profits, years, totalDays, { perYear, associatedCompanies });
  const firstShare = years[1].days > 0 ? Math.round((profits * years[0].days) / totalDays) : profits;
  const shares = [firstShare, profits - firstShare];
  const pence = charge.rows.reduce((total, row, index) => total + (row.days > 0 ? shares[index] * row.ratePercent : 0), 0);
  return pence - toPence(charge.marginalRelief);
}

/**
 * The carry-back claim against the twelve months before the period: the Corporation Tax the
 * previous period paid on its chargeable profits less what it would have paid with the claim
 * deducted, which is the repayment, and the boxes the previous period's return then carries.
 */
function workCarryBack(figures, losses, taxDataByYear) {
  if (losses.carriedBack === 0) return undefined;
  const priorProfits = numberOrZero(figures.priorPeriodChargeableProfits);
  if (losses.carriedBack > priorProfits) {
    refuseLoss(
      `The loss carried back ${losses.carriedBack} is more than the previous period's chargeable profits ${priorProfits}`,
      priorProfits === 0 ? "priorPeriodChargeableProfits" : "lossCarriedBack",
    );
  }
  const priorStart = utcDate(figures.periodStart);
  priorStart.setUTCFullYear(priorStart.getUTCFullYear() - 1);
  const priorEnd = new Date(utcDate(figures.periodStart).getTime() - DAY_MS);
  const fileFinancialYear = financialYearNumber(utcDate(figures.periodEnd));
  const taxData = taxDataByYear?.[fileFinancialYear];
  if (!taxData) refuseLoss(`No tax data is held for the financial year ${fileFinancialYear}`, "period");
  const { years, totalDays } = financialYearsInPeriod(priorStart, priorEnd);
  const options = { taxData, fileFinancialYear, associatedCompanies: numberOrZero(figures.associatedCompanies) };
  let before;
  let after;
  try {
    before = corporationTaxPenceOn(priorProfits, years, totalDays, options);
    after = corporationTaxPenceOn(priorProfits - losses.carriedBack, years, totalDays, options);
  } catch (error) {
    refuseLoss(`The previous period's tax cannot be worked for the claim: ${error.message}`, "lossCarriedBack");
  }
  return {
    amount: losses.carriedBack,
    priorPeriodStart: priorStart.toISOString().slice(0, 10),
    priorPeriodEnd: priorEnd.toISOString().slice(0, 10),
    boxes: { 275: losses.carriedBack, 280: "yes" },
    taxRepayable: fromPence(before - after),
  };
}

// The section 455 rates HMRC's online rules accept (RIM artefacts V1.994): the dividend upper rate
// from each date, until S455_RATES_IN_RIM_UNTIL.
export const S455_RATES_IN_RIM = [
  { from: "2016-04-06", rate: 0.325 },
  { from: "2022-04-06", rate: 0.3375 },
];
export const S455_RATES_IN_RIM_UNTIL = "2026-04-05";

export const S455_LATER_RATE_WARNING =
  "Loans made on or after 6 April 2026 owe section 455 tax at 35.75%. HMRC's online rules accept only 33.75% until they move to RIM V1.995, so this return files at 33.75% and shows less tax than is due. Amend the return when HMRC accepts 35.75%.";

const LOAN_NAME_PATTERN = /^[^<>|"\\]{2,56}$/;

function validLoanName(name) {
  return LOAN_NAME_PATTERN.test(name) && ![...name].some((character) => character < " ");
}
const MAX_LOAN_ROWS = 999;
const MAX_RATE_DECIMALS = 4;

function rimRateOn(isoDate) {
  let rate;
  for (const entry of S455_RATES_IN_RIM) if (entry.from <= isoDate) rate = entry.rate;
  return rate;
}

function addDays(isoDate, days) {
  const date = utcDate(isoDate);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function isMonthEnd(isoDate) {
  return addDays(isoDate, 1).endsWith("-01");
}

// The same day of the month `months` later, or its last day when that month is shorter.
function addMonths(isoDate, months) {
  const date = utcDate(isoDate);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.toISOString().slice(0, 10);
}

function lastDayOfMonthsAfter(isoDate, months) {
  const date = utcDate(isoDate);
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months + 1);
  date.setUTCDate(0);
  return date.toISOString().slice(0, 10);
}

// The latest date a repayment can come and still belong to part 2: nine months after the period
// end (rule 9406: before the first day of the tenth month when the period ends on a month end).
function part2LastDate(periodEnd) {
  return isMonthEnd(periodEnd) ? lastDayOfMonthsAfter(periodEnd, 9) : addMonths(periodEnd, 9);
}

// The tax year (6 April to 5 April) a date falls in, named by the year it starts.
function taxYearStartOf(isoDate) {
  const year = Number(isoDate.slice(0, 4));
  return isoDate >= `${year}-04-06` ? year : year - 1;
}

// The day relief is due for a repayment on `repaymentDate`: nine months and a day after the end of
// the accounting period it falls in, taking the periods after the return's own as 12 months each.
function reliefDueDate(periodEnd, repaymentDate) {
  let end = periodEnd;
  while (end < repaymentDate) end = addMonths(end, 12);
  return addDays(isMonthEnd(end) ? lastDayOfMonthsAfter(end, 9) : addMonths(end, 9), 1);
}

// Tax at a rate in pence, half up. The rate is a whole number of ten-thousandths.
function taxPence(pounds, rate) {
  return Math.floor((pounds * Math.round(rate * 10_000) + 50) / 100);
}

function rateProblem(rate) {
  if (!Number.isFinite(rate) || rate <= 0 || rate >= 1) return "must be between 0 and 1, for example 0.3375 for 33.75%";
  if (Math.abs(rate * 10 ** MAX_RATE_DECIMALS - Math.round(rate * 10 ** MAX_RATE_DECIMALS)) > 1e-6) {
    return `must have no more than ${MAX_RATE_DECIMALS} decimal places`;
  }
  return undefined;
}

function wholePoundProblem(value) {
  return Number.isInteger(value) && value >= 0;
}

/**
 * The checks on the loans to participators answers, as messages. A problem is something the
 * customer corrects; a refusal ends the return.
 * @returns {Array<{field: string, message: string, refusal: boolean}>}
 */
function loansProblems(figures, { today } = {}) {
  const problems = [];
  const problem = (field, message, refusal = false) => problems.push({ field, message, refusal });
  const loans = figures.loansToParticipators;
  const overdrawn = numberOrZero(figures.directorsLoanOverdrawn);
  const openingOverdrawn = numberOrZero(figures.directorsLoanOpeningOverdrawn);
  if (!loans) {
    if (figures.directorsLoanOverdrawn !== undefined && overdrawn > openingOverdrawn) {
      problem(
        "loansToParticipators",
        `The account is ${overdrawn - openingOverdrawn} more overdrawn at the end than at the start, so the company lent in the period`,
      );
    }
    return problems;
  }
  if (typeof loans !== "object" || Array.isArray(loans)) {
    problem("loansToParticipators", "The loans to participators answer must be an object");
    return problems;
  }
  const rows = Array.isArray(loans.loans) ? loans.loans : [];
  const repayments = Array.isArray(loans.repayments) ? loans.repayments : [];
  if (typeof loans.releasedBeforeEnd !== "boolean")
    problem("loansToParticipators", "Say whether any loans made in the period were repaid, released or written off before its end");
  if (rows.length === 0) problem("loansToParticipators", "Enter at least one loan to a participator, or answer that the company made none");
  if (rows.length > MAX_LOAN_ROWS) problem("loansToParticipators", `At most ${MAX_LOAN_ROWS} loans can be entered`);
  if (repayments.length > MAX_LOAN_ROWS) problem("loansToParticipators", `At most ${MAX_LOAN_ROWS} repayments can be entered`);
  const names = new Set();
  rows.forEach((row, index) => {
    const label = `Loan ${index + 1}`;
    if (typeof row?.name !== "string" || !validLoanName(row.name.trim())) {
      problem("loansToParticipators", `${label}: the participator's name must be 2 to 56 characters without < > | " or \\`);
    } else if (names.has(row.name.trim())) {
      problem("loansToParticipators", `${label}: ${row.name.trim()} appears twice; enter one loan for each participator`);
    } else {
      names.add(row.name.trim());
    }
    if (!wholePoundProblem(row?.amount) || row.amount === 0)
      problem("loansToParticipators", `${label}: the amount still owed must be whole pounds above 0`);
    if (row?.lentFromRateChange !== undefined && (!wholePoundProblem(row.lentFromRateChange) || row.lentFromRateChange > row.amount)) {
      problem(
        "loansToParticipators",
        `${label}: the amount lent on or after the rate change must be whole pounds and no more than the amount owed`,
      );
    }
    if (row?.rate !== undefined) {
      const rateMessage = rateProblem(row.rate);
      if (rateMessage) problem("loansToParticipators", `${label}: the section 455 rate ${rateMessage}`);
    }
  });
  const bookTotal = rows.reduce((total, row) => total + (Number.isInteger(row?.amount) ? row.amount : 0), 0);
  if (figures.directorsLoanOverdrawn !== undefined && bookTotal > overdrawn) {
    problem(
      "loansToParticipators",
      `The loans total ${bookTotal}, which is more than the ${overdrawn} the director's loan account is overdrawn at the end of the period`,
    );
  }
  repayments.forEach((row, index) => {
    const label = `Repayment ${index + 1}`;
    if (!names.has(typeof row?.name === "string" ? row.name.trim() : ""))
      problem("loansToParticipators", `${label}: name a participator from the loans`);
    if (!isIsoDate(row?.date)) problem("loansToParticipators", `${label}: enter the date as YYYY-MM-DD`);
    if (!wholePoundProblem(row?.repaid) || !wholePoundProblem(row?.releasedOrWrittenOff)) {
      problem("loansToParticipators", `${label}: the amounts must be whole pounds, 0 or more`);
    } else if (row.repaid + row.releasedOrWrittenOff === 0) {
      problem("loansToParticipators", `${label}: enter an amount repaid, or released or written off`);
    }
  });
  const perName = new Map();
  for (const row of repayments) {
    const total =
      (Number.isInteger(row?.repaid) ? row.repaid : 0) + (Number.isInteger(row?.releasedOrWrittenOff) ? row.releasedOrWrittenOff : 0);
    perName.set(row?.name?.trim(), (perName.get(row?.name?.trim()) ?? 0) + total);
  }
  for (const row of rows) {
    if ((perName.get(row?.name?.trim()) ?? 0) > (row?.amount ?? 0)) {
      problem("loansToParticipators", `The repayments for ${row.name.trim()} are more than the loan of ${row.amount}`);
    }
  }
  for (const row of repayments) {
    if (!isIsoDate(row?.date)) continue;
    if (row.date <= figures.periodEnd) {
      problem(
        "loansToParticipators",
        `The repayment on ${row.date} is on or before the end of the period; the period's own book records it`,
        true,
      );
    } else if (today && row.date > today) {
      problem("loansToParticipators", `The repayment on ${row.date} is after today`, true);
    }
  }
  return problems;
}

/**
 * The section 455 rate parts of a period: one part, or two when 6 April falls inside the period and
 * the rate changes there (or HMRC's online rules stop knowing the rate there). Each part carries
 * the rate the return files at, the rate the tax data holds, and any warning.
 */
function section455RateOf(taxDataByYear, year) {
  const rate = taxDataByYear?.[year]?.dividend_tax?.higher_rate;
  if (!Number.isFinite(rate)) {
    throw new Ct600RefusedError(`No section 455 rate is held for the tax year starting 6 April ${year}`, "loansToParticipators");
  }
  return rate;
}

/**
 * The 6 April inside a period at which the section 455 rate changes, or at which HMRC's online
 * rules stop knowing it; undefined when the period has no such date.
 * @param {string} periodStart - ISO date
 * @param {string} periodEnd - ISO date
 * @param {Record<number, object>} taxDataByYear
 * @returns {string|undefined}
 */
export function section455RateChangeDate(periodStart, periodEnd, taxDataByYear) {
  const startYear = taxYearStartOf(periodStart);
  const endYear = taxYearStartOf(periodEnd);
  const changeDate = `${endYear}-04-06`;
  const crosses =
    endYear > startYear &&
    changeDate > periodStart &&
    (section455RateOf(taxDataByYear, startYear) !== section455RateOf(taxDataByYear, endYear) ||
      changeDate === addDays(S455_RATES_IN_RIM_UNTIL, 1));
  return crosses ? changeDate : undefined;
}

function section455Parts(periodStart, periodEnd, taxDataByYear) {
  const changeDate = section455RateChangeDate(periodStart, periodEnd, taxDataByYear);
  const starts = changeDate ? [periodStart, changeDate] : [periodStart];
  return {
    changeDate,
    parts: starts.map((from) => {
      const derived = section455RateOf(taxDataByYear, taxYearStartOf(from));
      const rim = rimRateOn(from);
      if (from > S455_RATES_IN_RIM_UNTIL) {
        return { from, derived, rate: rimRate(), warning: S455_LATER_RATE_WARNING, source: "online-rules" };
      }
      if (derived !== rim) {
        return {
          from,
          derived,
          rate: rim,
          warning: `The tax data and HMRC's rules disagree on the section 455 rate for ${from}`,
          source: "online-rules",
        };
      }
      return { from, derived, rate: derived, source: "tax-data" };
    }),
  };
}

function rimRate() {
  return S455_RATES_IN_RIM[S455_RATES_IN_RIM.length - 1].rate;
}

/**
 * Part 1 to part 3 of supplementary page CT600A, loans to participators of a close company, and the
 * boxes that follow from it: 95 (the page is attached), 480 (the section 455 tax, A80) and 485
 * (relief claimed in part 3). Sets box 95, 480 and 485 on `boxes` and returns the page's boxes, or
 * undefined when the company made no loans.
 *
 * @param {object} figures - loansToParticipators: { releasedBeforeEnd, loans: [{name, amount, lentFromRateChange?, rate?}], repayments: [{name, date, repaid, releasedOrWrittenOff}] }
 * @param {Record<number, string|number>} boxes
 * @param {Record<number, {sources: string[], rule?: string}>} worked
 * @param {Record<number, object>} taxDataByYear - ltd-<year>.toml files by year; the dividend upper rate of the tax year of each loan
 * @param {{today?: string}} [options] - ISO date; a repayment cannot come after it
 * @returns {{ct600a: object|undefined, a80Pence: number}}
 */
export function workLoansToParticipators(figures, boxes, worked, taxDataByYear, { today } = {}) {
  const loans = figures.loansToParticipators;
  if (!loans) return { ct600a: undefined, a80Pence: 0 };
  const problems = loansProblems(figures, { today });
  const refusal = problems.find((entry) => entry.refusal);
  if (refusal) throw new Ct600RefusedError(refusal.message, refusal.field);
  if (problems.length > 0) throw new Error(problems[0].message);

  const { periodStart, periodEnd } = figures;
  const rows = loans.loans.map((row) => ({ ...row, name: row.name.trim() }));
  const needsDerivedRate = rows.some((row) => row.rate === undefined);
  const { changeDate, parts: derivedParts } = needsDerivedRate
    ? section455Parts(periodStart, periodEnd, taxDataByYear)
    : { changeDate: undefined, parts: [] };
  if (!changeDate && rows.some((row) => row.lentFromRateChange > 0 && row.rate === undefined)) {
    throw new Error("A loan lent on or after a rate change needs a period that crosses one");
  }

  // Each participator's loan as parts in the order they were lent, each at the rate the return files at.
  const warnings = [];
  const rateRows = rows.map((row) => {
    if (row.rate !== undefined) {
      return { name: row.name, parts: [{ amount: row.amount, rate: row.rate, source: "customer-entered" }] };
    }
    const lateAmount = changeDate ? (row.lentFromRateChange ?? 0) : 0;
    const parts = [
      { amount: row.amount - lateAmount, from: derivedParts[0].from, part: derivedParts[0] },
      ...(changeDate ? [{ amount: lateAmount, from: derivedParts[1].from, part: derivedParts[1] }] : []),
    ].filter((entry) => entry.amount > 0 || derivedParts.length === 1);
    for (const entry of parts) {
      if (entry.part.warning && !warnings.includes(entry.part.warning)) warnings.push(entry.part.warning);
    }
    return {
      name: row.name,
      parts: parts.map((entry) => ({
        amount: entry.amount,
        rate: entry.part.rate,
        source: entry.part.source,
        from: entry.from,
        ...(entry.part.derived !== entry.part.rate ? { taxDataRate: entry.part.derived } : {}),
      })),
    };
  });

  const bucketTotals = new Map();
  const addToBucket = (buckets, rate, amount) => buckets.set(rate, (buckets.get(rate) ?? 0) + amount);
  for (const row of rateRows) for (const part of row.parts) addToBucket(bucketTotals, part.rate, part.amount);
  const chargePence = (buckets) => [...buckets].reduce((total, [rate, amount]) => total + taxPence(amount, rate), 0);

  const totalLoans = rows.reduce((total, row) => total + row.amount, 0);
  const a20Pence = chargePence(bucketTotals);

  // Repayments in date order, against each participator's parts in the order lent.
  const remaining = new Map(rateRows.map((row) => [row.name, row.parts.map((part) => ({ ...part }))]));
  const part2Last = part2LastDate(periodEnd);
  const sortedRepayments = [...loans.repayments].sort((a, b) => a.date.localeCompare(b.date));
  const partTwo = [];
  const partThree = [];
  for (const repayment of sortedRepayments) {
    const row = { ...repayment, name: repayment.name.trim() };
    if (row.date <= part2Last) {
      partTwo.push(row);
    } else {
      const due = reliefDueDate(periodEnd, row.date);
      if (today && due > today) {
        throw new Ct600RefusedError(
          `Relief on the repayment of ${row.date} is due on ${due}. Claim it from HMRC after that date.`,
          "loansToParticipators",
        );
      }
      partThree.push(row);
    }
  }
  const relieve = (list) => {
    const allocated = new Map();
    for (const row of list) {
      let left = row.repaid + row.releasedOrWrittenOff;
      for (const part of remaining.get(row.name)) {
        const used = Math.min(left, part.amount);
        if (used > 0) {
          part.amount -= used;
          left -= used;
          addToBucket(allocated, part.rate, used);
        }
      }
    }
    return allocated;
  };
  const partTwoAllocated = relieve(partTwo);
  const partThreeAllocated = relieve(partThree);
  const a45Pence = Math.min(chargePence(partTwoAllocated), a20Pence);
  const a70Pence = Math.min(chargePence(partThreeAllocated), a20Pence);
  const a80Pence = Math.max(a20Pence - a45Pence - a70Pence, 0);

  const grouped = (list) => {
    const byName = new Map();
    for (const row of list) {
      const entry = byName.get(row.name) ?? { name: row.name, repaid: 0, releasedOrWrittenOff: 0, date: row.date };
      entry.repaid += row.repaid;
      entry.releasedOrWrittenOff += row.releasedOrWrittenOff;
      if (row.date > entry.date) entry.date = row.date;
      byName.set(row.name, entry);
    }
    return [...byName.values()];
  };
  const sum = (list, field) => list.reduce((total, row) => total + row[field], 0);
  const reliefPart = (list, reliefPence) => {
    if (list.length === 0) return undefined;
    const repaid = sum(list, "repaid");
    const released = sum(list, "releasedOrWrittenOff");
    return { rows: grouped(list), repaid, releasedOrWrittenOff: released, total: repaid + released, relief: fromPence(reliefPence) };
  };
  const partTwoBoxes = reliefPart(partTwo, a45Pence);
  const partThreeBoxes = reliefPart(partThree, a70Pence);
  const outstanding = totalLoans - (partTwoBoxes?.total ?? 0) - (partThreeBoxes?.total ?? 0);

  const ct600a = {
    releasedBeforeEnd: loans.releasedBeforeEnd,
    loans: rows.map((row) => ({ name: row.name, amount: row.amount })),
    totalLoans,
    taxChargeable: fromPence(a20Pence),
    partTwo: partTwoBoxes,
    partThree: partThreeBoxes,
    ...(outstanding > 0 ? { totalLoansOutstanding: outstanding } : {}),
    taxPayable: fromPence(a80Pence),
    rates: rateRows,
    warnings,
  };

  boxes[95] = "yes";
  boxes[480] = ct600a.taxPayable;
  worked[480] = workedEntry(["A20", "A45", "A70"], "Box 480 is the tax in box A80 of supplementary page CT600A");
  if (partThreeBoxes) {
    boxes[485] = "yes";
    worked[485] = workedEntry(["A70"], "Box 485 is ticked when box A70 is completed");
  }
  return { ct600a, a80Pence };
}

/**
 * The capital allowance boxes: the annual investment allowance (690), the pools (688/689, 693/694,
 * 695/700, 705/710) and the information boxes that carry no tax (735, 760, 775). Box 705 and box
 * 695 each include the annual investment allowance claimed on that pool.
 */
function workCapitalAllowanceBoxes(figures, boxes, worked) {
  const annualInvestmentAllowance = numberOrZero(figures.annualInvestmentAllowance);
  const onSpecialRatePool = numberOrZero(figures.specialRatePoolAnnualInvestmentAllowance);
  const classes = capitalAllowanceClassLines(figures);
  const amounts = {
    688: classes.fullExpensingAllowances,
    689: classes.fullExpensingBalancingCharges,
    690: annualInvestmentAllowance,
    693: classes.specialRateAllowances,
    694: classes.specialRateBalancingCharges,
    695: classes.specialRatePoolAllowances + onSpecialRatePool,
    700: classes.specialRatePoolBalancingCharges,
    705: annualInvestmentAllowance - onSpecialRatePool + numberOrZero(figures.mainPoolAllowances),
    710: numberOrZero(figures.mainPoolBalancingCharges),
    735: numberOrZero(figures.annualInvestmentAllowanceOutsideTrade),
    760: numberOrZero(figures.firstYearAllowanceExpenditure),
    773: numberOrZero(figures.specialRateAllowanceExpenditure),
    775: numberOrZero(figures.otherMachineryAndPlantExpenditure),
  };
  for (const [box, amount] of Object.entries(amounts)) if (amount > 0) boxes[box] = amount;
  worked[705] = workedEntry(
    ["annualInvestmentAllowance", "mainPoolAllowances", "specialRatePoolAnnualInvestmentAllowance"],
    "Box 705 includes the annual investment allowance in box 690, less the part claimed on the special rate pool",
  );
  worked[695] = workedEntry(
    ["specialRatePoolAllowances", "specialRatePoolAnnualInvestmentAllowance"],
    "Box 695 includes the annual investment allowance claimed on the special rate pool",
  );
}

/**
 * The boxes from the trading profit down to the chargeable profits (155 to 315): the trading
 * profit or loss, the losses brought forward, the claims against total profits and the donations.
 * Fills boxes and worked, and returns the losses and the chargeable profits.
 */
function workProfitsAndReliefs(figures, computationLines, boxes, worked) {
  const tradingProfit = Math.max(computationLines.adjustedProfit, 0);
  const tradingLoss = Math.max(-computationLines.adjustedProfit, 0);
  // Losses brought forward set against the trading profit by right (box 160); what the profit
  // does not take stays in the pool, and a claim against total profits (box 285) can use it.
  const lossesBroughtForward = numberOrZero(figures.lossesBroughtForward);
  const broughtForwardUsedAgainstTrading = Math.min(lossesBroughtForward, tradingProfit);
  if (tradingProfit > 0) {
    boxes[155] = tradingProfit;
    worked[155] = workedEntry(
      [
        "profitAndLoss",
        "nonTradingLoanRelationshipCredits",
        "depreciation",
        "amortisation",
        "entertaining",
        "donations",
        "annualInvestmentAllowance",
        "mainPoolAllowances",
        "mainPoolBalancingCharges",
        "fullExpensingAllowances",
        "fullExpensingBalancingCharges",
        "specialRateAllowances",
        "specialRateBalancingCharges",
        "specialRatePoolAllowances",
        "specialRatePoolBalancingCharges",
      ],
      "Box 155 equals the computation's adjusted profit",
    );
    if (broughtForwardUsedAgainstTrading > 0) boxes[160] = broughtForwardUsedAgainstTrading;
    boxes[165] = tradingProfit - broughtForwardUsedAgainstTrading;
    worked[165] = workedEntry(["155", "160"]);
  }
  const bankInterest = computationLines.nonTradingLoanRelationshipCredits;
  if (bankInterest > 0) boxes[170] = bankInterest;
  const profitsBeforeOtherDeductions = (boxes[165] ?? 0) + (boxes[170] ?? 0);
  if (profitsBeforeOtherDeductions > 0) {
    boxes[235] = profitsBeforeOtherDeductions;
    worked[235] = workedEntry(["165", "170"]);
  }

  const losses = workLosses({ figures, tradingLoss, profitsBeforeOtherDeductions, lossesBroughtForward, broughtForwardUsedAgainstTrading });
  if (tradingLoss > 0) {
    boxes[figures.lossOutsideUk === true ? 790 : 780] = tradingLoss;
    worked[figures.lossOutsideUk === true ? 790 : 780] = workedEntry(
      ["profitAndLoss"],
      "The loss arising is the computation's adjusted loss",
    );
  }
  if (losses.usedAgainstTotalProfits > 0) boxes[275] = losses.usedAgainstTotalProfits;
  if (losses.broughtForwardAgainstTotalProfits > 0) boxes[285] = losses.broughtForwardAgainstTotalProfits;
  const deductionsAndReliefs = losses.usedAgainstTotalProfits + losses.broughtForwardAgainstTotalProfits;
  if (deductionsAndReliefs > 0) {
    boxes[295] = deductionsAndReliefs;
    worked[295] = workedEntry(["lossAgainstTotalProfits", "lossesBroughtForwardAgainstTotalProfits"], "Box 295 is boxes 275 and 285");
  }
  const profitsBeforeDonations = profitsBeforeOtherDeductions - deductionsAndReliefs;
  if (profitsBeforeOtherDeductions > 0) {
    boxes[300] = profitsBeforeDonations;
    worked[300] = workedEntry(["235", "295"], "Box 300 is box 235 less box 295");
  }
  const qualifyingDonations = Math.min(computationLines.donations, Math.max(profitsBeforeDonations, 0));
  if (qualifyingDonations > 0) {
    boxes[305] = qualifyingDonations;
    worked[305] = workedEntry(["donations", "300"], "Donations are claimed up to the profits in box 300");
  }
  const chargeableProfits = profitsBeforeDonations - qualifyingDonations;
  boxes[315] = chargeableProfits;
  worked[315] = workedEntry(["300", "305"], "Box 315 is box 300 less box 305");
  return { losses, chargeableProfits };
}

/**
 * Work the CT600 boxes and the computation lines for a small trading company. The tax rows follow
 * HMRC's rules from box 315: 9198 splits the profit between financial years by days, 9204 and
 * 9213 charge each share at its rate to the penny, and the marginal relief is diya-gl's own
 * calculation on the boxed profit. The working sheet's own trading profit and tax, or the figure
 * the customer worked out, must agree with the result to within £5.
 *
 * @param {object} figures
 * @param {Record<number, object>} taxDataByYear - parsed ltd-<FY>.toml files by financial year; the one named for the period end's financial year is required
 * @param {object} [options]
 * @param {string} [options.today] - ISO date; a repayment of a loan to a participator cannot come after it
 * @returns {{boxes: Record<number, string|number>, ct600a: object|undefined, computationLines: object, losses: object, carryBack: object|undefined, worked: Record<number, {sources: string[], rule?: string}>, periodStart: string, periodEnd: string}}
 */
export function deriveCt600FromFigures(figures, taxDataByYear, { today } = {}) {
  const problems = figureProblems(figures);
  const refusal = problems.find((entry) => entry.refusal);
  if (refusal) throw new Ct600RefusedError(refusal.message, refusal.field);
  if (problems.length > 0) throw new Error(problems[0].message);

  const { periodStart, periodEnd } = figures;
  const computationLines = computationLinesFromFigures(figures);

  const worked = {};
  const boxes = {
    1: figures.companyName.trim(),
    2: figures.companyNumber,
    3: figures.utr,
    4: numberOrZero(figures.companyType),
    30: periodStart,
    35: periodEnd,
    145: figures.profitAndLoss.current.turnover,
    975: figures.declarantName.trim(),
    985: figures.declarantStatus.trim(),
  };

  const workingSheet = figures.workingSheet;
  if (workingSheet && Math.abs(computationLines.adjustedProfit - workingSheet.tradingProfit) > WORKING_SHEET_TOLERANCE_POUNDS) {
    throw new Ct600RefusedError(
      `The computation's adjusted trading profit ${computationLines.adjustedProfit} disagrees with the working sheet's ${Math.round(workingSheet.tradingProfit)}`,
      "profitAndLoss",
    );
  }

  const computedLoss = Math.max(-computationLines.adjustedProfit, 0);
  if (workingSheet?.tradingLoss !== undefined && Math.abs(computedLoss - workingSheet.tradingLoss) > WORKING_SHEET_TOLERANCE_POUNDS) {
    throw new Ct600RefusedError(
      `The computation's trading loss ${computedLoss} disagrees with the book's trading loss arising ${Math.round(workingSheet.tradingLoss)}`,
      "profitAndLoss",
    );
  }

  workCapitalAllowanceBoxes(figures, boxes, worked);

  const { losses, chargeableProfits } = workProfitsAndReliefs(figures, computationLines, boxes, worked);

  const { years, totalDays } = financialYearsInPeriod(utcDate(periodStart), utcDate(periodEnd));
  const straddles = years[1].days > 0;
  const associatedCompanies = numberOrZero(figures.associatedCompanies);
  const frankedInvestmentIncome = numberOrZero(figures.frankedInvestmentIncome);
  if (frankedInvestmentIncome > 0) boxes[620] = frankedInvestmentIncome;

  let corporationTaxPence = 0;
  let marginalReliefPence = 0;
  if (chargeableProfits > 0) {
    const fileFinancialYear = financialYearNumber(utcDate(periodEnd));
    const taxData = taxDataByYear?.[fileFinancialYear];
    if (!taxData) throw new Ct600RefusedError(`No tax data is held for the financial year ${fileFinancialYear}`, "period");
    const perYear = years.map((year) => financialYearRatesFor(taxData, year.year, fileFinancialYear, year.days));
    const charge = apportionCorporationTax(chargeableProfits, years, totalDays, { perYear, associatedCompanies, frankedInvestmentIncome });
    const firstShare = straddles ? Math.round((chargeableProfits * years[0].days) / totalDays) : chargeableProfits;
    const shares = [firstShare, chargeableProfits - firstShare];
    const yearBoxes = [
      [330, 335, 340, 345],
      [380, 385, 390, 395],
    ];
    years.forEach((year, index) => {
      if (index === 1 && !straddles) return;
      const [yearBox, profitBox, rateBox, taxBox] = yearBoxes[index];
      const ratePercent = charge.rows[index].ratePercent;
      boxes[yearBox] = year.year;
      boxes[profitBox] = shares[index];
      boxes[rateBox] = ratePercent;
      const taxPence = shares[index] * ratePercent;
      boxes[taxBox] = fromPence(taxPence);
      corporationTaxPence += taxPence;
      worked[profitBox] = workedEntry(["315"], "9198: the profit is split between financial years by days");
      worked[taxBox] = workedEntry(
        [String(profitBox), String(rateBox)],
        "9204 and 9213: each share is charged at its year's rate, to the penny",
      );
    });
    marginalReliefPence = toPence(charge.marginalRelief);
    const claimsSmallProfitsRateOrRelief =
      marginalReliefPence > 0 ||
      charge.rows.some(
        (row, index) =>
          row.days > 0 &&
          perYear[index].smallProfitsRatePercent < perYear[index].mainRatePercent &&
          row.ratePercent === perYear[index].smallProfitsRatePercent,
      );
    if (straddles) {
      boxes[327] = associatedCompanies;
      boxes[328] = associatedCompanies;
    } else {
      boxes[326] = associatedCompanies;
    }
    if (claimsSmallProfitsRateOrRelief) {
      boxes[329] = "yes";
      worked[329] = workedEntry(["315"]);
    }
    boxes[430] = fromPence(corporationTaxPence);
    worked[430] = workedEntry(["345", "395"]);
    if (marginalReliefPence > 0) {
      boxes[435] = fromPence(marginalReliefPence);
      worked[435] = workedEntry(["315", "associatedCompanies", "frankedInvestmentIncome"]);
    }
  }
  const netCorporationTaxPence = corporationTaxPence - marginalReliefPence;
  const netCorporationTax = fromPence(netCorporationTaxPence);
  if (workingSheet && Math.abs(netCorporationTax - workingSheet.corporationTax) > WORKING_SHEET_TOLERANCE_POUNDS) {
    throw new Ct600RefusedError(
      `The return's Corporation Tax ${netCorporationTax.toFixed(2)} disagrees with the working sheet's ${workingSheet.corporationTax.toFixed(2)}`,
      "corporationTax",
    );
  }
  const ownCorporationTax = figures.ownCorporationTax;
  if (
    ownCorporationTax !== undefined &&
    ownCorporationTax !== null &&
    Math.abs(netCorporationTax - ownCorporationTax) > WORKING_SHEET_TOLERANCE_POUNDS
  ) {
    throw new Ct600RefusedError(
      `The return's Corporation Tax ${netCorporationTax.toFixed(2)} disagrees with your own working's ${Number(ownCorporationTax).toFixed(2)}`,
      "ownCorporationTax",
    );
  }
  boxes[440] = netCorporationTax;
  boxes[475] = boxes[440];
  for (const box of [440, 475]) worked[box] = workedEntry(["430", "435"]);
  const { ct600a, a80Pence } = workLoansToParticipators(figures, boxes, worked, taxDataByYear, { today });
  const totalChargePence = netCorporationTaxPence + a80Pence;
  boxes[510] = fromPence(totalChargePence);
  worked[510] = workedEntry(["475", "480"], "Box 510 is box 475 plus box 480");

  const incomeTaxDeductedPence = toPence(numberOrZero(figures.incomeTaxDeducted));
  if (incomeTaxDeductedPence > netCorporationTaxPence) {
    throw new Ct600RefusedError(
      `Income Tax deducted ${fromPence(incomeTaxDeductedPence).toFixed(2)} is more than the Corporation Tax charged ${netCorporationTax.toFixed(2)}; the repayment boxes (bank details, 920 onward) are not filed here`,
      "incomeTaxDeducted",
    );
  }
  if (incomeTaxDeductedPence > 0) boxes[515] = fromPence(incomeTaxDeductedPence);
  const taxPayablePence = totalChargePence - incomeTaxDeductedPence;
  boxes[525] = fromPence(taxPayablePence);
  boxes[528] = boxes[525];
  for (const box of [525, 528]) worked[box] = workedEntry(["440", "515"]);

  const alreadyPaidPence = toPence(numberOrZero(figures.taxAlreadyPaid));
  if (alreadyPaidPence > taxPayablePence) {
    throw new Ct600RefusedError(
      "More tax was paid than the return charges; the repayment boxes (bank details, 920 onward) are not filed here",
      "taxAlreadyPaid",
    );
  }
  if (alreadyPaidPence > 0) boxes[595] = fromPence(alreadyPaidPence);
  boxes[600] = fromPence(taxPayablePence - alreadyPaidPence);
  worked[600] = workedEntry(["525", "595"]);

  const carryBack = workCarryBack(figures, losses, taxDataByYear);
  return { boxes, ct600a, computationLines, losses, carryBack, worked, periodStart, periodEnd };
}
