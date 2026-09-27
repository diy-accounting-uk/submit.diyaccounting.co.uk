// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/services/companiesHouseApi.test.js

import { describe, test, expect } from "vitest";
import { isValidCompaniesHousePersonalCode } from "@app/services/companiesHouseApi.js";

describe("isValidCompaniesHousePersonalCode", () => {
  test("accepts the confirmed Companies House XML Gateway test-service code", () => {
    const { valid, normalised } = isValidCompaniesHousePersonalCode("CWMPS832223");
    expect(valid).toBe(true);
    expect(normalised).toBe("CWMPS832223");
  });

  test("accepts six letters followed by five digits", () => {
    expect(isValidCompaniesHousePersonalCode("ABCDEF12345").valid).toBe(true);
  });

  test("accepts lowercase input, normalising it to uppercase", () => {
    const { valid, normalised } = isValidCompaniesHousePersonalCode("cwmps832223");
    expect(valid).toBe(true);
    expect(normalised).toBe("CWMPS832223");
  });

  test("accepts the display grouping with hyphens, stripping them before validating", () => {
    const { valid, normalised } = isValidCompaniesHousePersonalCode("CWM-PS8-32223");
    expect(valid).toBe(true);
    expect(normalised).toBe("CWMPS832223");
  });

  test("rejects letters and digits interleaved - the shape behind GovTalk error 9999", () => {
    expect(isValidCompaniesHousePersonalCode("AB1234CD56E").valid).toBe(false);
  });

  test("rejects an all-digit string", () => {
    expect(isValidCompaniesHousePersonalCode("12345678901").valid).toBe(false);
  });

  test("rejects an all-letter string", () => {
    expect(isValidCompaniesHousePersonalCode("ABCDEFGHIJK").valid).toBe(false);
  });

  test("rejects fewer than 5 leading letters", () => {
    expect(isValidCompaniesHousePersonalCode("AB123456789").valid).toBe(false);
  });

  test("rejects a code shorter than 11 characters", () => {
    expect(isValidCompaniesHousePersonalCode("CWMPS83222").valid).toBe(false);
  });

  test("rejects a code longer than 11 characters", () => {
    expect(isValidCompaniesHousePersonalCode("CWMPS8322234").valid).toBe(false);
  });

  test("rejects undefined and null", () => {
    expect(isValidCompaniesHousePersonalCode(undefined).valid).toBe(false);
    expect(isValidCompaniesHousePersonalCode(null).valid).toBe(false);
  });

  test("rejects an empty string", () => {
    expect(isValidCompaniesHousePersonalCode("").valid).toBe(false);
  });
});
