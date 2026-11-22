// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/services/revisedAccountsRegister.test.js

import { describe, test, beforeEach, afterEach, expect, vi } from "vitest";

const mockFilingHistory = vi.fn();
vi.mock("@app/services/companiesHouseApi.js", async (importOriginal) => ({
  ...(await importOriginal()),
  companiesHouseFilingHistory: (...args) => mockFilingHistory(...args),
}));

// The security state table that holds each account's share of the API key and the stop a Companies
// House 429 sets, as a map of counters and a map of values.
const counters = new Map();
const cachedValues = new Map();
vi.mock("@app/data/dynamoDbSecurityStateRepository.js", () => ({
  incrementRateCounter: async ({ identifier, minute, hits }) => {
    const key = `${identifier}|${minute}`;
    counters.set(key, (counters.get(key) || 0) + hits);
    return counters.get(key);
  },
  getCachedValue: async (key) => cachedValues.get(key),
  putCachedValue: async (key, value) => cachedValues.set(key, value),
}));
vi.mock("@app/services/subHasher.js", () => ({ hashSub: (sub) => `hashed-${sub}` }));

import { refuseRevisionWithNothingToReplace } from "@app/services/revisedAccountsRegister.js";

const FILING = {
  request: "POST /api/v1/companies-house/accounts",
  headers: {},
  userSub: "user-1",
  companyNumber: "00000001",
  periodEnd: "2025-12-31",
};

function history(items) {
  return { ok: true, status: 200, data: { items, totalCount: items.length, truncated: false } };
}

const bodyOf = (response) => JSON.parse(response.body);

describe("the register check of revised accounts that name no receipt", () => {
  const gatewayTestBefore = process.env.COMPANIES_HOUSE_GATEWAY_TEST;

  beforeEach(() => {
    vi.clearAllMocks();
    counters.clear();
    cachedValues.clear();
    process.env.SECURITY_STATE_DYNAMODB_TABLE_NAME = "test-security-state-table";
    delete process.env.COMPANIES_HOUSE_GATEWAY_TEST;
  });

  afterEach(() => {
    if (gatewayTestBefore === undefined) delete process.env.COMPANIES_HOUSE_GATEWAY_TEST;
    else process.env.COMPANIES_HOUSE_GATEWAY_TEST = gatewayTestBefore;
  });

  test("passes accounts and amended accounts made up to the period's end", async () => {
    for (const type of ["AA", "AAMD"]) {
      mockFilingHistory.mockResolvedValue(history([{ type, description_values: { made_up_date: "2025-12-31" } }]));
      expect(await refuseRevisionWithNothingToReplace(FILING)).toBeUndefined();
    }
    expect(mockFilingHistory).toHaveBeenCalledWith("00000001", { category: "accounts" });
  });

  test("refuses when the only filing made up to the period's end is not a set of accounts", async () => {
    mockFilingHistory.mockResolvedValue(
      history([
        { type: "AA01", description_values: { made_up_date: "2025-12-31" } },
        { type: "AA", description_values: { made_up_date: "2024-12-31" } },
        { type: "AA" },
      ]),
    );
    const response = await refuseRevisionWithNothingToReplace(FILING);
    expect(response.statusCode).toBe(400);
    expect(bodyOf(response)).toMatchObject({ reason: "revision-period-not-on-register", periodEnd: "2025-12-31" });
  });

  test("refuses a company the register answers 404 for", async () => {
    mockFilingHistory.mockResolvedValue({ ok: false, status: 404, data: {} });
    const response = await refuseRevisionWithNothingToReplace(FILING);
    expect(response.statusCode).toBe(400);
    expect(bodyOf(response)).toMatchObject({ reason: "revision-company-not-on-register", companyNumber: "00000001" });
  });

  test.each([
    [429, 429],
    [504, 504],
    [502, 502],
    [401, 500],
    [500, 500],
  ])("answers a JSON error, never a pass, when the register read fails with %i", async (status, answered) => {
    mockFilingHistory.mockResolvedValue({ ok: false, status, data: {}, headers: {} });
    const response = await refuseRevisionWithNothingToReplace(FILING);
    expect(response.statusCode).toBe(answered);
    expect(() => bodyOf(response)).not.toThrow();
  });

  test("answers a JSON 502 with a reason, never a pass, when the register read cannot be made at all", async () => {
    mockFilingHistory.mockRejectedValue(new Error("Missing required environment variable COMPANIES_HOUSE_BASE_URI"));
    const response = await refuseRevisionWithNothingToReplace(FILING);
    expect(response.statusCode).toBe(502);
    expect(bodyOf(response)).toMatchObject({ reason: "revision-register-not-read" });
    expect(response.body).not.toContain("COMPANIES_HOUSE_BASE_URI");
  });

  test("charges the read to the account's share of the API key, and refuses with no read once the share is spent", async () => {
    mockFilingHistory.mockResolvedValue(history([{ type: "AA", description_values: { made_up_date: "2025-12-31" } }]));
    for (let read = 0; read < 30; read += 1) expect(await refuseRevisionWithNothingToReplace(FILING)).toBeUndefined();
    expect([...counters.entries()].filter(([key]) => key.startsWith("hashed-user-1|"))).toEqual([[expect.any(String), 150]]);

    const response = await refuseRevisionWithNothingToReplace(FILING);

    expect(response.statusCode).toBe(429);
    expect(Number(response.headers["Retry-After"])).toBeGreaterThan(0);
    expect(() => bodyOf(response)).not.toThrow();
    expect(mockFilingHistory).toHaveBeenCalledTimes(30);
    expect(await refuseRevisionWithNothingToReplace({ ...FILING, userSub: "user-2" })).toBeUndefined();
  });

  test("a 429 from Companies House sets the stop every lookup reads, and the next revision is refused with no read", async () => {
    mockFilingHistory.mockResolvedValue({ ok: false, status: 429, data: {}, headers: { "retry-after": "30" } });
    expect((await refuseRevisionWithNothingToReplace(FILING)).statusCode).toBe(429);
    expect(cachedValues.get("chlookup#stopped").until).toBeGreaterThan(Date.now());

    const response = await refuseRevisionWithNothingToReplace({ ...FILING, userSub: "user-2" });

    expect(response.statusCode).toBe(429);
    expect(Number(response.headers["Retry-After"])).toBeGreaterThan(0);
    expect(mockFilingHistory).toHaveBeenCalledTimes(1);
  });

  test("reads nothing and refuses nothing where the envelope goes to the test service", async () => {
    process.env.COMPANIES_HOUSE_GATEWAY_TEST = "true";
    expect(await refuseRevisionWithNothingToReplace(FILING)).toBeUndefined();
    expect(mockFilingHistory).not.toHaveBeenCalled();
  });

  test.each(["false", "TRUE", "1", ""])("checks the register when the gateway setting is %j", async (setting) => {
    process.env.COMPANIES_HOUSE_GATEWAY_TEST = setting;
    mockFilingHistory.mockResolvedValue(history([]));
    expect((await refuseRevisionWithNothingToReplace(FILING)).statusCode).toBe(400);
  });
});
