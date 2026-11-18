// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/accountsLanguage.js
// The language of a set of accounts. A Welsh company (Companies House jurisdiction "wales") may
// deliver its accounts in Welsh under section 1104 of the Companies Act 2006. The builders write
// each phrase through accountsText; while a Welsh document is built it returns the Welsh wording
// below, and a phrase with no Welsh wording stops the build, so a Welsh document never carries an
// untranslated phrase.
//
// Sources of the wording:
// - Statutory statements: written to hold every Welsh phrase that the Companies House accounts TIS
//   (November 2026, section "Statements") checks, https://www.gov.uk/government/publications/technical-interface-specifications-for-companies-house-software
// - Balance sheet and note labels: the Welsh labels (xml:lang="cy") of the FRC 2026 taxonomy,
//   https://www.frc.org.uk/documents/8907/FRC-2026-Taxonomy-v1.0.0.zip, without the taxonomy's
//   qualifiers ("fformat 2", "is-gyfanswm mantolen"), as the English lines drop theirs.
// - Kinds of accounts: "Ffeilio eich gwybodaeth Tŷ'r Cwmnïau ar-lein",
//   https://www.gov.uk/guidance/filing-your-companies-house-information-online.cy

export const ACCOUNTS_LANGUAGES = ["en", "cy"];

const WELSH_MONTHS = [
  "Ionawr",
  "Chwefror",
  "Mawrth",
  "Ebrill",
  "Mai",
  "Mehefin",
  "Gorffennaf",
  "Awst",
  "Medi",
  "Hydref",
  "Tachwedd",
  "Rhagfyr",
];

// The Welsh of each phrase a micro-entity document can carry, keyed by its English. {name} is a value.
export const WELSH_ACCOUNTS_TEXT = {
  // Statements (TIS phrases: "Eithriad" and "adran 477 o Ddeddf Cwmnïau 2006"; "adran 480 o Ddeddf
  // Cwmnïau 2006"; "aelodau heb ei gwneud yn ofynnol i'r cwmni gael archwiliad"; "Cyfarwyddwr yn
  // cydnabod", "cyfrifoldebau" and "Ddeddf Cwmnïau 2006"; "wedi eu paratoi", "yn unol â",
  // "darpariaethau" and "micro"). The TIS writes each phrase with a straight apostrophe.
  "The company is entitled to exemption from audit under section 477 of the Companies Act 2006 relating to small companies.":
    "Mae gan y cwmni hawl i eithriad rhag archwiliad o dan adran 477 o Ddeddf Cwmnïau 2006 sy'n ymwneud â chwmnïau bach.",
  "The company is entitled to exemption from audit under section 480 of the Companies Act 2006 relating to dormant companies.":
    "Mae gan y cwmni hawl i eithriad rhag archwiliad o dan adran 480 o Ddeddf Cwmnïau 2006 sy'n ymwneud â chwmnïau segur.",
  "The members have not required the company to obtain an audit in accordance with section 476 of the Companies Act 2006.":
    "Mae'r aelodau heb ei gwneud yn ofynnol i'r cwmni gael archwiliad yn unol ag adran 476 o Ddeddf Cwmnïau 2006.",
  "The directors acknowledge their responsibilities for complying with the requirements of the Companies Act 2006 with respect to accounting records and the preparation of accounts.":
    "Mae pob cyfarwyddwr yn cydnabod eu cyfrifoldebau am gydymffurfio â'r gofynion o dan Ddeddf Cwmnïau 2006 o ran cofnodion cyfrifyddu a pharatoi cyfrifon.",
  "These accounts have been prepared in accordance with the provisions applicable to companies subject to the micro-entities regime and delivered in accordance with the provisions applicable to companies subject to the small companies regime.":
    "Mae'r cyfrifon hyn wedi eu paratoi yn unol â'r darpariaethau sy'n gymwys i gwmnïau sy'n ddarostyngedig i'r drefn micro-endidau, ac wedi eu cyflwyno yn unol â'r darpariaethau sy'n gymwys i gwmnïau sy'n ddarostyngedig i'r drefn cwmnïau bach.",

  // The cover page, headings and approval line.
  "Unaudited micro-entity accounts": "Cyfrifon micro-endid heb eu harchwilio",
  "Unaudited dormant micro-entity accounts": "Cyfrifon micro-endid segur heb eu harchwilio",
  "{company} - Accounts": "{company} - Cyfrifon",
  "Registered number: {number}": "Rhif cofrestru: {number}",
  "for the {period}": "ar gyfer y {period}",
  "Period from {start} to {end}": "Cyfnod o {start} i {end}",
  "year ended {date}": "flwyddyn a ddaeth i ben ar {date}",
  "period ended {date}": "cyfnod a ddaeth i ben ar {date}",
  "year": "flwyddyn",
  "period": "cyfnod",
  "Balance sheet": "Mantolen",
  "as at {date}": "ar {date}",
  "Profit and loss account": "Cyfrif elw a cholled",
  "Notes to the financial statements": "Nodiadau i’r datganiadau ariannol",
  "Note": "Nodyn",
  "Approved by {board} on {date} and signed on its behalf by:": "Cymeradwywyd gan {board} ar {date} a’u llofnodi ar ei ran gan:",
  "the board of directors": "y bwrdd cyfarwyddwyr",
  "Director": "Cyfarwyddwr",
  "Accountants' report": "Adroddiad y cyfrifwyr",
  "to the board of directors of {company} on the unaudited financial statements for the {period}":
    "i fwrdd cyfarwyddwyr {company} ar y datganiadau ariannol heb eu harchwilio ar gyfer y {period}",

  // Revised accounts.
  "Revised accounts": "Cyfrifon diwygiedig",
  "These are revised accounts. They replace the original accounts of the company for the financial year ended {end}, which were approved on {approved}.":
    "Cyfrifon diwygiedig yw’r rhain. Maent yn cymryd lle cyfrifon gwreiddiol y cwmni ar gyfer y flwyddyn ariannol a ddaeth i ben ar {end}, a gymeradwywyd ar {approved}.",
  "The revised accounts are now the statutory accounts of the company.": "Y cyfrifon diwygiedig yw cyfrifon statudol y cwmni bellach.",
  "They have been prepared as at the date of the original accounts, not as at the date of the revision, and so they do not deal with events between those dates.":
    "Maent wedi eu paratoi fel ar ddyddiad y cyfrifon gwreiddiol, nid fel ar ddyddiad y diwygiad, ac felly nid ydynt yn ymdrin â digwyddiadau rhwng y dyddiadau hynny.",
  "They have been prepared in accordance with the provisions of the Companies Act 2006 that applied to the original accounts when those were approved.":
    "Maent wedi eu paratoi yn unol â darpariaethau Deddf Cwmnïau 2006 a oedd yn gymwys i’r cyfrifon gwreiddiol pan gawsant eu cymeradwyo.",
  "Respects in which the original accounts differ": "Y ffyrdd y mae’r cyfrifon gwreiddiol yn wahanol",

  // The balance sheet (FRC 2026 Welsh labels).
  "Called up share capital not paid": "Cyfalaf cyfranddaliadau wedi'i alw na thalwyd",
  "Fixed assets": "Asedau sefydlog",
  "Current assets": "Asedau cyfredol",
  "Prepayments and accrued income": "Rhagdaliadau ac incwm cronedig",
  "Creditors: amounts falling due within one year": "Credydwyr: symiau sy’n ddyledus o fewn blwyddyn",
  "Net current assets": "Asedau cyfredol net",
  "Net current assets (liabilities)": "Asedau (rhwymedigaethau) cyfredol net",
  "Total assets less current liabilities": "Cyfanswm yr asedau llai'r rhwymedigaethau cyfredol",
  "Creditors: amounts falling due after more than one year": "Credydwyr: symiau sy’n ddyledus ar ôl mwy na blwyddyn",
  "Provisions for liabilities": "Darpariaethau ar gyfer rhwymedigaethau",
  "Accruals and deferred income": "Atebolrwydd cronedig ac incwm gohiriedig",
  "Net assets": "Asedau net",
  "Net assets (liabilities)": "Asedau net (rhwymedigaethau)",
  "Capital and reserves": "Cyfalaf a chronfeydd wrth gefn",
  "Called up share capital": "Cyfalaf cyfranddaliadau wedi'i alw",
  "Shareholders' funds": "Cronfeydd y cyfranddalwyr",

  // The micro-entity profit and loss account (FRC 2026 Welsh labels).
  "Turnover": "Trosiant",
  "Other income": "Incwm gweithredol arall",
  "Raw materials and consumables": "Deunyddiau crai a defnyddiau traul",
  "Staff costs": "Costau staff",
  "Depreciation and other amounts written off assets": "Dibrisiad, amorteiddiad ac amhariad",
  "Other charges": "Treuliau gweithredol eraill",
  "Profit or loss before tax": "Elw (colled) cyn treth",
  "Tax": "Treth",
  "Profit or loss for the financial year": "Elw (colled) ar gyfer y flwyddyn ariannol",

  // Notes.
  "General information": "Gwybodaeth gyffredinol",
  "{name} is a private company limited by shares, registered in {country}, registered number {number}. Its registered office is {office}.":
    "Mae {name} yn gwmni preifat cyfyngedig gan gyfranddaliadau, wedi’i gofrestru yng {country}, rhif cofrestru {number}. Ei swyddfa gofrestredig yw {office}.",
  "England and Wales": "Nghymru",
  "The company's principal activity is {activity}.": "Prif weithgaredd y cwmni yw {activity}.",
  "No description of principal activity": "Dim disgrifiad o’r prif weithgaredd",
  "Dormant company": "Cwmni segur",
  "Accounting policies": "Polisïau cyfrifyddu",
  "These financial statements have been prepared in accordance with FRS 105 The Financial Reporting Standard applicable to the Micro-entities Regime.":
    "Mae’r datganiadau ariannol hyn wedi eu paratoi yn unol ag FRS 105, y Safon Adrodd Ariannol sy’n gymwys i’r Drefn Micro-endidau.",
  "Employees": "Gweithwyr",
  "The average number of employees during the {span} was {count}.": "Nifer cyfartalog y gweithwyr yn ystod y {span} oedd {count}.",
  "The company has not traded during the year or the preceding financial period. During this time the company received no income and incurred no expenditure and therefore no profit and loss account is presented.":
    "Nid yw’r cwmni wedi masnachu yn ystod y flwyddyn na’r cyfnod ariannol blaenorol. Yn ystod yr amser hwn ni chafodd y cwmni unrhyw incwm ac ni aeth i unrhyw wariant, ac felly nid oes cyfrif elw a cholled yn cael ei gyflwyno.",
  "Allotted, called up and fully paid: {shares} {kind} {noun} of £{nominal} each.":
    "Wedi’u dyrannu, eu galw a’u talu’n llawn: {shares} {noun} {kind} o £{nominal} yr un.",
  "Allotted and called up: {allotted} {kind} {allottedNoun} of £{nominal} each, of which {paid} {paidVerb} fully paid.":
    "Wedi’u dyrannu a’u galw: {allotted} {allottedNoun} {kind} o £{nominal} yr un, ac mae {paid} ohonynt wedi’u talu’n llawn.",
  "share": "cyfranddaliad",
  "shares": "cyfranddaliad",
  "ordinary": "cyffredin",
  "preference": "dewisol",
  "deferred": "gohiriedig",
  "other": "arall",
  "Advances and credits to directors": "Blaensymiau a chredydau i gyfarwyddwyr",
  "Amounts owed to the company by its directors:": "Symiau sy’n ddyledus i’r cwmni gan ei gyfarwyddwyr:",
  "Owed at start": "Yn ddyledus ar y dechrau",
  "Advanced": "Wedi’i roi ymlaen llaw",
  "Repaid": "Wedi’i ad-dalu",
  "Owed at end": "Yn ddyledus ar y diwedd",
};

let documentLanguage = "en";

/**
 * Build a document in a language: every accountsText call made by `build` writes that language.
 * The builders are synchronous, so the language holds for exactly one build.
 * @template T
 * @param {"en"|"cy"|undefined} language
 * @param {() => T} build
 * @returns {T}
 */
export function inAccountsLanguage(language, build) {
  const previous = documentLanguage;
  documentLanguage = language === "cy" ? "cy" : "en";
  try {
    return build();
  } finally {
    documentLanguage = previous;
  }
}

/** True while a Welsh document is being built. */
export function buildingWelshAccounts() {
  return documentLanguage === "cy";
}

/**
 * A phrase of the accounts in the language of the document being built.
 * @param {string} english
 * @param {Record<string, string|number>} [values] - the {name} values
 * @returns {string}
 */
export function accountsText(english, values = {}) {
  const text = documentLanguage === "cy" ? WELSH_ACCOUNTS_TEXT[english] : english;
  if (text === undefined) throw new Error(`The Welsh accounts have no wording for "${english}"`);
  return text.replace(/\{([a-zA-Z]+)\}/g, (whole, name) => (name in values ? String(values[name]) : whole));
}

/**
 * A date written out in Welsh, e.g. "31 Rhagfyr 2025".
 * @param {string} isoDate
 * @returns {string}
 */
export function welshDisplayDate(isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return `${day} ${WELSH_MONTHS[month - 1]} ${year}`;
}

/**
 * The language a request asks its accounts to be written in: "en" when it names none.
 * @param {unknown} value - the request's documentLanguage
 * @param {"micro-entity"|"small-company"} regime
 * @param {string[]} errorMessages
 * @returns {"en"|"cy"}
 */
export function readDocumentLanguage(value, regime, errorMessages) {
  if (value === undefined || value === null || value === "en") return "en";
  if (value !== "cy") {
    errorMessages.push(`Invalid documentLanguage - must be one of ${ACCOUNTS_LANGUAGES.join(", ")}`);
    return "en";
  }
  if (regime !== "micro-entity") {
    errorMessages.push("Welsh accounts (documentLanguage cy) are written for micro-entity accounts");
    return "en";
  }
  return "cy";
}

/**
 * Only a Welsh company may deliver accounts in Welsh: one whose Companies House jurisdiction is
 * "wales" (section 88 and section 1104 of the Companies Act 2006).
 * @param {string|undefined} jurisdiction - the company profile's jurisdiction
 * @param {string[]} errorMessages
 */
export function checkWelshCompany(jurisdiction, errorMessages) {
  if (jurisdiction !== "wales") {
    errorMessages.push(
      `Welsh accounts are for a Welsh company: Companies House holds this company's jurisdiction as "${jurisdiction ?? "unknown"}", not "wales"`,
    );
  }
}
