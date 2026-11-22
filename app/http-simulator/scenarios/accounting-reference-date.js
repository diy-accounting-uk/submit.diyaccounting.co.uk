// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/http-simulator/scenarios/accounting-reference-date.js
// The simulator's answer to a ChangeAccountingReferenceDate form, from the form's own content: the
// rejection Companies House gives a change its AA01 rules out, and the change an accepted filing
// makes to the company's accounting period on the simulated register. AA01 says "You may use this
// form to change the accounting reference date relating to either the current, or the immediately
// previous, accounting period" and "You cannot extend a period beyond 18 months unless the company
// is in administration."

import { firstElement, firstElementText } from "../../lib/xmlDom.js";
import { getCompany, setNextAccountingPeriodEnd } from "./companies.js";
import { longerThanEighteenMonths } from "../../../web/public/lib/accounting-reference-period.js";

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

// The start of the company's period that ends on a date: its current period or the one before.
function periodStartOf(accounts, periodEnd) {
  if (accounts?.next_accounts?.period_end_on === periodEnd) return accounts.next_accounts.period_start_on;
  if (accounts?.last_accounts?.period_end_on === periodEnd) return accounts.last_accounts.period_start_on;
  return null;
}

/**
 * The rejection for a change the form's rules do not allow, or null. A company the simulator does
 * not hold is not checked.
 */
export function accountingReferenceDateRejection(companyNumber, form) {
  const company = getCompany(companyNumber);
  if (!company?.accounts) return null;
  const periodStart = periodStartOf(company.accounts, form.currentPeriodEnd);
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

/** An accepted change to the company's current period moves that period's end on the simulated register. */
export function acceptAccountingReferenceDate(companyNumber, form) {
  const company = getCompany(companyNumber);
  if (company?.accounts?.next_accounts?.period_end_on === form.currentPeriodEnd) {
    setNextAccountingPeriodEnd(companyNumber, form.newPeriodEnd);
  }
}
