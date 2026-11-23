// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/accountsRevisionRegister.test.js

import { describe, test, expect, afterEach } from "vitest";
import {
  COMPANY_NOT_ON_REGISTER,
  PERIOD_NOT_ON_REGISTER,
  registerRefusalReason,
  registerRefusalText,
  registerRefusalOfError,
} from "../public/lib/accounts-revision-register.js";

describe("revised accounts that name no receipt, against the register", () => {
  afterEach(() => {
    delete globalThis.siteText;
    delete globalThis.siteLanguage;
  });

  test("the register gives no reason to refuse when it holds accounts made up to the period's end", () => {
    expect(registerRefusalReason({ companyFound: true, madeUpDates: ["2025-12-31", "2024-12-31"] }, "2024-12-31")).toBeNull();
  });

  test("accounts made up to another date are not the accounts to replace", () => {
    expect(registerRefusalReason({ companyFound: true, madeUpDates: ["2025-12-30"] }, "2025-12-31")).toBe(PERIOD_NOT_ON_REGISTER);
    expect(registerRefusalReason({ companyFound: true, madeUpDates: [] }, "2025-12-31")).toBe(PERIOD_NOT_ON_REGISTER);
  });

  test("a company the register does not hold has no accounts to revise", () => {
    expect(registerRefusalReason({ companyFound: false, madeUpDates: [] }, "2025-12-31")).toBe(COMPANY_NOT_ON_REGISTER);
  });

  test("each reason has a sentence that names the company number or the period's end", () => {
    const filing = { companyNumber: "00000009", periodEnd: "2025-12-31" };
    expect(registerRefusalText(COMPANY_NOT_ON_REGISTER, filing)).toBe(
      "Companies House holds no company with the number 00000009, so there are no accounts to revise.",
    );
    expect(registerRefusalText(PERIOD_NOT_ON_REGISTER, filing)).toBe(
      "Companies House holds no accounts for this company made up to 31 December 2025, so there are no accounts for revised accounts to replace.",
    );
  });

  test("the period's end is printed as the page prints a date, in the page's language, and a value that is no real day as it came", () => {
    globalThis.siteText = (id, english, values) => values.end;
    expect(registerRefusalText(PERIOD_NOT_ON_REGISTER, { periodEnd: "2026-03-31" })).toBe("31 March 2026");
    expect(registerRefusalText(PERIOD_NOT_ON_REGISTER, { periodEnd: "2026-02-30" })).toBe("2026-02-30");
    expect(registerRefusalText(PERIOD_NOT_ON_REGISTER, { periodEnd: undefined })).toBe("undefined");
    globalThis.siteLanguage = { chrome: () => "cy" };
    expect(registerRefusalText(PERIOD_NOT_ON_REGISTER, { periodEnd: "2026-03-31" })).toBe("31 Mawrth 2026");
    expect(registerRefusalText(PERIOD_NOT_ON_REGISTER, { periodEnd: "2025-12-01" })).toBe("1 Rhagfyr 2025");
  });

  test("a failed accounts request with a register reason is worded in the page's language from what the answer names", () => {
    globalThis.siteText = (id, english, values) => `${id}|${JSON.stringify(values)}`;
    const error = { reason: PERIOD_NOT_ON_REGISTER, body: { companyNumber: "00000001", periodEnd: "2025-12-31" } };
    expect(registerRefusalOfError(error)).toBe('ch.revision.refuse-period-not-on-register|{"end":"31 December 2025"}');
    expect(registerRefusalOfError({ ...error, reason: COMPANY_NOT_ON_REGISTER })).toBe(
      'ch.revision.refuse-company-not-on-register|{"number":"00000001"}',
    );
  });

  test("any other failed request has no register sentence", () => {
    expect(registerRefusalOfError({ reason: "tokens_exhausted", body: {} })).toBeNull();
    expect(registerRefusalOfError(new Error("Request failed with status 500"))).toBeNull();
  });
});
