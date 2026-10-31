// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, vi, beforeEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { buildEventWithToken, makeIdToken } from "@app/test-helpers/eventBuilders.js";

const mockGetAffiliate = vi.fn();
const mockStartApplication = vi.fn();
vi.mock("@app/data/dynamoDbPassRepository.js", () => ({
  getAffiliate: (...args) => mockGetAffiliate(...args),
  startAffiliateApplication: (...args) => mockStartApplication(...args),
}));

vi.mock("@app/services/subHasher.js", () => ({
  initializeSalt: vi.fn().mockResolvedValue(undefined),
  hashSub: (sub) => `hash-of-${sub}`,
}));

const mockPublish = vi.fn().mockResolvedValue({ published: true });
vi.mock("@app/lib/activityAlert.js", () => ({
  publishActivityEvent: (...args) => mockPublish(...args),
}));

const stripe = {
  accounts: { create: vi.fn() },
  accountLinks: { create: vi.fn() },
};
const mockGetStripeClient = vi.fn();
vi.mock("@app/lib/stripeClient.js", () => ({
  getStripeClient: (...args) => mockGetStripeClient(...args),
}));

import { ingestHandler } from "@app/functions/account/affiliateApplicationPost.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const tokenFor = (email) => makeIdToken("applicant-sub", { email });

describe("affiliateApplicationPost", () => {
  beforeEach(() => {
    mockGetAffiliate.mockReset();
    mockStartApplication.mockReset();
    mockPublish.mockClear();
    mockGetStripeClient.mockReset();
    mockGetStripeClient.mockResolvedValue(stripe);
    stripe.accounts.create.mockReset();
    stripe.accountLinks.create.mockReset();
    stripe.accounts.create.mockResolvedValue({ id: "acct_new" });
    stripe.accountLinks.create.mockResolvedValue({ url: "https://connect.stripe.com/setup/e/acct_new" });
    mockStartApplication.mockResolvedValue(true);
    process.env.PASSES_DYNAMODB_TABLE_NAME = "test-passes";
    process.env.DIY_SUBMIT_BASE_URL = "https://submit.example.test/";
  });

  test("returns 401 without an authorization header", async () => {
    const result = await ingestHandler(buildEventWithToken(null, null));
    expect(result.statusCode).toBe(401);
    expect(stripe.accounts.create).not.toHaveBeenCalled();
  });

  test("a first application creates a UK Connect account asking only for transfers", async () => {
    mockGetAffiliate.mockResolvedValueOnce(null).mockResolvedValueOnce({
      state: "applied",
      tier: "casual",
      stripeAccountId: "acct_new",
    });
    const result = await ingestHandler(buildEventWithToken(tokenFor("a@example.com"), null));
    expect(result.statusCode).toBe(200);
    expect(stripe.accounts.create).toHaveBeenCalledWith({
      country: "GB",
      controller: {
        stripe_dashboard: { type: "express" },
        fees: { payer: "application" },
        losses: { payments: "application" },
        requirement_collection: "stripe",
      },
      capabilities: { transfers: { requested: true } },
      business_profile: { product_description: expect.stringContaining("DIY Accounting Submit") },
      metadata: { referrerHash: "hash-of-applicant-sub" },
    });
    expect(mockStartApplication).toHaveBeenCalledWith({
      referrerHash: "hash-of-applicant-sub",
      tier: "casual",
      stripeAccountId: "acct_new",
      stripeTest: false,
      now: expect.any(String),
    });
    expect(stripe.accountLinks.create).toHaveBeenCalledWith({
      account: "acct_new",
      type: "account_onboarding",
      return_url: "https://submit.example.test/bundles.html?affiliate=return#affiliateApplySection",
      refresh_url: "https://submit.example.test/bundles.html?affiliate=refresh#affiliateApplySection",
    });
    expect(JSON.parse(result.body)).toEqual({ state: "applied", url: "https://connect.stripe.com/setup/e/acct_new" });
    expect(mockPublish).toHaveBeenCalledOnce();
  });

  test("a synthetic test user gets a test-mode account", async () => {
    mockGetAffiliate.mockResolvedValueOnce(null).mockResolvedValueOnce({ state: "applied", stripeAccountId: "acct_new" });
    await ingestHandler(buildEventWithToken(tokenFor("synthetic-local@test.diyaccounting.co.uk"), null));
    expect(mockGetStripeClient).toHaveBeenCalledWith({ test: true });
    expect(mockStartApplication.mock.calls[0][0].stripeTest).toBe(true);
  });

  test("a returning applicant gets a new link on the account they already have", async () => {
    mockGetAffiliate.mockResolvedValue({ state: "applied", tier: "casual", stripeAccountId: "acct_old", stripeTest: false });
    const result = await ingestHandler(buildEventWithToken(tokenFor("a@example.com"), null));
    expect(result.statusCode).toBe(200);
    expect(stripe.accounts.create).not.toHaveBeenCalled();
    expect(mockStartApplication).not.toHaveBeenCalled();
    expect(stripe.accountLinks.create.mock.calls[0][0].account).toBe("acct_old");
    expect(mockPublish).not.toHaveBeenCalled();
  });

  test("a lost race keeps the account already stored", async () => {
    mockStartApplication.mockResolvedValue(false);
    mockGetAffiliate.mockResolvedValueOnce(null).mockResolvedValueOnce({ state: "applied", stripeAccountId: "acct_winner" });
    const result = await ingestHandler(buildEventWithToken(tokenFor("a@example.com"), null));
    expect(result.statusCode).toBe(200);
    expect(stripe.accountLinks.create.mock.calls[0][0].account).toBe("acct_winner");
    expect(mockPublish).not.toHaveBeenCalled();
  });

  test.each(["approved", "ended"])("an affiliate in the state %s is a 409 and creates nothing", async (state) => {
    mockGetAffiliate.mockResolvedValue({ state, stripeAccountId: "acct_old" });
    const result = await ingestHandler(buildEventWithToken(tokenFor("a@example.com"), null));
    expect(result.statusCode).toBe(409);
    expect(stripe.accountLinks.create).not.toHaveBeenCalled();
  });

  test("a Stripe failure is a 500 with a JSON body", async () => {
    mockGetAffiliate.mockResolvedValue(null);
    stripe.accounts.create.mockRejectedValue(new Error("stripe down"));
    const result = await ingestHandler(buildEventWithToken(tokenFor("a@example.com"), null));
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toBe("Failed to start the affiliate application");
  });
});
