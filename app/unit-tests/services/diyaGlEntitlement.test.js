// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@app/data/dynamoDbBundleRepository.js", () => ({
  getUserBundles: vi.fn(),
}));

vi.mock("@app/data/dynamoDbPracticeClientRepository.js", () => ({
  getClient: vi.fn(),
}));

const { getUserBundles } = await import("@app/data/dynamoDbBundleRepository.js");
const { getClient } = await import("@app/data/dynamoDbPracticeClientRepository.js");
const { entitlementFor, lapsedResidentExpiresAt } = await import("../../services/diyaGlEntitlement.js");
const { _setTestSalt, _clearSalt } = await import("../../services/subHasher.js");

function restoreEnv(key, value) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

describe("diyaGlEntitlement", () => {
  const originalResidentTier = process.env.DIYA_GL_RESIDENT_TIER;
  const originalBundleId = process.env.DIYA_GL_BUNDLE_ID;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.NODE_ENV = "test";
    _setTestSalt("test-salt");
    getUserBundles.mockReset();
    getClient.mockReset();
  });

  afterEach(() => {
    restoreEnv("DIYA_GL_RESIDENT_TIER", originalResidentTier);
    restoreEnv("DIYA_GL_BUNDLE_ID", originalBundleId);
    restoreEnv("NODE_ENV", originalNodeEnv);
    _clearSalt();
  });

  test("gives sandbox retention with no bundle read when the resident tier is off", async () => {
    delete process.env.DIYA_GL_RESIDENT_TIER;

    const result = await entitlementFor("some-sub");

    expect(result.retention).toBe("sandbox");
    expect(result.reason).toBe("tier-disabled");
    expect(result.residentTier).toBe(false);
    expect(getUserBundles).not.toHaveBeenCalled();
  });

  test("gives resident retention for a caller with an active, unexpired resident bundle", async () => {
    process.env.DIYA_GL_RESIDENT_TIER = "true";
    const future = new Date(Date.now() + 60_000).toISOString();
    getUserBundles.mockResolvedValue([{ bundleId: "resident", subscriptionStatus: "active", expiry: future }]);

    const result = await entitlementFor("active-sub");

    expect(result.retention).toBe("resident");
    expect(result.reason).toBe("active-subscription");
    expect(result.residentTier).toBe(true);
    expect(result.bundleId).toBe("resident");
  });

  test("gives resident retention for a caller still on the folded resident-diya-gl bundle", async () => {
    process.env.DIYA_GL_RESIDENT_TIER = "true";
    const future = new Date(Date.now() + 60_000).toISOString();
    getUserBundles.mockResolvedValue([{ bundleId: "resident-diya-gl", subscriptionStatus: "active", expiry: future }]);

    const result = await entitlementFor("active-sub");

    expect(result.retention).toBe("resident");
    expect(result.reason).toBe("active-subscription");
    expect(result.residentTier).toBe(true);
    expect(result.bundleId).toBe("resident-diya-gl");
  });

  test("gives sandbox retention with reason expired for a DIYA-GL bundle whose expiry has passed", async () => {
    process.env.DIYA_GL_RESIDENT_TIER = "true";
    const past = new Date(Date.now() - 60_000).toISOString();
    getUserBundles.mockResolvedValue([{ bundleId: "resident-diya-gl", subscriptionStatus: "canceled", expiry: past }]);

    const result = await entitlementFor("expired-sub");

    expect(result.retention).toBe("sandbox");
    expect(result.reason).toBe("expired");
    expect(result.residentTier).toBe(true);
    expect(result.expiry).toBe(past);
  });

  test("gives sandbox retention with reason no-subscription when the caller has no matching bundle", async () => {
    process.env.DIYA_GL_RESIDENT_TIER = "true";
    getUserBundles.mockResolvedValue([{ bundleId: "resident-vat", subscriptionStatus: "active", expiry: null }]);

    const result = await entitlementFor("no-bundle-sub");

    expect(result.retention).toBe("sandbox");
    expect(result.reason).toBe("no-subscription");
    expect(result.residentTier).toBe(true);
  });

  test("respects a configured DIYA_GL_BUNDLE_ID", async () => {
    process.env.DIYA_GL_RESIDENT_TIER = "true";
    process.env.DIYA_GL_BUNDLE_ID = "custom-books-bundle";
    getUserBundles.mockResolvedValue([{ bundleId: "custom-books-bundle", subscriptionStatus: "active", expiry: null }]);

    const result = await entitlementFor("custom-sub");

    expect(result.retention).toBe("resident");
    expect(result.bundleId).toBe("custom-books-bundle");
  });

  test("gives resident retention for a client's books when the practice holds an active resident-pro subscription and the client belongs to it", async () => {
    process.env.DIYA_GL_RESIDENT_TIER = "true";
    const future = new Date(Date.now() + 60_000).toISOString();
    getUserBundles.mockResolvedValue([{ bundleId: "resident-pro", subscriptionStatus: "active", expiry: future }]);
    getClient.mockResolvedValue({ hashedSub: "practice-hash", clientId: "client-1", displayName: "A Client" });

    const result = await entitlementFor("practice-sub", "client-1");

    expect(result.retention).toBe("resident");
    expect(result.reason).toBe("active-subscription");
    expect(result.bundleId).toBe("resident-pro");
    expect(getClient).toHaveBeenCalledWith("practice-sub", "client-1");
  });

  test("refuses a resident-pro practice reading a client id that does not belong to it", async () => {
    process.env.DIYA_GL_RESIDENT_TIER = "true";
    const future = new Date(Date.now() + 60_000).toISOString();
    getUserBundles.mockResolvedValue([{ bundleId: "resident-pro", subscriptionStatus: "active", expiry: future }]);
    getClient.mockResolvedValue(null);

    const result = await entitlementFor("practice-sub", "someone-elses-client");

    expect(result.retention).toBe("sandbox");
    expect(result.reason).toBe("client-not-found");
  });

  test("refuses a client id from a resident subscriber who holds no resident-pro subscription", async () => {
    process.env.DIYA_GL_RESIDENT_TIER = "true";
    const future = new Date(Date.now() + 60_000).toISOString();
    getUserBundles.mockResolvedValue([{ bundleId: "resident", subscriptionStatus: "active", expiry: future }]);

    const result = await entitlementFor("resident-sub", "client-1");

    expect(result.retention).toBe("sandbox");
    expect(result.reason).toBe("no-practice-subscription");
    expect(getClient).not.toHaveBeenCalled();
  });

  test("refuses a client id from a caller with no subscription at all", async () => {
    process.env.DIYA_GL_RESIDENT_TIER = "true";
    getUserBundles.mockResolvedValue([]);

    const result = await entitlementFor("no-bundle-sub", "client-1");

    expect(result.retention).toBe("sandbox");
    expect(result.reason).toBe("no-practice-subscription");
    expect(getClient).not.toHaveBeenCalled();
  });
});

describe("lapsedResidentExpiresAt", () => {
  test("adds 30 days to the bundle's own expiry", () => {
    const bundleExpiry = "2026-01-01T00:00:00.000Z";

    const result = lapsedResidentExpiresAt(bundleExpiry);

    expect(result).toBe("2026-01-31T00:00:00.000Z");
  });
});
