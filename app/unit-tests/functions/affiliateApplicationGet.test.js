// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, vi, beforeEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { buildEventWithToken, makeIdToken } from "@app/test-helpers/eventBuilders.js";

const mockGetAffiliate = vi.fn();
const mockGetFamilyAffiliate = vi.fn();
vi.mock("@app/data/dynamoDbPassRepository.js", () => ({
  getAffiliate: (...args) => mockGetAffiliate(...args),
  getFamilyAffiliate: (...args) => mockGetFamilyAffiliate(...args),
}));

vi.mock("@app/services/subHasher.js", () => ({
  initializeSalt: vi.fn().mockResolvedValue(undefined),
  hashSub: (sub) => `hash-of-${sub}`,
}));

const mockRefresh = vi.fn();
vi.mock("@app/services/affiliateConnect.js", async (importOriginal) => ({
  ...(await importOriginal()),
  refreshAffiliateAccount: (...args) => mockRefresh(...args),
}));

import { ingestHandler } from "@app/functions/account/affiliateApplicationGet.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const token = makeIdToken("applicant-sub", { email: "a@example.com" });
const applied = { state: "applied", tier: "casual", stripeAccountId: "acct_1", detailsSubmitted: false, transfersActive: false };

const customerTerms = {
  tier: "customer",
  name: "Customer",
  form: "credit",
  payout: "customer-balance",
  rateBps: 3300,
  months: 3,
  annualRateBps: null,
};

describe("affiliateApplicationGet", () => {
  beforeEach(() => {
    mockGetAffiliate.mockReset();
    mockRefresh.mockReset();
    mockGetFamilyAffiliate.mockReset().mockResolvedValue(null);
    process.env.PASSES_DYNAMODB_TABLE_NAME = "test-passes";
  });

  test("returns 401 without an authorization header", async () => {
    const result = await ingestHandler(buildEventWithToken(null, null));
    expect(result.statusCode).toBe(401);
  });

  test("a caller who never applied gets state null", async () => {
    mockGetAffiliate.mockResolvedValue(null);
    const result = await ingestHandler(buildEventWithToken(token, null));
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ state: null, configDriven: false, terms: customerTerms });
    expect(mockGetAffiliate).toHaveBeenCalledWith("hash-of-applicant-sub");
  });

  test("an applied account is read from Stripe and the stored result answered", async () => {
    mockGetAffiliate.mockResolvedValue(applied);
    mockRefresh.mockResolvedValue({ ...applied, detailsSubmitted: true, transfersActive: true });
    const result = await ingestHandler(buildEventWithToken(token, null));
    expect(mockRefresh).toHaveBeenCalledWith({ referrerHash: "hash-of-applicant-sub", item: applied });
    expect(JSON.parse(result.body)).toEqual({
      tier: "casual",
      state: "applied",
      configDriven: false,
      updatedAt: null,
      approvedAt: null,
      hasConnectAccount: true,
      detailsSubmitted: true,
      transfersActive: true,
      terms: customerTerms,
    });
  });

  test("a Stripe read failure answers the stored values", async () => {
    mockGetAffiliate.mockResolvedValue(applied);
    mockRefresh.mockRejectedValue(new Error("stripe down"));
    const result = await ingestHandler(buildEventWithToken(token, null));
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).detailsSubmitted).toBe(false);
  });

  test("an approved affiliate with transfers active is not read from Stripe", async () => {
    mockGetAffiliate.mockResolvedValue({ ...applied, state: "approved", detailsSubmitted: true, transfersActive: true });
    const result = await ingestHandler(buildEventWithToken(token, null));
    expect(mockRefresh).not.toHaveBeenCalled();
    expect(JSON.parse(result.body).state).toBe("approved");
  });

  test("an approved affiliate whose transfers are not yet active is read from Stripe", async () => {
    const approved = { ...applied, state: "approved", detailsSubmitted: true };
    mockGetAffiliate.mockResolvedValue(approved);
    mockRefresh.mockResolvedValue({ ...approved, transfersActive: true });
    const result = await ingestHandler(buildEventWithToken(token, null));
    expect(mockRefresh).toHaveBeenCalledWith({ referrerHash: "hash-of-applicant-sub", item: approved });
    expect(JSON.parse(result.body).transfersActive).toBe(true);
  });

  test("an ended affiliate is not read from Stripe", async () => {
    mockGetAffiliate.mockResolvedValue({ ...applied, state: "ended" });
    await ingestHandler(buildEventWithToken(token, null));
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  test("an approved casual affiliate gets the casual terms with the annual rate", async () => {
    mockGetAffiliate.mockResolvedValue({ ...applied, state: "approved", detailsSubmitted: true, transfersActive: true });
    const result = await ingestHandler(buildEventWithToken(token, null));
    expect(JSON.parse(result.body).terms).toEqual({
      tier: "casual",
      name: "Casual affiliate",
      form: "cash",
      payout: "connect",
      rateBps: 3300,
      months: 3,
      annualRateBps: 2500,
    });
  });

  test("a family affiliate with no affiliate item gets the family terms", async () => {
    mockGetAffiliate.mockResolvedValue(null);
    mockGetFamilyAffiliate.mockResolvedValue({ pk: "family#hash-of-applicant-sub" });
    const result = await ingestHandler(buildEventWithToken(token, null));
    expect(JSON.parse(result.body)).toEqual({
      state: null,
      configDriven: true,
      terms: {
        tier: "family",
        name: "Family",
        form: "cash",
        payout: "bank-transfer",
        rateBps: 10000,
        months: 1,
        annualRateBps: 2500,
      },
    });
  });

  test("an applicant not yet approved gets the customer terms", async () => {
    mockGetAffiliate.mockResolvedValue(applied);
    mockRefresh.mockResolvedValue(applied);
    const result = await ingestHandler(buildEventWithToken(token, null));
    expect(JSON.parse(result.body).terms).toEqual(customerTerms);
  });

  test("a storage failure is a 500", async () => {
    mockGetAffiliate.mockRejectedValue(new Error("boom"));
    const result = await ingestHandler(buildEventWithToken(token, null));
    expect(result.statusCode).toBe(500);
  });
});
