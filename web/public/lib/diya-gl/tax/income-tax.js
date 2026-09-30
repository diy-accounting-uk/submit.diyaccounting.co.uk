// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2006-2026 DIY Accounting Limited
//
// income-tax.js — UK income tax calculation for self-employed individuals.

/**
 * Calculate income tax from profit and tax rates.
 *
 * The personal allowance falls by one pound for every two pounds of income
 * above the taper threshold (ITA 2007 s35). That divisor has not moved since
 * 2010, so it sits in the formula rather than in the tax data.
 *
 * @param {number} profit - taxable profit before personal allowance
 * @param {Object} taxRates - { personal_allowance, personal_allowance_taper_threshold, basic_band_end,
 *   higher_band_end, basic_rate, higher_rate, additional_rate }
 * @returns {{ personalAllowance, taxableIncome, basicRateTax, higherRateTax, additionalRateTax, totalIncomeTax }}
 */
export function calculateIncomeTax(profit, taxRates) {
  const withdrawn = Math.max(0, profit - taxRates.personal_allowance_taper_threshold) / 2;
  const pa = Math.max(0, taxRates.personal_allowance - withdrawn);
  const taxableIncome = Math.max(0, profit - pa);
  const basicBandEnd = taxRates.basic_band_end;
  const higherBandEnd = taxRates.higher_band_end;
  const basicRateTax = Math.min(taxableIncome, basicBandEnd) * taxRates.basic_rate;
  const higherRateTax = Math.max(0, Math.min(taxableIncome, higherBandEnd) - basicBandEnd) * taxRates.higher_rate;
  const additionalRateTax = Math.max(0, taxableIncome - higherBandEnd) * taxRates.additional_rate;
  const totalIncomeTax = basicRateTax + higherRateTax + additionalRateTax;

  return {
    personalAllowance: pa,
    taxableIncome,
    basicRateTax,
    higherRateTax,
    additionalRateTax,
    totalIncomeTax,
  };
}

// Half up to the penny, for the voluntary Class 2 figure below.
function round2(value) {
  return Math.round(value * 100) / 100;
}

/**
 * Backward-compatible wrapper matching reconcile.js calculateExpectedTax signature.
 * Computes income tax + NI Class 4 from profit and full tax data.
 * @param {number} profit - taxable profit
 * @param {Object} taxData - full tax data object (from app/data/*.toml)
 * @returns {{ income_tax, personal_allowance, income_tax_basic, income_tax_higher, income_tax_additional,
 *   ni_class4_lower, ni_class4_upper, total_tax_and_ni, ni_class2_weekly, ni_class2_threshold, ni_class2 }}
 */
export function calculateExpectedTax(profit, taxData) {
  const { totalIncomeTax, personalAllowance, basicRateTax, higherRateTax, additionalRateTax } = calculateIncomeTax(
    profit,
    taxData.income_tax,
  );

  const lowerLimit = taxData.national_insurance.class4_lower_limit;
  const upperLimit = taxData.national_insurance.class4_upper_limit;
  const lowerRate = taxData.national_insurance.class4_lower_rate;
  const upperRate = taxData.national_insurance.class4_upper_rate;
  const niLower = profit > lowerLimit ? (Math.min(profit, upperLimit) - lowerLimit) * lowerRate : 0;
  const niUpper = profit > upperLimit ? (profit - upperLimit) * upperRate : 0;

  // Class 2 is voluntary below the small profits threshold (a customer may
  // choose to pay it to protect their state pension record) and nil above
  // it, where the NI record is credited without payment.
  const class2Weekly = taxData.national_insurance.class2_weekly_rate;
  const class2Threshold = taxData.national_insurance.class2_small_profits_threshold;

  // income_tax, ni_class4_lower, ni_class4_upper and total_tax_and_ni carry
  // no rounding of their own, matching the Income Tax sheet: E11 (BST/SE) /
  // E11 (Taxi) is SUM(E8:E10) and the total (E18 BST/SE, E17 Taxi) is
  // SUM(E11:E17) with every intermediate row a plain formula -- the sheet
  // never rounds this chain, so the JS mirror does not either.
  return {
    income_tax: totalIncomeTax,
    personal_allowance: personalAllowance,
    income_tax_basic: basicRateTax,
    income_tax_higher: higherRateTax,
    income_tax_additional: additionalRateTax,
    ni_class4_lower: niLower,
    ni_class4_upper: niUpper,
    total_tax_and_ni: totalIncomeTax + niLower + niUpper,
    ni_class2_weekly: class2Weekly,
    ni_class2_threshold: class2Threshold,
    ni_class2: profit < class2Threshold ? round2(class2Weekly * 52) : 0,
  };
}

/**
 * Runs the six checks the SE Profit Forecast and Taxi Wages Forecast sheets
 * share: personal allowance after taper, tax at each of the three income
 * tax rates, Class 4 National Insurance, and the total liability. Read
 * against both templates' own formulas (Profit Forecast C40-C46, Wages
 * Forecast C35-C41), neither carries a ROUND() anywhere in this chain --
 * every intermediate cell is a plain arithmetic or IF formula over the
 * Admin sheet's own rate cells, the same rates calculateExpectedTax takes.
 * So every comparison here runs to the penny: a wider tolerance would only
 * hide a genuine mismatch between the sheet's formula and this mirror.
 *
 * Both templates also floor the personal allowance at nil when the
 * forecast has no taxable profit (C39/C34 <= 0), rather than showing the
 * taper's full, unclamped allowance -- calculateExpectedTax has no such
 * floor, so the comparison applies it here.
 *
 * @param {function} check - (name, actual, expected, tolerance) => void, the caller's own check()
 * @param {number} forecastProfit - the sheet's own taxable profit cell (Profit Forecast C39 / Wages Forecast C34)
 * @param {{personalAllowance: number, standard: number, higher: number, additional: number, ni: number, total: number}} cells
 *   - the sheet's own personal allowance, tax-at-rate, NI and total cells
 * @param {Object} taxData
 * @param {function} calculateExpectedTax
 */
export function checkForecastTaxAndNi(check, forecastProfit, cells, taxData, calculateExpectedTax) {
  const expected = calculateExpectedTax(forecastProfit, taxData);
  check("Forecast: personal allowance after taper", cells.personalAllowance, forecastProfit <= 0 ? 0 : expected.personal_allowance, 0.01);
  check("Forecast: tax at standard rate", cells.standard, expected.income_tax_basic, 0.01);
  check("Forecast: tax at higher rate", cells.higher, expected.income_tax_higher, 0.01);
  check("Forecast: tax at additional rate", cells.additional, expected.income_tax_additional, 0.01);
  check("Forecast: National Insurance", cells.ni, expected.ni_class4_lower + expected.ni_class4_upper, 0.01);
  check("Forecast: tax and NI liability", cells.total, expected.total_tax_and_ni, 0.01);
}
