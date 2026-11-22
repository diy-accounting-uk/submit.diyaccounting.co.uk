// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/services/companiesHouseCacheDrop.test.js
import { describe, test, beforeEach, expect, vi } from "vitest";

const mockListCacheKeys = vi.fn();
const mockDeleteCacheEntry = vi.fn();
vi.mock("@app/data/dynamoDbCompaniesHouseCacheRepository.js", () => ({
  listCacheKeys: (...args) => mockListCacheKeys(...args),
  deleteCacheEntry: (...args) => mockDeleteCacheEntry(...args),
}));

import { invalidateCompany, dropCompanyCacheAfterAcceptedFiling } from "@app/services/companiesHouseCacheDrop.js";

const CACHED_KEYS = [
  "/company/00000001",
  "/company/00000001/filing-history?items_per_page=100&start_index=0",
  "/company/00000001/officers?items_per_page=100&start_index=0",
  "/company/00000001/persons-with-significant-control?items_per_page=100&start_index=0",
  "figures#MzQ1Njc4OTAxMg",
  "figures-bulk#2098-04-30",
];

describe("dropping a company's cached register answers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListCacheKeys.mockResolvedValue(CACHED_KEYS);
    mockDeleteCacheEntry.mockResolvedValue(undefined);
  });

  test("deletes the profile, filing history, officers and PSC answers, and keeps the figures of filed sets", async () => {
    expect(await invalidateCompany("00000001")).toBe(4);
    expect(mockListCacheKeys).toHaveBeenCalledWith("00000001");
    expect(mockDeleteCacheEntry.mock.calls.map(([, sk]) => sk)).toEqual(CACHED_KEYS.slice(0, 4));
    for (const [companyNumber] of mockDeleteCacheEntry.mock.calls) expect(companyNumber).toBe("00000001");
  });

  test("after an accepted filing answers the number of entries dropped", async () => {
    expect(await dropCompanyCacheAfterAcceptedFiling("00000001")).toBe(4);
  });

  test("a company with nothing cached drops nothing", async () => {
    mockListCacheKeys.mockResolvedValue([]);
    expect(await dropCompanyCacheAfterAcceptedFiling("00000002")).toBe(0);
    expect(mockDeleteCacheEntry).not.toHaveBeenCalled();
  });

  test("a failed read of the cache answers null and throws nothing", async () => {
    mockListCacheKeys.mockRejectedValue(new Error("AccessDeniedException"));
    await expect(dropCompanyCacheAfterAcceptedFiling("00000001")).resolves.toBeNull();
  });

  test("a failed delete answers null and throws nothing", async () => {
    mockDeleteCacheEntry.mockRejectedValueOnce(new Error("ProvisionedThroughputExceededException"));
    await expect(dropCompanyCacheAfterAcceptedFiling("00000001")).resolves.toBeNull();
  });

  test("an accepted filing that names no company drops nothing", async () => {
    expect(await dropCompanyCacheAfterAcceptedFiling(undefined)).toBeNull();
    expect(mockListCacheKeys).not.toHaveBeenCalled();
  });
});
