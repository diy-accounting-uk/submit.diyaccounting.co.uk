// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2006-2026 DIY Accounting Limited
//
// national-insurance.js — UK National Insurance calculations.

/**
 * Calculate NI Class 4 contributions for self-employed.
 * @param {number} profit - annual profit
 * @param {Object} niRates - { class4_lower_limit, class4_upper_limit, class4_lower_rate, class4_upper_rate }
 * @returns {{ lowerBand, upperBand, total }}
 */
export function calculateNIClass4(profit, niRates) {
  const { class4_lower_limit, class4_upper_limit, class4_lower_rate, class4_upper_rate } = niRates;
  const lowerBand = profit > class4_lower_limit ? (Math.min(profit, class4_upper_limit) - class4_lower_limit) * class4_lower_rate : 0;
  const upperBand = profit > class4_upper_limit ? (profit - class4_upper_limit) * class4_upper_rate : 0;
  return { lowerBand, upperBand, total: lowerBand + upperBand };
}

/**
 * Calculate NI Class 2 contributions for self-employed.
 * @param {number} profit - annual profit
 * @param {Object} niRates - { class2_weekly_rate, class2_small_profits_threshold? }
 * @returns {number} annual Class 2 NI
 */
export function calculateNIClass2(profit, niRates) {
  const weeklyRate = niRates.class2_weekly_rate || niRates.class2_rate || 0;
  if (weeklyRate === 0) return 0;
  const threshold = niRates.class2_small_profits_threshold || 0;
  if (threshold > 0 && profit < threshold) return 0;
  return weeklyRate * 52;
}
