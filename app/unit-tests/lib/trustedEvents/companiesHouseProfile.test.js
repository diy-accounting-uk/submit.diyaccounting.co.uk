// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@app/lib/cachedSecret.js", () => ({ readSecret: vi.fn(), refreshAfterAuthFailure: vi.fn() }));
vi.mock("@app/lib/httpFetch.js", () => ({ DEFAULT_TIMEOUTS: { SHORT: 1 } }));
vi.mock("@app/services/companiesHouseSend.js", () => ({ sendJsonToCompaniesHouse: vi.fn() }));

import { readSecret, refreshAfterAuthFailure } from "@app/lib/cachedSecret.js";
import { sendJsonToCompaniesHouse } from "@app/services/companiesHouseSend.js";
import { fetchCompanyProfile } from "@app/lib/trustedEvents/companiesHouseProfile.js";

describe("fetchCompanyProfile", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.COMPANIES_HOUSE_BASE_URI = "https://ch.example";
    process.env.COMPANIES_HOUSE_API_KEY_ARN = "prod/key";
    readSecret.mockResolvedValue("key-1");
  });
  afterEach(() => {
    delete process.env.COMPANIES_HOUSE_BASE_URI;
    delete process.env.COMPANIES_HOUSE_API_KEY_ARN;
  });

  test("sends a basic-auth GET and returns the profile", async () => {
    sendJsonToCompaniesHouse.mockResolvedValue({ ok: true, status: 200, data: { company_name: "X" } });
    await expect(fetchCompanyProfile("06846849")).resolves.toEqual({ company_name: "X" });
    const [url, init, , options] = sendJsonToCompaniesHouse.mock.calls[0];
    expect(options).toEqual({ api: "GET /company/{id}" });
    expect(url).toBe("https://ch.example/company/06846849");
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from("key-1:").toString("base64")}`);
  });

  test("retries once with a rolled key after a 401", async () => {
    sendJsonToCompaniesHouse
      .mockResolvedValueOnce({ ok: false, status: 401, data: {} })
      .mockResolvedValueOnce({ ok: true, status: 200, data: { company_name: "X" } });
    refreshAfterAuthFailure.mockResolvedValue("key-2");
    await expect(fetchCompanyProfile("06846849")).resolves.toEqual({ company_name: "X" });
    expect(sendJsonToCompaniesHouse).toHaveBeenCalledTimes(2);
  });

  test("throws when the key did not change after a 401", async () => {
    sendJsonToCompaniesHouse.mockResolvedValue({ ok: false, status: 401, data: {} });
    refreshAfterAuthFailure.mockResolvedValue(null);
    await expect(fetchCompanyProfile("06846849")).rejects.toThrow("Companies House answered 401");
  });

  test("throws on a non-200 answer", async () => {
    sendJsonToCompaniesHouse.mockResolvedValue({ ok: false, status: 500, data: {} });
    await expect(fetchCompanyProfile("06846849")).rejects.toThrow("Companies House answered 500");
  });

  test("throws when the base URI is unset", async () => {
    delete process.env.COMPANIES_HOUSE_BASE_URI;
    await expect(fetchCompanyProfile("06846849")).rejects.toThrow("COMPANIES_HOUSE_BASE_URI");
  });
});
