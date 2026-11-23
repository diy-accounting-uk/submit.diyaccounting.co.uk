// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/accountsNotesCheck.test.js

import { describe, test, expect } from "vitest";
import {
  MAX_DIRECTORS_ADVANCES,
  MAX_ADVANCE_NAME_LENGTH,
  MAX_ADVANCE_TERMS_LENGTH,
  directorsAdvancesFindings,
  directorsAdvancesMissing,
  shareCapitalFindings,
  noteFindingSentence,
} from "../public/lib/accounts-notes-check.js";
import { readDirectorsAdvances } from "../../app/services/accountsIxbrlCommon.js";

const ROW = { name: "Alex Jones", terms: "Interest free", balanceAtStart: 300, advanced: 400, repaid: 200, balanceAtEnd: 500 };
const rules = (findings) => findings.map(({ rule }) => rule);

describe("the rules of the advances to directors note", () => {
  test("take at most one row for each director the taxonomy can name, and names and terms within the Companies House lengths", () => {
    expect([MAX_DIRECTORS_ADVANCES, MAX_ADVANCE_NAME_LENGTH, MAX_ADVANCE_TERMS_LENGTH]).toEqual([40, 160, 4000]);
    const rows = Array.from({ length: 41 }, (_, index) => ({ ...ROW, name: `Director ${index + 1}` }));
    expect(rules(directorsAdvancesFindings(rows))).toEqual(["too-many-rows"]);
    expect(rules(directorsAdvancesFindings(rows.slice(0, 40)))).toEqual([]);
    expect(rules(directorsAdvancesFindings([{ ...ROW, name: "N".repeat(161) }]))).toEqual(["name-too-long"]);
    expect(rules(directorsAdvancesFindings([{ ...ROW, terms: "T".repeat(4001) }]))).toEqual(["terms-too-long"]);
    expect(rules(directorsAdvancesFindings([{ ...ROW, name: "N".repeat(160), terms: "T".repeat(4000) }]))).toEqual([]);
  });

  test("find an advance that does not add up, a second row for one director, a stranger, and closing balances off the balance sheet", () => {
    expect(directorsAdvancesFindings([{ ...ROW, balanceAtEnd: 600 }])).toEqual([
      { rule: "arithmetic", index: 0, name: "Alex Jones", expected: 500 },
    ]);
    expect(rules(directorsAdvancesFindings([ROW, ROW]))).toEqual(["same-director"]);
    expect(rules(directorsAdvancesFindings([ROW], { directorNames: ["Alan James Morgan"] }))).toEqual(["not-a-director"]);
    expect(directorsAdvancesFindings([ROW], { amountsOwedByDirectors: 800 })).toEqual([{ rule: "sum", total: 500, owed: 800 }]);
    expect(directorsAdvancesFindings([], { amountsOwedByDirectors: 800 })).toEqual([{ rule: "sum", total: 0, owed: 800 }]);
    expect(directorsAdvancesFindings([], { amountsOwedByDirectors: 0 })).toEqual([]);
    expect(directorsAdvancesFindings([ROW], { directorNames: ["Alex Jones"], amountsOwedByDirectors: 500 })).toEqual([]);
  });

  test("are the rules the accounts route applies, in the route's own messages", () => {
    const errors = [];
    readDirectorsAdvances([{ ...ROW, terms: "T".repeat(4001) }, ROW], "smallCompany.directorsAdvances", errors, {
      directorNames: ["Alex Jones"],
      amountsOwedByDirectors: 900,
    });
    expect(errors).toEqual([
      "smallCompany.directorsAdvances[0].terms must be at most 4000 characters",
      "smallCompany.directorsAdvances[1].name names Alex Jones again: give each director one row, with the amounts of all their advances added together",
      "smallCompany.directorsAdvances balanceAtEnd (1000) must equal balanceSheet.currentYear.amountsOwedByDirectors",
    ]);
  });

  test("each have the page's own sentence", () => {
    expect(noteFindingSentence({ rule: "arithmetic", name: "Alex Jones", expected: 500 })).toBe(
      "The advance to Alex Jones does not add up: owed at the start, plus advanced, less repaid is £500, so owed at the end is £500.",
    );
    expect(noteFindingSentence({ rule: "sum", total: 500, owed: 800 })).toBe(
      "The amounts owed at the end of the advances add up to £500, but the balance sheet shows £800 owed by directors.",
    );
    expect(noteFindingSentence({ rule: "too-many-rows", total: 41 })).toBe(
      "The note on advances holds at most 40 rows, one for each director.",
    );
  });
});

describe("the rules of the share capital note", () => {
  test("find a class it does not know, a nominal value that is not a positive amount, and one that does not divide the capital", () => {
    expect(shareCapitalFindings({ shareClass: "ordinaryShares", nominalValue: 1 }, 100)).toEqual([]);
    expect(rules(shareCapitalFindings({ shareClass: "founderShares", nominalValue: 0 }, 100))).toEqual(["share-class", "nominal-value"]);
    expect(rules(shareCapitalFindings({ shareClass: "ordinaryShares", nominalValue: 0.3 }, 100))).toEqual(["whole-shares"]);
    expect(noteFindingSentence({ rule: "whole-shares" }, { calledUpShareCapital: 100 })).toBe(
      "The nominal value of each share must divide the called up share capital of £100 into whole shares.",
    );
  });

  test("an advance on micro-entity accounts names the director who signs them", () => {
    const row = { name: "Sam Lender", terms: "Interest free", balanceAtStart: 0, advanced: 0, repaid: 0, balanceAtEnd: 0 };
    const findings = directorsAdvancesFindings([row], { signerName: "Jo Director" });
    expect(findings).toEqual([{ rule: "not-the-signer", index: 0, name: "Sam Lender", signer: "Jo Director" }]);
    expect(noteFindingSentence(findings[0])).toBe(
      "Sam Lender is named for an advance, but on micro-entity accounts an advance names the director who signs the accounts, Jo Director. Correct the name.",
    );
    expect(directorsAdvancesFindings([{ ...row, name: "Jo Director" }], { signerName: "Jo Director" })).toEqual([]);
  });
});

describe("the note on advances when the balance sheet shows amounts owed by directors", () => {
  test("is missing when a year shows an amount owed and the note gives no row", () => {
    expect(directorsAdvancesMissing(undefined, [100])).toBe(true);
    expect(directorsAdvancesMissing([], [0, 100])).toBe(true);
    expect(noteFindingSentence({ rule: "advances-required" })).toBe(
      "The balance sheet shows amounts owed by directors. Give each director who owes the company money a row in the note on advances.",
    );
  });

  test("is not missing when nothing is owed or a row is given", () => {
    expect(directorsAdvancesMissing(undefined, [0, undefined])).toBe(false);
    expect(directorsAdvancesMissing([{ name: "Alex Jones" }], [100])).toBe(false);
  });
});
