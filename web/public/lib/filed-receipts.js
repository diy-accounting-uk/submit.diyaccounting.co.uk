// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/filed-receipts.js
// The filings a person made that can fill an accounts form or the Company Tax Return: their HMRC
// Company Tax Return receipts and Companies House accounts receipts, each for a company and a
// period. A filing of another company, or of another period than the form already holds, is left
// out. The filed accounts document a receipt keeps is what fills the form.

export const FILLING_RECEIPT_KINDS = ["company-tax-return", "companies-house-accounts"];

const normalisedNumber = (number) =>
  String(number ?? "")
    .trim()
    .toUpperCase();

/**
 * The receipts that can fill the form, newest first.
 * @param {Array<object>} receipts - the receipts route's list
 * @param {{companyNumber: string, periodStart?: string, periodEnd?: string}} form
 */
export function receiptsForForm(receipts, { companyNumber, periodStart, periodEnd }) {
  const company = normalisedNumber(companyNumber);
  if (!company) return [];
  const formHoldsPeriod = Boolean(periodStart && periodEnd);
  return (receipts ?? [])
    .filter((receipt) => FILLING_RECEIPT_KINDS.includes(receipt.kind))
    .filter((receipt) => normalisedNumber(receipt.companyNumber) === company)
    .filter((receipt) => !formHoldsPeriod || (receipt.periodStart === periodStart && receipt.periodEnd === periodEnd))
    .sort((first, second) => String(second.timestamp ?? "").localeCompare(String(first.timestamp ?? "")));
}

/** The filed accounts document a receipt keeps, as text, or null when it kept none. */
export function filedAccountsDocumentOf(record) {
  if (record?.kind === "company-tax-return") return record.filed?.accountsIxbrl || null;
  if (record?.kind === "companies-house-accounts") return record.filedDocument || null;
  return null;
}

/** The Company Tax Return boxes a receipt was filed with, or null for accounts. */
export function filedBoxesOf(record) {
  return record?.kind === "company-tax-return" && record.filed?.boxes ? record.filed.boxes : null;
}
