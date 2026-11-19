// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/lib/companiesHouseReviewCriteria.js
// The checks a reviewer at Companies House makes on the substance of a filing, beyond its form:
// could a real company file this? Each check returns a findings row {criterion, result, evidence,
// file}. `ours` is the inspected document {facts, visibleText}; `input` is the fixture case.
//
// Left to the judge by hand: share capital against the register's statement of capital. It needs a
// read of the register, which a script tier here does not make yet.

import { longDate } from "./companiesHouseReviewReconcile.js";
import { registeredOfficeLine } from "../../app/services/accountsIxbrlCommon.js";

// The phrase rules from the Companies House accounts TIS, "FRS unaudited accounts statements to
// the Balance sheet". Every inner array is an OR; the outer array is an AND. Case-insensitive. A
// Welsh document (ReportPrincipalLanguage on the Welsh member) is held to the TIS's Welsh phrases.
export const STATEMENTS = {
  section477: {
    label: "Section 477 audit exemption statement",
    concept: "StatementThatCompanyEntitledToExemptionFromAuditUnderSection477CompaniesAct2006RelatingToSmallCompanies",
    phrases: [["exempt", "exemption"], ["section 477 of the companies act 2006"]],
    welshPhrases: [["wedi'i eithrio", "eithriad"], ["adran 477 o ddeddf cwmnïau 2006"]],
  },
  section480: {
    label: "Section 480 dormant audit exemption statement",
    concept: "StatementThatCompanyEntitledToExemptionFromAuditUnderSection480CompaniesAct2006RelatingToDormantCompanies",
    phrases: [["exempt", "exemption"], ["section 480 of the companies act 2006"]],
    welshPhrases: [["wedi'i eithrio", "eithriad"], ["adran 480 o ddeddf cwmnïau 2006"]],
  },
  membersNoAudit: {
    label: "Members have not required an audit (section 476)",
    concept: "StatementThatMembersHaveNotRequiredCompanyToObtainAnAudit",
    phrases: [["members have not required the company to obtain an audit", "member has not required the company to obtain an audit"]],
    welshPhrases: [
      ["aelodau heb ei gwneud yn ofynnol i'r cwmni gael archwiliad", "aelod heb ei gwneud yn ofynnol i'r cwmni gael archwiliad"],
    ],
  },
  directorsResponsibilities: {
    label: "Directors acknowledge their responsibilities",
    concept: "StatementThatDirectorsAcknowledgeTheirResponsibilitiesUnderCompaniesAct",
    phrases: [["directors acknowledge", "director acknowledges"], ["responsibilities"], ["companies act 2006", "the act"]],
    welshPhrases: [["cyfarwyddwyryn cydnabod", "cyfarwyddwr yn cydnabod"], ["cyfrifoldebau"], ["ddeddf cwmnïau 2006", "y ddeddf"]],
  },
  microProvisions: {
    label: "Prepared in accordance with the micro-entity provisions",
    concept: "StatementThatAccountsHaveBeenPreparedInAccordanceWithProvisionsSmallCompaniesRegime",
    phrases: [["prepared"], ["in accordance with"], ["provisions"], ["micro"]],
    welshPhrases: [["wedi eu paratoi"], ["yn unol â"], ["darpariaethau"], ["micro"]],
  },
  smallCompaniesRegime: {
    label: "Prepared in accordance with the small companies regime",
    concept: "StatementThatAccountsHaveBeenPreparedInAccordanceWithProvisionsSmallCompaniesRegime",
    phrases: [["prepared"], ["in accordance with"], ["provisions"], ["small companies"]],
    // The TIS prints "Paratowyd yn unol â" here, but the test validator checks "Wedi eu paratoi".
    welshPhrases: [["wedi eu paratoi"], ["yn unol â"], ["darpariaethau"], ["cwmnïau bach"]],
  },
};

const PUBLIC_COMPANY_NAME = /\b(plc|public limited company)\b/i;
const PUBLIC_COMPANY_TEXT = /\bpublic (limited )?company\b/i;
const PRIVATE_COMPANY_TEXT = /\bprivate (limited )?company\b|\b[cg]wmni preifat\b/i;
const LEGAL_FORM_TEXT =
  /\b(private|public) (limited )?company limited by (shares|guarantee)\b|\blimited liability partnership\b|\bunlimited company\b|\b[cg]wmni (preifat|cyhoeddus) cyfyngedig gan (gyfranddaliadau|warant)\b/i;
const JURISDICTION_TEXT =
  /\bregistered in (England and Wales|Scotland|Northern Ireland|England|Wales)\b|\bwedi[’']i gofrestru yng? (Nghymru a Lloegr|Nghymru|Lloegr|Ngogledd Iwerddon|Yr Alban)\b/i;
const REGISTERED_OFFICE_TEXT = /registered office|swyddfa gofrestredig/i;
const PLACEHOLDER_WORD = /\b(test|fictional|example|sample|dummy|placeholder|lorem)\b/i;
const ZEROS = /0{8}/;
const NEVER_TRADED_TEXT = /\bhas not traded\b/i;
// The principal activity of a micro-entity or dormant set is a header fact by design; every other
// sentence-length statement or description is something a reader is owed on the page.
const NARRATIVE_CONCEPT = /^(Statement|Description)(?!PrincipalActivities)/;
const MINIMUM_NARRATIVE_WORDS = 4;

const row = (criterion, result, evidence, file) => ({ criterion, result, evidence, file });

export function isoToday(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

function squash(text) {
  return text.replace(/\s+/g, " ").trim();
}

// Values the case input carries under any of the named keys, at any depth.
function inputValues(node, keys) {
  if (Array.isArray(node)) return node.flatMap((item) => inputValues(item, keys));
  if (node && typeof node === "object") {
    return Object.entries(node).flatMap(([key, value]) => (keys.includes(key) ? [value] : inputValues(value, keys)));
  }
  return [];
}

const carries = (input, keys) => inputValues(input, keys).some((value) => value !== 0 && value !== "" && value != null);

// Example facts that depend on a part of the company's own data. When the case input holds no value
// for the part, the fact is the example company's own and not a miss; when it does, a fact we fail
// to tag stays a miss. Each entry is [concept, the input keys that feed it, the reason when none do].
const FACTS_THE_INPUT_FEEDS = [
  ["TaxationSocialSecurityPayable", ["taxationSocialSecurity"], "a balance sheet line the filer has no figure for"],
  ["BankBorrowingsOverdrafts", ["bankLoansOverdrafts", "bankLoansAfterOneYear"], "a balance sheet line the filer has no figure for"],
  ["AccruedLiabilities", ["accruals"], "a balance sheet line the filer has no figure for"],
  ["AddressLine2", ["addressLine2"], "an address part the registered office does not have"],
  ["AddressLine3", ["addressLine3"], "an address part the registered office does not have"],
  ["CountyRegion", ["countyRegion"], "an address part the registered office does not have"],
  ["IntangibleAssets", ["intangibleAssetNote"], "an intangible assets note the filer has not entered"],
  ["IntangibleAssetsGrossCost", ["intangibleAssetNote"], "an intangible assets note the filer has not entered"],
  ["AccumulatedAmortisationImpairmentIntangibleAssets", ["intangibleAssetNote"], "an intangible assets note the filer has not entered"],
  ["IntangibleAssetsPolicy", ["intangibleAssetsPolicy"], "an intangible assets policy the filer has not entered"],
  ["TradeDebtorsTradeReceivables", ["tradeDebtors"], "a debtors line the filer has no figure for"],
  ["OtherDebtors", ["otherDebtors"], "a debtors line the filer has no figure for"],
  ["PrepaymentsAccruedIncome", ["prepayments"], "a debtors line the filer has no figure for"],
  ["AmountsOwedToDirectors", ["amountsOwedToDirectors"], "a creditors line the filer has no figure for"],
  ["AmountsOwedToGroupUndertakings", ["amountsOwedToGroupUndertakings"], "a creditors line the filer has no figure for"],
  [
    "CalledUpShareCapitalNotPaidNotExpressedAsCurrentAsset",
    ["calledUpShareCapitalNotPaid", "calledUpShareCapitalUnpaid"],
    "share capital that is all paid, so none is owed to the company",
  ],
];

/**
 * The reason an example fact is not carried because the case input has nothing to tag, or null when
 * the input does carry a value (or the fact is not one the input decides).
 * @param {string} concept - the example fact's concept local name
 * @param {object} input - the fixture case
 * @returns {string|null}
 */
export function notCarriedFromInput(concept, input) {
  if (concept === "DefinedContributionPensionsPolicy") {
    return /pension/i.test(JSON.stringify(input)) ? null : "a pension policy of the example company; the input has no pension";
  }
  const entry = FACTS_THE_INPUT_FEEDS.find(([name]) => name === concept);
  return entry && !carries(input, entry[1]) ? entry[2] : null;
}

/**
 * A tax note whose tagged charge is positive reads as a credit when printed in brackets. Fails
 * each CurrentTaxForPeriod fact that is positive and sits in brackets in the visible page.
 * @param {{facts: Array<{concept: string, text: string, visible?: boolean}>, visibleText: string}} ours
 */
export function taxNoteBracketsCriterion(ours) {
  const criterion = "A tax note's charge is not in brackets when its tagged value is positive";
  const taxFacts = ours.facts.filter((fact) => fact.concept === "CurrentTaxForPeriod" && fact.visible !== false);
  if (taxFacts.length === 0) return row(criterion, "pass", "no tax note", "visible-text.txt");
  // The profit and loss account prints the same charge in brackets by design, so read the note's own page.
  const heading = ours.visibleText.match(/^\s*\d+\.\s*(Tax on profit|Treth ar elw)\s*$/m);
  const note = heading ? ours.visibleText.slice(heading.index).split(/^\s*\d+\.\s+(?!Tax on profit\b|Treth ar elw\b)\S.*$/m)[0] : "";
  if (!note) return row(criterion, "unknown", "the tax facts have no tax note page", "visible-text.txt");
  const bracketed = taxFacts.filter((fact) => {
    const text = fact.text.trim();
    if (text.startsWith("-") || text.startsWith("(")) return false;
    const figure = text.replace(/[^\d,.]/g, "");
    return figure !== "" && note.includes(`(${figure})`);
  });
  return row(
    criterion,
    bracketed.length > 0 ? "fail" : "pass",
    bracketed.length > 0
      ? `${bracketed.length} of ${taxFacts.length} charges printed as (${bracketed[0].text.trim()}) in the note`
      : `${taxFacts.length} charges printed without brackets in the note`,
    "visible-text.txt",
  );
}

export function categoryCriterion(input, ours) {
  const criterion = "The company's category allows the regime claimed";
  const publicName = input.companyName.match(PUBLIC_COMPANY_NAME);
  const publicText = ours.visibleText.match(PUBLIC_COMPANY_TEXT);
  if (publicName || publicText) {
    return row(
      criterion,
      "fail",
      `a public company (${publicName ? `name "${input.companyName}"` : `text "${publicText[0]}"`}) is outside the small companies and micro-entity regimes`,
      "visible-text.txt",
    );
  }
  const privateText = ours.visibleText.match(PRIVATE_COMPANY_TEXT);
  return row(
    criterion,
    privateText ? "pass" : "unknown",
    privateText ? `"${privateText[0]}" in the accounts` : "the accounts do not say whether the company is private",
    "visible-text.txt",
  );
}

export function companyInformationCriterion(input, ours) {
  const text = ours.visibleText;
  const missing = [];
  if (!LEGAL_FORM_TEXT.test(text)) missing.push("legal form");
  if (!JURISDICTION_TEXT.test(text)) missing.push("part of the UK of registration");
  if (!text.includes(input.companyNumber)) missing.push("company number");
  if (
    !REGISTERED_OFFICE_TEXT.test(text) ||
    !squash(text)
      .replace(/ ([,.])/g, "$1")
      .includes(registeredOfficeLine(input.registeredOffice))
  )
    missing.push("registered office");
  return row(
    "The s396(A1) company information statement is visible",
    missing.length === 0 ? "pass" : "fail",
    missing.length === 0
      ? `legal form, part of the UK, number ${input.companyNumber} and registered office are in the notes`
      : `not visible: ${missing.join(", ")}`,
    "visible-text.txt",
  );
}

export function periodCriterion(input, today) {
  const periodEnd = input.periodEnd;
  const approved = input.director.dateApproved;
  const ended = periodEnd < today;
  const approvedInPast = approved >= periodEnd && approved <= today;
  return row(
    "The period has ended and the approval date is past",
    ended && approvedInPast ? "pass" : "fail",
    `year to ${longDate(periodEnd)}, approved ${longDate(approved)}, review date ${longDate(today)}${
      ended ? "" : "; the period has not ended"
    }${approvedInPast ? "" : "; the approval date is not between the period end and today"}`,
    "visible-text.txt",
  );
}

export function hiddenNarrativeCriterion(ours) {
  const visible = squash(ours.visibleText);
  const hiddenOnly = ours.facts.filter((fact) => {
    if (!fact.hidden || !NARRATIVE_CONCEPT.test(fact.concept)) return false;
    const words = squash(fact.text).split(" ").filter(Boolean);
    return words.length >= MINIMUM_NARRATIVE_WORDS && !visible.includes(squash(fact.text));
  });
  return row(
    "No narrative fact sits only in ix:hidden",
    hiddenOnly.length === 0 ? "pass" : "fail",
    hiddenOnly.length === 0
      ? "every sentence tagged in the hidden header is also in the visible page"
      : `${hiddenOnly.length} only hidden: ${hiddenOnly
          .slice(0, 3)
          .map((fact) => `${fact.concept} "${squash(fact.text).slice(0, 60)}"`)
          .join(", ")}`,
    "facts.json",
  );
}

export function neverTradedCriterion(ours) {
  const sentence = ours.visibleText.split(/(?<=\.)\s+/).find((candidate) => NEVER_TRADED_TEXT.test(candidate));
  return row(
    "The dormant accounts show the never-traded sentence",
    sentence ? "pass" : "fail",
    sentence ? `"${squash(sentence).slice(0, 160)}"` : "no visible sentence says the company has not traded",
    "visible-text.txt",
  );
}

export function placeholderCriterion(input, ours) {
  const named = [
    ["company name", input.companyName],
    ["company number", input.companyNumber],
    ["director", input.director.name],
    ["registered office", registeredOfficeLine(input.registeredOffice)],
    ...ours.facts.filter((fact) => fact.concept === "NameEntityOfficer").map((fact) => ["officer", fact.text]),
  ];
  const hits = named.filter(([, value]) => PLACEHOLDER_WORD.test(value) || ZEROS.test(value));
  return row(
    'No placeholder text in names, officers or addresses ("Test", "Fictional", 00000000)',
    hits.length === 0 ? "pass" : "fail",
    hits.length === 0
      ? "company name, number, director and registered office read as real"
      : hits.map(([what, value]) => `${what} "${value}"`).join(", "),
    "source/case-input.json",
  );
}

export function balanceSheetDateOf(ours) {
  const fact =
    ours.facts.find((candidate) => candidate.concept === "BalanceSheetDate") ??
    ours.facts.find((candidate) => candidate.concept === "EndDateForPeriodCoveredByReport");
  return fact ? fact.text : null;
}

// One row per case of a company that has more than one case in the review: its cases file the
// same balance sheet date.
export function sameBalanceSheetDateCriterion(reviews, review) {
  const criterion = "One company's cases agree on one balance sheet date";
  const sameCompany = reviews.filter((candidate) => candidate.input.companyNumber === review.input.companyNumber);
  if (sameCompany.length < 2) return row(criterion, "pass", `the only case for ${review.input.companyNumber}`, "facts.json");
  const dates = new Map(sameCompany.map((candidate) => [candidate.directory, balanceSheetDateOf(candidate.ours)]));
  const distinct = new Set(dates.values());
  return row(
    criterion,
    distinct.size === 1 && !distinct.has(null) ? "pass" : "fail",
    distinct.size === 1 && !distinct.has(null)
      ? `${review.input.companyNumber}: ${[...distinct][0]} in ${sameCompany.length} cases`
      : `${review.input.companyNumber}: ${[...dates].map(([directory, date]) => `${directory} ${date ?? "none"}`).join(", ")}`,
    "facts.json",
  );
}

// The substance checks for one case, in the order the page lists them.
export function substanceCriteria({ kind, input, ours, today }) {
  return [
    categoryCriterion(input, ours),
    companyInformationCriterion(input, ours),
    periodCriterion(input, today),
    hiddenNarrativeCriterion(ours),
    ...(kind === "dormant" ? [neverTradedCriterion(ours)] : []),
    placeholderCriterion(input, ours),
    taxNoteBracketsCriterion(ours),
  ];
}
