// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/accountsRevision.test.js

import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  refusalOf,
  documentLanguageOf,
  accountantsReportOf,
  checkRevision,
  filedPeriodOf,
  notesOf,
  refusalNextStep,
  revisionSourceOf,
  balanceSheetLinesOf,
  registeredOfficeOf,
  NOTE_POLICY_FACTS,
  NOTE_CONTROLLING_PARTY_FACTS,
  NOTE_ADVANCE_FACTS,
  NOTE_INTANGIBLE_FACTS,
  NOTE_DEBTOR_FACTS,
  NOTE_SHARE_CAPITAL_FACTS,
} from "../public/lib/accounts-revision.js";
import { buildMicroEntityAccounts } from "../../app/services/microEntityAccountsIxbrl.js";
import { inAccountsLanguage } from "../../app/services/accountsLanguage.js";
import {
  microInputFromTestServiceCase,
  SMALL_COMPANY_CASE_INPUT,
  SMALL_COMPANY_NOTES_CASE_INPUT,
  SMALL_COMPANY_EVERY_LINE_CASE_INPUT,
  SMALL_COMPANY_FORMAT_2_CASE_INPUT,
  SMALL_COMPANY_BANK_LINES_CASE_INPUT,
} from "../../app/test-helpers/accountsDocumentCases.js";
import {
  buildSmallCompanyAccounts,
  SMALL_COMPANY_POLICY_FIELDS,
  balanceSheetBreakdownProblems,
  profitAndLossLinesOf,
} from "../../app/services/smallCompanyAccountsIxbrl.js";
import { mapIxbrlAccounts } from "@diy-accounting-uk/diya-gl/dist/app/lib/ixbrl-accounts.js";
import { capitalAndReservesMismatch } from "../public/lib/balance-sheet-check.js";
import { CONCEPTS } from "../../app/services/accountsIxbrlCommon.js";

const MICRO_CASE = JSON.parse(readFileSync("scripts/fixtures/companies-house-test-service-cases.json", "utf8")).find(
  (testCase) => testCase.name === "micro-entity-accounts",
);
const REPORT = {
  accountantsName: "Jones & Partners <Chartered Accountants>",
  statement: "We compiled these accounts from the company’s records & the information given to us.",
};

function filedDocument({ language = "en", accountantsReport } = {}) {
  const input = { ...microInputFromTestServiceCase(MICRO_CASE), ...(accountantsReport ? { accountantsReport } : {}) };
  return inAccountsLanguage(language, () => buildMicroEntityAccounts(input));
}

function accountsReceipt(overrides = {}) {
  return {
    kind: "companies-house-accounts",
    statusCode: "ACCEPT",
    submissionNumber: "00001A",
    companyNumber: "00000003",
    filedDocument: "<html/>",
    ...overrides,
  };
}

describe("which accounts receipts can be revised", () => {
  test("accepted accounts filed on their own with their document can be revised", () => {
    expect(refusalOf(accountsReceipt({ filedDocument: filedDocument() }))).toBeNull();
  });

  test("accounts whose document states no period are refused with their own sentence", () => {
    const sentence = "The accounts on that receipt do not state their period, so this site cannot revise them here.";
    expect(refusalOf(accountsReceipt())).toBe(sentence);
    expect(refusalOf(accountsReceipt(), "00000003", { periodStart: "2025-04-01", periodEnd: "2026-03-31" })).toBe(sentence);
  });

  test("accounts that are already revised accounts are refused, with one sentence", () => {
    expect(refusalOf(accountsReceipt({ amended: true }))).toBe(
      "These accounts are already revised accounts, and this site does not yet file a second revision.",
    );
  });
});

describe("what a filed document carries over to its revision", () => {
  for (const language of ["en", "cy"]) {
    test(`reads the language and the accountants' report of a document filed in ${language}`, () => {
      const document = filedDocument({ language, accountantsReport: REPORT });
      expect(documentLanguageOf(document)).toBe(language);
      expect(accountantsReportOf(document)).toEqual(REPORT);
    });

    test(`reads no accountants' report from a document filed in ${language} without one`, () => {
      const document = filedDocument({ language });
      expect(documentLanguageOf(document)).toBe(language);
      expect(accountantsReportOf(document)).toBeNull();
    });
  }

  test("says a report cannot be read when the document has one without its tagged firm and statement", () => {
    const document = filedDocument({ accountantsReport: REPORT }).replace(/bus:NameEntityAccountants/g, "bus:SomethingElse");
    expect(accountantsReportOf(document)).toEqual({ unreadable: true });
  });
});

describe("the revision the customer describes", () => {
  const complete = { originalDateOfApproval: "2026-09-15", nonCompliance: "A", amendments: "B", dateApproved: "2026-09-20" };

  test("a complete revision approved after the original has no problem", () => {
    expect(checkRevision(complete)).toEqual([]);
  });

  test("an empty original approval date is a problem with its own sentence", () => {
    expect(checkRevision({ ...complete, originalDateOfApproval: "" })).toEqual([
      {
        field: "originalDateOfApproval",
        message: "Enter the date the original accounts were approved, as the filed accounts show it",
      },
    ]);
  });
});

describe("what a filed small company document carries over to its revision", () => {
  for (const filleted of [false, true]) {
    for (const language of ["en", "cy"]) {
      const copy = filleted ? "filleted" : "full";
      const document = (accountantsReport) =>
        inAccountsLanguage(language, () =>
          buildSmallCompanyAccounts({ ...SMALL_COMPANY_CASE_INPUT, filleted, ...(accountantsReport ? { accountantsReport } : {}) }),
        );

      test(`reads the language and the accountants' report of ${copy} accounts filed in ${language}`, () => {
        const filed = document(REPORT);
        expect(documentLanguageOf(filed)).toBe(language);
        expect(accountantsReportOf(filed)).toEqual(REPORT);
      });

      test(`reads no accountants' report from ${copy} accounts filed in ${language} without one`, () => {
        const filed = document();
        expect(documentLanguageOf(filed)).toBe(language);
        expect(accountantsReportOf(filed)).toBeNull();
      });
    }
  }
});

describe("the registered office a filed document states", () => {
  test("is read part by part, with the country written before the postcode, as the accounts were filed", () => {
    expect(registeredOfficeOf(filedDocument())).toEqual(MICRO_CASE.registeredOffice);
    const office = {
      addressLine1: "1 Stryd & Fawr",
      addressLine2: "Uned 2",
      cityOrTown: "Caerdydd",
      countyRegion: "De Morgannwg",
      postalCode: "CF10 1AA",
    };
    const welsh = inAccountsLanguage("cy", () =>
      buildMicroEntityAccounts({ ...microInputFromTestServiceCase(MICRO_CASE), registeredOffice: office }),
    );
    expect(registeredOfficeOf(welsh)).toEqual(office);
  });

  test("keeps the country of an office that states no postcode", () => {
    const office = { addressLine1: "1 Rue Exemple", cityOrTown: "Paris", country: "France" };
    for (const language of ["en", "cy"]) {
      const document = inAccountsLanguage(language, () =>
        buildMicroEntityAccounts({ ...microInputFromTestServiceCase(MICRO_CASE), registeredOffice: office }),
      );
      expect(registeredOfficeOf(document)).toEqual(office);
    }
  });

  test("is null for a document that states no office", () => {
    expect(registeredOfficeOf("<html/>")).toBeNull();
  });
});

describe("the period a filed document is for", () => {
  test("is read from the context the company name is stated in, for micro-entity and small company accounts", () => {
    expect(filedPeriodOf(filedDocument())).toEqual({ periodStart: MICRO_CASE.periodStart, periodEnd: MICRO_CASE.periodEnd });
    expect(filedPeriodOf(buildSmallCompanyAccounts(SMALL_COMPANY_CASE_INPUT))).toEqual({
      periodStart: SMALL_COMPANY_CASE_INPUT.periodStart,
      periodEnd: SMALL_COMPANY_CASE_INPUT.periodEnd,
    });
  });

  test("a receipt is refused for revised accounts of another period, and accepted for its own", () => {
    const receipt = accountsReceipt({ filedDocument: filedDocument() });
    const own = { periodStart: MICRO_CASE.periodStart, periodEnd: MICRO_CASE.periodEnd };
    expect(refusalOf(receipt, receipt.companyNumber, own)).toBeNull();
    expect(refusalOf(receipt, receipt.companyNumber, { ...own, periodEnd: "2027-03-31" })).toContain("cannot replace them");
  });
});

describe("the notes a filed document carries over to its revision", () => {
  const qname = (conceptKey) => `${CONCEPTS[conceptKey].prefix}:${CONCEPTS[conceptKey].name}`;
  const POLICY_FIELDS = ["accountingPolicies", ...SMALL_COMPANY_POLICY_FIELDS.map(({ field }) => field)];

  test("are read by the facts the builders tag them with", () => {
    expect(NOTE_POLICY_FACTS).toEqual(
      Object.fromEntries([
        ["accountingPolicies", qname("generalDescriptionBasisMeasurement")],
        ...SMALL_COMPANY_POLICY_FIELDS.map(({ field, conceptKey }) => [field, qname(conceptKey)]),
      ]),
    );
    expect(NOTE_CONTROLLING_PARTY_FACTS).toEqual({ ultimate: qname("controllingPartyIsUltimate"), name: qname("nameControllingParty") });
    expect(NOTE_ADVANCE_FACTS).toEqual({
      terms: qname("descriptionAdvanceConditionsDirectors"),
      balance: qname("advancesCreditsDirectors"),
      advanced: qname("advancesCreditsMadeDirectors"),
      repaid: qname("advancesCreditsRepaidDirectors"),
    });
    expect(NOTE_INTANGIBLE_FACTS).toEqual({
      cost: qname("intangibleAssetsGrossCost"),
      additions: qname("additionsIntangibleAssets"),
      disposals: qname("disposalsIntangibleAssets"),
      amortisation: qname("accumulatedAmortisationIntangibleAssets"),
      amortisationCharge: qname("amortisationChargeIntangibleAssets"),
      amortisationOnDisposals: qname("amortisationDisposalsIntangibleAssets"),
    });
    expect(NOTE_DEBTOR_FACTS).toEqual({
      tradeDebtors: qname("tradeDebtors"),
      otherDebtors: qname("otherDebtors"),
      amountsOwedByDirectors: qname("amountsOwedByDirectors"),
      prepayments: qname("prepaymentsInDebtors"),
    });
    expect(NOTE_SHARE_CAPITAL_FACTS).toEqual({
      shares: qname("numberSharesIssuedFullyPaid"),
      parValue: qname("parValueShare"),
      nominalValue: qname("nominalValueAllottedShareCapital"),
    });
  });

  for (const filleted of [false, true]) {
    for (const language of ["en", "cy"]) {
      const copy = filleted ? "filleted" : "full";
      const build = (overrides = {}) =>
        inAccountsLanguage(language, () => buildSmallCompanyAccounts({ ...SMALL_COMPANY_NOTES_CASE_INPUT, filleted, ...overrides }));

      test(`every note of ${copy} small company accounts filed in ${language} comes back as filed`, () => {
        const notes = notesOf(build());
        expect(notes.policies).toEqual(Object.fromEntries(POLICY_FIELDS.map((field) => [field, SMALL_COMPANY_NOTES_CASE_INPUT[field]])));
        expect(notes.controllingParty).toEqual(SMALL_COMPANY_NOTES_CASE_INPUT.controllingParty);
        expect(notes.debtors).toEqual({
          current: { tradeDebtors: 1700, amountsOwedByDirectors: 800 },
          prior: {},
        });
        expect(notes.directorsAdvances).toEqual(SMALL_COMPANY_NOTES_CASE_INPUT.directorsAdvances);
        expect(notes.intangibleAssetNote).toEqual(SMALL_COMPANY_NOTES_CASE_INPUT.intangibleAssetNote);
        expect(notes.shareCapital).toEqual(SMALL_COMPANY_NOTES_CASE_INPUT.shareCapital);
        expect(notes.unreadable).toEqual([]);
      });

      test(`a controlling party of ${copy} accounts filed in ${language} comes back whichever way it was stated`, () => {
        expect(notesOf(build({ controllingParty: { ultimate: false } })).controllingParty).toEqual({ ultimate: false });
        expect(notesOf(build({ controllingParty: { name: "Jo Morgan", ultimate: false } })).controllingParty).toEqual({
          name: "Jo Morgan",
          ultimate: false,
        });
      });
    }
  }

  test("small company accounts without the optional notes give none back", () => {
    const notes = notesOf(buildSmallCompanyAccounts(SMALL_COMPANY_CASE_INPUT));
    expect(notes.policies).toEqual({ accountingPolicies: SMALL_COMPANY_CASE_INPUT.accountingPolicies });
    expect(notes.controllingParty).toBeNull();
    expect(notes.debtors).toBeNull();
    expect(notes.directorsAdvances).toEqual([]);
    expect(notes.intangibleAssetNote).toBeNull();
    expect(notes.shareCapital).toBeNull();
    expect(notes.unreadable).toEqual([]);
  });

  for (const language of ["en", "cy"]) {
    test(`the advances to directors of micro-entity accounts filed in ${language} come back as filed`, () => {
      const input = microInputFromTestServiceCase(MICRO_CASE);
      const directorsAdvances = [
        {
          name: input.directorName,
          terms: "Repayable within nine months",
          balanceAtStart: 0,
          advanced: 450,
          repaid: 50,
          balanceAtEnd: 400,
        },
      ];
      const notes = notesOf(inAccountsLanguage(language, () => buildMicroEntityAccounts({ ...input, directorsAdvances })));
      expect(notes.directorsAdvances).toEqual(directorsAdvances);
      expect(notes.policies).toEqual({});
      expect(notes.unreadable).toEqual([]);
    });
  }

  test("a note whose facts are there but cannot be read is named as unreadable", () => {
    const filed = buildSmallCompanyAccounts(SMALL_COMPANY_NOTES_CASE_INPUT)
      .replace(/(name="core:DisposalsIntangibleAssets"[^>]*>)[^<]*/, "$1n/a")
      .replace(/(<ix:nonNumeric name="core:TaxPolicy"[^>]*>)/, "$1<span>")
      .replace(/<p>Alex Jones: /, "<p><b>Alex Jones</b>: ");
    expect(notesOf(filed).unreadable).toEqual(["policies", "directorsAdvances", "intangibleAssetNote"]);
  });
});

// The boxes of a form whose ids start with the year, read from the page itself.
function formLinesOf(page, year) {
  const html = readFileSync(`web/public/companies-house/${page}`, "utf8");
  return Array.from(
    html.matchAll(new RegExp(`<input[^>]*\\sid="${year}([A-Z][A-Za-z]*)"`, "g")),
    ([, name]) => name[0].toLowerCase() + name.slice(1),
  );
}

// The figure each box of a year holds once the revision has opened: what the books mapping gives for
// the lines the books card fills, then what the revision module reads over it.
function filledYear(source, year, lines) {
  const mappedYear = source.figures[year === "current" ? "currentYear" : "priorYear"];
  const filled = Object.fromEntries(lines.filter((line) => typeof mappedYear[line] === "number").map((line) => [line, mappedYear[line]]));
  return { ...filled, ...(source.notes.debtors?.[year] ?? {}), ...source.balanceSheetLines[year] };
}

describe("the balance sheet of a filed document comes back whole in its revision", () => {
  const SMALL_FORM = "fileSmallCompanyAccounts.html";
  const profitAndLossLines = new Set([...profitAndLossLinesOf(1), ...profitAndLossLinesOf(2)]);

  for (const filleted of [false, true]) {
    const copy = filleted ? "filleted" : "full";
    test(`every balance sheet line of the small company form comes back equal from ${copy} accounts, and the rules pass`, () => {
      const input = { ...SMALL_COMPANY_EVERY_LINE_CASE_INPUT, filleted };
      const filed = buildSmallCompanyAccounts(input);
      const source = revisionSourceOf({ filedDocument: filed, companyNumber: input.companyNumber }, { mapIxbrlAccounts });
      const back = {};
      for (const [year, inputYear] of [
        ["current", input.balanceSheet.current],
        ["prior", input.balanceSheet.prior],
      ]) {
        const lines = formLinesOf(SMALL_FORM, year).filter((line) => !profitAndLossLines.has(line));
        expect(lines).toHaveLength(21);
        const filledFigures = filledYear(source, year, lines);
        for (const line of lines) expect([year, line, filledFigures[line]]).toEqual([year, line, inputYear[line]]);
        back[year] = { ...filledFigures, capitalAndReserves: filledFigures.calledUpShareCapital + filledFigures.profitAndLossAccount };
        expect(balanceSheetBreakdownProblems(back[year])).toEqual([]);
        expect(capitalAndReservesMismatch(back[year])).toBeNull();
      }
      expect(() => buildSmallCompanyAccounts({ ...input, balanceSheet: back })).not.toThrow();
    });
  }

  for (const caseInput of [SMALL_COMPANY_EVERY_LINE_CASE_INPUT, SMALL_COMPANY_FORMAT_2_CASE_INPUT]) {
    const format = caseInput.profitAndLossFormat === 2 ? 2 : 1;
    test(`every profit and loss line of a full copy in format ${format} comes back equal through the books mapping`, () => {
      const source = revisionSourceOf(
        { filedDocument: buildSmallCompanyAccounts(caseInput), companyNumber: caseInput.companyNumber },
        { mapIxbrlAccounts },
      );
      const formLines = formLinesOf(SMALL_FORM, "current").filter((line) => profitAndLossLinesOf(format).includes(line));
      expect(formLines.length).toBeGreaterThan(4);
      for (const [year, mappedYear] of [
        ["current", "currentYear"],
        ["prior", "priorYear"],
      ]) {
        for (const line of formLines) {
          expect([year, line, source.mapped.profitAndLoss[mappedYear][line] ?? 0]).toEqual([
            year,
            line,
            caseInput.profitAndLoss[year]?.[line] ?? 0,
          ]);
        }
      }
    });
  }

  test("every balance sheet line of the micro-entity form comes back equal, and the rule passes", () => {
    const input = microInputFromTestServiceCase(MICRO_CASE);
    const withLines = (year) => ({
      ...year,
      creditorsAfterOneYear: 200,
      provisionsForLiabilities: 100,
      currentAssets: year.currentAssets + 300,
    });
    const balanceSheet = { current: withLines(input.balanceSheet.current), prior: withLines(input.balanceSheet.prior) };
    const source = revisionSourceOf(
      { filedDocument: buildMicroEntityAccounts({ ...input, balanceSheet }), companyNumber: input.companyNumber },
      { mapIxbrlAccounts },
    );
    const back = {};
    for (const year of ["current", "prior"]) {
      const lines = formLinesOf("fileMicroEntityAccounts.html", year).filter((line) => line !== "capitalAndReserves");
      expect(lines).toHaveLength(10);
      const filledFigures = filledYear(source, year, lines);
      for (const line of lines) expect([year, line, filledFigures[line] ?? 0]).toEqual([year, line, balanceSheet[year][line] ?? 0]);
      back[year] = { ...filledFigures, capitalAndReserves: filledFigures.calledUpShareCapital + filledFigures.profitAndLossAccount };
      expect(capitalAndReservesMismatch(back[year])).toBeNull();
    }
    expect(() => buildMicroEntityAccounts({ ...input, balanceSheet: back })).not.toThrow();
  });

  test("the taxation and social security line is read from the concept beside corporation tax, in both years", () => {
    const filed = buildSmallCompanyAccounts(SMALL_COMPANY_BANK_LINES_CASE_INPUT);
    expect(filed).toContain("core:OtherTaxationSocialSecurityPayable");
    const lines = balanceSheetLinesOf(filed);
    expect(lines.current.taxationSocialSecurity).toBe(SMALL_COMPANY_BANK_LINES_CASE_INPUT.balanceSheet.current.taxationSocialSecurity);
    expect(lines.prior.taxationSocialSecurity).toBe(SMALL_COMPANY_BANK_LINES_CASE_INPUT.balanceSheet.prior.taxationSocialSecurity);
    expect(lines.unreadable).toBe(false);
  });

  test("a document filed with the line on the concept of the tax creditors' total gives the same figures", () => {
    const filed = buildSmallCompanyAccounts(SMALL_COMPANY_BANK_LINES_CASE_INPUT).replaceAll(
      "core:OtherTaxationSocialSecurityPayable",
      "core:TaxationSocialSecurityPayable",
    );
    expect(filed).toContain("core:TaxationSocialSecurityPayable");
    const lines = balanceSheetLinesOf(filed);
    expect(lines.current.taxationSocialSecurity).toBe(SMALL_COMPANY_BANK_LINES_CASE_INPUT.balanceSheet.current.taxationSocialSecurity);
    expect(lines.prior.taxationSocialSecurity).toBe(SMALL_COMPANY_BANK_LINES_CASE_INPUT.balanceSheet.prior.taxationSocialSecurity);
  });

  test("a document that states both concepts gives the figure beside corporation tax", () => {
    const built = buildSmallCompanyAccounts(SMALL_COMPANY_BANK_LINES_CASE_INPUT);
    const fact =
      /<ix:nonFraction name="core:OtherTaxationSocialSecurityPayable" contextRef="e2026-within-one-year"[^>]*>[^<]*<\/ix:nonFraction>/.exec(
        built,
      )[0];
    const total = fact
      .replace("core:OtherTaxationSocialSecurityPayable", "core:TaxationSocialSecurityPayable")
      .replace(/>[^<]*</, ">9,999<");
    const lines = balanceSheetLinesOf(built.replace(fact, `${fact}${total}`));
    expect(lines.current.taxationSocialSecurity).toBe(SMALL_COMPANY_BANK_LINES_CASE_INPUT.balanceSheet.current.taxationSocialSecurity);
  });

  test("the micro-entity headings outside the totals are read from the document, in both years", () => {
    const input = microInputFromTestServiceCase(MICRO_CASE);
    const withHeadings = (year) => ({
      ...year,
      calledUpShareCapitalNotPaid: 50,
      prepaymentsAccruedIncome: 200,
      provisionsForLiabilities: 100,
      accrualsDeferredIncome: 150,
    });
    const filed = buildMicroEntityAccounts({
      ...input,
      balanceSheet: { current: withHeadings(input.balanceSheet.current), prior: withHeadings(input.balanceSheet.prior) },
    });
    const headings = {
      calledUpShareCapitalNotPaid: 50,
      prepaymentsAccruedIncome: 200,
      provisionsForLiabilities: 100,
      accrualsDeferredIncome: 150,
    };
    const lines = balanceSheetLinesOf(filed);
    expect(lines.current).toEqual({ ...headings, creditorsAfterOneYear: 0 });
    expect(lines.prior).toEqual({ ...headings, creditorsAfterOneYear: 0 });
    expect(lines.unreadable).toBe(false);
  });
});

describe("the next step of a refusal", () => {
  test("leads back to the receipts in the page's own language", () => {
    const { href } = refusalNextStep("receipts", "2026-10-24T10:15:00.000Z-00001A.json");
    const from = (page) => new URL(href, `https://submit.diyaccounting.co.uk${page}`).pathname;
    expect(from("/companies-house/fileMicroEntityAccounts.html")).toBe("/hmrc/receipt/receipts.html");
    expect(from("/cy/companies-house/fileSmallCompanyAccounts.html")).toBe("/cy/hmrc/receipt/receipts.html");
  });
});
