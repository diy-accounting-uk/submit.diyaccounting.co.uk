// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/accountsRevision.test.js

import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { refusalOf, documentLanguageOf, accountantsReportOf, checkRevision } from "../public/lib/accounts-revision.js";
import { buildMicroEntityAccounts } from "../../app/services/microEntityAccountsIxbrl.js";
import { inAccountsLanguage } from "../../app/services/accountsLanguage.js";
import { microInputFromTestServiceCase, SMALL_COMPANY_CASE_INPUT } from "../../app/test-helpers/accountsDocumentCases.js";
import { buildSmallCompanyAccounts } from "../../app/services/smallCompanyAccountsIxbrl.js";

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
