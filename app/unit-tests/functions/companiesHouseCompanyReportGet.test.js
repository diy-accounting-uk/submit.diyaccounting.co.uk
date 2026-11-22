// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/companiesHouseCompanyReportGet.test.js

import { describe, test, expect, vi, beforeEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const mockEnforceBundles = vi.fn();
vi.mock("@app/services/bundleManagement.js", async (importOriginal) => ({
  ...(await importOriginal()),
  enforceBundles: (...args) => mockEnforceBundles(...args),
}));

const mockLookupRefusalSeconds = vi.fn();
vi.mock("@app/services/companiesHouseLookupLimit.js", async (importOriginal) => ({
  ...(await importOriginal()),
  lookupRefusalSeconds: (...args) => mockLookupRefusalSeconds(...args),
}));

vi.mock("@app/services/subHasher.js", async (importOriginal) => ({ ...(await importOriginal()), initializeSalt: async () => {} }));

const { ingestHandler, REPORT_MODULES, REPORT_NAMES } = await import("@app/functions/companies-house/companiesHouseCompanyReportGet.js");
const { BundleEntitlementError } = await import("@app/services/bundleManagement.js");

function reportEvent(companyNumber, report) {
  return {
    requestContext: { http: { method: "GET", path: `/api/v1/companies-house/company/${companyNumber}/reports/${report}` } },
    pathParameters: { companyNumber, report },
    headers: { host: "localhost" },
  };
}

const bodyOf = (response) => JSON.parse(response.body);

describe("functions/companiesHouseCompanyReportGet", () => {
  beforeEach(() => {
    process.env.COMPANIES_HOUSE_BASE_URI = "https://api.company-information.service.gov.uk";
    mockEnforceBundles.mockReset().mockResolvedValue({ userSub: "user-1" });
    mockLookupRefusalSeconds.mockReset().mockResolvedValue(0);
    for (const name of Object.keys(REPORT_MODULES)) delete REPORT_MODULES[name];
  });

  test("names the six reports and registers no report module of its own", () => {
    expect(REPORT_NAMES).toEqual(["filings", "people", "capital", "charges", "history", "accounts"]);
    expect(REPORT_MODULES).toEqual({});
  });

  test("answers a JSON 403 for an account without the company reports activity", async () => {
    mockEnforceBundles.mockRejectedValue(new BundleEntitlementError("Forbidden", { code: "BUNDLE_FORBIDDEN" }));

    const response = await ingestHandler(reportEvent("00000001", "filings"));

    expect(response.statusCode).toBe(403);
    expect(() => bodyOf(response)).not.toThrow();
    expect(mockLookupRefusalSeconds).not.toHaveBeenCalled();
  });

  test("answers a JSON 400 for a value that is not a company number", async () => {
    REPORT_MODULES.filings = vi.fn();

    const response = await ingestHandler(reportEvent("not-a-number", "filings"));

    expect(response.statusCode).toBe(400);
    expect(JSON.stringify(bodyOf(response))).toContain("Invalid company number");
    expect(REPORT_MODULES.filings).not.toHaveBeenCalled();
  });

  test.each(["unknown", "filings", "toString", "constructor", "__proto__"])(
    "answers a JSON 404 for the report %s, which has no module",
    async (report) => {
      const response = await ingestHandler(reportEvent("00000001", report));

      expect(response.statusCode).toBe(404);
      expect(bodyOf(response)).toMatchObject({ message: `No company report named ${report}` });
      expect(mockLookupRefusalSeconds).not.toHaveBeenCalled();
    },
  );

  test("answers the report a module builds, with the company number and the report's name", async () => {
    REPORT_MODULES.filings = vi.fn(async () => ({ rows: [{ type: "AA" }], readAt: "2026-11-22T14:05:00.000Z" }));

    const response = await ingestHandler(reportEvent("sc000001", "filings"));

    expect(response.statusCode).toBe(200);
    expect(bodyOf(response)).toMatchObject({ companyNumber: "SC000001", report: "filings", rows: [{ type: "AA" }] });
    expect(REPORT_MODULES.filings).toHaveBeenCalledWith("SC000001");
    expect(mockLookupRefusalSeconds).toHaveBeenCalledWith("user-1", 20);
  });

  test("answers a JSON 429 with Retry-After while lookups on the shared key are refused", async () => {
    REPORT_MODULES.people = vi.fn();
    mockLookupRefusalSeconds.mockResolvedValue(42);

    const response = await ingestHandler(reportEvent("00000001", "people"));

    expect(response.statusCode).toBe(429);
    expect(response.headers["Retry-After"]).toBe("42");
    expect(() => bodyOf(response)).not.toThrow();
    expect(REPORT_MODULES.people).not.toHaveBeenCalled();
  });

  test("answers a JSON 500 when a report module fails", async () => {
    REPORT_MODULES.charges = vi.fn(async () => {
      throw new Error("boom");
    });

    const response = await ingestHandler(reportEvent("00000001", "charges"));

    expect(response.statusCode).toBe(500);
    expect(bodyOf(response)).toMatchObject({ message: "The company report could not be built" });
  });
});
