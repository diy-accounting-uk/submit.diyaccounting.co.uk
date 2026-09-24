// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// labels.js -- matches a transaction's description against a label map's
// payee rules, shared by bank-lines.js, paypal-statement-lines.js and
// stripe-lines.js. No payee pattern is held here or anywhere else in this
// repository: the caller reads and parses the label map's own TOML file and
// passes the parsed object in, so this module and its callers stay pure.
//
// A label map is a parsed TOML document whose `[[rule]]` array entries carry
// a case-insensitive substring `pattern` matched against a line's own
// description, plus the posting fields a match sets: `sourceJournalID`,
// `accountMainID`, an optional `taxCode`, and an optional
// `"diya-gl:bankCode"` for a rule that labels a bank line.

/**
 * Finds the first label rule whose pattern is a case-insensitive substring
 * of description. Returns undefined when labels carries no rule array, or
 * carries one but no rule's pattern matches -- the caller's own coding
 * stands in both cases.
 * @param {string} description
 * @param {{rule?: Array<{pattern: string, sourceJournalID?: string, accountMainID?: string, taxCode?: string, "diya-gl:bankCode"?: string}>}} [labels]
 *   a parsed label map
 * @returns {Object|undefined} the matching rule
 */
export function matchLabel(description, labels) {
  const rules = labels?.rule;
  if (!rules || rules.length === 0) {
    return undefined;
  }
  const haystack = description.toUpperCase();
  return rules.find((rule) => haystack.includes(rule.pattern.toUpperCase()));
}
