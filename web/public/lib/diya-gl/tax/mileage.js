// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2006-2026 DIY Accounting Limited
//
// mileage.js — the HMRC approved mileage allowance, shared by the Basic
// Sole Trader and Taxi Driver engines.

// HMRC's approved mileage rate for a car: 45p to the first 10,000 business
// miles in the tax year, 25p beyond. It has held since 2011/12 and matches
// every tax year this app's own data files carry (app/data/*.toml). A figure
// worked out from it ahead of any one tax year's data -- an expected value at
// fixture-extraction time, say -- does not go stale the way a rate that does
// change year to year would.
export const HMRC_CAR_MILEAGE_RATES = { higher_rate_limit: 10000, higher_rate_pence: 0.45, lower_rate_pence: 0.25 };

/**
 * The allowance a year's business miles claim: the first band of miles at
 * the higher rate, the rest at the lower one.
 *
 * The packages band it a month at a time off a running mileage total (BST:
 * PurchasesApr!G4 = IF(C1<Admin!F22, C1*Admin!G21, C1*G21-(C1-F21)*(G21-G22)),
 * each later month subtracting what the months before it already claimed;
 * Taxi: the same shape at PurchasesApr!U4 off its own A1). Month by month
 * those subtractions telescope, so the year's total is this one calculation.
 *
 * @param {number} totalMiles - business miles for the year
 * @param {Object} mileageRates - the tax year's [mileage] table
 * @returns {number} the allowance claimed
 */
export function calculateMileageAllowance(totalMiles, mileageRates) {
  const higherBandMiles = Math.min(totalMiles, mileageRates.higher_rate_limit);
  const lowerBandMiles = Math.max(0, totalMiles - mileageRates.higher_rate_limit);
  return higherBandMiles * mileageRates.higher_rate_pence + lowerBandMiles * mileageRates.lower_rate_pence;
}

/**
 * Business miles a journal's lines carry. A line records them as a measurable
 * quantity in miles beside the money it moves — a taxi day's fares carry the
 * miles driven to earn them, a purchase carries the miles the journey to make
 * it took.
 *
 * @param {Array} lines - journal lines
 * @returns {number} total miles
 */
export function totalBusinessMiles(lines) {
  return lines
    .filter((line) => line.measurableUnitOfMeasure === "miles" && typeof line.measurableQuantity === "number")
    .reduce((sum, line) => sum + line.measurableQuantity, 0);
}

/**
 * Business miles a scenario's own sales and purchase rows carry. This is what
 * cellWrites puts on the sheets' mileage columns, so it is what the recalculated
 * package's allowance is worked out from.
 *
 * @param {Object} scenario - a loaded scenario (or a merged scenario/expected)
 * @returns {number} total miles
 */
export function scenarioBusinessMiles(scenario) {
  let miles = 0;
  for (const table of [scenario.sales, scenario.purchases]) {
    if (!table) continue;
    for (const transactions of Object.values(table)) {
      for (const tx of transactions) {
        if (typeof tx.mileage === "number") miles += tx.mileage;
      }
    }
  }
  return miles;
}
