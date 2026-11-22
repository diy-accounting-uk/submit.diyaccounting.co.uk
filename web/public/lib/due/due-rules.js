// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability SITE-36 Compute due dates from sourced rules
// - **Use when:** working out a filing or payment date that no service states: a Company Tax Return and its payment from an accounting period, a VAT return or payment from its period end, the next VAT period, the standard Income Tax updates, the Self Assessment payments, a director or PSC change, or the identity verification on a confirmation statement.
// - **Does:** due-rules.js is a plain ES module that the browser and app/ both import. Each function answers rows of ISO dates in UK days, each with the fact id of its rule and source "computed"; every fact id has a source file under .claude/skills/tax-sources/sources with its gov.uk quote. A period of account longer than 12 months splits into two accounting periods. A month added to the last day of a month lands on the last day of the later month, as HMRC counts.
// - **Run:** `npx vitest run web/unit-tests/dueRules.test.js`
// - **Entry:** `web/public/lib/due/due-rules.js:ct600Rows`; `web/public/lib/due/due-rules.js:ctPaymentRows`; `web/public/lib/due/due-rules.js:vatReturnDue`; `web/public/lib/due/due-rules.js:vatPaymentDue`; `web/public/lib/due/due-rules.js:expectedNextVatPeriod`; `web/public/lib/due/due-rules.js:itsaStandardRows`; `web/public/lib/due/due-rules.js:saPaymentRows`; `web/public/lib/due/due-rules.js:changeDue`; `web/public/lib/due/due-rules.js:identityVerificationRow`
// - **Files:** web/public/lib/due/due-rules.js, web/unit-tests/dueRules.test.js, .claude/skills/tax-sources/sources/sa-payments-on-account.json, .claude/skills/tax-sources/sources/sa-balancing-payment.json, .claude/skills/tax-sources/sources/ch-officer-changes-14-days.json, .claude/skills/tax-sources/sources/ch-psc-changes-14-days.json, .claude/skills/tax-sources/sources/vat-payment-same-deadline.json
// - **Keywords:** due dates, deadline rules, ct600 due date, corporation tax payment date, vat return due date, vat payment date, payments on account, balancing payment, officer change 14 days, psc change, identity verification, period of account split
// - **Related:** SITE-22
// @end-capability

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The fact id of each rule, as the source files list them. */
export const DUE_RULE_FACT_IDS = {
  ct600: "ct600-12-months",
  ctPayment: "ct-payment-9-months-1-day",
  vatReturn: "vat-return-due-date",
  vatPayment: "vat-payment-same-deadline",
  itsaQuarterly: "itsa-quarterly-update-deadlines",
  itsaFinalDeclaration: "itsa-final-declaration-deadline",
  saPaymentsOnAccount: "sa-payments-on-account",
  saBalancingPayment: "sa-balancing-payment",
  officerChange: "ch-officer-changes-14-days",
  pscChange: "ch-psc-changes-14-days",
  identityVerification: "ch-identity-verification-2025-11",
};

function parse(iso, name) {
  const match = ISO_DATE.exec(String(iso ?? ""));
  const date = match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) : null;
  if (!date || date.toISOString().slice(0, 10) !== iso) throw new Error(`${name} must be a date written YYYY-MM-DD`);
  return date;
}

function format(date) {
  return date.toISOString().slice(0, 10);
}

function lastDayOf(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function addDays(iso, days) {
  const date = parse(iso, "date");
  date.setUTCDate(date.getUTCDate() + days);
  return format(date);
}

// Months after a date, as HMRC and Companies House count them: the same day of the later month, the
// last day of that month when it is shorter, and the last day when the date is the last of its month.
function addMonths(iso, months) {
  const date = parse(iso, "date");
  const year = date.getUTCFullYear();
  const monthIndex = date.getUTCMonth();
  const day = date.getUTCDate();
  const target = new Date(Date.UTC(year, monthIndex + months, 1));
  const targetLast = lastDayOf(target.getUTCFullYear(), target.getUTCMonth());
  const monthEnd = day === lastDayOf(year, monthIndex);
  target.setUTCDate(monthEnd ? targetLast : Math.min(day, targetLast));
  return format(target);
}

function lastDayOfMonthsFrom(start, months) {
  return addMonths(addDays(start, -1), months);
}

function computed(row, rule) {
  return { ...row, rule, source: "computed" };
}

/**
 * The accounting periods of a period of account: itself when it is 12 months or shorter, else the
 * first 12 months and then the rest.
 * @param {{periodStart: string, periodEnd: string}} period
 * @returns {{periodStart: string, periodEnd: string}[]}
 */
export function accountingPeriods({ periodStart, periodEnd }) {
  parse(periodStart, "periodStart");
  parse(periodEnd, "periodEnd");
  if (periodEnd < periodStart) throw new Error("periodEnd must not be before periodStart");
  const firstEnd = lastDayOfMonthsFrom(periodStart, 12);
  if (periodEnd <= firstEnd) return [{ periodStart, periodEnd }];
  return [
    { periodStart, periodEnd: firstEnd },
    { periodStart: addDays(firstEnd, 1), periodEnd },
  ];
}

/**
 * The Company Tax Returns for a period of account: one per accounting period, each due 12 months
 * after the period of account ends.
 * @param {{periodStart: string, periodEnd: string}} period
 */
export function ct600Rows({ periodStart, periodEnd }) {
  const due = addMonths(periodEnd, 12);
  return accountingPeriods({ periodStart, periodEnd }).map((accountingPeriod) =>
    computed({ kind: "ct600", type: "taxes", ...accountingPeriod, due }, DUE_RULE_FACT_IDS.ct600),
  );
}

/**
 * The Corporation Tax payments for a period of account: one per accounting period, each due 9 months
 * and 1 day after its own accounting period ends.
 * @param {{periodStart: string, periodEnd: string}} period
 */
export function ctPaymentRows({ periodStart, periodEnd }) {
  return accountingPeriods({ periodStart, periodEnd }).map((accountingPeriod) =>
    computed(
      { kind: "ct-payment", type: "taxes", ...accountingPeriod, due: addDays(addMonths(accountingPeriod.periodEnd, 9), 1) },
      DUE_RULE_FACT_IDS.ctPayment,
    ),
  );
}

/**
 * A VAT return, due one calendar month and 7 days after its period ends.
 * @param {string} periodEnd
 */
export function vatReturnDue(periodEnd) {
  parse(periodEnd, "periodEnd");
  return computed({ kind: "vat-return", type: "taxes", periodEnd, due: addDays(addMonths(periodEnd, 1), 7) }, DUE_RULE_FACT_IDS.vatReturn);
}

/**
 * A VAT payment, due by the same deadline as the return for its period.
 * @param {string} periodEnd
 */
export function vatPaymentDue(periodEnd) {
  return computed({ ...vatReturnDue(periodEnd), kind: "vat-payment" }, DUE_RULE_FACT_IDS.vatPayment);
}

/**
 * The VAT period after one already filed: the same number of months, starting the day after, with
 * its return's due date. It is expected, not read from HMRC.
 * @param {{start: string, end: string}} period
 */
export function expectedNextVatPeriod({ start, end }) {
  const startDate = parse(start, "start");
  const afterEnd = parse(addDays(end, 1), "end");
  const months = (afterEnd.getUTCFullYear() - startDate.getUTCFullYear()) * 12 + afterEnd.getUTCMonth() - startDate.getUTCMonth();
  if (months < 1) throw new Error("a VAT period lasts at least a month");
  const nextStart = format(afterEnd);
  const nextEnd = lastDayOfMonthsFrom(nextStart, months);
  return { ...vatReturnDue(nextEnd), periodStart: nextStart, expected: true };
}

function taxYearStart(taxYear) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(taxYear ?? ""));
  const first = match ? Number(match[1]) : NaN;
  if (!match || (first + 1) % 100 !== Number(match[2])) throw new Error("taxYear must be written like 2026-27");
  return first;
}

/**
 * The standard Income Tax quarterly updates of a tax year, each from 6 April to the quarter's end,
 * and the final declaration by 31 January after the tax year.
 * @param {string} taxYear - such as "2026-27"
 */
export function itsaStandardRows(taxYear) {
  const year = taxYearStart(taxYear);
  const quarters = [
    [`${year}-07-05`, `${year}-08-07`],
    [`${year}-10-05`, `${year}-11-07`],
    [`${year + 1}-01-05`, `${year + 1}-02-07`],
    [`${year + 1}-04-05`, `${year + 1}-05-07`],
  ];
  return [
    ...quarters.map(([periodEnd, due]) =>
      computed(
        { kind: "itsa-quarterly-update", type: "taxes", taxYear, periodStart: `${year}-04-06`, periodEnd, due },
        DUE_RULE_FACT_IDS.itsaQuarterly,
      ),
    ),
    computed({ kind: "itsa-final-declaration", type: "taxes", taxYear, due: `${year + 2}-01-31` }, DUE_RULE_FACT_IDS.itsaFinalDeclaration),
  ];
}

/**
 * The Self Assessment payments for a tax year: two payments on account, by 31 January in the tax year
 * and 31 July after it, and the balancing payment by 31 January the year after.
 * @param {string} taxYear - such as "2026-27"
 */
export function saPaymentRows(taxYear) {
  const year = taxYearStart(taxYear);
  return [
    computed({ kind: "sa-payment-on-account", type: "taxes", taxYear, due: `${year + 1}-01-31` }, DUE_RULE_FACT_IDS.saPaymentsOnAccount),
    computed({ kind: "sa-payment-on-account", type: "taxes", taxYear, due: `${year + 1}-07-31` }, DUE_RULE_FACT_IDS.saPaymentsOnAccount),
    computed({ kind: "sa-balancing-payment", type: "taxes", taxYear, due: `${year + 2}-01-31` }, DUE_RULE_FACT_IDS.saBalancingPayment),
  ];
}

/**
 * A change to a director or secretary, or to a PSC, which Companies House must be told of within 14
 * days.
 * @param {string} changeDate
 * @param {"officer"|"psc"} change
 */
export function changeDue(changeDate, change) {
  parse(changeDate, "changeDate");
  if (change !== "officer" && change !== "psc") throw new Error('change must be "officer" or "psc"');
  return computed(
    { kind: `${change}-change`, type: "people", changeDate, due: addDays(changeDate, 14) },
    change === "officer" ? DUE_RULE_FACT_IDS.officerChange : DUE_RULE_FACT_IDS.pscChange,
  );
}

/**
 * The identity verification that goes with the next confirmation statement: due on its date.
 * @param {string} confirmationStatementDue
 */
export function identityVerificationRow(confirmationStatementDue) {
  parse(confirmationStatementDue, "confirmationStatementDue");
  return computed({ kind: "identity-verification", type: "people", due: confirmationStatementDue }, DUE_RULE_FACT_IDS.identityVerification);
}
