// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/services/companiesHouseCacheDrop.test.js
import { describe, test, beforeEach, expect, vi } from "vitest";

const mockListCacheKeys = vi.fn();
const mockDeleteCacheEntry = vi.fn();
const mockPutCacheEntry = vi.fn();
vi.mock("@app/data/dynamoDbCompaniesHouseCacheRepository.js", () => ({
  listCacheKeys: (...args) => mockListCacheKeys(...args),
  deleteCacheEntry: (...args) => mockDeleteCacheEntry(...args),
  putCacheEntry: (...args) => mockPutCacheEntry(...args),
}));

import { invalidateCompany, dropCompanyCacheAfterAcceptedFiling } from "@app/services/companiesHouseCacheDrop.js";
import { ACCEPTED_FILING_SK, ACCEPTED_FILING_MARKER_SECONDS } from "@app/services/companiesHouseAcceptedFiling.js";

const CACHED_KEYS = [
  "/company/00000001",
  "/company/00000001/filing-history?items_per_page=100&start_index=0",
  "/company/00000001/officers?items_per_page=100&start_index=0",
  "/company/00000001/persons-with-significant-control?items_per_page=100&start_index=0",
  "figures#MzQ1Njc4OTAxMg",
  "figures-bulk#2098-04-30",
  "accepted-filing",
];

describe("dropping a company's cached register answers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListCacheKeys.mockResolvedValue(CACHED_KEYS);
    mockDeleteCacheEntry.mockResolvedValue(undefined);
    mockPutCacheEntry.mockResolvedValue(undefined);
  });

  test("deletes the profile, filing history, officers and PSC answers, and keeps the figures of filed sets and the marker", async () => {
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

  test("an accepted filing that names no company drops nothing and marks nothing", async () => {
    expect(await dropCompanyCacheAfterAcceptedFiling(undefined)).toBeNull();
    expect(mockListCacheKeys).not.toHaveBeenCalled();
    expect(mockPutCacheEntry).not.toHaveBeenCalled();
  });

  test("an accepted filing writes one marker for the company, holding the acceptance time, for the marker's life", async () => {
    const before = new Date().toISOString();
    await dropCompanyCacheAfterAcceptedFiling("00000001");
    expect(mockPutCacheEntry).toHaveBeenCalledTimes(1);
    const [companyNumber, sk, value, readAt, ttlSeconds] = mockPutCacheEntry.mock.calls[0];
    expect([companyNumber, sk, ttlSeconds]).toEqual(["00000001", ACCEPTED_FILING_SK, ACCEPTED_FILING_MARKER_SECONDS]);
    expect(value.acceptedAt >= before).toBe(true);
    expect(readAt).toBe(value.acceptedAt);
  });

  test("a marker write that fails still drops the answers and throws nothing", async () => {
    mockPutCacheEntry.mockRejectedValue(new Error("AccessDeniedException"));
    await expect(dropCompanyCacheAfterAcceptedFiling("00000001")).resolves.toBe(4);
  });
});
