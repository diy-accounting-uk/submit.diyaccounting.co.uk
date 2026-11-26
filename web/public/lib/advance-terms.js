// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/advance-terms.js
// Section 413 of the Companies Act 2006 asks the note on an advance to a director for an
// indication of the interest rate and the main conditions. While the advance has an amount above 0
// and its terms field is empty, the field holds a common arrangement, to be changed to what the
// company and the director agreed. The default follows the amounts until the person types in the
// field, and clears when every amount is 0 again. Terms that came from a book, an iXBRL file or a
// filing stay.

export const DEFAULT_ADVANCE_TERMS = "Interest free if repaid within 12 months of the year end; unsecured; repayable on demand.";
export const SECTION_413_URL = "https://www.legislation.gov.uk/ukpga/2006/46/section/413";

const AMOUNT_FIELDS = ["balanceAtStart", "advanced", "balanceAtEnd"];

function pounds(text) {
  const value = Number(String(text ?? "").replace(/[£,\s]/g, ""));
  return Number.isFinite(value) ? value : 0;
}

/** Whether any of the advance's amounts is above 0. */
export function anyAdvanceAbove0(amounts) {
  return amounts.some((amount) => pounds(amount) > 0);
}

/**
 * The terms field's next value, or null to leave it as it is: the default while an amount is above 0
 * and the field is empty, and empty again once every amount is 0 and the field still holds the
 * default. A field the person has typed in is theirs.
 */
export function followedTerms({ terms, amounts, typed }) {
  if (typed) return null;
  const current = String(terms ?? "");
  const above0 = anyAdvanceAbove0(amounts);
  if (above0 && current.trim() === "") return DEFAULT_ADVANCE_TERMS;
  if (!above0 && current === DEFAULT_ADVANCE_TERMS) return "";
  return null;
}

/**
 * Keeps the terms of each advance row under root on the default. A row is a .directors-advance-row
 * whose boxes carry data-advance-field: terms, balanceAtStart, advanced and balanceAtEnd.
 * @returns {() => void} applies the rule to every row now, for a fill that sends no events
 */
export function followAdvanceTerms(root) {
  const typed = new WeakSet();
  const apply = () => {
    for (const row of root.querySelectorAll(".directors-advance-row")) {
      const terms = row.querySelector('[data-advance-field="terms"]');
      if (!terms) continue;
      const amounts = AMOUNT_FIELDS.map((field) => row.querySelector(`[data-advance-field="${field}"]`)?.value);
      const next = followedTerms({ terms: terms.value, amounts, typed: typed.has(terms) });
      if (next !== null) terms.value = next;
    }
  };
  root.addEventListener("input", (event) => {
    // A person typing sends trusted events; a fill from a book or a file sends its own.
    if (event.isTrusted && event.target?.dataset?.advanceField === "terms") typed.add(event.target);
    apply();
  });
  root.addEventListener("change", apply);
  apply();
  return apply;
}
