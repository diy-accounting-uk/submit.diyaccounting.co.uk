// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/services/companiesHouseLookupLimit.test.js

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

const mockIncrementRateCounter = vi.fn();
vi.mock("@app/data/dynamoDbSecurityStateRepository.js", () => ({
  incrementRateCounter: (...args) => mockIncrementRateCounter(...args),
}));
vi.mock("@app/services/subHasher.js", () => ({ hashSub: (sub) => `hashed_${sub}` }));
const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
vi.mock("@app/lib/logger.js", async (importOriginal) => ({ ...(await importOriginal()), createLogger: () => mockLogger }));

const {
  publicLookupBudgetSpent,
  PUBLIC_LOOKUP_CALLS,
  PUBLIC_LOOKUP_CALLS_PER_WINDOW,
  lookupLimitReached,
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

  test("charges the lookup to the budget of all signed-in lookups under one fixed key for the window", async () => {
    mockIncrementRateCounter.mockResolvedValue(15);
    await lookupLimitReached("user-1", LOOKUP_CALLS.filedAccounts);
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
    expect(await lookupLimitReached("user-1", 1)).toBe(false);
    mockIncrementRateCounter.mockResolvedValueOnce(1).mockResolvedValueOnce(451);
    expect(await lookupLimitReached("user-2", 1)).toBe(true);
  });

  test("logs each refusal by the budget of all as one line with its event name and window", async () => {
    mockLogger.warn.mockClear();
    mockIncrementRateCounter.mockResolvedValueOnce(1).mockResolvedValueOnce(451);
    expect(await lookupLimitReached("user-2", 1)).toBe(true);
    const lines = mockLogger.warn.mock.calls.map(([line]) => line).filter((line) => line.event === "CompaniesHouseLookupBudgetRefused");
    expect(lines).toEqual([expect.objectContaining({ window: Math.floor(Date.now() / 1000 / 300), used: 451 })]);
  });

  test("logs no budget event for a refusal by the account's own share", async () => {
    mockLogger.warn.mockClear();
    mockIncrementRateCounter.mockResolvedValueOnce(LOOKUP_CALLS_PER_ACCOUNT_PER_WINDOW + 1);
    expect(await lookupLimitReached("user-1", 1)).toBe(true);
    expect(mockLogger.warn.mock.calls.some(([line]) => line.event === "CompaniesHouseLookupBudgetRefused")).toBe(false);
  });

  test("a lookup refused for the account's share is not charged to the budget of all", async () => {
    mockIncrementRateCounter.mockResolvedValueOnce(LOOKUP_CALLS_PER_ACCOUNT_PER_WINDOW + 1);
    expect(await lookupLimitReached("user-1", 1)).toBe(true);
    expect(mockIncrementRateCounter).toHaveBeenCalledTimes(1);
  });

  test("applies the budget of all when the account's counter cannot be written, and the reverse", async () => {
    mockIncrementRateCounter.mockRejectedValueOnce(new Error("throttled")).mockResolvedValueOnce(451);
    expect(await lookupLimitReached("user-1", 1)).toBe(true);
    mockIncrementRateCounter.mockResolvedValueOnce(LOOKUP_CALLS_PER_ACCOUNT_PER_WINDOW + 1);
    expect(await lookupLimitReached("user-1", 1)).toBe(true);
    mockIncrementRateCounter.mockResolvedValueOnce(1).mockRejectedValueOnce(new Error("throttled"));
    expect(await lookupLimitReached("user-1", 1)).toBe(false);
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

  test("answers a JSON 429 with a Retry-After of the seconds left in the five-minute window", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(300 * 1000 * 5_000_000 + 100 * 1000));
      const response = lookupLimitResponse({}, { "Content-Type": "application/json" });
      expect(response.statusCode).toBe(429);
      expect(response.headers["Retry-After"]).toBe("200");
      expect(JSON.parse(response.body).message).toBe("Too many Companies House lookups just now. Try again in a few minutes.");
    } finally {
      vi.useRealTimers();
    }
  });

  test("answers a Retry-After of at least one second at the end of the window, and the whole window at its start", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(300 * 1000 * 5_000_001 - 200));
      expect(lookupLimitResponse({}, {}).headers["Retry-After"]).toBe("1");
      vi.setSystemTime(new Date(300 * 1000 * 5_000_001));
      expect(lookupLimitResponse({}, {}).headers["Retry-After"]).toBe("300");
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
    expect(await publicLookupBudgetSpent(PUBLIC_LOOKUP_CALLS.register)).toBe(false);
    expect(mockIncrementRateCounter).toHaveBeenCalledWith({
      namespace: "chlookup",
      identifier: "all-public-lookups",
      minute: Math.floor(Date.now() / 1000 / 300),
      hits: 5,
    });
  });

  test("is spent once public lookups pass their budget, which leaves the signed-in budget and the filings their calls", async () => {
    mockIncrementRateCounter.mockResolvedValue(PUBLIC_LOOKUP_CALLS_PER_WINDOW + 1);
    expect(await publicLookupBudgetSpent(PUBLIC_LOOKUP_CALLS.deadlines)).toBe(true);
    expect(PUBLIC_LOOKUP_CALLS_PER_WINDOW + LOOKUP_CALLS_FOR_ALL_ACCOUNTS_PER_WINDOW).toBeLessThan(600);
  });

  test("does not apply where the security state table is not configured, or the counter cannot be written", async () => {
    mockIncrementRateCounter.mockRejectedValue(new Error("throttled"));
    expect(await publicLookupBudgetSpent(1)).toBe(false);
    delete process.env.SECURITY_STATE_DYNAMODB_TABLE_NAME;
    expect(await publicLookupBudgetSpent(1)).toBe(false);
    expect(mockIncrementRateCounter).toHaveBeenCalledTimes(1);
  });
});
