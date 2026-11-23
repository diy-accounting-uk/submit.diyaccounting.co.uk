// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/video/values.test.js

import { describe, test, expect } from "vitest";
import { substituteValues, REGISTER_FIELDS } from "../../../scripts/lib/video/values.js";
import { registerCompany } from "../../../app/http-simulator/fixtures/register.js";

const now = new Date("2026-09-04T10:00:00Z");

describe("substituteValues", () => {
  test("leaves text with no placeholder alone", () => {
    expect(substituteValues("Retrieve Obligations", {}, now)).toBe("Retrieve Obligations");
  });

  test("resolves a named value", () => {
    expect(substituteValues("{{hmrcVatNumber}}", { hmrcVatNumber: "193054661" }, now)).toBe("193054661");
  });

  test("resolves several placeholders in one string", () => {
    expect(substituteValues("{{today}} for {{hmrcVatNumber}}", { hmrcVatNumber: "193054661" }, now)).toBe("2026-09-04 for 193054661");
  });

  test("resolves the minted user's National Insurance number", () => {
    expect(substituteValues("{{hmrcNino}}", { hmrcNino: "AB123456C" }, now)).toBe("AB123456C");
  });

  test("throws when the script asked for no income-tax service, so hmrcNino was never resolved", () => {
    expect(() => substituteValues("{{hmrcNino}}", { hmrcVatNumber: "193054661" }, now)).toThrow(/no value for this run/);
  });

  test("resolves the run's date from the clock it is given", () => {
    expect(substituteValues("{{today}}", {}, now)).toBe("2026-09-04");
    expect(substituteValues("{{daysAgo:10}}", {}, now)).toBe("2026-08-25");
    expect(substituteValues("{{monthsAgo:11}}", {}, now)).toBe("2025-10-04");
    expect(substituteValues("{{yearsAgo:2}}", {}, now)).toBe("2024-09-04");
  });

  test("clamps a month shift onto a day the target month has", () => {
    expect(substituteValues("{{monthsAgo:1}}", {}, new Date("2026-03-31T10:00:00Z"))).toBe("2026-02-28");
  });

  test("an eleven month window stays inside the API's 366 day limit", () => {
    const from = Date.parse(substituteValues("{{monthsAgo:11}}", {}, now));
    const to = Date.parse(substituteValues("{{today}}", {}, now));
    expect((to - from) / 86400000).toBeLessThan(366);
  });

  test("throws when a placeholder has no value for the run", () => {
    expect(() => substituteValues("{{hmrcVatNumber}}", {}, now)).toThrow(/no value for this run/);
  });

  test("throws on an unknown placeholder rather than typing it into the page", () => {
    expect(() => substituteValues("{{madeUp}}", {}, now)).toThrow(/madeUp/);
  });
});

describe("register placeholders", () => {
  test("types a register company's next accounts period, read on the run's day", () => {
    expect(substituteValues("{{register:00000001:periodStart}} to {{register:00000001:periodEnd}}", {}, now)).toBe(
      "2025-04-01 to 2026-03-31",
    );
    const later = new Date("2027-07-15T10:00:00Z");
    expect(substituteValues("{{register:00000001:periodStart}} to {{register:00000001:periodEnd}}", {}, later)).toBe(
      "2026-04-01 to 2027-03-31",
    );
  });

  test("types the confirmation statement date of the company whose statement is due now", () => {
    const company = registerCompany("00000004", now);
    expect(substituteValues("{{register:00000004:confirmationStatementMadeUpTo}}", {}, now)).toBe(
      company.confirmationStatementDates.madeUpTo,
    );
    expect(substituteValues("{{register:00000004:confirmationStatementDue}}", {}, now)).toBe(company.confirmationStatementDates.due);
    expect(company.confirmationStatementDates.madeUpTo <= "2026-09-04").toBe(true);
  });

  test("types a register company's name and first director", () => {
    expect(substituteValues("{{register:00000003:director}} of {{register:00000003:name}}", {}, now)).toBe(
      "Sam Patel of MARSH LANE BAKERY LIMITED",
    );
  });

  test("gives every field a value for the register's first company", () => {
    for (const field of Object.keys(REGISTER_FIELDS)) {
      expect(substituteValues(`{{register:00000001:${field}}}`, {}, now), field).not.toBe("");
    }
  });

  test("moves a date field by a number of months, and refuses to move a field that is not a date", () => {
    expect(substituteValues("{{register:00000001:periodStart:-3}}", {}, now)).toBe("2025-01-01");
    expect(substituteValues("{{register:00000001:periodEnd:+6}}", {}, now)).toBe("2026-09-30");
    expect(() => substituteValues("{{register:00000001:name:-3}}", {}, now)).toThrow(/not a date/);
  });

  test("resolves a register placeholder beside a clock placeholder", () => {
    expect(substituteValues("{{register:00000001:periodEnd}} approved {{daysAgo:7}}", {}, now)).toBe("2026-03-31 approved 2026-08-28");
  });

  test("throws for a company the register does not hold, an unknown field, and a company with no director", () => {
    expect(() => substituteValues("{{register:00000011:periodEnd}}", {}, now)).toThrow(/does not hold/);
    expect(() => substituteValues("{{register:00000001:turnover}}", {}, now)).toThrow(/names no register field/);
    expect(() => substituteValues("{{register:00000002:director}}", {}, now)).toThrow(/has no value for this company/);
  });
});
