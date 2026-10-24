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
];

// The figures fields that hold whole pounds and no less than zero, with the label a message uses.
const WHOLE_POUND_FIELDS = [
  ["nonTradingLoanRelationshipCredits", "Non-trading loan relationship credits (bank interest)"],
  ["depreciation", "Depreciation added back"],
  ["amortisation", "Amortisation added back"],
  ["entertaining", "Entertaining added back"],
  ["annualInvestmentAllowance", "Annual investment allowance (box 690)"],
  ["mainPoolAllowances", "Main pool writing down allowances, without the annual investment allowance"],
  ["mainPoolBalancingCharges", "Main pool balancing charges (box 710)"],
  ["lossesBroughtForward", "Trading losses brought forward (box 160)"],
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
  for (const [field, label] of PENCE_FIELDS) {
    const value = numberOrZero(figures[field]);
    if (!Number.isFinite(value) || value < 0 || Math.abs(value * 100 - Math.round(value * 100)) > 1e-6) {
      problem(field, `${label} must be pounds and pence, 0 or more`);
    }
  }
  if (!validText(figures.declarantName)) problem("declarantName", "The declarant's name is required (at least 2 characters)");
  if (!validText(figures.declarantStatus)) problem("declarantStatus", "The declarant's status is required (at least 2 characters)");
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
 * The computation lines, in whole pounds, from the figures. Each total is summed from the lines
 * above it, so the computation adds up.
 *
 * @param {object} figures
 * @returns {{profitLossPerAccounts: number, nonTradingLoanRelationshipCredits: number, depreciation: number, amortisation: number, entertaining: number, adjustedProfitBeforeCapitalAllowances: number, totalCapitalAllowances: number, adjustedProfit: number}}
 */
export function computationLinesFromFigures(figures) {
  const lines = {
    profitLossPerAccounts: figures.profitAndLoss.current.profitBeforeTax,
    nonTradingLoanRelationshipCredits: numberOrZero(figures.nonTradingLoanRelationshipCredits),
    depreciation: numberOrZero(figures.depreciation),
    amortisation: numberOrZero(figures.amortisation),
    entertaining: numberOrZero(figures.entertaining),
  };
  lines.adjustedProfitBeforeCapitalAllowances =
    lines.profitLossPerAccounts + COMPUTATION_ADJUSTMENTS.reduce((total, [key, effect]) => total + effect * lines[key], 0);
  lines.totalCapitalAllowances =
    numberOrZero(figures.annualInvestmentAllowance) +
    numberOrZero(figures.mainPoolAllowances) -
    numberOrZero(figures.mainPoolBalancingCharges);
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
  if (workingSheet.K22 < 0) {
    throw new Ct600RefusedError("The book makes a trading loss; the loss boxes (780 onward) have no diya-gl cell yet", "profitAndLoss");
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
    annualInvestmentAllowance: wholePounds(allowances.I15),
    mainPoolAllowances: wholePounds((allowances.I16 ?? 0) + (allowances.I17 ?? 0) + Math.max(allowances.I18 ?? 0, 0)),
    mainPoolBalancingCharges: wholePounds(Math.max(-(allowances.I18 ?? 0), 0)),
    frankedInvestmentIncome: wholePounds(workingSheet.K29),
    incomeTaxDeducted: workingSheet.K37 > 0 ? fromPence(toPence(workingSheet.K37)) : 0,
    workingSheet: { tradingProfit: workingSheet.K22, corporationTax: workingSheet.K35 ?? 0 },
  };
  const lossesBroughtForward = wholePounds(ct600.Z72);
  if (lossesBroughtForward > 0) {
    const tradingProfit = Math.max(computationLinesFromFigures(figures).adjustedProfit, 0);
    figures.lossesBroughtForward = Math.min(lossesBroughtForward, tradingProfit);
  }
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
    deriveCt600FromFigures(figures, taxDataByYear);
  } catch (error) {
    if (!(error instanceof Ct600RefusedError)) throw error;
    problems.push({ field: error.field ?? "figures", message: error.message, refusal: true });
  }
  return problems;
}

function workedEntry(sources, rule) {
  return rule ? { sources, rule } : { sources };
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
 * @returns {{boxes: Record<number, string|number>, computationLines: object, worked: Record<number, {sources: string[], rule?: string}>, periodStart: string, periodEnd: string}}
 */
export function deriveCt600FromFigures(figures, taxDataByYear) {
  const problems = figureProblems(figures);
  const refusal = problems.find((entry) => entry.refusal);
  if (refusal) throw new Ct600RefusedError(refusal.message, refusal.field);
  if (problems.length > 0) throw new Error(problems[0].message);

  const { periodStart, periodEnd } = figures;
  const computationLines = computationLinesFromFigures(figures);
  if (computationLines.adjustedProfit < 0) {
    throw new Ct600RefusedError("The computation makes a trading loss; the loss boxes (780 onward) have no input yet", "profitAndLoss");
  }

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

  const tradingProfit = computationLines.adjustedProfit;
  const workingSheet = figures.workingSheet;
  if (workingSheet && Math.abs(tradingProfit - workingSheet.tradingProfit) > WORKING_SHEET_TOLERANCE_POUNDS) {
    throw new Ct600RefusedError(
      `The computation's adjusted trading profit ${tradingProfit} disagrees with the working sheet's ${Math.round(workingSheet.tradingProfit)}`,
      "profitAndLoss",
    );
  }

  const capitalAllowances705 = numberOrZero(figures.annualInvestmentAllowance) + numberOrZero(figures.mainPoolAllowances);
  const balancingCharges = numberOrZero(figures.mainPoolBalancingCharges);
  if (numberOrZero(figures.annualInvestmentAllowance) > 0) boxes[690] = figures.annualInvestmentAllowance;
  if (capitalAllowances705 > 0) boxes[705] = capitalAllowances705;
  if (balancingCharges > 0) boxes[710] = balancingCharges;
  worked[705] = workedEntry(
    ["annualInvestmentAllowance", "mainPoolAllowances"],
    "Box 705 includes the annual investment allowance in box 690",
  );

  const lossesBroughtForward = numberOrZero(figures.lossesBroughtForward);
  if (tradingProfit > 0) {
    boxes[155] = tradingProfit;
    worked[155] = workedEntry(
      [
        "profitAndLoss",
        "nonTradingLoanRelationshipCredits",
        "depreciation",
        "amortisation",
        "entertaining",
        "annualInvestmentAllowance",
        "mainPoolAllowances",
        "mainPoolBalancingCharges",
      ],
      "Box 155 equals the computation's adjusted profit",
    );
    if (lossesBroughtForward > tradingProfit) {
      throw new Ct600RefusedError(
        `Trading losses brought forward ${lossesBroughtForward} are more than the trading profit ${tradingProfit}`,
        "lossesBroughtForward",
      );
    }
    if (lossesBroughtForward > 0) boxes[160] = lossesBroughtForward;
    boxes[165] = tradingProfit - (boxes[160] ?? 0);
    worked[165] = workedEntry(["155", "160"]);
  } else if (lossesBroughtForward > 0) {
    throw new Ct600RefusedError(
      `Trading losses brought forward ${lossesBroughtForward} are more than the trading profit 0`,
      "lossesBroughtForward",
    );
  }
  const bankInterest = computationLines.nonTradingLoanRelationshipCredits;
  if (bankInterest > 0) boxes[170] = bankInterest;
  const profitsBeforeOtherDeductions = (boxes[165] ?? 0) + (boxes[170] ?? 0);
  if (profitsBeforeOtherDeductions > 0) {
    boxes[235] = profitsBeforeOtherDeductions;
    boxes[300] = profitsBeforeOtherDeductions;
  }
  const chargeableProfits = profitsBeforeOtherDeductions;
  boxes[315] = chargeableProfits;
  for (const box of [235, 300, 315]) worked[box] = workedEntry(["165", "170"]);

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
  boxes[510] = boxes[440];
  for (const box of [440, 475, 510]) worked[box] = workedEntry(["430", "435"]);

  const incomeTaxDeductedPence = toPence(numberOrZero(figures.incomeTaxDeducted));
  if (incomeTaxDeductedPence > netCorporationTaxPence) {
    throw new Ct600RefusedError(
      `Income Tax deducted ${fromPence(incomeTaxDeductedPence).toFixed(2)} is more than the Corporation Tax charged ${netCorporationTax.toFixed(2)}; the repayment boxes (bank details, 920 onward) are not filed here`,
      "incomeTaxDeducted",
    );
  }
  if (incomeTaxDeductedPence > 0) boxes[515] = fromPence(incomeTaxDeductedPence);
  const taxPayablePence = netCorporationTaxPence - incomeTaxDeductedPence;
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

  return { boxes, computationLines, worked, periodStart, periodEnd };
}
