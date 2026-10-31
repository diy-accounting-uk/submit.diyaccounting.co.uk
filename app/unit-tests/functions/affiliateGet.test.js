// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, vi, beforeEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { buildEventWithToken, makeIdToken } from "@app/test-helpers/eventBuilders.js";

const mockGetAffiliate = vi.fn();
vi.mock("@app/data/dynamoDbPassRepository.js", () => ({
  getAffiliate: (...args) => mockGetAffiliate(...args),
}));

const mockRefresh = vi.fn();
vi.mock("@app/services/affiliateConnect.js", async (importOriginal) => ({
  ...(await importOriginal()),
  refreshAffiliateAccount: (...args) => mockRefresh(...args),
}));

import { ingestHandler } from "@app/functions/account/affiliateGet.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const operatorEmail = "operator@example.com";
const tokenFor = (email) => makeIdToken("caller-sub", { email });
const referrerHash = "abc123def456";
const eventFor = (token, query) => ({ ...buildEventWithToken(token, null), queryStringParameters: query });

describe("affiliateGet", () => {
  beforeEach(() => {
    mockGetAffiliate.mockReset();
    mockRefresh.mockReset();
    mockGetAffiliate.mockResolvedValue({
      pk: `affiliate#${referrerHash}`,
      tier: "creator",
      state: "applied",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    process.env.PASSES_DYNAMODB_TABLE_NAME = "test-passes";
    process.env.OPERATOR_EMAILS = operatorEmail;
  });

  test("returns 401 without an authorization header", async () => {
    const result = await ingestHandler(eventFor(null, { referrerHash }));
    expect(result.statusCode).toBe(401);
    expect(mockGetAffiliate).not.toHaveBeenCalled();
  });

  test("returns 403 for a customer", async () => {
    const result = await ingestHandler(eventFor(tokenFor("customer@example.com"), { referrerHash }));
    expect(result.statusCode).toBe(403);
    expect(mockGetAffiliate).not.toHaveBeenCalled();
  });

  test("an operator reads the tier and state", async () => {
    const result = await ingestHandler(eventFor(tokenFor(operatorEmail), { referrerHash }));
    expect(result.statusCode).toBe(200);
    expect(mockGetAffiliate).toHaveBeenCalledWith(referrerHash);
    expect(JSON.parse(result.body)).toEqual({
      referrerHash,
      tier: "creator",
      state: "applied",
      updatedAt: "2026-01-01T00:00:00.000Z",
      approvedAt: null,
      hasConnectAccount: false,
      detailsSubmitted: false,
      transfersActive: false,
    });
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  test("an applied affiliate with a Connect account is read from Stripe first", async () => {
    const item = { pk: `affiliate#${referrerHash}`, tier: "casual", state: "applied", stripeAccountId: "acct_1" };
    mockGetAffiliate.mockResolvedValue(item);
    mockRefresh.mockResolvedValue({ ...item, detailsSubmitted: true, transfersActive: false });
    const result = await ingestHandler(eventFor(tokenFor(operatorEmail), { referrerHash }));
    expect(mockRefresh).toHaveBeenCalledWith({ referrerHash, item });
    expect(JSON.parse(result.body)).toMatchObject({ hasConnectAccount: true, detailsSubmitted: true, transfersActive: false });
  });

  test("a Stripe read failure answers the stored values", async () => {
    mockGetAffiliate.mockResolvedValue({ tier: "casual", state: "applied", stripeAccountId: "acct_1" });
    mockRefresh.mockRejectedValue(new Error("stripe down"));
    const result = await ingestHandler(eventFor(tokenFor(operatorEmail), { referrerHash }));
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).detailsSubmitted).toBe(false);
  });

  test("a referrer with no item is a 404", async () => {
    mockGetAffiliate.mockResolvedValue(null);
    const result = await ingestHandler(eventFor(tokenFor(operatorEmail), { referrerHash }));
    expect(result.statusCode).toBe(404);
  });

  test("a missing referrer hash is a 400", async () => {
    const result = await ingestHandler(eventFor(tokenFor(operatorEmail), {}));
    expect(result.statusCode).toBe(400);
    expect(mockGetAffiliate).not.toHaveBeenCalled();
  });
});
