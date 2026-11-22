// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/services/accountsWelsh.test.js
// A Welsh company's micro-entity and small company accounts written in Welsh: the language tag the
// accounts TIS names, the Welsh statement phrases its validator checks, Welsh labels, and the same figures.

import { readFileSync } from "node:fs";
import { describe, test, expect } from "vitest";
import { mapIxbrlAccounts } from "@diy-accounting-uk/diya-gl/dist/app/lib/ixbrl-accounts.js";
import { buildAccountsIxbrl, extractAndValidateAccountsParameters } from "@app/functions/companies-house/companiesHouseAccountsPost.js";
import {
  WELSH_ACCOUNTS_TEXT,
  accountsText,
  checkWelshCompany,
  inAccountsLanguage,
  readDocumentLanguage,
} from "@app/services/accountsLanguage.js";
import { parseXmlDocument } from "@app/lib/xmlDom.js";
import { ixbrlStructureProblems } from "@app/lib/ixbrlStructure.js";
import { buildSmallCompanyAccounts } from "@app/services/smallCompanyAccountsIxbrl.js";
import {
  SMALL_COMPANY_BANK_LINES_CASE_INPUT,
  SMALL_COMPANY_CASE_INPUT,
  SMALL_COMPANY_FORMAT_2_CASE_INPUT,
} from "@app/test-helpers/accountsDocumentCases.js";

const cases = JSON.parse(readFileSync("scripts/fixtures/companies-house-test-service-cases.json", "utf8"));
const microCase = cases.find((testCase) => testCase.name === "micro-entity-accounts");
const dormantCase = cases.find((testCase) => testCase.name === "micro-entity-accounts-dormant");
const welshCases = JSON.parse(readFileSync("scripts/fixtures/companies-house-test-service-cases-welsh.json", "utf8"));
const smallCase = cases.find((testCase) => testCase.name === "small-company-accounts-full");
const filletedCase = cases.find((testCase) => testCase.name === "small-company-accounts-filleted");

function accountsOf(testCase, extra = {}) {
  const { name, type, govTestScenario, expectedOutcome, ...requestBody } = testCase;
  const errors = [];
  const accounts = extractAndValidateAccountsParameters({ body: JSON.stringify({ ...requestBody, ...extra }) }, errors);
  return { accounts, errors };
}

function welshDocument(testCase = microCase) {
  const { accounts, errors } = accountsOf(testCase, { documentLanguage: "cy" });
  expect(errors).toEqual([]);
  return buildAccountsIxbrl(accounts);
}

function factText(xhtml, name) {
  const document = parseXmlDocument(xhtml);
  const fact = Array.from(document.getElementsByTagName("ix:nonNumeric")).find((element) => element.getAttribute("name") === name);
  return fact ? fact.textContent : undefined;
}

// The Welsh phrases the Companies House accounts TIS checks in each statement (case-insensitive).
const TIS_WELSH_PHRASES = {
  "direp:StatementThatCompanyEntitledToExemptionFromAuditUnderSection477CompaniesAct2006RelatingToSmallCompanies": [
    ["wedi'i eithrio", "eithriad"],
    ["adran 477 o ddeddf cwmnïau 2006"],
  ],
  "direp:StatementThatMembersHaveNotRequiredCompanyToObtainAnAudit": [
    ["aelodau heb ei gwneud yn ofynnol i'r cwmni gael archwiliad", "aelod heb ei gwneud yn ofynnol i'r cwmni gael archwiliad"],
  ],
  "direp:StatementThatDirectorsAcknowledgeTheirResponsibilitiesUnderCompaniesAct": [
    ["cyfarwyddwyryn cydnabod", "cyfarwyddwr yn cydnabod"],
    ["cyfrifoldebau"],
    ["ddeddf cwmnïau 2006", "y ddeddf"],
  ],
  "direp:StatementThatAccountsHaveBeenPreparedInAccordanceWithProvisionsSmallCompaniesRegime": [
    ["wedi eu paratoi"],
    ["yn unol â"],
    ["darpariaethau"],
    ["micro"],
  ],
};

describe("a document language for the accounts", () => {
  test("a request names English, Welsh or nothing", () => {
    const errors = [];
    expect(readDocumentLanguage(undefined, errors)).toBe("en");
    expect(readDocumentLanguage("en", errors)).toBe("en");
    expect(readDocumentLanguage("cy", errors)).toBe("cy");
    expect(errors).toEqual([]);
    readDocumentLanguage("fr", errors);
    expect(errors).toEqual(["Invalid documentLanguage - must be one of en, cy"]);
  });

  test("a small company request may ask for Welsh, and the accounts keep the choice", () => {
    const { accounts, errors } = accountsOf(smallCase, { documentLanguage: "cy" });
    expect(errors).toEqual([]);
    expect(accounts.documentLanguage).toBe("cy");
    expect(accountsOf(smallCase).accounts.documentLanguage).toBeUndefined();
  });

  test("only a company whose jurisdiction is wales may file in Welsh", () => {
    const errors = [];
    checkWelshCompany("wales", errors);
    expect(errors).toEqual([]);
    checkWelshCompany("england-wales", errors);
    expect(errors).toEqual([
      'Welsh accounts are for a Welsh company: Companies House holds this company\'s jurisdiction as "england-wales", not "wales"',
    ]);
  });

  test("a phrase with no Welsh wording stops a Welsh build", () => {
    expect(() => inAccountsLanguage("cy", () => accountsText("A phrase nobody translated"))).toThrow(
      'The Welsh accounts have no wording for "A phrase nobody translated"',
    );
    expect(inAccountsLanguage("en", () => accountsText("A phrase nobody translated"))).toBe("A phrase nobody translated");
  });

  test("every Welsh wording keeps the values of its English", () => {
    for (const [english, welsh] of Object.entries(WELSH_ACCOUNTS_TEXT)) {
      const names = (text) => (text.match(/\{[a-zA-Z]+\}/g) ?? []).sort();
      const required = names(english).filter((name) => name !== "{paidVerb}");
      expect(
        names(welsh).filter((name) => name !== "{paidVerb}"),
        english,
      ).toEqual(required);
    }
  });
});

describe("Welsh micro-entity accounts", () => {
  test("the report names Welsh as its principal language, on a context with the Welsh member", () => {
    const xhtml = welshDocument();
    const document = parseXmlDocument(xhtml);
    expect(xhtml).toContain('xmlns:lang="http://xbrl.frc.org.uk/cd/2026-01-01/languages"');
    expect(xhtml).toContain('xml:lang="cy"');
    const fact = Array.from(document.getElementsByTagName("ix:nonNumeric")).find(
      (element) => element.getAttribute("name") === "bus:ReportPrincipalLanguage",
    );
    const context = document.getElementById(fact.getAttribute("contextRef"));
    const member = context.getElementsByTagName("xbrldi:explicitMember")[0];
    expect(member.getAttribute("dimension")).toBe("lang:LanguagesDimension");
    expect(member.textContent).toBe("lang:Welsh");
  });

  test("an English report keeps ReportPrincipalLanguage with no dimension and declares no languages namespace", () => {
    const { accounts } = accountsOf(microCase);
    const xhtml = buildAccountsIxbrl(accounts);
    const document = parseXmlDocument(xhtml);
    const fact = Array.from(document.getElementsByTagName("ix:nonNumeric")).find(
      (element) => element.getAttribute("name") === "bus:ReportPrincipalLanguage",
    );
    expect(document.getElementById(fact.getAttribute("contextRef")).getElementsByTagName("xbrli:segment")).toHaveLength(0);
    expect(xhtml).not.toContain("xmlns:lang=");
    expect(xhtml).not.toContain('xml:lang="cy"');
  });

  test.each(Object.entries(TIS_WELSH_PHRASES))("%s holds every Welsh phrase the validator checks", (name, phraseGroups) => {
    const text = factText(welshDocument(), name).toLowerCase();
    for (const alternatives of phraseGroups) {
      expect(
        alternatives.some((phrase) => text.includes(phrase)),
        `${name}: one of ${alternatives.join(" / ")}`,
      ).toBe(true);
    }
  });

  test("a dormant company's section 480 statement holds the Welsh phrases", () => {
    const text = factText(
      welshDocument(dormantCase),
      "direp:StatementThatCompanyEntitledToExemptionFromAuditUnderSection480CompaniesAct2006RelatingToDormantCompanies",
    ).toLowerCase();
    expect(text).toContain("eithriad");
    expect(text).toContain("adran 480 o ddeddf cwmnïau 2006");
  });

  test("the pages read in Welsh: the title, the balance sheet labels and the approval line", () => {
    const xhtml = welshDocument();
    for (const welsh of [
      "Cyfrifon micro-endid heb eu harchwilio",
      "Mantolen",
      "Asedau sefydlog",
      "Asedau cyfredol",
      "Credydwyr: symiau sy’n ddyledus o fewn blwyddyn",
      "Cyfanswm yr asedau llai&#39;r rhwymedigaethau cyfredol",
      "Cyfalaf a chronfeydd wrth gefn",
      "Cronfeydd y cyfranddalwyr",
      "Nodiadau i’r datganiadau ariannol",
      "Gwybodaeth gyffredinol",
      "y bwrdd cyfarwyddwyr",
    ]) {
      expect(xhtml.replaceAll("'", "&#39;")).toContain(welsh);
    }
    for (const english of ["Balance sheet", "Fixed assets", "Notes to the financial statements", "Companies Act 2006", "Approved by"]) {
      expect(xhtml).not.toContain(english);
    }
  });

  test("the company information note names England and Wales as the part of the UK of registration", () => {
    const xhtml = welshDocument();
    expect(xhtml).toContain("wedi’i gofrestru yng Nghymru a Lloegr, rhif cofrestru");
    expect(xhtml).not.toMatch(/wedi’i gofrestru yng Nghymru,/);
  });

  test("tagged dates are numbers that registry 2 reads in any language", () => {
    const xhtml = welshDocument();
    expect(xhtml).not.toContain("ixt2:datedaymonthyearen");
    const [year, month, day] = microCase.periodEnd.split("-");
    expect(xhtml).toContain(`format="ixt2:datedaymonthyear">${day}/${month}/${year}</ix:nonNumeric>`);
  });

  test("the Welsh accounts carry the same figures, period, employees and director as the English", () => {
    const english = mapIxbrlAccounts(buildAccountsIxbrl(accountsOf(microCase).accounts), {
      regime: "micro",
      companyNumber: microCase.companyNumber,
    });
    const welsh = mapIxbrlAccounts(welshDocument(), { regime: "micro", companyNumber: microCase.companyNumber });
    expect(welsh.balanceSheet).toEqual(english.balanceSheet);
    expect(welsh.period).toEqual(english.period);
    expect(welsh.averageEmployees).toBe(english.averageEmployees);
    expect(welsh.signer).toBe(english.signer);
    expect(welsh.approvalDate).toBe(english.approvalDate);
  });
});

// The Welsh phrases of the small companies regime statements: the micro-entity statement's phrases,
// with the small companies regime in place of "micro".
const SMALL_TIS_WELSH_PHRASES = {
  ...Object.fromEntries(
    Object.entries(TIS_WELSH_PHRASES).filter(
      ([name]) => name !== "direp:StatementThatAccountsHaveBeenPreparedInAccordanceWithProvisionsSmallCompaniesRegime",
    ),
  ),
  "direp:StatementThatAccountsHaveBeenPreparedInAccordanceWithProvisionsSmallCompaniesRegime": [
    ["wedi eu paratoi"],
    ["yn unol â"],
    ["darpariaethau"],
    ["cwmnïau bach"],
  ],
  "direp:StatementThatDirectorsReportHasBeenPreparedInAccordanceWithProvisionsSmallCompaniesRegime": [
    ["wedi ei baratoi"],
    ["yn unol â"],
    ["darpariaethau"],
    ["cwmnïau bach"],
  ],
};

const SMALL_KITCHEN_SINK_INPUT = {
  ...SMALL_COMPANY_CASE_INPUT,
  goingConcernStatement: "The directors expect the company to keep trading.",
  revenueRecognitionPolicy: "Turnover is the value of work done in the year.",
  inventoriesPolicy: "Stocks are at the lower of cost and net realisable value.",
  taxPolicy: "Tax is the tax payable on the year's profit.",
  controllingParty: { ultimate: true, name: "MORGAN HOLDINGS LIMITED" },
  shareCapital: { shareClass: "ordinaryShares", nominalValue: 1 },
  intangibleAssetNote: {
    costAtStart: 1000,
    additions: 0,
    disposals: 0,
    amortisationAtStart: 1000,
    amortisationCharge: 0,
    amortisationOnDisposals: 0,
  },
  accountantsReport: { accountantsName: "Example Accountants LLP", statement: "We prepared these accounts from the records you gave us." },
  revision: {
    originalDateOfApproval: "2026-06-01",
    nonCompliance: "The original accounts gave the wrong stock figure.",
    amendments: "Stocks and the profit for the year are restated.",
  },
  directorsAdvances: [
    { name: "Alex Jones", terms: "Interest free, repayable on demand.", balanceAtStart: 0, advanced: 500, repaid: 500, balanceAtEnd: 0 },
  ],
  balanceSheet: {
    current: { ...SMALL_COMPANY_CASE_INPUT.balanceSheet.current, tradeDebtors: 2000, otherDebtors: 500 },
    prior: SMALL_COMPANY_CASE_INPUT.balanceSheet.prior,
  },
};

const welshSmall = (input) => inAccountsLanguage("cy", () => buildSmallCompanyAccounts(input));

describe("Welsh small company accounts", () => {
  test("the report names Welsh as its principal language, on a context with the Welsh member", () => {
    const xhtml = welshDocument(smallCase);
    const document = parseXmlDocument(xhtml);
    expect(xhtml).toContain('xml:lang="cy"');
    const fact = Array.from(document.getElementsByTagName("ix:nonNumeric")).find(
      (element) => element.getAttribute("name") === "bus:ReportPrincipalLanguage",
    );
    const member = document.getElementById(fact.getAttribute("contextRef")).getElementsByTagName("xbrldi:explicitMember")[0];
    expect(member.getAttribute("dimension")).toBe("lang:LanguagesDimension");
    expect(member.textContent).toBe("lang:Welsh");
  });

  test.each(Object.entries(SMALL_TIS_WELSH_PHRASES))("%s holds every Welsh phrase the validator checks", (name, phraseGroups) => {
    const text = factText(welshDocument(smallCase), name).toLowerCase();
    for (const alternatives of phraseGroups) {
      expect(
        alternatives.some((phrase) => text.includes(phrase)),
        `${name}: one of ${alternatives.join(" / ")}`,
      ).toBe(true);
    }
  });

  test("the filleted copy's section 444(5A) statement is in Welsh", () => {
    const text = factText(
      welshDocument(filletedCase),
      "direp:StatementThatDirectorsHaveElectedNotToDeliverProfitLossAccountUnderSection4445ACompaniesAct2006",
    )?.toLowerCase();
    expect(text).toContain("adran 444(5a) o ddeddf cwmnïau 2006");
    expect(text).toContain("cyfrif elw a cholled");
  });

  test("the pages read in Welsh: the directors' report, the profit and loss account and the notes", () => {
    const xhtml = welshSmall(SMALL_KITCHEN_SINK_INPUT);
    for (const welsh of [
      "Datganiadau ariannol heb eu harchwilio",
      "Adroddiad y cyfarwyddwyr",
      "Cost gwerthiant",
      "Elw gros",
      "Elw ar gyfer y flwyddyn ariannol",
      "Stociau",
      "Arian yn y banc ac mewn llaw",
      "Credydwyr masnach",
      "Asedau sefydlog diriaethol",
      "Gwerth llyfr net",
      "Asedau anniriaethol",
      "Dyledwyr masnach",
      "Treth gorfforaeth y DU",
      "Parti sy’n rheoli’r cwmni yn y pen draw yw",
      "Busnes gweithredol",
      "Cyfrifon diwygiedig",
      "Adroddiad y cyfrifwyr",
      "Blaensymiau a chredydau i gyfarwyddwyr",
      "Cymeradwywyd yr adroddiad hwn gan y bwrdd cyfarwyddwyr",
    ]) {
      expect(xhtml, welsh).toContain(welsh);
    }
    for (const english of [
      "Balance sheet",
      "Directors' report",
      "Directors&#39; report",
      "Notes to the financial statements",
      "Profit for the financial year",
      "Net book value",
      "Companies Act 2006",
      "Approved by",
      "controlling party",
      "ixt2:datedaymonthyearen",
    ]) {
      expect(xhtml, english).not.toContain(english);
    }
  });

  test.each([
    ["the full set", SMALL_COMPANY_CASE_INPUT],
    ["the filleted copy", { ...SMALL_COMPANY_CASE_INPUT, filleted: true }],
    ["Format 2", SMALL_COMPANY_FORMAT_2_CASE_INPUT],
    ["the bank and tax lines", SMALL_COMPANY_BANK_LINES_CASE_INPUT],
    ["every note", SMALL_KITCHEN_SINK_INPUT],
    ["every note, filleted", { ...SMALL_KITCHEN_SINK_INPUT, filleted: true }],
    ["a controlling party that is not ultimate", { ...SMALL_KITCHEN_SINK_INPUT, controllingParty: { ultimate: false, name: "A PERSON" } }],
    ["no ultimate controlling party", { ...SMALL_KITCHEN_SINK_INPUT, controllingParty: { ultimate: false } }],
  ])("%s builds in Welsh with a sound iXBRL structure", (label, input) => {
    expect(ixbrlStructureProblems(welshSmall(input))).toEqual([]);
  });

  test.each([
    ["the full set", SMALL_COMPANY_CASE_INPUT],
    ["Format 2", SMALL_COMPANY_FORMAT_2_CASE_INPUT],
    ["the filleted copy", { ...SMALL_COMPANY_CASE_INPUT, filleted: true }],
  ])("%s read back through the diya-gl reader gives the same figures as the English", (label, input) => {
    const expect_ = { regime: "small", companyNumber: input.companyNumber };
    const english = mapIxbrlAccounts(buildSmallCompanyAccounts(input), expect_);
    const welsh = mapIxbrlAccounts(welshSmall(input), expect_);
    expect(welsh.balanceSheet).toEqual(english.balanceSheet);
    expect(welsh.profitAndLoss).toEqual(english.profitAndLoss);
    expect(welsh.fixedAssetNote).toEqual(english.fixedAssetNote);
    expect(welsh.period).toEqual(english.period);
    expect(welsh.filleted).toBe(english.filleted);
    expect(welsh.averageEmployees).toBe(english.averageEmployees);
    expect(welsh.directors).toEqual(english.directors);
    expect(welsh.signer).toBe(english.signer);
    expect(welsh.approvalDate).toBe(english.approvalDate);
  });
});

describe("the Welsh test-service cases", () => {
  test.each(welshCases.map((testCase) => [testCase.name, testCase]))("%s asks for Welsh and builds a Welsh document", (name, testCase) => {
    const { accounts, errors } = accountsOf(testCase);
    expect(errors).toEqual([]);
    expect(accounts.documentLanguage).toBe("cy");
    const xhtml = buildAccountsIxbrl(accounts);
    expect(xhtml).toContain('xml:lang="cy"');
    expect(ixbrlStructureProblems(xhtml)).toEqual([]);
  });

  test("the set holds a micro-entity case and a small company case", () => {
    expect(welshCases.map((testCase) => Boolean(testCase.smallCompany))).toEqual([false, true]);
  });
});
