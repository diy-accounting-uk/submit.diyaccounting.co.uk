// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, vi, beforeEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { buildEventWithToken, makeIdToken } from "@app/test-helpers/eventBuilders.js";

const mockGetPassesByIssuer = vi.fn();
const mockGetPassFigures = vi.fn();
vi.mock("@app/data/dynamoDbPassRepository.js", () => ({
  getPassesByIssuer: (...args) => mockGetPassesByIssuer(...args),
  getPassFigures: (...args) => mockGetPassFigures(...args),
}));

vi.mock("@app/services/subHasher.js", () => ({
  initializeSalt: vi.fn().mockResolvedValue(undefined),
  hashSub: vi.fn((sub) => `hashed_${sub}`),
}));

import { ingestHandler, toPassFigures, toPassTotals } from "@app/functions/account/passMyPassesGet.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const pass = (code, useCount) => ({
  code,
  passTypeId: "digital-pass",
  bundleId: "day-guest",
  validFrom: "2026-01-01T00:00:00.000Z",
  useCount,
});
const stored = (code, newAccounts, filed, subscribers, paidCharges, lastUsed) => ({
  code,
  newAccounts,
  filed,
  subscribers,
  paidCharges,
  lastUsed,
  computedAt: "2026-10-31T02:00:00.000Z",
});

describe("pass figures", () => {
  beforeEach(() => {
    mockGetPassesByIssuer.mockReset();
    mockGetPassFigures.mockReset();
    process.env.PASSES_DYNAMODB_TABLE_NAME = "test-passes";
    process.env.USER_SUB_HASH_SALT = '{"current":"v1","versions":{"v1":"test-salt-for-unit-tests"}}';
  });

  test("a pass with three or more new accounts shows every count", () => {
    expect(toPassFigures(pass("a", 9), stored("a", 3, 2, 1, 4, "2026-10-30T10:00:00.000Z"))).toEqual({
      uses: 9,
      newAccounts: 3,
      filed: 2,
      subscribers: 1,
      paidCharges: 4,
      fewerThanThree: false,
      lastUsed: "2026-10-30T10:00:00.000Z",
      computedAt: "2026-10-31T02:00:00.000Z",
    });
  });

  test("a pass with fewer than three new accounts withholds the counts that could identify people", () => {
    const figures = toPassFigures(pass("a", 2), stored("a", 2, 2, 1, 3, "2026-10-30T10:00:00.000Z"));
    expect(figures).toMatchObject({
      uses: 2,
      newAccounts: null,
      filed: null,
      subscribers: null,
      paidCharges: null,
      fewerThanThree: true,
      lastUsed: "2026-10-30T10:00:00.000Z",
    });
  });

  test("a pass with no figures item yet reads as fewer than three with its live use count", () => {
    expect(toPassFigures(pass("a", 1), undefined)).toMatchObject({
      uses: 1,
      newAccounts: null,
      fewerThanThree: true,
      lastUsed: null,
      computedAt: null,
    });
  });

  test("the totals row shows counts when the new-account total reaches three, though no pass does", () => {
    const passes = [pass("a", 2), pass("b", 2)];
    const byCode = new Map([
      ["a", stored("a", 2, 1, 1, 2, "2026-10-29T10:00:00.000Z")],
      ["b", stored("b", 1, 1, 0, 0, "2026-10-30T10:00:00.000Z")],
    ]);
    expect(toPassTotals(passes, byCode)).toEqual({
      passes: 2,
      uses: 4,
      newAccounts: 3,
      filed: 2,
      subscribers: 1,
      paidCharges: 2,
      fewerThanThree: false,
      lastUsed: "2026-10-30T10:00:00.000Z",
    });
  });

  test("the totals row withholds counts below three new accounts", () => {
    const totals = toPassTotals([pass("a", 1)], new Map([["a", stored("a", 2, 2, 2, 2, null)]]));
    expect(totals).toMatchObject({ uses: 1, newAccounts: null, filed: null, subscribers: null, paidCharges: null, fewerThanThree: true });
  });

  test("the handler returns the figures with each pass and the totals, reading figures by the pass codes", async () => {
    mockGetPassesByIssuer.mockResolvedValue({ items: [pass("a", 4), pass("b", 0)] });
    mockGetPassFigures.mockResolvedValue(new Map([["a", stored("a", 4, 3, 2, 5, "2026-10-30T10:00:00.000Z")]]));

    const result = await ingestHandler(
      buildEventWithToken(makeIdToken("test-user-sub", { email: "user@example.com" }), null, { method: "GET" }),
    );
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);

    expect(mockGetPassFigures).toHaveBeenCalledWith(["a", "b"]);
    expect(body.passes[0].figures).toMatchObject({ uses: 4, newAccounts: 4, filed: 3, subscribers: 2, paidCharges: 5 });
    expect(body.passes[1].figures).toMatchObject({ uses: 0, newAccounts: null, fewerThanThree: true });
    expect(body.totals).toMatchObject({
      passes: 2,
      uses: 4,
      newAccounts: 4,
      filed: 3,
      subscribers: 2,
      paidCharges: 5,
      fewerThanThree: false,
    });
  });
});
