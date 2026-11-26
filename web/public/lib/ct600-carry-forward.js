// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/ct600-carry-forward.js
// Next year's Company Tax Return starts from this year's: from the return Submit filed for the
// company's last period, the next 12 months as the period, last year's accounts as the accounts'
// prior-year column, the losses carried forward as box 160, last year's box 315 as the previous
// period's chargeable profits, and box 326, the trade name, the declarant and the statements as
// last year. This year's figures stay for the person to type. HMRC gives software no read of a
// filed return, so the return is Submit's own record of it, and last year's accounts are the ones
// filed with it or, failing those, the accounts on the Companies House register.

import {
  ACCOUNTS_REGIMES,
  BALANCE_SHEET_FIELDS,
  MICRO_BALANCE_SHEET_FIELDS,
  PROFIT_AND_LOSS_FIELDS,
  balanceSheetId,
  microId,
  profitAndLossId,
} from "./ct600-fields.js";
import { foldBalanceSheetHeadings } from "./balance-sheet-headings.js";

const figureText = (value) => (Number.isInteger(value) ? String(value) : value.toFixed(2));

function isoDay(date) {
  return date.toISOString().slice(0, 10);
}

/** The 12 months after a period that ended on periodEnd. */
export function nextPeriodAfter(periodEnd) {
  const end = new Date(`${periodEnd}T00:00:00Z`);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() + 1);
  const nextEnd = new Date(Date.UTC(end.getUTCFullYear() + 1, end.getUTCMonth(), end.getUTCDate()));
  // A period to 28 February ends on 28 February next year too, and one to 29 February on the 28th.
  if (nextEnd.getUTCMonth() !== end.getUTCMonth()) nextEnd.setUTCDate(0);
  return { periodStart: isoDay(start), periodEnd: isoDay(nextEnd) };
}

/**
 * The company's last Company Tax Return Submit filed, from the receipts route's list: the one whose
 * period ends latest, or null.
 */
export function lastFiledReturn(receipts, companyNumber) {
  const company = String(companyNumber ?? "")
    .trim()
    .toUpperCase();
  const returns = (receipts ?? []).filter(
    (receipt) =>
      receipt.kind === "company-tax-return" &&
      receipt.periodEnd &&
      String(receipt.companyNumber ?? "")
        .trim()
        .toUpperCase() === company,
  );
  returns.sort(
    (first, second) =>
      String(second.periodEnd).localeCompare(String(first.periodEnd)) || String(second.timestamp).localeCompare(String(first.timestamp)),
  );
  return returns[0] ?? null;
}

function entriesOf(idOf, fields, figures) {
  return fields.filter(([field]) => Number.isFinite(figures?.[field])).map(([field]) => [idOf("prior", field), figureText(figures[field])]);
}

/**
 * The accounts' prior-year column from last year's accounts: the regime they were, their balance
 * sheet and, for small company accounts, their profit and loss account, all as this form's last year.
 * @param {{regime: "micro"|"small", balanceSheet: object, profitAndLoss?: object|null}} accounts - one year of accounts
 */
export function priorYearEntries({ regime, balanceSheet, profitAndLoss }) {
  const micro = regime === "micro";
  const regimeId = ACCOUNTS_REGIMES.find((choice) => choice.value === (micro ? "micro" : "small")).id;
  if (micro) {
    const lines = MICRO_BALANCE_SHEET_FIELDS.map(([field]) => field);
    return [[regimeId, true], ...entriesOf(microId, MICRO_BALANCE_SHEET_FIELDS, foldBalanceSheetHeadings(balanceSheet, lines))];
  }
  const lines = BALANCE_SHEET_FIELDS.map(([field]) => field);
  return [
    [regimeId, true],
    ["includeComparatives", true],
    ...entriesOf(balanceSheetId, BALANCE_SHEET_FIELDS, foldBalanceSheetHeadings(balanceSheet, lines)),
    ...entriesOf(profitAndLossId, PROFIT_AND_LOSS_FIELDS, profitAndLoss),
  ];
}

/** One year of accounts from the accounts filed with a return, as the diya-gl reader mapped them: their current year. */
export function lastYearOfFiledAccounts(mapped) {
  return { regime: mapped.regime, balanceSheet: mapped.balanceSheet.currentYear, profitAndLoss: mapped.profitAndLoss?.currentYear ?? null };
}

/** One year of accounts from the register, as the last-accounts route maps them. */
export function lastYearOfRegisterAccounts(accounts) {
  return { regime: accounts.regime, balanceSheet: accounts.balanceSheet, profitAndLoss: accounts.profitAndLoss?.figures ?? null };
}

/**
 * The answers last year's return carries into this year's: the next period, box 160 from the
 * losses carried forward (when they are known), the previous period's chargeable profits from box
 * 315, box 326, the trade name, the declarant and the statements.
 * @param {{periodEnd: string, filed?: {boxes?: object}, formRequest?: {values?: object}}} record - the stored return and its period end
 * @param {{lossesCarriedForward: number|null}} worked - from last year's own working
 */
export function carryForwardEntries(record, { lossesCarriedForward }) {
  const boxes = record.filed?.boxes ?? {};
  const values = record.formRequest?.values ?? {};
  const box = (number) => boxes[number] ?? boxes[String(number)];
  const next = nextPeriodAfter(record.periodEnd);
  const entries = [
    ["periodStart", next.periodStart],
    ["periodEnd", next.periodEnd],
  ];
  if (Number.isFinite(lossesCarriedForward)) entries.push(["lossesBroughtForward", figureText(lossesCarriedForward)]);
  if (box(315) !== undefined) entries.push(["priorPeriodChargeableProfits", figureText(Number(box(315)))]);
  const associated = box(326) ?? values.associatedCompanies;
  if (associated !== undefined && associated !== "") entries.push(["associatedCompanies", String(associated)]);
  if (values.tradeName) entries.push(["tradeName", values.tradeName]);
  const declarantName = values.declarantName || box(975);
  const declarantStatus = values.declarantStatus || box(985);
  if (declarantName) entries.push(["declarantName", String(declarantName)]);
  if (declarantStatus) entries.push(["declarantStatus", String(declarantStatus)]);
  for (const [id, value] of Object.entries(values)) if (id.startsWith("statement") && value === true) entries.push([id, true]);
  return entries;
}
