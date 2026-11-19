// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2006-2026 DIY Accounting Limited
//
// capital-allowances.js — UK Capital Allowances, as the Fixed Assets
// schedule claims them.
//
// The schedule gives an asset bought in the year the annual investment
// allowance on its whole cost, and an asset brought forward a writing down
// allowance on the tax written-down value it carries. A car does not qualify
// for the annual investment allowance, so a car bought in the year claims the
// writing down allowance on its cost, less its private use share. Either way
// the asset leaves the year with a pool value: cost less the allowance for a
// purchase, written-down value less the allowance for an asset already owned. Selling
// it settles that pool against the sale proceeds, which is a balancing
// allowance when the proceeds fall short and a balancing charge when they
// exceed it.
//
// Percentages arrive as the sheets hold them, whole numbers out of 100, so a
// rate read straight off the Admin sheet needs no conversion.

import { financialYearsInPeriod, financialYearNumber } from "./corporation-tax.js";

/**
 * One asset's allowance for the year.
 *
 * @param {Object} asset
 * @param {boolean} asset.acquiredInYear - bought in the year, so it claims the investment allowance
 * @param {boolean} [asset.car] - a car, which claims writing down allowance on its cost in the year it is bought
 * @param {number} [asset.privateUse] - the share of a car's use that is private, 0 to 1; it reduces the allowance and any balancing figure
 * @param {number} asset.cost - original cost, net of VAT
 * @param {number} [asset.taxWrittenDownValue] - the pool value brought forward, for an asset already owned
 * @param {number} [asset.disposalProceeds] - sale proceeds, net of VAT, when the asset was sold in the year
 * @param {boolean} [asset.disposed] - sold in the year even when the proceeds were nil
 * @param {Object} rates
 * @param {number} rates.investmentAllowancePercent - whole-number percentage of cost the year allows
 * @param {number} rates.writingDownPercent - whole-number percentage of written-down value the year allows
 * @returns {{ investmentAllowance: number, writingDownAllowance: number, poolCarriedForward: number,
 *             balancingAllowance: number, balancingCharge: number }}
 */
export function assetCapitalAllowance(asset, rates) {
  const cost = asset.cost || 0;
  const writtenDownValue = asset.taxWrittenDownValue || 0;
  const privateUseFactor = 1 - (asset.privateUse || 0);
  const boughtCar = asset.acquiredInYear && asset.car === true;

  const investmentAllowance = asset.acquiredInYear && !boughtCar && cost > 0 ? (cost * rates.investmentAllowancePercent) / 100 : 0;
  const writingDownBase = boughtCar ? cost : !asset.acquiredInYear ? writtenDownValue : 0;
  const writingDownAllowance = writingDownBase > 0 ? (writingDownBase * rates.writingDownPercent * privateUseFactor) / 100 : 0;

  let poolCarriedForward = 0;
  if (asset.acquiredInYear && cost > 0) poolCarriedForward = cost - investmentAllowance - writingDownAllowance;
  else if (writtenDownValue > 0) poolCarriedForward = writtenDownValue - writingDownAllowance;

  const proceeds = asset.disposalProceeds || 0;
  const sold = proceeds > 0 || asset.disposed === true;
  const balancingAllowance = sold && proceeds < poolCarriedForward ? (poolCarriedForward - proceeds) * privateUseFactor : 0;
  const balancingCharge = sold && proceeds > poolCarriedForward ? (proceeds - poolCarriedForward) * privateUseFactor : 0;

  return { investmentAllowance, writingDownAllowance, poolCarriedForward, balancingAllowance, balancingCharge };
}

/**
 * The capital allowances a set of assets claims for one year.
 *
 * A balancing charge is a claw-back, so it comes off the total the tax
 * computation deducts rather than adding to it.
 *
 * @param {Array<Object>} assets - see assetCapitalAllowance
 * @param {Object} rates - see assetCapitalAllowance
 * @returns {{ investmentAllowance: number, writingDownAllowance: number, balancingAllowance: number,
 *             balancingCharge: number, total: number }}
 */
export function calculateCapitalAllowances(assets, rates) {
  const totals = { investmentAllowance: 0, writingDownAllowance: 0, balancingAllowance: 0, balancingCharge: 0 };
  for (const asset of assets || []) {
    const claim = assetCapitalAllowance(asset, rates);
    totals.investmentAllowance += claim.investmentAllowance;
    totals.writingDownAllowance += claim.writingDownAllowance;
    totals.balancingAllowance += claim.balancingAllowance;
    totals.balancingCharge += claim.balancingCharge;
  }
  return {
    ...totals,
    total: totals.investmentAllowance + totals.writingDownAllowance + totals.balancingAllowance - totals.balancingCharge,
  };
}

/**
 * The main writing down rate a Company accounting period claims, as a
 * percentage.
 *
 * A period inside one financial year claims that year's rate, as a whole
 * percentage. A period that holds the day the rate changed (1 April) claims a
 * hybrid rate, by the method on
 * https://www.gov.uk/guidance/calculate-your-hybrid-rate-of-writing-down-allowance :
 * the days before the change over the days in the period times the earlier
 * rate, plus the days from the change over the days in the period times the
 * later rate, rounded up to 2 decimal places. The earlier rate comes from the
 * tax data's capital_allowances_previous_financial_year table, the later from
 * its capital_allowances table. The sum is worked in hundredths of a percent
 * with whole numbers, so the rounding step never moves a figure that is exact.
 *
 * @param {Object} taxData - the ltd-<FY>.toml the period's year end falls in
 * @param {Date} periodStart
 * @param {Date} periodEnd
 * @returns {number} the rate as a percentage, such as 14 or 17.01
 */
export function mainWritingDownPercent(taxData, periodStart, periodEnd) {
  // Tax data with no capital allowances table reaches here from callers that
  // want the period dates off the Admin sheet and nothing else. The rate cell
  // comes out NaN for them, as the other rate cells do.
  const current = taxData.capital_allowances?.writing_down_allowance_main;
  if (current === undefined) return NaN;
  const wholePercent = Math.round(current * 100);
  const { years, totalDays } = financialYearsInPeriod(periodStart, periodEnd);
  const [earlier, later] = years;
  if (earlier.year === financialYearNumber(periodEnd) || earlier.days <= 0 || later.days <= 0) return wholePercent;

  const previous = taxData.capital_allowances_previous_financial_year?.writing_down_allowance_main;
  if (previous === undefined) {
    throw new Error(
      `the tax data states no capital_allowances_previous_financial_year.writing_down_allowance_main, so the ${earlier.days} days of the period before 1 April have no rate`,
    );
  }
  if (Math.round(previous * 10000) === Math.round(current * 10000)) return wholePercent;

  const hundredths = Math.ceil((earlier.days * Math.round(previous * 10000) + later.days * Math.round(current * 10000)) / totalDays);
  return hundredths / 100;
}

/**
 * mainWritingDownPercent for the twelve month period that ends on a year end.
 * @param {Object} taxData
 * @param {Date} yearEnd
 * @returns {number}
 */
export function mainWritingDownPercentForYearEnd(taxData, yearEnd) {
  const periodStart = new Date(Date.UTC(yearEnd.getUTCFullYear() - 1, yearEnd.getUTCMonth() + 1, 1));
  return mainWritingDownPercent(taxData, periodStart, yearEnd);
}
