// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@app/data/dynamoDbBundleRepository.js", () => ({
  getUserBundles: vi.fn(),
}));

const { getUserBundles } = await import("@app/data/dynamoDbBundleRepository.js");
const { entitlementFor } = await import("../../services/booksEntitlement.js");
const { _setTestSalt, _clearSalt } = await import("../../services/subHasher.js");

function restoreEnv(key, value) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

describe("booksEntitlement", () => {
  const originalEnabled = process.env.BOOKS_ENTITLEMENT_ENFORCED;
  const originalBundleId = process.env.BOOKS_BUNDLE_ID;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.NODE_ENV = "test";
    _setTestSalt("test-salt");
    getUserBundles.mockReset();
  });

  afterEach(() => {
    restoreEnv("BOOKS_ENTITLEMENT_ENFORCED", originalEnabled);
    restoreEnv("BOOKS_BUNDLE_ID", originalBundleId);
    restoreEnv("NODE_ENV", originalNodeEnv);
    _clearSalt();
  });

  test("stub allows everyone when enforcement is off", async () => {
    delete process.env.BOOKS_ENTITLEMENT_ENFORCED;

    const result = await entitlementFor("some-sub");

    expect(result.allowed).toBe(true);
    expect(result.reason).toBe("not-enforced");
    expect(getUserBundles).not.toHaveBeenCalled();
  });

  test("allows a caller with an active, unexpired DIYA-GL bundle", async () => {
    process.env.BOOKS_ENTITLEMENT_ENFORCED = "true";
    const future = new Date(Date.now() + 60_000).toISOString();
    getUserBundles.mockResolvedValue([{ bundleId: "resident-diya-gl", subscriptionStatus: "active", expiry: future }]);

    const result = await entitlementFor("active-sub");

    expect(result.allowed).toBe(true);
    expect(result.reason).toBe("active-subscription");
    expect(result.bundleId).toBe("resident-diya-gl");
  });

  test("reports expired for a DIYA-GL bundle whose expiry has passed", async () => {
    process.env.BOOKS_ENTITLEMENT_ENFORCED = "true";
    const past = new Date(Date.now() - 60_000).toISOString();
    getUserBundles.mockResolvedValue([{ bundleId: "resident-diya-gl", subscriptionStatus: "canceled", expiry: past }]);

    const result = await entitlementFor("expired-sub");

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("expired");
  });

  test("reports no-subscription when the caller has no matching bundle", async () => {
    process.env.BOOKS_ENTITLEMENT_ENFORCED = "true";
    getUserBundles.mockResolvedValue([{ bundleId: "resident-vat", subscriptionStatus: "active", expiry: null }]);

    const result = await entitlementFor("no-bundle-sub");

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("no-subscription");
  });

  test("respects a configured BOOKS_BUNDLE_ID", async () => {
    process.env.BOOKS_ENTITLEMENT_ENFORCED = "true";
    process.env.BOOKS_BUNDLE_ID = "custom-books-bundle";
    getUserBundles.mockResolvedValue([{ bundleId: "custom-books-bundle", subscriptionStatus: "active", expiry: null }]);

    const result = await entitlementFor("custom-sub");

    expect(result.allowed).toBe(true);
    expect(result.bundleId).toBe("custom-books-bundle");
  });
});
