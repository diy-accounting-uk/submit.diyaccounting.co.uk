// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, vi, beforeEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { buildEventWithToken, makeIdToken, buildLambdaEvent } from "@app/test-helpers/eventBuilders.js";

const mockQueryLinesByReferrer = vi.fn();
vi.mock("@app/data/dynamoDbCommissionRepository.js", () => ({
  queryLinesByReferrer: (...args) => mockQueryLinesByReferrer(...args),
}));

vi.mock("@app/services/subHasher.js", () => ({
  initializeSalt: vi.fn().mockResolvedValue(undefined),
  hashSub: vi.fn((sub) => `hashed_${sub}`),
}));

import { ingestHandler, toCommissionTotals } from "@app/functions/account/commissionMineGet.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const validToken = makeIdToken("referrer-sub", { email: "referrer@example.com" });

describe("commissionMineGet", () => {
  beforeEach(() => {
    mockQueryLinesByReferrer.mockReset();
    process.env.COMMISSIONS_DYNAMODB_TABLE_NAME = "test-commissions";
  });

  test("returns 403 without an authorization header", async () => {
    const result = await ingestHandler(buildLambdaEvent({ method: "GET", headers: {} }));
    expect(result.statusCode).toBe(403);
    expect(mockQueryLinesByReferrer).not.toHaveBeenCalled();
  });

  test("reads only the caller's own lines and returns totals", async () => {
    mockQueryLinesByReferrer.mockResolvedValue([{ state: "held", amountPence: 300, releaseAt: "2026-12-01T10:00:00.000Z" }]);
    const result = await ingestHandler(buildEventWithToken(validToken, null, { method: "GET" }));
    expect(result.statusCode).toBe(200);
    expect(mockQueryLinesByReferrer).toHaveBeenCalledWith("hashed_referrer-sub");
    const body = JSON.parse(result.body);
    expect(body.held).toEqual({ totalPence: 300, releases: [{ releaseDate: "2026-12-01", amountPence: 300 }] });
    expect(body.payable).toEqual({ totalPence: 0 });
    expect(body.paid).toEqual({ totalPence: 0 });
  });

  test("returns a JSON 500 when the read fails", async () => {
    mockQueryLinesByReferrer.mockRejectedValue(new Error("boom"));
    const result = await ingestHandler(buildEventWithToken(validToken, null, { method: "GET" }));
    expect(result.statusCode).toBe(500);
    expect(() => JSON.parse(result.body)).not.toThrow();
  });
});

describe("toCommissionTotals", () => {
  test("groups held lines by release day, oldest first", () => {
    const totals = toCommissionTotals([
      { state: "held", amountPence: 100, releaseAt: "2026-12-05T01:00:00.000Z" },
      { state: "held", amountPence: 250, releaseAt: "2026-12-01T09:00:00.000Z" },
      { state: "held", amountPence: 50, releaseAt: "2026-12-01T23:00:00.000Z" },
    ]);
    expect(totals.held).toEqual({
      totalPence: 400,
      releases: [
        { releaseDate: "2026-12-01", amountPence: 300 },
        { releaseDate: "2026-12-05", amountPence: 100 },
      ],
    });
  });

  test("a negative reversal line lowers payable and a reversed line counts nowhere", () => {
    const totals = toCommissionTotals([
      { state: "payable", amountPence: 500 },
      { state: "payable", amountPence: -200 },
      { state: "paid", amountPence: 900 },
      { state: "reversed", amountPence: 700 },
    ]);
    expect(totals.payable.totalPence).toBe(300);
    expect(totals.paid.totalPence).toBe(900);
    expect(totals.held.totalPence).toBe(0);
  });

  test("returns zero totals for a referrer with no lines", () => {
    expect(toCommissionTotals([])).toEqual({ held: { totalPence: 0, releases: [] }, payable: { totalPence: 0 }, paid: { totalPence: 0 } });
  });
});
