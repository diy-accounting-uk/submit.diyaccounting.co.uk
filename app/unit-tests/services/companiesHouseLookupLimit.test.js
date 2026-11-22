// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/services/companiesHouseLookupLimit.test.js

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

const mockIncrementRateCounter = vi.fn();
const mockGetCachedValue = vi.fn();
const mockPutCachedValue = vi.fn();
vi.mock("@app/data/dynamoDbSecurityStateRepository.js", () => ({
  incrementRateCounter: (...args) => mockIncrementRateCounter(...args),
  getCachedValue: (...args) => mockGetCachedValue(...args),
  putCachedValue: (...args) => mockPutCachedValue(...args),
}));
vi.mock("@app/services/subHasher.js", () => ({ hashSub: (sub) => `hashed_${sub}` }));
const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
vi.mock("@app/lib/logger.js", async (importOriginal) => ({ ...(await importOriginal()), createLogger: () => mockLogger }));

const {
  lookupFailureResponse,
  companiesHouseStopSecondsLeft,
  stopCompaniesHouseLookups,
  publicLookupRefusal,
  PUBLIC_LOOKUP_CALLS,
  PUBLIC_LOOKUP_CALLS_PER_WINDOW,
  lookupRefusalSeconds,
  lookupLimitResponse,
  LOOKUP_CALLS,
  LOOKUP_CALLS_PER_ACCOUNT_PER_WINDOW,
  LOOKUP_CALLS_FOR_ALL_ACCOUNTS_PER_WINDOW,
} = await import("@app/services/companiesHouseLookupLimit.js");

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
    expect(await lookupRefusalSeconds("user-1", LOOKUP_CALLS.filedAccounts)).toBe(0);
    expect(mockIncrementRateCounter).toHaveBeenCalledWith({
      namespace: "chlookup",
      identifier: "hashed_user-1",
      minute: Math.floor(Date.now() / 1000 / 300),
      hits: 15,
    });
  });

  test("refuses once the account has used more than its share of the key in the window", async () => {
    mockIncrementRateCounter.mockResolvedValue(LOOKUP_CALLS_PER_ACCOUNT_PER_WINDOW);
    expect(await lookupRefusalSeconds("user-1", 1)).toBe(0);
    mockIncrementRateCounter.mockResolvedValue(LOOKUP_CALLS_PER_ACCOUNT_PER_WINDOW + 1);
    expect(await lookupRefusalSeconds("user-1", 1)).toBeGreaterThan(0);
  });

  test("an account's share is a quarter of the key's 600 calls, so no one account can use up the key", () => {
    expect(LOOKUP_CALLS_PER_ACCOUNT_PER_WINDOW * 4).toBe(600);
  });

  test("charges the lookup to the budget of all signed-in lookups under one fixed key for the window", async () => {
    mockIncrementRateCounter.mockResolvedValue(15);
    await lookupRefusalSeconds("user-1", LOOKUP_CALLS.filedAccounts);
    expect(mockIncrementRateCounter).toHaveBeenLastCalledWith({
      namespace: "chlookup",
      identifier: "all-signed-in-lookups",
      minute: Math.floor(Date.now() / 1000 / 300),
      hits: 15,
    });
  });

  test("refuses once all signed-in lookups together have used 450 of the key's 600 calls in the window", async () => {
    expect(LOOKUP_CALLS_FOR_ALL_ACCOUNTS_PER_WINDOW).toBe(450);
    mockIncrementRateCounter.mockResolvedValueOnce(1).mockResolvedValueOnce(450);
    expect(await lookupRefusalSeconds("user-1", 1)).toBe(0);
    mockIncrementRateCounter.mockResolvedValueOnce(1).mockResolvedValueOnce(451);
    expect(await lookupRefusalSeconds("user-2", 1)).toBeGreaterThan(0);
  });

  test("logs each refusal by the budget of all as one line with its event name and window", async () => {
    mockLogger.warn.mockClear();
    mockIncrementRateCounter.mockResolvedValueOnce(1).mockResolvedValueOnce(451);
    expect(await lookupRefusalSeconds("user-2", 1)).toBeGreaterThan(0);
    const lines = mockLogger.warn.mock.calls.map(([line]) => line).filter((line) => line.event === "CompaniesHouseLookupBudgetRefused");
    expect(lines).toEqual([expect.objectContaining({ window: Math.floor(Date.now() / 1000 / 300), used: 451 })]);
  });

  test("logs no budget event for a refusal by the account's own share", async () => {
    mockLogger.warn.mockClear();
    mockIncrementRateCounter.mockResolvedValueOnce(LOOKUP_CALLS_PER_ACCOUNT_PER_WINDOW + 1);
    expect(await lookupRefusalSeconds("user-1", 1)).toBeGreaterThan(0);
    expect(mockLogger.warn.mock.calls.some(([line]) => line.event === "CompaniesHouseLookupBudgetRefused")).toBe(false);
  });

  test("a lookup refused for the account's share is not charged to the budget of all", async () => {
    mockIncrementRateCounter.mockResolvedValueOnce(LOOKUP_CALLS_PER_ACCOUNT_PER_WINDOW + 1);
    expect(await lookupRefusalSeconds("user-1", 1)).toBeGreaterThan(0);
    expect(mockIncrementRateCounter).toHaveBeenCalledTimes(1);
  });

  test("applies the budget of all when the account's counter cannot be written, and the reverse", async () => {
    mockIncrementRateCounter.mockRejectedValueOnce(new Error("throttled")).mockResolvedValueOnce(451);
    expect(await lookupRefusalSeconds("user-1", 1)).toBeGreaterThan(0);
    mockIncrementRateCounter.mockResolvedValueOnce(LOOKUP_CALLS_PER_ACCOUNT_PER_WINDOW + 1);
    expect(await lookupRefusalSeconds("user-1", 1)).toBeGreaterThan(0);
    mockIncrementRateCounter.mockResolvedValueOnce(1).mockRejectedValueOnce(new Error("throttled"));
    expect(await lookupRefusalSeconds("user-1", 1)).toBe(0);
  });

  test("applies no limit where the security state table is not configured", async () => {
    delete process.env.SECURITY_STATE_DYNAMODB_TABLE_NAME;
    expect(await lookupRefusalSeconds("user-1", 1)).toBe(0);
    expect(mockIncrementRateCounter).not.toHaveBeenCalled();
  });

  test("leaves the lookup to the WAF when the counter cannot be written", async () => {
    mockIncrementRateCounter.mockRejectedValue(new Error("throttled"));
    expect(await lookupRefusalSeconds("user-1", 1)).toBe(0);
  });

  test("refuses for the seconds left in the five-minute window, and answers them as Retry-After on a JSON 429", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(300 * 1000 * 5_000_000 + 100 * 1000));
      mockIncrementRateCounter.mockResolvedValueOnce(LOOKUP_CALLS_PER_ACCOUNT_PER_WINDOW + 1);
      const seconds = await lookupRefusalSeconds("user-1", 1);
      expect(seconds).toBe(200);
      const response = lookupLimitResponse({}, { "Content-Type": "application/json" }, seconds);
      expect(response.statusCode).toBe(429);
      expect(response.headers["Retry-After"]).toBe("200");
      expect(JSON.parse(response.body).message).toBe("Too many Companies House lookups just now. Try again in a few minutes.");
    } finally {
      vi.useRealTimers();
    }
  });

  test("refuses for at least one second at the end of the window, and the whole window at its start", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(300 * 1000 * 5_000_001 - 200));
      mockIncrementRateCounter.mockResolvedValue(LOOKUP_CALLS_PER_ACCOUNT_PER_WINDOW + 1);
      expect(await lookupRefusalSeconds("user-1", 1)).toBe(1);
      vi.setSystemTime(new Date(300 * 1000 * 5_000_001));
      expect(await lookupRefusalSeconds("user-1", 1)).toBe(300);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("the Companies House budget of all public lookups", () => {
  beforeEach(() => {
    mockIncrementRateCounter.mockReset();
    process.env.SECURITY_STATE_DYNAMODB_TABLE_NAME = "test-security-state";
  });
  afterEach(() => {
    delete process.env.SECURITY_STATE_DYNAMODB_TABLE_NAME;
  });

  test("charges every public lookup to one counter for the five-minute window, whatever address it comes from", async () => {
    mockIncrementRateCounter.mockResolvedValue(5);
    expect(await publicLookupRefusal(PUBLIC_LOOKUP_CALLS.register)).toBeNull();
    expect(mockIncrementRateCounter).toHaveBeenCalledWith({
      namespace: "chlookup",
      identifier: "all-public-lookups",
      minute: Math.floor(Date.now() / 1000 / 300),
      hits: 5,
    });
  });

  test("is spent once public lookups pass their budget, which leaves the signed-in budget and the filings their calls", async () => {
    mockIncrementRateCounter.mockResolvedValue(PUBLIC_LOOKUP_CALLS_PER_WINDOW + 1);
    expect(await publicLookupRefusal(PUBLIC_LOOKUP_CALLS.deadlines)).toEqual({ seconds: expect.any(Number), reason: "budget_spent" });
    expect(PUBLIC_LOOKUP_CALLS_PER_WINDOW + LOOKUP_CALLS_FOR_ALL_ACCOUNTS_PER_WINDOW).toBeLessThan(600);
  });

  test("does not apply where the security state table is not configured, or the counter cannot be written", async () => {
    mockIncrementRateCounter.mockRejectedValue(new Error("throttled"));
    expect(await publicLookupRefusal(1)).toBeNull();
    delete process.env.SECURITY_STATE_DYNAMODB_TABLE_NAME;
    expect(await publicLookupRefusal(1)).toBeNull();
    expect(mockIncrementRateCounter).toHaveBeenCalledTimes(1);
  });
});

describe("the stop every Companies House lookup reads after Companies House answers 429", () => {
  beforeEach(() => {
    mockIncrementRateCounter.mockReset();
    mockGetCachedValue.mockReset();
    mockPutCachedValue.mockReset();
    process.env.SECURITY_STATE_DYNAMODB_TABLE_NAME = "test-security-state";
  });
  afterEach(() => {
    delete process.env.SECURITY_STATE_DYNAMODB_TABLE_NAME;
    vi.useRealTimers();
  });

  test("stores one stop for the seconds Companies House's Retry-After names, or five minutes when it names none", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1_000_000_000_000));
    await stopCompaniesHouseLookups("120");
    expect(mockPutCachedValue).toHaveBeenLastCalledWith("chlookup#stopped", { until: 1_000_000_120_000 }, 120);
    await stopCompaniesHouseLookups(undefined);
    expect(mockPutCachedValue).toHaveBeenLastCalledWith("chlookup#stopped", { until: 1_000_000_300_000 }, 300);
  });

  test("answers the seconds left in the stop, and none once it has passed", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1_000_000_000_000));
    mockGetCachedValue.mockResolvedValue({ until: 1_000_000_045_500 });
    expect(await companiesHouseStopSecondsLeft()).toBe(46);
    mockGetCachedValue.mockResolvedValue({ until: 999_999_999_000 });
    expect(await companiesHouseStopSecondsLeft()).toBe(0);
    mockGetCachedValue.mockResolvedValue(null);
    expect(await companiesHouseStopSecondsLeft()).toBe(0);
  });

  test("refuses a signed-in lookup for the seconds left in the stop and charges it nothing", async () => {
    mockGetCachedValue.mockResolvedValue({ until: Date.now() + 90_000 });
    expect(await lookupRefusalSeconds("user-1", LOOKUP_CALLS.profile)).toBe(90);
    expect(mockIncrementRateCounter).not.toHaveBeenCalled();
  });

  test("refuses a public lookup for the seconds left in the stop, as stopped, and charges it nothing", async () => {
    mockGetCachedValue.mockResolvedValue({ until: Date.now() + 90_000 });
    expect(await publicLookupRefusal(PUBLIC_LOOKUP_CALLS.register)).toEqual({ seconds: 90, reason: "stopped" });
    expect(mockIncrementRateCounter).not.toHaveBeenCalled();
  });

  test("applies no stop where the table is not configured or the stop cannot be read, and writes none it cannot", async () => {
    mockGetCachedValue.mockRejectedValue(new Error("throttled"));
    expect(await companiesHouseStopSecondsLeft()).toBe(0);
    mockPutCachedValue.mockRejectedValue(new Error("throttled"));
    await expect(stopCompaniesHouseLookups("60")).resolves.toBeUndefined();
    delete process.env.SECURITY_STATE_DYNAMODB_TABLE_NAME;
    mockGetCachedValue.mockReset();
    mockPutCachedValue.mockReset();
    expect(await companiesHouseStopSecondsLeft()).toBe(0);
    await stopCompaniesHouseLookups("60");
    expect(mockGetCachedValue).not.toHaveBeenCalled();
    expect(mockPutCachedValue).not.toHaveBeenCalled();
  });

  test("a signed-in lookup's failed answer stops every lookup when Companies House answered 429, and only then", async () => {
    const limited = await lookupFailureResponse({}, { status: 429, headers: { "retry-after": "45" }, data: {} }, {});
    expect(limited.statusCode).toBe(429);
    expect(mockPutCachedValue).toHaveBeenCalledWith("chlookup#stopped", { until: expect.any(Number) }, 45);
    mockPutCachedValue.mockClear();
    const missing = await lookupFailureResponse({}, { status: 404, headers: {}, data: {} }, {});
    expect(missing.statusCode).toBe(404);
    expect(mockPutCachedValue).not.toHaveBeenCalled();
  });
});
