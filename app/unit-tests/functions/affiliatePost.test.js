// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, vi, beforeEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { buildEventWithToken, makeIdToken } from "@app/test-helpers/eventBuilders.js";

const mockPutAffiliate = vi.fn();
const mockGetAffiliate = vi.fn();
vi.mock("@app/data/dynamoDbPassRepository.js", () => ({
  putAffiliate: (...args) => mockPutAffiliate(...args),
  getAffiliate: (...args) => mockGetAffiliate(...args),
}));

const mockRefresh = vi.fn();
vi.mock("@app/services/affiliateConnect.js", () => ({
  refreshAffiliateAccount: (...args) => mockRefresh(...args),
}));

import { ingestHandler } from "@app/functions/account/affiliatePost.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const operatorEmail = "operator@example.com";
const tokenFor = (email) => makeIdToken("caller-sub", { email });
const referrerHash = "abc123def456";

describe("affiliatePost", () => {
  beforeEach(() => {
    mockPutAffiliate.mockReset();
    mockGetAffiliate.mockReset();
    mockRefresh.mockReset();
    mockGetAffiliate.mockResolvedValue({ stripeAccountId: "acct_1", detailsSubmitted: true });
    mockPutAffiliate.mockResolvedValue({
      tier: "casual",
      state: "approved",
      updatedAt: "2026-01-01T00:00:00.000Z",
      approvedAt: "2026-01-01T00:00:00.000Z",
    });
    process.env.PASSES_DYNAMODB_TABLE_NAME = "test-passes";
    process.env.OPERATOR_EMAILS = operatorEmail;
  });

  test("returns 401 and writes nothing without an authorization header", async () => {
    const result = await ingestHandler(buildEventWithToken(null, { referrerHash, tier: "casual", state: "approved" }));
    expect(result.statusCode).toBe(401);
    expect(mockPutAffiliate).not.toHaveBeenCalled();
  });

  test("returns 403 and writes nothing for a customer", async () => {
    const result = await ingestHandler(
      buildEventWithToken(tokenFor("customer@example.com"), { referrerHash, tier: "casual", state: "approved" }),
    );
    expect(result.statusCode).toBe(403);
    expect(mockPutAffiliate).not.toHaveBeenCalled();
  });

  test("an operator approves a referrer and gets the item back", async () => {
    const result = await ingestHandler(buildEventWithToken(tokenFor(operatorEmail), { referrerHash, tier: "casual", state: "approved" }));
    expect(result.statusCode).toBe(200);
    expect(mockPutAffiliate).toHaveBeenCalledWith({ referrerHash, tier: "casual", state: "approved", now: expect.any(String) });
    expect(JSON.parse(result.body)).toEqual({
      referrerHash,
      tier: "casual",
      state: "approved",
      updatedAt: "2026-01-01T00:00:00.000Z",
      approvedAt: "2026-01-01T00:00:00.000Z",
    });
  });

  test("an unknown tier is a 400", async () => {
    const result = await ingestHandler(buildEventWithToken(tokenFor(operatorEmail), { referrerHash, tier: "gold", state: "approved" }));
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toContain("customer, casual, creator, family");
    expect(mockPutAffiliate).not.toHaveBeenCalled();
  });

  test("an unknown state is a 400", async () => {
    const result = await ingestHandler(buildEventWithToken(tokenFor(operatorEmail), { referrerHash, tier: "casual", state: "paused" }));
    expect(result.statusCode).toBe(400);
    expect(mockPutAffiliate).not.toHaveBeenCalled();
  });

  test("a missing or malformed referrer hash is a 400", async () => {
    for (const bad of [undefined, "", "has space", "a".repeat(129)]) {
      const result = await ingestHandler(
        buildEventWithToken(tokenFor(operatorEmail), { referrerHash: bad, tier: "casual", state: "applied" }),
      );
      expect(result.statusCode).toBe(400);
    }
    expect(mockPutAffiliate).not.toHaveBeenCalled();
  });

  test("a write failure is a 500", async () => {
    mockPutAffiliate.mockRejectedValue(new Error("boom"));
    const result = await ingestHandler(buildEventWithToken(tokenFor(operatorEmail), { referrerHash, tier: "casual", state: "ended" }));
    expect(result.statusCode).toBe(500);
  });

  test("approving a Connect tier without a Connect account is a 409 and writes nothing", async () => {
    mockGetAffiliate.mockResolvedValue(null);
    const result = await ingestHandler(buildEventWithToken(tokenFor(operatorEmail), { referrerHash, tier: "casual", state: "approved" }));
    expect(result.statusCode).toBe(409);
    expect(mockPutAffiliate).not.toHaveBeenCalled();
  });

  test("approving reads the account from Stripe when the stored flag is false, and refuses if Stripe agrees", async () => {
    const item = { stripeAccountId: "acct_1", detailsSubmitted: false };
    mockGetAffiliate.mockResolvedValue(item);
    mockRefresh.mockResolvedValue(item);
    const refused = await ingestHandler(buildEventWithToken(tokenFor(operatorEmail), { referrerHash, tier: "creator", state: "approved" }));
    expect(mockRefresh).toHaveBeenCalledWith({ referrerHash, item });
    expect(refused.statusCode).toBe(409);
    expect(mockPutAffiliate).not.toHaveBeenCalled();

    mockRefresh.mockResolvedValue({ ...item, detailsSubmitted: true });
    const approved = await ingestHandler(
      buildEventWithToken(tokenFor(operatorEmail), { referrerHash, tier: "creator", state: "approved" }),
    );
    expect(approved.statusCode).toBe(200);
    expect(mockPutAffiliate).toHaveBeenCalledOnce();
  });

  test("ending needs no Connect account", async () => {
    mockGetAffiliate.mockResolvedValue(null);
    const result = await ingestHandler(buildEventWithToken(tokenFor(operatorEmail), { referrerHash, tier: "casual", state: "ended" }));
    expect(result.statusCode).toBe(200);
    expect(mockGetAffiliate).not.toHaveBeenCalled();
  });

  test("approving a tier paid by another route needs no Connect account", async () => {
    mockGetAffiliate.mockResolvedValue(null);
    const result = await ingestHandler(buildEventWithToken(tokenFor(operatorEmail), { referrerHash, tier: "family", state: "approved" }));
    expect(result.statusCode).toBe(200);
  });
});
