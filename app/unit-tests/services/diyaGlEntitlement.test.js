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
const { entitlementFor, hasActivePracticeSubscription } = await import("../../services/diyaGlEntitlement.js");
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
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.NODE_ENV = "test";
    _setTestSalt("test-salt");
    getUserBundles.mockReset();
    getClient.mockReset();
  });

  afterEach(() => {
    restoreEnv("DIYA_GL_RESIDENT_TIER", originalResidentTier);
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

  test("gives resident retention for a caller with an active, unexpired resident-pro bundle", async () => {
    process.env.DIYA_GL_RESIDENT_TIER = "true";
    const future = new Date(Date.now() + 60_000).toISOString();
    getUserBundles.mockResolvedValue([{ bundleId: "resident-pro", subscriptionStatus: "active", expiry: future }]);

    const result = await entitlementFor("active-sub");

    expect(result.retention).toBe("resident");
    expect(result.reason).toBe("active-subscription");
    expect(result.residentTier).toBe(true);
    expect(result.bundleId).toBe("resident-pro");
    expect(result.expiry).toBe(future);
    expect(getClient).not.toHaveBeenCalled();
  });

  test("gives resident own books to a resident-tax-agent holder, a bundle that includes resident-pro", async () => {
    process.env.DIYA_GL_RESIDENT_TIER = "true";
    getUserBundles.mockResolvedValue([{ bundleId: "resident-tax-agent", subscriptionStatus: "active", expiry: null }]);

    const result = await entitlementFor("practice-sub");

    expect(result.retention).toBe("resident");
    expect(result.bundleId).toBe("resident-tax-agent");
  });

  test("gives sandbox retention with reason no-subscription for a caller holding only the resident-diya-gl bundle", async () => {
    process.env.DIYA_GL_RESIDENT_TIER = "true";
    const future = new Date(Date.now() + 60_000).toISOString();
    getUserBundles.mockResolvedValue([{ bundleId: "resident-diya-gl", subscriptionStatus: "active", expiry: future }]);

    const result = await entitlementFor("active-sub");

    expect(result.retention).toBe("sandbox");
    expect(result.reason).toBe("no-subscription");
    expect(result.residentTier).toBe(true);
    expect(result.bundleId).toBeNull();
  });

  test("gives sandbox retention with reason expired for a resident-pro bundle whose expiry has passed", async () => {
    process.env.DIYA_GL_RESIDENT_TIER = "true";
    const past = new Date(Date.now() - 60_000).toISOString();
    getUserBundles.mockResolvedValue([{ bundleId: "resident-pro", subscriptionStatus: "canceled", expiry: past }]);

    const result = await entitlementFor("expired-sub");

    expect(result.retention).toBe("sandbox");
    expect(result.reason).toBe("expired");
    expect(result.residentTier).toBe(true);
    expect(result.expiry).toBe(past);
  });

  test("gives sandbox retention with reason no-subscription for resident-vat and resident-ltd holders, which do not include resident-pro", async () => {
    process.env.DIYA_GL_RESIDENT_TIER = "true";
    getUserBundles.mockResolvedValue([
      { bundleId: "resident-vat", subscriptionStatus: "active", expiry: null },
      { bundleId: "resident-ltd", subscriptionStatus: "active", expiry: null },
    ]);

    const result = await entitlementFor("no-bundle-sub");

    expect(result.retention).toBe("sandbox");
    expect(result.reason).toBe("no-subscription");
    expect(result.residentTier).toBe(true);
  });

  test("picks the active bundle when a lapsed one is held beside it", async () => {
    process.env.DIYA_GL_RESIDENT_TIER = "true";
    getUserBundles.mockResolvedValue([
      { bundleId: "resident-pro", subscriptionStatus: "expired", expiry: null },
      { bundleId: "resident-tax-agent", subscriptionStatus: "active", expiry: null },
    ]);

    const result = await entitlementFor("practice-sub");

    expect(result.retention).toBe("resident");
    expect(result.bundleId).toBe("resident-tax-agent");
  });

  test("gives sandbox own books to an expired or inactive resident-pro holder", async () => {
    process.env.DIYA_GL_RESIDENT_TIER = "true";
    const past = new Date(Date.now() - 60_000).toISOString();

    getUserBundles.mockResolvedValue([{ bundleId: "resident-pro", subscriptionStatus: "active", expiry: past }]);
    const expired = await entitlementFor("practice-sub");
    expect(expired.retention).toBe("sandbox");
    expect(expired.reason).toBe("expired");

    getUserBundles.mockResolvedValue([{ bundleId: "resident-pro", subscriptionStatus: "cancelled", expiry: null }]);
    const inactive = await entitlementFor("practice-sub");
    expect(inactive.retention).toBe("sandbox");
    expect(inactive.reason).toBe("expired");
  });

  test("gives resident retention for a client's books when the practice holds an active resident-tax-agent subscription and the client belongs to it", async () => {
    process.env.DIYA_GL_RESIDENT_TIER = "true";
    const future = new Date(Date.now() + 60_000).toISOString();
    getUserBundles.mockResolvedValue([{ bundleId: "resident-tax-agent", subscriptionStatus: "active", expiry: future }]);
    getClient.mockResolvedValue({ hashedSub: "practice-hash", clientId: "client-1", displayName: "A Client" });

    const result = await entitlementFor("practice-sub", "client-1");

    expect(result.retention).toBe("resident");
    expect(result.reason).toBe("active-subscription");
    expect(result.bundleId).toBe("resident-tax-agent");
    expect(getClient).toHaveBeenCalledWith("practice-sub", "client-1");
  });

  test("refuses a resident-tax-agent practice reading a client id that does not belong to it", async () => {
    process.env.DIYA_GL_RESIDENT_TIER = "true";
    const future = new Date(Date.now() + 60_000).toISOString();
    getUserBundles.mockResolvedValue([{ bundleId: "resident-tax-agent", subscriptionStatus: "active", expiry: future }]);
    getClient.mockResolvedValue(null);

    const result = await entitlementFor("practice-sub", "someone-elses-client");

    expect(result.retention).toBe("sandbox");
    expect(result.reason).toBe("client-not-found");
  });

  test("refuses a client id from a resident-pro subscriber who holds no resident-tax-agent subscription", async () => {
    process.env.DIYA_GL_RESIDENT_TIER = "true";
    const future = new Date(Date.now() + 60_000).toISOString();
    getUserBundles.mockResolvedValue([{ bundleId: "resident-pro", subscriptionStatus: "active", expiry: future }]);

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

describe("hasActivePracticeSubscription", () => {
  test("is true for an active, unexpired resident-tax-agent bundle", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(hasActivePracticeSubscription([{ bundleId: "resident-tax-agent", subscriptionStatus: "active", expiry: future }])).toBe(true);
  });

  test("is true for an active resident-tax-agent bundle with no expiry", () => {
    expect(hasActivePracticeSubscription([{ bundleId: "resident-tax-agent", subscriptionStatus: "active" }])).toBe(true);
  });

  test("is false when resident-tax-agent has expired", () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(hasActivePracticeSubscription([{ bundleId: "resident-tax-agent", subscriptionStatus: "active", expiry: past }])).toBe(false);
  });

  test("is false when only resident-pro is held", () => {
    expect(hasActivePracticeSubscription([{ bundleId: "resident-pro", subscriptionStatus: "active" }])).toBe(false);
  });

  test("is false when resident-tax-agent is held but not active", () => {
    expect(hasActivePracticeSubscription([{ bundleId: "resident-tax-agent", subscriptionStatus: "canceled" }])).toBe(false);
  });
});
