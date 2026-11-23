// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/http-simulator/fixtures/register.test.js

import { describe, test, expect } from "vitest";
import {
  registerCompanies,
  registerDates,
  confirmationStatementDates,
  REGISTER_COMPANY_NUMBERS,
  NOT_HELD_COMPANY_NUMBER,
  TEST_EMAIL_DOMAIN,
} from "@app/http-simulator/fixtures/register.js";

const TEST_LOOKING = [
  /EXAMPLE/i,
  /SIMULATOR/i,
  /DIRECTORCO/i,
  /MISSED YEAR/i,
  /DIY ACCOUNTING/i,
  /\b06846849\b/,
  /\b(Example|Test|Simulator|Validation|While) (Street|Road)\b/i,
  /@example\.(com|org|net)\b/i,
  /\.example\b/i,
  /\b209\d-\d\d-\d\d\b/,
  /\b(99999999|09999999|12345678|11111111|87654321|01234567|00000000|42942942|SC000000|NI000000|SC765432)\b/,
];

describe("simulator register", () => {
  const companies = registerCompanies(new Date("2026-11-22T12:00:00Z"));

  test("holds none of the values that read as test data", () => {
    const text = JSON.stringify(companies);
    for (const pattern of TEST_LOOKING) expect(text, String(pattern)).not.toMatch(pattern);
    for (const company of companies) expect(company.name).not.toMatch(/\bTEST\b/i);
  });

  test("uses only numbers Companies House does not issue, and not the number it holds nothing for", () => {
    expect(REGISTER_COMPANY_NUMBERS).toEqual([
      "00000001",
      "00000002",
      "00000003",
      "00000004",
      "00000005",
      "00000006",
      "00000007",
      "00000008",
      "00000009",
      "00000010",
      "SC000001",
      "NI000001",
    ]);
    expect(REGISTER_COMPANY_NUMBERS).not.toContain(NOT_HELD_COMPANY_NUMBER);
  });

  test("gives every email address at the test domain and every postcode a valid form", () => {
    for (const company of companies) {
      expect(company.email ?? `x@${TEST_EMAIL_DOMAIN}`, company.number).toMatch(new RegExp(`@${TEST_EMAIL_DOMAIN.replace(/\./g, "\\.")}$`));
      expect(company.address.postalCode, company.number).toMatch(/^[A-Z]{1,2}\d[A-Z\d]? \d[A-Z]{2}$/);
      for (const person of [...company.officers, ...company.pscs.filter((psc) => psc.email)]) {
        expect(person.email, company.number).toMatch(new RegExp(`@${TEST_EMAIL_DOMAIN.replace(/\./g, "\\.")}$`));
      }
    }
  });

  test("computes the accounting dates from the day, with a 31 March year end and accounts due nine months later", () => {
    expect(registerDates(new Date("2026-11-22T12:00:00Z"))).toEqual(
      expect.objectContaining({
        next: { start: "2025-04-01", end: "2026-03-31", due: "2026-12-31" },
        filed: expect.objectContaining({ start: "2024-04-01", end: "2025-03-31", due: "2025-12-31" }),
      }),
    );
    expect(registerDates(new Date("2026-05-01T12:00:00Z")).next.end).toBe("2025-03-31");
    expect(registerDates(new Date("2026-07-01T12:00:00Z")).next.end).toBe("2026-03-31");
  });

  test("makes a confirmation statement up to the next anniversary of incorporation, or to the last one when it is due now", () => {
    const today = new Date("2026-11-22T12:00:00Z");
    expect(confirmationStatementDates("2009-04-16", "next", today)).toEqual({
      madeUpTo: "2027-04-16",
      due: "2027-04-30",
      lastMadeUpTo: "2026-04-16",
    });
    expect(confirmationStatementDates("2011-09-21", "due", today)).toEqual({
      madeUpTo: "2026-09-21",
      due: "2026-10-05",
      lastMadeUpTo: "2025-09-21",
    });
  });

  test("every company's share classes state the rights attached to them, not only the class's name", () => {
    for (const company of registerCompanies()) {
      for (const share of company.capital?.shares ?? []) {
        expect(share.prescribedParticulars, company.number).toMatch(/vote/i);
      }
    }
  });
});
