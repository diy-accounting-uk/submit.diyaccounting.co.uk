// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/lib/companiesHouseGatewayErrors.test.js
import { describe, test, expect } from "vitest";
import { hasInvalidCompanyAuthenticationCodeError } from "@app/lib/companiesHouseGatewayErrors.js";

describe("hasInvalidCompanyAuthenticationCodeError", () => {
  test("is true for the gateway's invalid authentication code text", () => {
    expect(hasInvalidCompanyAuthenticationCodeError([{ number: 9999, text: "Invalid CompanyAuthenticationCode" }])).toBe(true);
  });

  test("is false for other errors, including others numbered 9999", () => {
    expect(hasInvalidCompanyAuthenticationCodeError([{ number: 9999, text: "No presenter ID supplied" }])).toBe(false);
  });

  test("is false for no errors", () => {
    expect(hasInvalidCompanyAuthenticationCodeError(undefined)).toBe(false);
    expect(hasInvalidCompanyAuthenticationCodeError([])).toBe(false);
  });
});
