// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/presenter-poll-schedule.test.js

import { describe, test, expect } from "vitest";
import { scheduledChecks } from "../public/lib/presenter-poll-schedule.js";
import { companiesHouseStatusPath } from "../public/lib/companies-house-forms.js";

const at = (iso) => scheduledChecks(new Date(iso));

describe("presenter-poll-schedule", () => {
  test("inside office hours the checks are the quarter hours either side", () => {
    const { last, next } = at("2026-11-25T10:07:00.000Z");
    expect(last.toISOString()).toBe("2026-11-25T10:00:00.000Z");
    expect(next.toISOString()).toBe("2026-11-25T10:15:00.000Z");
  });

  test("a moment on a quarter hour is its own last check", () => {
    const { last, next } = at("2026-11-25T10:15:00.000Z");
    expect(last.toISOString()).toBe("2026-11-25T10:15:00.000Z");
    expect(next.toISOString()).toBe("2026-11-25T10:30:00.000Z");
  });

  test("after 18:45 UTC the next check is 07:00 the next weekday", () => {
    const { last, next } = at("2026-11-25T20:00:00.000Z");
    expect(last.toISOString()).toBe("2026-11-25T18:45:00.000Z");
    expect(next.toISOString()).toBe("2026-11-26T07:00:00.000Z");
  });

  test("over a weekend the last check is Friday's last and the next is Monday's first", () => {
    const { last, next } = at("2026-11-28T12:00:00.000Z");
    expect(last.toISOString()).toBe("2026-11-27T18:45:00.000Z");
    expect(next.toISOString()).toBe("2026-11-30T07:00:00.000Z");
  });
});

describe("companiesHouseStatusPath", () => {
  test("accounts, the confirmation statement and the PSC verification statement ask on their own routes", () => {
    expect(companiesHouseStatusPath("accounts", "00001A")).toBe("/api/v1/companies-house/accounts/00001A");
    expect(companiesHouseStatusPath("confirmation-statement", "00001B")).toBe("/api/v1/companies-house/confirmation-statement/00001B");
    expect(companiesHouseStatusPath("psc-verification-statement", "00001C")).toBe(
      "/api/v1/companies-house/psc-verification-statement/00001C",
    );
  });

  test("a form on the shared poll asks on the forms route", () => {
    expect(companiesHouseStatusPath("psc-cessation", "00001D")).toBe("/api/v1/companies-house/forms/psc-cessation/00001D");
  });
});
