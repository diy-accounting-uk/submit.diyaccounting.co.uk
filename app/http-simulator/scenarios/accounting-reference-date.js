// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/http-simulator/scenarios/accounting-reference-date.js
// The simulator's answer to a ChangeAccountingReferenceDate form, from the form's own content: the
// rejection Companies House gives a change its AA01 rules out, and the change an accepted filing
// makes to the company's accounting period on the simulated register. The periods it may change are
// the ones the change form's page offers (changeablePeriods). AA01 says "You may use this
// form to change the accounting reference date relating to either the current, or the immediately
// previous, accounting period" and "You cannot extend a period beyond 18 months unless the company
// is in administration."

import { firstElement, firstElementText } from "../../lib/xmlDom.js";
import { getCompany, setNextAccountingPeriodEnd, setAccountingReferenceDate } from "./companies.js";
import { longerThanEighteenMonths, changeablePeriods } from "../../../web/public/lib/accounting-reference-period.js";

const rejection = (rejectCode, description) => ({ rejectCode, description, instanceNumber: "1" });

/** The fields of the form in a parsed envelope. */
export function readAccountingReferenceDateForm(document) {
  const form = firstElement(document, "ChangeAccountingReferenceDate");
  return {
    currentPeriodEnd: firstElementText(form, "AccountRefDate"),
    change: firstElementText(form, "ChangeToPeriod"),
    newPeriodEnd: firstElementText(form, "AmendedAccountRefDate"),
    extensionReason: firstElementText(form, "ExtensionReason") || null,
  };
}

// Today's date in the United Kingdom, as YYYY-MM-DD.
const todayInTheUnitedKingdom = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());

// The periods the form may change for a company today, from its accounts on the register.
function periodsOf(accounts, today = todayInTheUnitedKingdom()) {
  return changeablePeriods(
    {
      nextStart: accounts?.next_accounts?.period_start_on,
      nextEnd: accounts?.next_accounts?.period_end_on,
      nextDue: accounts?.next_accounts?.due_on,
      lastStart: accounts?.last_accounts?.period_start_on,
      lastEnd: accounts?.last_accounts?.period_end_on,
      accountingReferenceDate: accounts?.accounting_reference_date,
    },
    today,
  );
}

/**
 * The rejection for a change the form's rules do not allow, or null. A company the simulator does
 * not hold is not checked.
 */
export function accountingReferenceDateRejection(companyNumber, form) {
  const company = getCompany(companyNumber);
  if (!company?.accounts) return null;
  const { overdue, periods } = periodsOf(company.accounts);
  if (overdue) {
    return rejection("9993", "The company's accounts are overdue, so its accounting reference date cannot be changed.");
  }
  const periodStart = periods.find((period) => period.end === form.currentPeriodEnd)?.start;
  if (!periodStart) {
    return rejection("9996", "The accounting period on this form is not the company's current or immediately previous accounting period.");
  }
  if (form.change === "EXTEND" && form.extensionReason !== "ADMIN" && longerThanEighteenMonths(periodStart, form.newPeriodEnd)) {
    return rejection(
      "9997",
      "The accounting reference period cannot be extended beyond 18 months unless the company is in administration.",
    );
  }
  return null;
}

/**
 * An accepted change moves the period on the simulated register: a change to the period of the next
 * accounts moves that period's end, its reference date and its due date; a change to the current
 * period after it, which the register does not list yet, moves the reference date only.
 */
export function acceptAccountingReferenceDate(companyNumber, form) {
  const company = getCompany(companyNumber);
  if (company?.accounts?.next_accounts?.period_end_on === form.currentPeriodEnd) {
    setNextAccountingPeriodEnd(companyNumber, form.newPeriodEnd);
  } else if (periodsOf(company?.accounts).periods.some((period) => period.current && period.end === form.currentPeriodEnd)) {
    setAccountingReferenceDate(companyNumber, form.newPeriodEnd);
  }
}
