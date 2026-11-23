// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/companies-house-company-name.js
// The rules of a company name that the change of name page and its route share. A plain ES module,
// so app/ imports it and the page loads it as a module, which also sets
// window.companiesHouseCompanyName.

// baseTypes-v2-10.xsd's companyNameString, as ChangeOfName restricts it: three characters of the
// first set, then up to 157 of the same set and * = # % +. Upper case only.
const NAME_CHARACTERS =
  "-,.:; 0-9A-Z&@$£¥€'\"«»‘’“”?!/\\\\()\\[\\]{}<>ÀÁÂÃÄÅĀĂĄÆǼÇĆĈĊČÞĎÐÈÉÊËĒĔĖĘĚĜĞĠĢĤĦÌÍÎÏĨĪĬĮİĴĶĹĻĽĿŁÑŃŅŇŊÒÓÔÕÖØŌŎŐǾŒŔŖŘŚŜŞŠŢŤŦÙÚÛÜŨŪŬŮŰŲŴẀẂẄỲÝŶŸŹŻŽ";
const PROPOSED_NAME = new RegExp(`^[${NAME_CHARACTERS}]{3}[${NAME_CHARACTERS}*=#%+]{0,157}$`, "u");

/**
 * Whether a name fits the schema's ProposedCompanyName: 3 to 160 characters of its character set.
 * @param {string} name - in upper case
 * @returns {boolean}
 */
export function isValidProposedCompanyName(name) {
  return typeof name === "string" && PROPOSED_NAME.test(name);
}

/**
 * Whether a name ends as a private limited company's name usually must: LIMITED or LTD, or, for a
 * company registered in Wales, the Welsh CYFYNGEDIG or CYF instead.
 * @param {string} name - in upper case
 * @param {{registeredInWales: boolean}} company
 * @returns {boolean}
 */
export function hasUsualLimitedEnding(name, { registeredInWales }) {
  const endings = registeredInWales ? ["LIMITED", "LTD", "CYFYNGEDIG", "CYF"] : ["LIMITED", "LTD"];
  return endings.some((ending) => new RegExp(`(^|\\s)${ending}\\.?$`, "u").test(String(name).trim()));
}

// What Companies House disregards at the end of a name when it decides whether two names are the
// "same as" each other (Incorporation and names, section 6.4), longest first so a long ending goes
// before a short one inside it.
const DISREGARDED_ENDINGS = [
  "COMMUNITY INTEREST PUBLIC LIMITED COMPANY",
  "CWMNI BUDDIANT CYMUNEDOL CYHOEDDUS CYFYNGEDIG",
  "COMMUNITY INTEREST COMPANY",
  "CWMNI CYFYNGEDIG CYHOEDDUS",
  "CWMNI BUDDIANT CYMUNEDOL CCC",
  "CWMNI BUDDIANT CYMUNEDOL",
  "PUBLIC LIMITED COMPANY",
  "COMMUNITY INTEREST PLC",
  "LIMITED LIABILITY PARTNERSHIP",
  "LIMITED PARTNERSHIP",
  "CWMNI RTM CYFYNGEDIG",
  "RIGHT TO ENFRANCHISEMENT",
  "RIGHT TO MANAGE",
  "ANGHYFYNGEDIG",
  "CYFYNGEDIG",
  "UNLIMITED",
  "LIMITED",
  "LTD",
  "PLC",
  "CIC",
  "RTE",
  "RTM",
  "LLP",
  "LP",
  "CYF",
  "CCC",
  "CBC",
];
// What it disregards after a blank space at the end of a name (section 6.4), with & read as AND.
const DISREGARDED_AFTER_A_SPACE = [
  "AND COMPANY",
  "AND CO",
  "A’R CWMNI",
  "AND CWMNI",
  "COMPANY",
  "CWMNI",
  "CO UK",
  "CO",
  "COM",
  "ORG UK",
  "ORG",
  "NET",
  "BIZ",
  "EU",
  "UNITED KINGDOM",
  "UK",
  "GREAT BRITAIN",
  "GB",
  "NORTHERN IRELAND",
  "NI",
  "WALES",
  "CYMRU",
  "CYM",
  "Y DEYRNAS UNEDIG",
  "DU",
  "PRYDAIN FAWR",
  "PF",
];
// Section 6.5's letters that carry no accent mark to strip, each as the letter it is read as; the
// others of its first table lose their accents in normalize("NFD").
const READ_AS_LETTERS = [
  [/[ÞĐ]/g, "D"],
  [/Ħ/g, "H"],
  [/[ŁĿ]/g, "L"],
  [/Ŋ/g, "N"],
  [/Ø/g, "O"],
  [/Ŧ/g, "T"],
];
// Section 6.5's words, signs and digits read as the same, each as the word this key uses. The number
// words come before the digits, so a digit read as a word is not read again.
const READ_AS = [
  [/&/g, " AND "],
  [/\+/g, " PLUS "],
  [/@/g, " AT "],
  [/£/g, " POUND "],
  [/€/g, " EURO "],
  [/\$/g, " DOLLAR "],
  [/¥/g, " YEN "],
  [/%|\bPER CENT(UM)?\b|\bPERCENT\b/g, " PERCENTUM "],
  [/\bZERO\b/g, " O "],
  [/\b(TWO|TOO|TO)\b/g, " TOO "],
  [/\bFOUR\b/g, " FOR "],
  [/0/g, " O "],
  [/1/g, " ONE "],
  [/2/g, " TOO "],
  [/3/g, " THREE "],
  [/4/g, " FOR "],
  [/5/g, " FIVE "],
  [/6/g, " SIX "],
  [/7/g, " SEVEN "],
  [/8/g, " EIGHT "],
  [/9/g, " NINE "],
];
// The punctuation, signs and symbols section 6.4 disregards.
const DISREGARDED_PUNCTUATION = /[‘’'",()[\]{}<>!«»“”?./\\]/g;
// The signs section 6.4 disregards when they are one of a name's first three characters.
const DISREGARDED_AT_THE_START = /[*=#%+]/g;

function readAsTheSame(text) {
  let read = text;
  for (const [sign, word] of READ_AS) read = read.replace(sign, word);
  return read.replace(DISREGARDED_PUNCTUATION, " ").replace(/\s+/g, " ").trim();
}

// The endings as the key reads them by then (RIGHT TOO MANAGE, A R CWMNI), so section 6.5's reading
// of TO and the disregarded apostrophe leave them disregarded.
const READ_ENDINGS = [...DISREGARDED_ENDINGS, ...DISREGARDED_AFTER_A_SPACE].map(readAsTheSame);

/**
 * A key under which two names that Companies House counts as the "same as" each other are equal:
 * the first 60 characters, the signs disregarded among the first three, letters without accents, the words,
 * signs and digits read as the same, the start's
 * THE and WWW, the endings and the words after a blank space that it disregards, a final S, the
 * listed punctuation and the spaces between characters left out.
 * @param {string} name
 * @returns {string}
 */
export function sameAsKey(name) {
  const first60 = String(name || "").slice(0, 60);
  let key = (first60.slice(0, 3).replace(DISREGARDED_AT_THE_START, "") + first60.slice(3))
    .toUpperCase()
    .replace(/[ÆǼ]/g, "AE")
    .replace(/Œ/g, "OE")
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  for (const [letter, plain] of READ_AS_LETTERS) key = key.replace(letter, plain);
  key = readAsTheSame(key);
  key = key.replace(/^(THE|WWW) /, "");
  let shortened = true;
  while (shortened) {
    shortened = false;
    for (const ending of READ_ENDINGS) {
      if (key.endsWith(` ${ending}`)) {
        key = key.slice(0, -ending.length - 1).trim();
        shortened = true;
        break;
      }
    }
  }
  return key.replace(/S$/, "").replace(/ /g, "");
}

/** Whether the register's jurisdiction is Wales, where a company's name may end in the Welsh words. */
export function isRegisteredInWales(jurisdiction) {
  return jurisdiction === "wales";
}

if (typeof window !== "undefined") {
  window.companiesHouseCompanyName = { isValidProposedCompanyName, hasUsualLimitedEnding, isRegisteredInWales, sameAsKey };
}
