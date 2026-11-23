// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/balance-sheet-check.js
// The arithmetic a micro-entity balance sheet must hold before it is rendered or filed, shared by the
// accounts form and the accounts route: capital and reserves equal called up share capital plus the
// profit and loss account. A document that breaks it cannot be read back, so it cannot be revised.

// The words the route answers; the form shows the same words through siteText.
export const CAPITAL_AND_RESERVES_MESSAGE =
  "Capital and reserves of {capital} for {year} do not equal called up share capital plus the profit and loss account, which add up to {sum}.";

export const YEAR_NAMES = { currentYear: "the current year", priorYear: "the prior year" };

/** A whole-pound amount as the forms write money: £10,000, or -£500. */
export function formatPounds(amount) {
  return `${amount < 0 ? "-" : ""}£${Math.abs(amount).toLocaleString("en-GB")}`;
}

/**
 * The figures of a year whose capital and reserves differ from the lines under them, or null when
 * they agree or a figure is not a number.
 * @param {{calledUpShareCapital: number, profitAndLossAccount: number, capitalAndReserves: number}} year
 * @returns {{capital: number, sum: number}|null}
 */
export function capitalAndReservesMismatch({ calledUpShareCapital, profitAndLossAccount, capitalAndReserves }) {
  if (![calledUpShareCapital, profitAndLossAccount, capitalAndReserves].every(Number.isFinite)) return null;
  const sum = calledUpShareCapital + profitAndLossAccount;
  return sum === capitalAndReserves ? null : { capital: capitalAndReserves, sum };
}

/**
 * The message for a mismatch, in the words of CAPITAL_AND_RESERVES_MESSAGE.
 * @param {{capital: number, sum: number}} mismatch
 * @param {string} yearName - "the current year" or "the prior year", in the reader's language
 * @param {string} [template] - the same message in the reader's language
 */
export function capitalAndReservesMessage({ capital, sum }, yearName, template = CAPITAL_AND_RESERVES_MESSAGE) {
  return template.replace("{capital}", formatPounds(capital)).replace("{year}", yearName).replace("{sum}", formatPounds(sum));
}
