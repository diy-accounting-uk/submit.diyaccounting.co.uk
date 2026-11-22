// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/share-capital.js
// Share capital arithmetic for the return of allotment of shares: numbers of shares and amounts
// with up to six decimal places, added and multiplied without rounding, and a company's statement
// of capital after an allotment. A plain ES module, so the page and app/ both read it.

const SCALE = 1_000_000n;
const DECIMAL = /^\d{1,20}(\.\d{1,6})?$/;

/**
 * A number of shares or an amount as millionths, or null when the text is not a non-negative
 * decimal of at most six decimal places.
 * @param {string|number} value
 * @returns {bigint|null}
 */
export function toMillionths(value) {
  const text = String(value ?? "").trim();
  if (!DECIMAL.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  return BigInt(whole) * SCALE + BigInt(fraction.padEnd(6, "0"));
}

/**
 * Millionths as a decimal, with no trailing zeros.
 * @param {bigint} millionths
 * @returns {string}
 */
export function fromMillionths(millionths) {
  const whole = millionths / SCALE;
  let fraction = (millionths % SCALE).toString().padStart(6, "0");
  while (fraction.endsWith("0")) fraction = fraction.slice(0, -1);
  return fraction ? `${whole}.${fraction}` : `${whole}`;
}

/**
 * The product of two millionths values as millionths, or null when it has more than six decimal places.
 * @param {bigint} left
 * @param {bigint} right
 * @returns {bigint|null}
 */
export function multiplyMillionths(left, right) {
  const product = left * right;
  return product % SCALE === 0n ? product / SCALE : null;
}

/** The sum of decimals, as a decimal; a value that is not a decimal counts as nothing. */
export function sumDecimals(values) {
  return fromMillionths(values.reduce((total, value) => total + (toMillionths(value) ?? 0n), 0n));
}

/**
 * The product of two decimals as a decimal, or null when either is not a decimal or the product has
 * more than six decimal places.
 */
export function multiplyDecimals(left, right) {
  const leftValue = toMillionths(left);
  const rightValue = toMillionths(right);
  if (leftValue === null || rightValue === null) return null;
  const product = multiplyMillionths(leftValue, rightValue);
  return product === null ? null : fromMillionths(product);
}

/**
 * A company's capital in one currency after allotments: each allotment adds its shares and their
 * nominal value to its class, or starts a class with no particulars yet, and adds what is unpaid on
 * its shares to the total unpaid. An allotment that is not complete yet is left out.
 * @param {{totalAmountUnpaid: string, shares: Array<{shareClass: string, prescribedParticulars: string, numShares: string,
 *   aggregateNominalValue: string}>}} before - the capital on the register, with no shares for a company that has none
 * @param {Array<{shareClass: string, numShares: string, nominalValue: string, amountUnpaidPerShare: string}>} allotments
 * @returns {{totalAmountUnpaid: string, totalNumberOfIssuedShares: string, totalAggregateNominalValue: string,
 *   shares: Array<{shareClass: string, prescribedParticulars: string, numShares: string, aggregateNominalValue: string, added: boolean}>}}
 *   added marks a class the allotments start
 */
export function capitalAfterAllotments(before, allotments) {
  const shares = (before.shares || []).map((share) => ({ ...share, added: false }));
  let unpaid = toMillionths(before.totalAmountUnpaid) ?? 0n;
  for (const allotment of allotments) {
    const shareClass = String(allotment.shareClass ?? "").trim();
    const number = toMillionths(allotment.numShares);
    const nominal = number === null ? null : multiplyMillionths(number, toMillionths(allotment.nominalValue) ?? -1n);
    if (!shareClass || number === null || number === 0n || nominal === null || nominal <= 0n) continue;
    const unpaidOnShares = multiplyMillionths(number, toMillionths(allotment.amountUnpaidPerShare) ?? 0n) ?? 0n;
    unpaid += unpaidOnShares;
    const held = shares.find((share) => share.shareClass.trim().toLowerCase() === shareClass.toLowerCase());
    if (held) {
      held.numShares = fromMillionths((toMillionths(held.numShares) ?? 0n) + number);
      held.aggregateNominalValue = fromMillionths((toMillionths(held.aggregateNominalValue) ?? 0n) + nominal);
    } else {
      shares.push({
        shareClass,
        prescribedParticulars: "",
        numShares: fromMillionths(number),
        aggregateNominalValue: fromMillionths(nominal),
        added: true,
      });
    }
  }
  return {
    totalAmountUnpaid: fromMillionths(unpaid),
    totalNumberOfIssuedShares: sumDecimals(shares.map((share) => share.numShares)),
    totalAggregateNominalValue: sumDecimals(shares.map((share) => share.aggregateNominalValue)),
    shares,
  };
}
