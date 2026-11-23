// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/firstAccounts.test.js

import { describe, test, expect } from "vitest";
import {
  applyComparativesRule,
  companyFromProfile,
  comparativesFinding,
  dateOfIncorporationFor,
  endsWithinFirstFinancialYear,
  firstAccountsLine,
  isFirstAccountsPeriod,
  marksFirstAccounts,
} from "../public/lib/first-accounts.js";

describe("when small company accounts may leave out the prior year", () => {
  test("a period that starts on the day of incorporation, with no accounts on the register, is the first", () => {
    expect(isFirstAccountsPeriod({ dateOfCreation: "2025-04-01" }, "2025-04-01")).toBe(true);
  });

  test("the revision of first accounts is still the first: the register's last accounts are these", () => {
    expect(isFirstAccountsPeriod({ dateOfCreation: "2025-04-01", accountsLastPeriodStart: "2025-04-01" }, "2025-04-01")).toBe(true);
  });

  test("a period after accounts on the register, or not starting on the day of incorporation, is not the first", () => {
    expect(isFirstAccountsPeriod({ dateOfCreation: "2024-04-01", accountsLastPeriodStart: "2024-04-01" }, "2025-04-01")).toBe(false);
    expect(isFirstAccountsPeriod({ dateOfCreation: "2025-03-15" }, "2025-04-01")).toBe(false);
    expect(isFirstAccountsPeriod({}, "2025-04-01")).toBe(false);
    expect(isFirstAccountsPeriod({ dateOfCreation: "2025-04-01" }, "")).toBe(false);
  });

  test("accounts that are not the first need the prior year, and first accounts start on incorporation and have none", () => {
    expect(comparativesFinding({ periodStart: "2025-04-01", hasPriorYear: true })).toBeNull();
    expect(comparativesFinding({ periodStart: "2025-04-01", hasPriorYear: false })).toBe("prior-year-required");
    expect(comparativesFinding({ periodStart: "2025-04-01", dateOfIncorporation: "2025-04-01", hasPriorYear: false })).toBeNull();
    expect(comparativesFinding({ periodStart: "2025-04-01", dateOfIncorporation: "2025-03-01", hasPriorYear: false })).toBe(
      "first-accounts-start-on-incorporation",
    );
    expect(comparativesFinding({ periodStart: "2025-04-01", dateOfIncorporation: "2025-04-01", hasPriorYear: true })).toBe(
      "first-accounts-have-no-prior-year",
    );
  });

  test("a filed document marks first accounts by a date of incorporation that reads as the period's start date", () => {
    const start =
      '<ix:nonNumeric name="bus:StartDateForPeriodCoveredByReport" contextRef="p2026" format="ixt2:datedaymonthyearen">1 July 2025</ix:nonNumeric>';
    const incorporated = (date) =>
      `<ix:nonNumeric name="bus:DateFormationOrIncorporation" contextRef="p2026" format="ixt2:datedaymonthyearen">${date}</ix:nonNumeric>`;
    expect(marksFirstAccounts(`${start}${incorporated("1 July 2025")}`)).toBe(true);
    expect(marksFirstAccounts(`${start}${incorporated("1 June 2025")}`)).toBe(false);
    expect(marksFirstAccounts(start)).toBe(false);
  });

  test("a register whose last accounts give their end and no start still shows accounts filed before the period", () => {
    expect(isFirstAccountsPeriod({ dateOfCreation: "2025-04-01", accountsLastPeriodEnd: "2025-03-31" }, "2025-04-01")).toBe(false);
  });

  test("a revision of first accounts stays first after the register holds a later year", () => {
    const profile = { dateOfCreation: "2025-04-01", accountsLastPeriodStart: "2026-04-01", accountsLastPeriodEnd: "2027-03-31" };
    expect(isFirstAccountsPeriod(profile, "2025-04-01")).toBe(true);
  });

  test("first accounts end within 18 months of incorporation and the seven days a financial year may run past its reference date", () => {
    expect(endsWithinFirstFinancialYear("2025-01-01", "2025-12-31")).toBe(true);
    expect(endsWithinFirstFinancialYear("2025-01-01", "2026-06-30")).toBe(true);
    expect(endsWithinFirstFinancialYear("2025-01-01", "2026-07-07")).toBe(true);
    expect(endsWithinFirstFinancialYear("2025-01-01", "2026-07-08")).toBe(false);
    expect(endsWithinFirstFinancialYear("2019-06-01", "2025-12-31")).toBe(false);
  });

  test("the company a form holds keeps the profile facts that say whether a period is its first", () => {
    const profile = {
      companyNumber: "00000001",
      companyName: "HARBOUR LANE JOINERY LIMITED",
      dateOfCreation: "2019-04-01",
      accountsLastPeriodEnd: "2025-03-31",
      registeredOffice: { postalCode: "AB1 2CD" },
    };
    expect(companyFromProfile(profile)).toEqual({
      companyNumber: "00000001",
      companyName: "HARBOUR LANE JOINERY LIMITED",
      dateOfCreation: "2019-04-01",
      accountsLastPeriodEnd: "2025-03-31",
    });
  });

  test("first accounts send the date of incorporation, and other accounts and an unknown company send none", () => {
    expect(dateOfIncorporationFor({ dateOfCreation: "2025-04-01" }, "2025-04-01")).toBe("2025-04-01");
    expect(dateOfIncorporationFor({ dateOfCreation: "2019-04-01", accountsLastPeriodStart: "2024-04-01" }, "2025-04-01")).toBeUndefined();
    expect(dateOfIncorporationFor({ dateOfCreation: "2025-04-01" }, "2025-05-01")).toBeUndefined();
    expect(dateOfIncorporationFor(null, "2025-04-01")).toBeUndefined();
  });

  test("the first accounts line gives the date of incorporation in words", () => {
    expect(firstAccountsLine("2025-04-01")).toBe(
      "These are the company's first accounts: the period starts on the day it was incorporated, 1 April 2025, so there is no prior year.",
    );
  });

  test("the prior-year box is ticked and locked unless the period is the company's first, and the line says which", () => {
    const established = { box: { checked: false, disabled: false }, line: { textContent: "" } };
    expect(
      applyComparativesRule({
        ...established,
        company: { dateOfCreation: "2019-04-01", accountsLastPeriodStart: "2024-04-01" },
        periodStart: "2025-04-01",
      }),
    ).toBe(false);
    expect(established.box).toEqual({ checked: true, disabled: true });
    expect(established.line.textContent).toMatch(/^These are not the company's first accounts, so they show the prior year's figures/);

    const first = { box: { checked: true, disabled: false }, line: { textContent: "" } };
    expect(applyComparativesRule({ ...first, company: { dateOfCreation: "2025-04-01" }, periodStart: "2025-04-01" })).toBe(true);
    expect(first.box).toEqual({ checked: false, disabled: true });
    expect(first.line.textContent).toBe(firstAccountsLine("2025-04-01"));
  });
});
