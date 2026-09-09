// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, vi, beforeEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const mockCountActiveAllocations = vi.fn();
vi.mock("@app/data/dynamoDbBundleRepository.js", () => ({
  countActiveAllocations: (...args) => mockCountActiveAllocations(...args),
}));

const mockPutCounter = vi.fn();
vi.mock("@app/data/dynamoDbCapacityRepository.js", () => ({
  putCounter: (...args) => mockPutCounter(...args),
}));

const mockLoadCatalogFromRoot = vi.fn();
const mockGetCappedBundleIds = vi.fn();
vi.mock("@app/services/productCatalog.js", () => ({
  loadCatalogFromRoot: (...args) => mockLoadCatalogFromRoot(...args),
  getCappedBundleIds: (...args) => mockGetCappedBundleIds(...args),
}));

const mockPublishActivityEvent = vi.fn();
vi.mock("@app/lib/activityAlert.js", () => ({
  publishActivityEvent: (...args) => mockPublishActivityEvent(...args),
}));

const { handler } = await import("@app/functions/account/bundleCapacityReconcile.js");

describe("functions/account/bundleCapacityReconcile", () => {
  beforeEach(() => {
    mockCountActiveAllocations.mockReset();
    mockPutCounter.mockReset();
    mockLoadCatalogFromRoot.mockReset();
    mockGetCappedBundleIds.mockReset();
    mockPublishActivityEvent.mockReset();
    process.env.BUNDLE_DYNAMODB_TABLE_NAME = "test-bundle-table";
    process.env.BUNDLE_CAPACITY_DYNAMODB_TABLE_NAME = "test-bundle-capacity-table";

    mockLoadCatalogFromRoot.mockReturnValue({ catalog: "stub" });
    mockPutCounter.mockResolvedValue(undefined);
    mockPublishActivityEvent.mockResolvedValue(undefined);
  });

  test("writes one counter per capped bundle with the count the repository returned", async () => {
    mockGetCappedBundleIds.mockReturnValue(["day-guest"]);
    mockCountActiveAllocations.mockResolvedValue(7);

    await handler({});

    expect(mockPutCounter).toHaveBeenCalledWith("day-guest", 7);
  });

  test("two capped bundles produce two putCounter calls with the right bundle ids", async () => {
    mockGetCappedBundleIds.mockReturnValue(["day-guest", "week-guest"]);
    mockCountActiveAllocations.mockImplementation(async (bundleId) => (bundleId === "day-guest" ? 3 : 9));

    await handler({});

    expect(mockPutCounter).toHaveBeenCalledTimes(2);
    expect(mockPutCounter).toHaveBeenCalledWith("day-guest", 3);
    expect(mockPutCounter).toHaveBeenCalledWith("week-guest", 9);
  });

  test("no capped bundles means no query and no counter write", async () => {
    mockGetCappedBundleIds.mockReturnValue([]);

    await expect(handler({})).resolves.toBeUndefined();

    expect(mockCountActiveAllocations).not.toHaveBeenCalled();
    expect(mockPutCounter).not.toHaveBeenCalled();
  });

  test("throws when the catalogue fails to load, without writing any counter", async () => {
    mockLoadCatalogFromRoot.mockImplementation(() => {
      throw new Error("catalogue missing");
    });

    await expect(handler({})).rejects.toThrow("catalogue missing");
    expect(mockPutCounter).not.toHaveBeenCalled();
  });

  test("one bundle's count failing does not stop the other bundle's counter write, then throws", async () => {
    mockGetCappedBundleIds.mockReturnValue(["day-guest", "week-guest"]);
    mockCountActiveAllocations.mockImplementation(async (bundleId) => {
      if (bundleId === "day-guest") throw new Error("index query failed");
      return 4;
    });

    await expect(handler({})).rejects.toThrow(/day-guest/);

    expect(mockPutCounter).toHaveBeenCalledTimes(1);
    expect(mockPutCounter).toHaveBeenCalledWith("week-guest", 4);
  });

  test("throws when putCounter fails", async () => {
    mockGetCappedBundleIds.mockReturnValue(["day-guest"]);
    mockCountActiveAllocations.mockResolvedValue(1);
    mockPutCounter.mockRejectedValue(new Error("write failed"));

    await expect(handler({})).rejects.toThrow(/day-guest/);
  });

  test("every countActiveAllocations call in one invocation receives the same timestamp", async () => {
    mockGetCappedBundleIds.mockReturnValue(["day-guest", "week-guest"]);
    mockCountActiveAllocations.mockResolvedValue(0);

    await handler({});

    const timestamps = mockCountActiveAllocations.mock.calls.map((call) => call[1]);
    expect(timestamps).toHaveLength(2);
    expect(timestamps[0]).toBe(timestamps[1]);
  });

  test("throws before any query when the capacity table env var is missing", async () => {
    delete process.env.BUNDLE_CAPACITY_DYNAMODB_TABLE_NAME;

    await expect(handler({})).rejects.toThrow();

    expect(mockCountActiveAllocations).not.toHaveBeenCalled();
  });

  test("publishes the activity event on a clean pass", async () => {
    mockGetCappedBundleIds.mockReturnValue(["day-guest"]);
    mockCountActiveAllocations.mockResolvedValue(2);

    await handler({});

    expect(mockPublishActivityEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: "capacity-reconciled" }),
    );
  });

  test("does not publish the activity event after a failure", async () => {
    mockGetCappedBundleIds.mockReturnValue(["day-guest"]);
    mockCountActiveAllocations.mockRejectedValue(new Error("index query failed"));

    await expect(handler({})).rejects.toThrow();

    expect(mockPublishActivityEvent).not.toHaveBeenCalled();
  });
});
