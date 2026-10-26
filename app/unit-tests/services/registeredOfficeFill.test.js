// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/services/registeredOfficeFill.test.js
import { describe, test, expect, vi, beforeEach } from "vitest";

const mockGetCompanyProfile = vi.fn();
vi.mock("@app/functions/companies-house/companiesHouseCompanyGet.js", () => ({
  getCompanyProfile: (...args) => mockGetCompanyProfile(...args),
}));

import { fillRegisteredOffice } from "@app/services/registeredOfficeFill.js";

describe("services/registeredOfficeFill", () => {
  beforeEach(() => vi.clearAllMocks());

  test("leaves a registered office the request carries alone", async () => {
    const accounts = { companyNumber: "04549236", registeredOffice: "1 High Street" };
    const errors = [];
    await fillRegisteredOffice(accounts, errors);
    expect(accounts.registeredOffice).toBe("1 High Street");
    expect(errors).toEqual([]);
    expect(mockGetCompanyProfile).not.toHaveBeenCalled();
  });

  test("takes the office from the company profile when the request has none", async () => {
    mockGetCompanyProfile.mockResolvedValue({ profile: { registeredOffice: "9 Register Road, Cardiff" } });
    const accounts = { companyNumber: "04549236", registeredOffice: "" };
    const errors = [];
    await fillRegisteredOffice(accounts, errors);
    expect(mockGetCompanyProfile).toHaveBeenCalledWith("04549236");
    expect(accounts.registeredOffice).toBe("9 Register Road, Cardiff");
    expect(errors).toEqual([]);
  });

  test("reports Missing registeredOffice when the profile holds none or the lookup fails", async () => {
    for (const lookup of [() => Promise.resolve({ profile: null }), () => Promise.reject(new Error("down"))]) {
      mockGetCompanyProfile.mockImplementation(lookup);
      const errors = [];
      await fillRegisteredOffice({ companyNumber: "04549236", registeredOffice: "" }, errors);
      expect(errors[0]).toContain("Missing registeredOffice");
    }
  });
});
