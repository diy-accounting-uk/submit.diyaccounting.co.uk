// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// web/unit-tests/hmrc-service.test.js

import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("../public/lib/services/api-client.js", () => ({
  authorizedFetch: vi.fn(),
}));

import { authorizedFetch } from "../public/lib/services/api-client.js";
import { submitVat, getBusinessDetails } from "../public/lib/services/hmrc-service.js";

describe("hmrc-service submitVat error handling", () => {
  const vatData = {
    periodStart: "2017-04-01",
    periodEnd: "2017-06-30",
    vatDueSales: 1000.0,
    vatDueAcquisitions: 0,
    totalVatDue: 1000.0,
    vatReclaimedCurrPeriod: 0,
    netVatDue: 1000.0,
    totalValueSalesExVAT: 5000,
    totalValuePurchasesExVAT: 0,
    totalValueGoodsSuppliedExVAT: 0,
    totalAcquisitionsExVAT: 0,
    finalised: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    global.localStorage = {
      getItem: vi.fn(() => null),
    };
  });

  test("throws a friendly message when the token allowance is exhausted", async () => {
    authorizedFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: "Forbidden",
      json: () =>
        Promise.resolve({
          message: "Token limit reached",
          reason: "tokens_exhausted",
          tokensRemaining: 0,
        }),
    });

    await expect(submitVat("111222333", vatData, "test-token")).rejects.toThrow(
      "No tokens remaining. Your token allowance has been used. Tokens refresh at the start of the next period. Visit the Bundles page for more options.",
    );
  });

  test("throws a friendly message and clears the stored token when the HMRC scope is insufficient", async () => {
    authorizedFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      json: () =>
        Promise.resolve({
          message: "Forbidden",
          reason: "hmrc_scope_insufficient",
          userMessage: "Your HMRC authorization does not include the required permissions for this action",
          actionAdvice: "Please re-authorize with HMRC to grant the necessary permissions",
        }),
    });

    const clearHmrcToken = vi.fn();
    global.window = { hmrcScopeCheck: { clearHmrcToken } };

    await expect(submitVat("111222333", vatData, "test-token")).rejects.toThrow(
      "Your HMRC authorization does not include the required permissions for this action",
    );
    expect(clearHmrcToken).toHaveBeenCalledTimes(1);

    delete global.window;
  });

  test("still throws the raw response for unrecognised failure reasons", async () => {
    authorizedFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: () => Promise.resolve({ message: "Something else went wrong" }),
    });

    await expect(submitVat("111222333", vatData, "test-token")).rejects.toThrow(/Failed to submit VAT/);
  });
});

describe("hmrc-service getBusinessDetails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("returns the parsed business list on success", async () => {
    const listOfBusinesses = [{ typeOfBusiness: "self-employment", businessId: "XBIS12345678901", tradingName: "Company X" }];
    authorizedFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ listOfBusinesses }),
    });

    const result = await getBusinessDetails("AB123456C", "test-token");
    expect(result).toEqual({ listOfBusinesses });
    expect(authorizedFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/hmrc/itsa/business/details?nino=AB123456C"),
      expect.objectContaining({ method: "GET" }),
    );
  });

  test("throws a friendly message and clears the stored token when the HMRC scope is insufficient", async () => {
    authorizedFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      json: () =>
        Promise.resolve({
          message: "Forbidden",
          reason: "hmrc_scope_insufficient",
          userMessage: "Your HMRC authorization does not include the required permissions for this action",
        }),
    });

    const clearHmrcToken = vi.fn();
    global.window = { hmrcScopeCheck: { clearHmrcToken } };

    await expect(getBusinessDetails("AB123456C", "test-token")).rejects.toThrow(
      "Your HMRC authorization does not include the required permissions for this action",
    );
    expect(clearHmrcToken).toHaveBeenCalledTimes(1);

    delete global.window;
  });

  test("throws the raw response for unrecognised failure reasons", async () => {
    authorizedFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: () => Promise.resolve({ message: "Something else went wrong" }),
    });

    await expect(getBusinessDetails("AB123456C", "test-token")).rejects.toThrow(/Failed to retrieve business details/);
  });
});
