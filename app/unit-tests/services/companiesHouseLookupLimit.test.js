// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/services/companiesHouseLookupLimit.test.js

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

const mockIncrementRateCounter = vi.fn();
vi.mock("@app/data/dynamoDbSecurityStateRepository.js", () => ({
  incrementRateCounter: (...args) => mockIncrementRateCounter(...args),
}));
vi.mock("@app/services/subHasher.js", () => ({ hashSub: (sub) => `hashed_${sub}` }));

const { lookupLimitReached, lookupLimitResponse, LOOKUP_CALLS, LOOKUP_CALLS_PER_ACCOUNT_PER_WINDOW } =
  await import("@app/services/companiesHouseLookupLimit.js");

describe("the Companies House lookup limit per account", () => {
  beforeEach(() => {
    mockIncrementRateCounter.mockReset();
    process.env.SECURITY_STATE_DYNAMODB_TABLE_NAME = "test-security-state";
  });
  afterEach(() => {
    delete process.env.SECURITY_STATE_DYNAMODB_TABLE_NAME;
  });

  test("charges the account the lookup's calls in one counter update keyed by its hashed sub and the five-minute window", async () => {
    mockIncrementRateCounter.mockResolvedValue(15);
    expect(await lookupLimitReached("user-1", LOOKUP_CALLS.filedAccounts)).toBe(false);
    expect(mockIncrementRateCounter).toHaveBeenCalledWith({
      namespace: "chlookup",
      identifier: "hashed_user-1",
      minute: Math.floor(Date.now() / 1000 / 300),
      hits: 15,
    });
  });

  test("refuses once the account has used more than its share of the key in the window", async () => {
    mockIncrementRateCounter.mockResolvedValue(LOOKUP_CALLS_PER_ACCOUNT_PER_WINDOW);
    expect(await lookupLimitReached("user-1", 1)).toBe(false);
    mockIncrementRateCounter.mockResolvedValue(LOOKUP_CALLS_PER_ACCOUNT_PER_WINDOW + 1);
    expect(await lookupLimitReached("user-1", 1)).toBe(true);
  });

  test("an account's share is a quarter of the key's 600 calls, so no one account can use up the key", () => {
    expect(LOOKUP_CALLS_PER_ACCOUNT_PER_WINDOW * 4).toBe(600);
  });

  test("applies no limit where the security state table is not configured", async () => {
    delete process.env.SECURITY_STATE_DYNAMODB_TABLE_NAME;
    expect(await lookupLimitReached("user-1", 1)).toBe(false);
    expect(mockIncrementRateCounter).not.toHaveBeenCalled();
  });

  test("leaves the lookup to the WAF when the counter cannot be written", async () => {
    mockIncrementRateCounter.mockRejectedValue(new Error("throttled"));
    expect(await lookupLimitReached("user-1", 1)).toBe(false);
  });

  test("answers a JSON 429 with a Retry-After of the window", () => {
    const response = lookupLimitResponse({}, { "Content-Type": "application/json" });
    expect(response.statusCode).toBe(429);
    expect(response.headers["Retry-After"]).toBe("300");
    expect(JSON.parse(response.body).message).toBe("Too many Companies House lookups from this account. Try again in a few minutes.");
  });
});
