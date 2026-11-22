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
  NOTE_POLICY_FACTS,
  NOTE_CONTROLLING_PARTY_FACTS,
  NOTE_ADVANCE_FACTS,
  NOTE_INTANGIBLE_FACTS,
  NOTE_DEBTOR_FACTS,
  NOTE_SHARE_CAPITAL_FACT,
} from "../public/lib/accounts-revision.js";
import { buildMicroEntityAccounts } from "../../app/services/microEntityAccountsIxbrl.js";
import { inAccountsLanguage } from "../../app/services/accountsLanguage.js";
import {
  microInputFromTestServiceCase,
  SMALL_COMPANY_CASE_INPUT,
  SMALL_COMPANY_NOTES_CASE_INPUT,
} from "../../app/test-helpers/accountsDocumentCases.js";
import { buildSmallCompanyAccounts, SMALL_COMPANY_POLICY_FIELDS } from "../../app/services/smallCompanyAccountsIxbrl.js";
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
    companyNumber: "06846849",
    filedDocument: "<html/>",
    ...overrides,
  };
}

describe("which accounts receipts can be revised", () => {
  test("accepted accounts filed on their own with their document can be revised", () => {
    expect(refusalOf(accountsReceipt())).toBeNull();
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
    expect(NOTE_SHARE_CAPITAL_FACT).toBe(qname("numberSharesIssuedFullyPaid"));
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
          prior: { tradeDebtors: 0, amountsOwedByDirectors: 0 },
        });
        expect(notes.directorsAdvances).toEqual(SMALL_COMPANY_NOTES_CASE_INPUT.directorsAdvances);
        expect(notes.intangibleAssetNote).toEqual(SMALL_COMPANY_NOTES_CASE_INPUT.intangibleAssetNote);
        expect(notes.shareCapital).toBe(true);
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
    expect(notes.shareCapital).toBe(false);
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
