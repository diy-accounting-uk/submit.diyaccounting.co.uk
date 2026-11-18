// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/services/accountsWelsh.test.js
// A Welsh company's micro-entity accounts written in Welsh: the language tag the accounts TIS
// names, the Welsh statement phrases its validator checks, Welsh labels, and the same figures.

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

const cases = JSON.parse(readFileSync("scripts/fixtures/companies-house-test-service-cases.json", "utf8"));
const microCase = cases.find((testCase) => testCase.name === "micro-entity-accounts");
const dormantCase = cases.find((testCase) => testCase.name === "micro-entity-accounts-dormant");
const smallCase = cases.find((testCase) => testCase.name === "small-company-accounts-full");

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
    expect(readDocumentLanguage(undefined, "micro-entity", errors)).toBe("en");
    expect(readDocumentLanguage("en", "micro-entity", errors)).toBe("en");
    expect(readDocumentLanguage("cy", "micro-entity", errors)).toBe("cy");
    expect(errors).toEqual([]);
    readDocumentLanguage("fr", "micro-entity", errors);
    expect(errors).toEqual(["Invalid documentLanguage - must be one of en, cy"]);
  });

  test("a small company request asking for Welsh is refused", () => {
    const { errors } = accountsOf(smallCase, { documentLanguage: "cy" });
    expect(errors).toContain("Welsh accounts (documentLanguage cy) are written for micro-entity accounts");
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
