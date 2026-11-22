// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/companyReports/wording.js
// A company report states figures, dates and changes and never rates the company. These are the
// words no report's text may use: the words that rate a company, and for each report the words that
// would say more than its record states (the register says when Companies House processed a filing,
// not when it received one or whether it was late).

/** Words no report may use. */
export const BANNED_WORDS = ["healthy", "strong", "weak", "risky", "good", "poor", "concern", "improved", "worsened"];

/** Words a report's rows may not use, by the report's name. */
export const REPORT_BANNED_WORDS = {
  filings: ["late", "on time", "missed", "received"],
  people: ["left", "stepped down", "joined"],
  capital: ["raised", "invested", "diluted"],
  charges: ["debt", "secured lender at risk", "in trouble"],
};

const escape = (word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The banned words a report's text uses, each once, in the order of the lists.
 * @param {string[]} texts - the sentences the report shows, with any placeholders left in
 * @param {string} [report] - the report's name, which adds its own words to the shared list
 * @returns {string[]}
 */
export function bannedWordsIn(texts, report) {
  const words = [...BANNED_WORDS, ...(REPORT_BANNED_WORDS[report] || [])];
  const joined = texts.join("\n");
  return words.filter((word) => new RegExp(`(^|[^\\p{L}])${escape(word)}($|[^\\p{L}])`, "iu").test(joined));
}
