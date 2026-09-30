// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2006-2026 DIY Accounting Limited
//
// capital-allowances.js — UK Capital Allowances, as the Fixed Assets
// schedule claims them.
//
// The schedule gives an asset bought in the year the annual investment
// allowance on its whole cost, and an asset brought forward a writing down
// allowance on the tax written-down value it carries. Either way the asset
// leaves the year with a pool value: cost less the allowance for a purchase,
// written-down value less the allowance for an asset already owned. Selling
// it settles that pool against the sale proceeds, which is a balancing
// allowance when the proceeds fall short and a balancing charge when they
// exceed it.
//
// Percentages arrive as the sheets hold them, whole numbers out of 100, so a
// rate read straight off the Admin sheet needs no conversion.

/**
 * One asset's allowance for the year.
 *
 * @param {Object} asset
 * @param {boolean} asset.acquiredInYear - bought in the year, so it claims the investment allowance
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

  const investmentAllowance = asset.acquiredInYear && cost > 0 ? (cost * rates.investmentAllowancePercent) / 100 : 0;
  const writingDownAllowance = !asset.acquiredInYear && writtenDownValue > 0 ? (writtenDownValue * rates.writingDownPercent) / 100 : 0;

  let poolCarriedForward = 0;
  if (asset.acquiredInYear && cost > 0) poolCarriedForward = cost - investmentAllowance;
  else if (writtenDownValue > 0) poolCarriedForward = writtenDownValue - writingDownAllowance;

  const proceeds = asset.disposalProceeds || 0;
  const sold = proceeds > 0 || asset.disposed === true;
  const balancingAllowance = sold && proceeds < poolCarriedForward ? poolCarriedForward - proceeds : 0;
  const balancingCharge = sold && proceeds > poolCarriedForward ? proceeds - poolCarriedForward : 0;

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
