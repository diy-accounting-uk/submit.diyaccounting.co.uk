// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/dueListGet.test.js

import { describe, test, expect, vi, beforeEach } from "vitest";
import { dueListEvent, responseBody } from "@app/test-helpers/dueListRouteDoubles.js";

const mockEnforceBundles = vi.fn();
vi.mock("@app/services/bundleManagement.js", async (importOriginal) => ({
  ...(await importOriginal()),
  enforceBundles: (...args) => mockEnforceBundles(...args),
}));
const mockList = vi.fn();
vi.mock("@app/data/dynamoDbDueListRepository.js", () => ({ listBusinessesAndRows: (...args) => mockList(...args) }));
vi.mock("@app/services/subHasher.js", async (importOriginal) => ({ ...(await importOriginal()), initializeSalt: async () => {} }));

const { ingestHandler } = await import("@app/functions/account/dueListGet.js");
const { BundleEntitlementError } = await import("@app/services/bundleManagement.js");

describe("functions/dueListGet", () => {
  beforeEach(() => {
    mockEnforceBundles.mockReset().mockResolvedValue({ userSub: "user-1" });
    mockList.mockReset();
  });

  test("answers the account's businesses and rows without the hashed sub, the raw sub or the ttl", async () => {
    mockList.mockResolvedValue({
      businesses: [{ hashedSub: "h", sk: "business#b1", businessId: "b1", kind: "company", sub: "user-1", job: "refresh" }],
      rows: [{ hashedSub: "h", sk: "row#b1#accounts#2026-06-30", type: "accounts", dueDate: "2027-03-31", ttl: 1, status: "open" }],
    });

    const response = await ingestHandler(dueListEvent());

    expect(response.statusCode).toBe(200);
    const body = responseBody(response);
    expect(body.businesses).toEqual([{ sk: "business#b1", businessId: "b1", kind: "company", job: "refresh" }]);
    expect(body.rows).toEqual([{ sk: "row#b1#accounts#2026-06-30", type: "accounts", dueDate: "2027-03-31", status: "open" }]);
    expect(mockList).toHaveBeenCalledWith("user-1");
  });

  test("answers a JSON 403 for an account without the due list activity", async () => {
    mockEnforceBundles.mockRejectedValue(new BundleEntitlementError("Forbidden", { code: "BUNDLE_FORBIDDEN" }));
    const response = await ingestHandler(dueListEvent());
    expect(response.statusCode).toBe(403);
    expect(responseBody(response).message).toBe("Forbidden - missing or insufficient bundle entitlement");
    expect(mockList).not.toHaveBeenCalled();
  });

  test("answers a JSON 500 when the list cannot be read", async () => {
    mockList.mockRejectedValue(new Error("down"));
    const response = await ingestHandler(dueListEvent());
    expect(response.statusCode).toBe(500);
    expect(responseBody(response).message).toBe("The due list could not be read");
  });
});
