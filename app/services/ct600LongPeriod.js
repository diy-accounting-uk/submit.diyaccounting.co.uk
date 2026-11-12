// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/ct600LongPeriod.js
// A period of account longer than 12 months files as two Company Tax Returns: an accounting period
// ends 12 months after it starts (CTA 2009 section 10(1)(a)), so the first 12 months and the rest
// are two accounting periods, each with its own CT600 and computations. A period of account is at
// most 18 months (Companies Act 2006 section 392(5)).
//
// Like ct600Figures.js, the module has no fs and no Buffer, so the books bundle can carry it to the
// page and the page's live check and the server's boxes come from the same code.

import {
  Ct600RefusedError,
  addDays,
  addMonths,
  computationLinesFromFigures,
  daysInclusive,
  deriveCt600FromFigures,
  lastDayOfTwelveMonths,
} from "./ct600Figures.js";

const LONGEST_PERIOD_OF_ACCOUNT_MONTHS = 18;

// The figures an accounting period carries for itself: the capital allowances, the donations paid,
// the associated companies, the loans to participators and the loss and tax claims. Every other
// field is a fact of the whole period of account.
export const ACCOUNTING_PERIOD_FIELDS = [
  "annualInvestmentAllowance",
  "mainPoolAllowances",
  "mainPoolBalancingCharges",
  "fullExpensingAllowances",
  "fullExpensingBalancingCharges",
  "specialRateAllowances",
  "specialRateBalancingCharges",
  "specialRatePoolAllowances",
  "specialRatePoolAnnualInvestmentAllowance",
  "specialRatePoolBalancingCharges",
  "annualInvestmentAllowanceOutsideTrade",
  "firstYearAllowanceExpenditure",
  "specialRateAllowanceExpenditure",
  "otherMachineryAndPlantExpenditure",
  "donationsPaid",
  "associatedCompanies",
  "frankedInvestmentIncome",
  "directorsLoanOverdrawn",
  "directorsLoanOpeningOverdrawn",
  "loansToParticipators",
  "lossAgainstTotalProfits",
  "lossesBroughtForwardAgainstTotalProfits",
  "lossCarriedBack",
  "incomeTaxDeducted",
  "taxAlreadyPaid",
  "ownCorporationTax",
];

// Typed once for the whole period of account but belonging to the first return; the second return
// takes the loss and the profits from the first.
const FIRST_RETURN_FIELDS = ["lossesBroughtForward", "priorPeriodChargeableProfits"];

function isIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/**
 * The accounting periods of a period of account: one, or two when it is longer than 12 months (the
 * first 12 months and the rest).
 *
 * @param {string} periodStart - ISO date
 * @param {string} periodEnd - ISO date
 * @returns {Array<{periodStart: string, periodEnd: string}>}
 */
export function accountingPeriodsOf(periodStart, periodEnd) {
  if (!isIsoDate(periodStart) || !isIsoDate(periodEnd)) {
    throw new Ct600RefusedError("The period start and end must be dates (YYYY-MM-DD)", "period");
  }
  if (periodEnd < periodStart) throw new Ct600RefusedError("The period cannot end before it starts", "period");
  const firstEnd = lastDayOfTwelveMonths(periodStart);
  if (periodEnd <= firstEnd) return [{ periodStart, periodEnd }];
  if (periodEnd > addDays(addMonths(periodStart, LONGEST_PERIOD_OF_ACCOUNT_MONTHS), -1)) {
    throw new Ct600RefusedError("A period of account can be 18 months at most (Companies Act 2006 s392).", "period");
  }
  return [
    { periodStart, periodEnd: firstEnd },
    { periodStart: addDays(firstEnd, 1), periodEnd },
  ];
}

// An amount split by days between two accounting periods in whole pounds: the first takes its
// rounded share, the second the rest, so the two add back to the whole (CTA 2010 section 1172(1)).
function sharesByDays(amount, firstDays, totalDays) {
  const first = Math.round((amount * firstDays) / totalDays);
  return [first, amount - first];
}

function refuseField(field, message) {
  throw new Ct600RefusedError(message, field);
}

function checkAccountingPeriodFigures(figures) {
  const { accountingPeriods } = figures;
  if (!Array.isArray(accountingPeriods) || accountingPeriods.length !== 2) {
    refuseField("accountingPeriods", "A period of account longer than 12 months needs the figures of its two accounting periods");
  }
  accountingPeriods.forEach((period, index) => {
    if (!period || typeof period !== "object" || Array.isArray(period)) {
      refuseField("accountingPeriods", `The figures of accounting period ${index + 1} must be an object`);
    }
    for (const field of Object.keys(period)) {
      if (!ACCOUNTING_PERIOD_FIELDS.includes(field)) {
        refuseField(
          field,
          `${field} is a figure of the whole period of account; accounting period ${index + 1} takes only the figures of its own period`,
        );
      }
    }
  });
  for (const field of ACCOUNTING_PERIOD_FIELDS) {
    if (figures[field] !== undefined) {
      refuseField(field, `${field} is typed for each accounting period of a long period of account, not for the whole period`);
    }
  }
  if (figures.workingSheet !== undefined) {
    refuseField("workingSheet", "The working sheet check is for a book of 12 months or less");
  }
  if (!figures.profitAndLoss?.current || !Number.isFinite(figures.profitAndLoss.current.turnover)) {
    refuseField("profitAndLoss", "The profit and loss account needs turnover and profit before tax");
  }
}

/**
 * Two figures objects for a period of account longer than 12 months, one for each accounting
 * period. The figures of the whole period of account (the profit and loss account, the
 * adjustments, the bank interest) stay as they are, and each return's periodOfAccount holds the
 * dates, the days and the return's share by days of the turnover, the bank interest and the
 * adjusted profit before capital allowances. The figures of each accounting period
 * (ACCOUNTING_PERIOD_FIELDS) come from figures.accountingPeriods; donations paid are 0 when an
 * accounting period gives none. The losses brought forward and
 * the previous period's chargeable profits go to the first return.
 *
 * @param {object} figures - a period of account of more than 12 months and at most 18, with accountingPeriods: two objects of per-period fields
 * @returns {[object, object]}
 */
export function splitLongPeriodFigures(figures) {
  const periods = accountingPeriodsOf(figures.periodStart, figures.periodEnd);
  if (periods.length === 1) {
    refuseField(
      "accountingPeriods",
      figures.accountingPeriods === undefined
        ? "A period of account of 12 months or less files as one return"
        : "accountingPeriods are for a period of account longer than 12 months",
    );
  }
  if (figures.accountingPeriods === undefined) {
    refuseField(
      "accountingPeriods",
      `The period ${figures.periodStart} to ${figures.periodEnd} is longer than 12 months; a long period of account files two returns, with the figures of each accounting period`,
    );
  }
  checkAccountingPeriodFigures(figures);

  const { accountingPeriods, ...wholePeriod } = figures;
  const periodOfAccountDays = daysInclusive(figures.periodStart, figures.periodEnd);
  const firstDays = daysInclusive(periods[0].periodStart, periods[0].periodEnd);
  const wholeLines = computationLinesFromFigures(wholePeriod);
  const [turnover1, turnover2] = sharesByDays(figures.profitAndLoss.current.turnover, firstDays, periodOfAccountDays);
  const [credits1, credits2] = sharesByDays(wholeLines.nonTradingLoanRelationshipCredits, firstDays, periodOfAccountDays);
  const [profit1, profit2] = sharesByDays(wholeLines.adjustedProfitBeforeCapitalAllowances, firstDays, periodOfAccountDays);
  const apportioned = [
    { turnover: turnover1, nonTradingLoanRelationshipCredits: credits1, adjustedProfitBeforeCapitalAllowances: profit1 },
    { turnover: turnover2, nonTradingLoanRelationshipCredits: credits2, adjustedProfitBeforeCapitalAllowances: profit2 },
  ];

  return periods.map((period, index) => {
    const returnFigures = { ...wholePeriod, donationsPaid: 0, ...accountingPeriods[index], ...period };
    if (index === 1) for (const field of FIRST_RETURN_FIELDS) delete returnFigures[field];
    returnFigures.periodOfAccount = {
      periodStart: figures.periodStart,
      periodEnd: figures.periodEnd,
      days: periodOfAccountDays,
      apportioned: apportioned[index],
    };
    return returnFigures;
  });
}

function poundsAndPence(pence) {
  return Math.round(pence) / 100;
}

/**
 * Both returns' derivations, in order, for a period of account longer than 12 months. The first
 * return's loss carried forward becomes the second's losses brought forward, and the second
 * return's loss carried back reaches the first: the first return is worked again with boxes 275
 * and 280 set, and the second's carry-back repayment is the difference between the first return's
 * Corporation Tax before and after.
 *
 * @param {object} figures - as splitLongPeriodFigures takes
 * @param {Record<number, object>} taxDataByYear - parsed ltd-<FY>.toml files for the financial years of both periods
 * @param {object} [options]
 * @param {string} [options.today] - ISO date, as deriveCt600FromFigures takes
 * @returns {[object, object]} deriveCt600FromFigures results; each also carries periodOfAccount
 */
export function deriveLongPeriodReturns(figures, taxDataByYear, options) {
  const [first, second] = splitLongPeriodFigures(figures);
  const firstReturn = deriveCt600FromFigures(first, taxDataByYear, options);
  const secondFigures = { ...second, priorPeriodChargeableProfits: firstReturn.boxes[315] };
  if (firstReturn.losses.totalCarriedForward > 0) secondFigures.lossesBroughtForward = firstReturn.losses.totalCarriedForward;
  const secondReturn = deriveCt600FromFigures(secondFigures, taxDataByYear, options);
  if (!secondReturn.carryBack) return [firstReturn, secondReturn];

  const firstWithClaim = deriveCt600FromFigures(
    { ...first, lossCarriedBackFromLaterPeriod: secondReturn.carryBack.amount },
    taxDataByYear,
    options,
  );
  const repayable = poundsAndPence((firstReturn.boxes[440] - firstWithClaim.boxes[440]) * 100);
  return [firstWithClaim, { ...secondReturn, carryBack: { ...secondReturn.carryBack, taxRepayable: repayable } }];
}
