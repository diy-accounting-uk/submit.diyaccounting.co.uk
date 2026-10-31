// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, vi, beforeEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

const mockRecord = vi.fn();
vi.mock("@app/data/dynamoDbPassRepository.js", () => ({
  recordAffiliateAccountStatus: (...args) => mockRecord(...args),
}));

const stripe = { accounts: { retrieve: vi.fn() } };
const mockGetStripeClient = vi.fn();
vi.mock("@app/lib/stripeClient.js", () => ({
  getStripeClient: (...args) => mockGetStripeClient(...args),
}));

import { refreshAffiliateAccount, toAffiliateView } from "@app/services/affiliateConnect.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

describe("services/affiliateConnect", () => {
  beforeEach(() => {
    mockRecord.mockReset();
    stripe.accounts.retrieve.mockReset();
    mockGetStripeClient.mockReset();
    mockGetStripeClient.mockResolvedValue(stripe);
    mockRecord.mockImplementation(async (args) => ({ ...args, tier: "casual", state: "applied", stripeAccountId: "acct_1" }));
  });

  test("records details_submitted and an active transfers capability", async () => {
    stripe.accounts.retrieve.mockResolvedValue({ details_submitted: true, capabilities: { transfers: "active" } });
    const stored = await refreshAffiliateAccount({
      referrerHash: "h1",
      item: { stripeAccountId: "acct_1", stripeTest: false },
      nowIso: "2026-01-01T00:00:00.000Z",
    });
    expect(stripe.accounts.retrieve).toHaveBeenCalledWith("acct_1");
    expect(mockRecord).toHaveBeenCalledWith({
      referrerHash: "h1",
      detailsSubmitted: true,
      transfersActive: true,
      now: "2026-01-01T00:00:00.000Z",
    });
    expect(stored.detailsSubmitted).toBe(true);
  });

  test("a pending transfers capability is not active, and a test-mode item reads with the test key", async () => {
    stripe.accounts.retrieve.mockResolvedValue({ details_submitted: false, capabilities: { transfers: "pending" } });
    await refreshAffiliateAccount({ referrerHash: "h1", item: { stripeAccountId: "acct_1", stripeTest: true } });
    expect(mockGetStripeClient).toHaveBeenCalledWith({ test: true });
    expect(mockRecord.mock.calls[0][0]).toMatchObject({ detailsSubmitted: false, transfersActive: false });
  });

  test("the view names no Connect account id", () => {
    const view = toAffiliateView("h1", { tier: "casual", state: "applied", stripeAccountId: "acct_1", detailsSubmitted: true });
    expect(view).toEqual({
      referrerHash: "h1",
      tier: "casual",
      state: "applied",
      updatedAt: null,
      approvedAt: null,
      hasConnectAccount: true,
      detailsSubmitted: true,
      transfersActive: false,
    });
  });
});
