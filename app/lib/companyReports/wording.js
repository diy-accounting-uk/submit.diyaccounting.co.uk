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

// The same rules in Welsh. Welsh changes a word's first letter after some words (cryf, gryf,
// nghryf, chryf), so each word is listed in every form it can take. A word the register itself uses
// in Welsh is left out: "dyledus" (owed) names creditors and debtors, "ymddiswyddo" a resignation.

/** Words no report may use, in Welsh. */
export const BANNED_WORDS_CY = [
  "iach",
  "iachus",
  "cryf",
  "gryf",
  "nghryf",
  "chryf",
  "cryfach",
  "gwan",
  "wan",
  "ngwan",
  "gwannach",
  "peryglus",
  "beryglus",
  "mheryglus",
  "pheryglus",
  "mentrus",
  "fentrus",
  "da",
  "dda",
  "gwael",
  "wael",
  "ngwael",
  "pryder",
  "bryder",
  "mhryder",
  "phryder",
  "pryderus",
  "gwella",
  "wella",
  "gwellodd",
  "gwellhad",
  "gwaethygu",
  "waethygu",
  "gwaethygodd",
];

/** Words a report's rows may not use in Welsh, by the report's name. */
export const REPORT_BANNED_WORDS_CY = {
  filings: ["hwyr", "mewn pryd", "ar amser", "methwyd", "methodd", "derbyniwyd", "derbyn", "dderbyn"],
  people: ["gadael", "adael", "gadawodd", "ymuno", "ymunodd", "camu i lawr", "gamu i lawr"],
  capital: ["codi", "godi", "codwyd", "buddsoddi", "fuddsoddi", "buddsoddwyd", "gwanhau", "wanhau"],
  charges: ["dyled", "ddyled", "nyled", "dyledion", "ddyledion", "mewn trafferth", "benthyciwr mewn perygl"],
};

const escape = (word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The banned words a report's text uses, each once, in the order of the lists.
 * @param {string[]} texts - the sentences the report shows, with any placeholders left in
 * @param {string} [report] - the report's name, which adds its own words to the shared list
 * @param {"en"|"cy"} [language] - the language of the texts
 * @returns {string[]}
 */
export function bannedWordsIn(texts, report, language = "en") {
  const words =
    language === "cy"
      ? [...BANNED_WORDS_CY, ...(REPORT_BANNED_WORDS_CY[report] || [])]
      : [...BANNED_WORDS, ...(REPORT_BANNED_WORDS[report] || [])];
  const joined = texts.join("\n");
  return words.filter((word) => new RegExp(`(^|[^\\p{L}])${escape(word)}($|[^\\p{L}])`, "iu").test(joined));
}
