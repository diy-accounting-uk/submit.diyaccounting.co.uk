// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { buildEventWithToken, makeIdToken } from "@app/test-helpers/eventBuilders.js";

// Mock passService
const mockRedeemPass = vi.fn();
const mockCheckPass = vi.fn();
const mockGetPassRecord = vi.fn();
const mockClaimReferral = vi.fn();
const mockGetRedemption = vi.fn();
const mockReleaseReferral = vi.fn();
const mockRecordRedemption = vi.fn();
vi.mock("@app/services/passService.js", () => ({
  redeemPass: (...args) => mockRedeemPass(...args),
  checkPass: (...args) => mockCheckPass(...args),
  getPassRecord: (...args) => mockGetPassRecord(...args),
  claimReferral: (...args) => mockClaimReferral(...args),
  getRedemption: (...args) => mockGetRedemption(...args),
  releaseReferral: (...args) => mockReleaseReferral(...args),
  recordRedemption: (...args) => mockRecordRedemption(...args),
}));

// Mock subHasher
vi.mock("@app/services/subHasher.js", () => ({
  initializeSalt: vi.fn().mockResolvedValue(undefined),
  hashSub: vi.fn((sub) => `hashed_${sub}`),
  isSaltInitialized: vi.fn(() => true),
}));

// Mock EventBridge, capturing sent events so activity-event tests can inspect the Detail JSON.
const mockEventBridgeSend = vi.fn().mockResolvedValue({});
vi.mock("@aws-sdk/client-eventbridge", () => ({
  EventBridgeClient: class {
    send(...args) {
      return mockEventBridgeSend(...args);
    }
  },
  PutEventsCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
}));

// Mock grantBundle
const mockGrantBundle = vi.fn();
vi.mock("@app/functions/account/bundlePost.js", () => ({
  grantBundle: (...args) => mockGrantBundle(...args),
}));

// Mock the catalogue lookup so the "on-pass-on-subscription" branch is exercised against a
// fixed synthetic bundle, independent of whichever real bundle in the live catalogue carries
// that allocation today.
vi.mock("@app/services/productCatalog.js", () => ({
  loadCatalogFromRoot: () => ({
    bundles: [{ id: "test-subscription-bundle", allocation: "on-pass-on-subscription" }],
  }),
}));

const mockGetUserBundles = vi.fn();
vi.mock("@app/data/dynamoDbBundleRepository.js", () => ({
  getUserBundles: (...args) => mockGetUserBundles(...args),
}));

const mockRequestCustomerEmail = vi.fn();
vi.mock("@app/lib/customerEmailRequest.js", () => ({
  requestCustomerEmail: (...args) => mockRequestCustomerEmail(...args),
}));

import { ingestHandler } from "@app/functions/account/passPost.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

describe("passPost", () => {
  const validToken = makeIdToken("test-user-sub", { email: "user@example.com" });

  beforeEach(() => {
    mockRedeemPass.mockReset();
    mockCheckPass.mockReset();
    mockCheckPass.mockResolvedValue({ valid: true });
    mockGetPassRecord.mockReset();
    mockGetPassRecord.mockResolvedValue({ code: "test-pass-code", passTypeId: "day-guest-pass" });
    mockClaimReferral.mockReset();
    mockClaimReferral.mockResolvedValue(true);
    mockGetRedemption.mockReset();
    mockGetRedemption.mockResolvedValue(null);
    mockReleaseReferral.mockReset();
    mockRecordRedemption.mockReset();
    mockGetUserBundles.mockReset();
    mockGetUserBundles.mockResolvedValue([]);
    mockGrantBundle.mockReset();
    mockGrantBundle.mockResolvedValue({ status: "granted", expiry: "2026-03-01T00:00:00.000Z" });
    mockEventBridgeSend.mockClear();
    process.env.PASSES_DYNAMODB_TABLE_NAME = "test-passes";
    process.env.BUNDLE_DYNAMODB_TABLE_NAME = "test-bundles";
    process.env.USER_SUB_HASH_SALT = '{"current":"v1","versions":{"v1":"test-salt-for-unit-tests"}}';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("returns 401 when no authorization header", async () => {
    const event = buildEventWithToken(null, { code: "test-pass-code" });
    const result = await ingestHandler(event);
    expect(result.statusCode).toBe(401);
  });

  test("returns 400 when code is missing", async () => {
    const event = buildEventWithToken(validToken, {});
    const result = await ingestHandler(event);
    expect(result.statusCode).toBe(400);
  });

  test("returns requiresSubscription for on-pass-on-subscription bundles", async () => {
    mockRedeemPass.mockResolvedValue({
      valid: true,
      bundleId: "test-subscription-bundle",
      pass: { testPass: false },
    });

    const event = buildEventWithToken(validToken, { code: "test-pass-code" });
    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.redeemed).toBe(false);
    expect(body.valid).toBe(true);
    expect(body.requiresSubscription).toBe(true);
    expect(body.bundleId).toBe("test-subscription-bundle");
    expect(body.testPass).toBe(false);
    // Should NOT have called grantBundle
    expect(mockGrantBundle).not.toHaveBeenCalled();
  });

  test("returns testPass true in requiresSubscription response for test passes", async () => {
    mockRedeemPass.mockResolvedValue({
      valid: true,
      bundleId: "test-subscription-bundle",
      pass: { testPass: true },
    });

    const event = buildEventWithToken(validToken, { code: "test-pass-code" });
    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.redeemed).toBe(false);
    expect(body.valid).toBe(true);
    expect(body.requiresSubscription).toBe(true);
    expect(body.testPass).toBe(true);
    expect(mockGrantBundle).not.toHaveBeenCalled();
  });

  test("grants bundle for non-subscription bundles", async () => {
    mockRedeemPass.mockResolvedValue({
      valid: true,
      bundleId: "day-guest",
      pass: { testPass: false },
    });

    const event = buildEventWithToken(validToken, { code: "test-pass-code" });
    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.redeemed).toBe(true);
    expect(body.bundleId).toBe("day-guest");
    expect(body.testPass).toBe(false);
    expect(mockGrantBundle).toHaveBeenCalledTimes(1);
    expect(mockGrantBundle.mock.calls[0][4]).toMatchObject({ viaPass: true });
  });

  test("returns testPass true in redeemed response for test passes", async () => {
    mockRedeemPass.mockResolvedValue({
      valid: true,
      bundleId: "day-guest",
      pass: { testPass: true },
    });

    const event = buildEventWithToken(validToken, { code: "test-pass-code" });
    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.redeemed).toBe(true);
    expect(body.testPass).toBe(true);
  });

  test("returns error reason for invalid pass", async () => {
    mockRedeemPass.mockResolvedValue({
      valid: false,
      reason: "not_found",
    });

    const event = buildEventWithToken(validToken, { code: "invalid-code" });
    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.redeemed).toBe(false);
    expect(body.reason).toBe("not_found");
  });

  test.each(["wrong_email", "email_required"])("a %s refusal answers 200 and grants nothing", async (reason) => {
    mockRedeemPass.mockResolvedValue({ valid: false, reason, pass: { passTypeId: "day-guest-pass" } });

    const result = await ingestHandler(buildEventWithToken(validToken, { code: "test-pass-code" }));

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ redeemed: false, reason });
    expect(mockGrantBundle).not.toHaveBeenCalled();
  });

  test("publishes the pass-redeemed event with the hashed sub, never the raw sub", async () => {
    mockRedeemPass.mockResolvedValue({
      valid: true,
      bundleId: "day-guest",
      pass: { testPass: false },
    });

    const event = buildEventWithToken(validToken, { code: "test-pass-code" });
    await ingestHandler(event);

    expect(mockEventBridgeSend).toHaveBeenCalledTimes(1);
    const rawDetail = mockEventBridgeSend.mock.calls[0][0].input.Entries[0].Detail;
    // Only the hashed form ("hashed_test-user-sub") should appear, never the bare raw sub as its own field value.
    expect(rawDetail).not.toContain('"test-user-sub"');
    const detail = JSON.parse(rawDetail);
    expect(detail.event).toBe("pass-redeemed");
    expect(detail.hashedSub).toBe("hashed_test-user-sub");
  });

  describe("the pass-redeemed event carries the class of the redeeming account", () => {
    async function redeemedActor(email) {
      mockRedeemPass.mockResolvedValue({ valid: true, bundleId: "day-guest", pass: { testPass: false } });
      await ingestHandler(buildEventWithToken(makeIdToken("test-user-sub", { email }), { code: "test-pass-code" }));
      return JSON.parse(mockEventBridgeSend.mock.calls[0][0].input.Entries[0].Detail).actor;
    }

    test("is customer for a customer's email", async () => {
      expect(await redeemedActor("user@example.com")).toBe("customer");
    });

    test("is test-user for a test account's email", async () => {
      expect(await redeemedActor("synthetic-local@test.diyaccounting.co.uk")).toBe("test-user");
    });

    test("is probe for a probe account's email", async () => {
      expect(await redeemedActor("probe-abc@example.com")).toBe("probe");
    });

    test("never publishes the email", async () => {
      await redeemedActor("user@example.com");
      expect(mockEventBridgeSend.mock.calls[0][0].input.Entries[0].Detail).not.toContain("user@example.com");
    });
  });

  describe("refused redemptions are tracked", () => {
    const referralPass = { code: "tiger-happy-mountain-silver", passTypeId: "digital-pass", issuedBy: "hashed_issuer-sub" };

    function refusalDetail() {
      expect(mockEventBridgeSend).toHaveBeenCalledTimes(1);
      return JSON.parse(mockEventBridgeSend.mock.calls[0][0].input.Entries[0].Detail);
    }

    test("an expired pass publishes pass-redeem-refused with the reason, code and pass type", async () => {
      mockGetPassRecord.mockResolvedValue(referralPass);
      mockRedeemPass.mockResolvedValue({ valid: false, reason: "expired", pass: referralPass });

      const result = await ingestHandler(buildEventWithToken(validToken, { code: referralPass.code }));

      expect(JSON.parse(result.body)).toMatchObject({ redeemed: false, reason: "expired" });
      const detail = refusalDetail();
      expect(detail.event).toBe("pass-redeem-refused");
      expect(detail.hashedSub).toBe("hashed_test-user-sub");
      expect(detail.reason).toBe("expired");
      expect(detail.code).toBe(referralPass.code);
      expect(detail.passTypeId).toBe("digital-pass");
    });

    test("a code that is not found publishes the refusal with the reason", async () => {
      mockGetPassRecord.mockResolvedValue(null);
      mockRedeemPass.mockResolvedValue({ valid: false, reason: "not_found" });

      await ingestHandler(buildEventWithToken(validToken, { code: "no-such-code" }));

      const detail = refusalDetail();
      expect(detail.event).toBe("pass-redeem-refused");
      expect(detail.reason).toBe("not_found");
      expect(detail.code).toBe("no-such-code");
    });

    test("redeeming an own pass publishes the refusal", async () => {
      mockGetPassRecord.mockResolvedValue({ ...referralPass, issuedBy: "hashed_test-user-sub" });

      await ingestHandler(buildEventWithToken(validToken, { code: referralPass.code }));

      expect(refusalDetail().reason).toBe("own_pass");
    });

    test("a second redemption of the same pass publishes the refusal", async () => {
      mockGetPassRecord.mockResolvedValue(referralPass);
      mockGetRedemption.mockResolvedValue({ code: referralPass.code });

      await ingestHandler(buildEventWithToken(validToken, { code: referralPass.code }));

      expect(refusalDetail().reason).toBe("already_redeemed");
    });

    test("a second referral pass publishes the refusal", async () => {
      mockGetPassRecord.mockResolvedValue(referralPass);
      mockClaimReferral.mockResolvedValue(false);

      await ingestHandler(buildEventWithToken(validToken, { code: referralPass.code }));

      expect(refusalDetail().reason).toBe("referral_already_used");
    });

    test("a successful redemption publishes no refusal", async () => {
      mockRedeemPass.mockResolvedValue({ valid: true, bundleId: "day-guest", pass: { testPass: false } });

      await ingestHandler(buildEventWithToken(validToken, { code: "test-pass-code" }));

      const events = mockEventBridgeSend.mock.calls.map((call) => JSON.parse(call[0].input.Entries[0].Detail).event);
      expect(events).toEqual(["pass-redeemed"]);
    });
  });

  describe("an account that already holds the bundle", () => {
    const heldPass = { code: "test-pass-code", passTypeId: "digital-pass", bundleId: "resident-pro", issuedBy: "hashed_issuer-sub" };

    beforeEach(() => {
      mockGetPassRecord.mockResolvedValue(heldPass);
      mockRedeemPass.mockResolvedValue({ valid: true, bundleId: "resident-pro", pass: { ...heldPass, testPass: false } });
    });

    test("a subscriber is refused with already_held, no use is counted and no referral is claimed", async () => {
      mockGetUserBundles.mockResolvedValue([{ bundleId: "resident-pro", stripeSubscriptionId: "sub_123" }]);

      const result = await ingestHandler(buildEventWithToken(validToken, { code: heldPass.code }));

      expect(result.statusCode).toBe(409);
      const body = JSON.parse(result.body);
      expect(body.reason).toBe("already_held");
      expect(body.message).toContain("resident-pro");
      expect(mockRedeemPass).not.toHaveBeenCalled();
      expect(mockClaimReferral).not.toHaveBeenCalled();
      expect(mockGrantBundle).not.toHaveBeenCalled();
    });

    test("an account that holds the bundle with no subscription is topped up", async () => {
      mockGetUserBundles.mockResolvedValue([{ bundleId: "resident-pro" }]);

      const result = await ingestHandler(buildEventWithToken(validToken, { code: heldPass.code }));

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).redeemed).toBe(true);
      expect(mockRedeemPass).toHaveBeenCalledTimes(1);
      expect(mockGrantBundle).toHaveBeenCalledTimes(1);
    });

    test("an account that holds another bundle with a subscription redeems as before", async () => {
      mockGetUserBundles.mockResolvedValue([{ bundleId: "other-bundle", stripeSubscriptionId: "sub_123" }]);

      const result = await ingestHandler(buildEventWithToken(validToken, { code: heldPass.code }));

      expect(JSON.parse(result.body).redeemed).toBe(true);
      expect(mockClaimReferral).toHaveBeenCalledTimes(1);
    });

    test("an unknown code reads no bundles", async () => {
      mockGetPassRecord.mockResolvedValue(null);
      mockRedeemPass.mockResolvedValue({ valid: false, reason: "not_found" });

      await ingestHandler(buildEventWithToken(validToken, { code: "nope" }));

      expect(mockGetUserBundles).not.toHaveBeenCalled();
    });
  });

  describe("a pass generated by an account", () => {
    const referralPass = { code: "tiger-happy-mountain-silver", passTypeId: "digital-pass", issuedBy: "hashed_issuer-sub" };

    beforeEach(() => {
      mockGetPassRecord.mockResolvedValue(referralPass);
      mockRedeemPass.mockResolvedValue({
        valid: true,
        bundleId: "day-guest",
        pass: { ...referralPass, testPass: false },
      });
    });

    test("writes a redemption record with the issuer hash and the pass type", async () => {
      const result = await ingestHandler(buildEventWithToken(validToken, { code: referralPass.code }));

      expect(result.statusCode).toBe(200);
      expect(mockRecordRedemption).toHaveBeenCalledWith({
        code: referralPass.code,
        hashedSub: "hashed_test-user-sub",
        issuedBy: "hashed_issuer-sub",
        passTypeId: "digital-pass",
      });
    });

    test("sets the redeemer's acquisition ref to the code", async () => {
      await ingestHandler(buildEventWithToken(validToken, { code: referralPass.code }));

      expect(mockGrantBundle.mock.calls[0][1]).toMatchObject({ acquisition: { ref: referralPass.code } });
    });

    test("a referral pass keeps its ref beside the click id", async () => {
      await ingestHandler(buildEventWithToken(validToken, { code: referralPass.code, acquisition: { gclid: "g1", ref: "other" } }));

      expect(mockGrantBundle.mock.calls[0][1].acquisition).toEqual({ gclid: "g1", ref: referralPass.code });
    });

    test("carries the pass type and the code on the pass-redeemed event", async () => {
      await ingestHandler(buildEventWithToken(validToken, { code: referralPass.code }));

      const detail = JSON.parse(mockEventBridgeSend.mock.calls[0][0].input.Entries[0].Detail);
      expect(detail.passTypeId).toBe("digital-pass");
      expect(detail.code).toBe(referralPass.code);
    });

    test("refuses a redemption by the account that generated the pass", async () => {
      mockGetPassRecord.mockResolvedValue({ ...referralPass, issuedBy: "hashed_test-user-sub" });

      const result = await ingestHandler(buildEventWithToken(validToken, { code: referralPass.code }));

      expect(result.statusCode).toBe(403);
      expect(JSON.parse(result.body).reason).toBe("own_pass");
      expect(mockRedeemPass).not.toHaveBeenCalled();
      expect(mockGrantBundle).not.toHaveBeenCalled();
      expect(mockRecordRedemption).not.toHaveBeenCalled();
    });

    test("answers already_redeemed when this account has redeemed this pass before", async () => {
      mockGetRedemption.mockResolvedValue({ code: referralPass.code, redeemedBy: "hashed_test-user-sub" });

      const result = await ingestHandler(buildEventWithToken(validToken, { code: referralPass.code }));

      expect(result.statusCode).toBe(409);
      expect(JSON.parse(result.body).reason).toBe("already_redeemed");
      expect(mockGetRedemption).toHaveBeenCalledWith(referralPass.code, "hashed_test-user-sub");
      expect(mockClaimReferral).not.toHaveBeenCalled();
      expect(mockRedeemPass).not.toHaveBeenCalled();
      expect(mockGrantBundle).not.toHaveBeenCalled();
    });

    test("an expired referral pass takes no claim and answers expired", async () => {
      mockCheckPass.mockResolvedValue({ valid: false, reason: "expired" });
      mockRedeemPass.mockResolvedValue({ valid: false, reason: "expired" });

      const result = await ingestHandler(buildEventWithToken(validToken, { code: referralPass.code }));

      expect(JSON.parse(result.body).reason).toBe("expired");
      expect(mockClaimReferral).not.toHaveBeenCalled();
      expect(mockReleaseReferral).not.toHaveBeenCalled();
    });

    test("refuses a second referral redemption by the same account", async () => {
      mockClaimReferral.mockResolvedValue(false);

      const result = await ingestHandler(buildEventWithToken(validToken, { code: referralPass.code }));

      expect(result.statusCode).toBe(409);
      expect(JSON.parse(result.body).reason).toBe("referral_already_used");
      expect(mockRedeemPass).not.toHaveBeenCalled();
      expect(mockGrantBundle).not.toHaveBeenCalled();
    });

    test("gives the referral claim back when the pass is not valid", async () => {
      mockRedeemPass.mockResolvedValue({ valid: false, reason: "held_for_review" });

      const result = await ingestHandler(buildEventWithToken(validToken, { code: referralPass.code }));

      expect(JSON.parse(result.body)).toMatchObject({ redeemed: false, reason: "held_for_review" });
      expect(mockReleaseReferral).toHaveBeenCalledWith("hashed_test-user-sub");
      expect(mockRecordRedemption).not.toHaveBeenCalled();
    });

    test("gives the referral claim back when the grant fails", async () => {
      mockGrantBundle.mockRejectedValue(new Error("grant failed"));

      const result = await ingestHandler(buildEventWithToken(validToken, { code: referralPass.code }));

      expect(result.statusCode).toBe(500);
      expect(mockReleaseReferral).toHaveBeenCalledWith("hashed_test-user-sub");
    });
  });

  test("an admin-issued pass writes no redemption record and sets no acquisition", async () => {
    mockRedeemPass.mockResolvedValue({ valid: true, bundleId: "day-guest", pass: { testPass: false } });

    await ingestHandler(buildEventWithToken(validToken, { code: "test-pass-code" }));

    expect(mockClaimReferral).not.toHaveBeenCalled();
    expect(mockRecordRedemption).not.toHaveBeenCalled();
    expect(mockGrantBundle.mock.calls[0][1].acquisition).toBeUndefined();
  });

  test("an admin-issued pass writes the click id and campaign tags the client sent on the granted bundle", async () => {
    mockRedeemPass.mockResolvedValue({ valid: true, bundleId: "week-guest", pass: { testPass: false } });
    const acquisition = {
      gclid: "Cj0KCQ-test-click",
      utmSource: "google",
      utmTerm: "vat return deadline",
      landedAt: "2026-01-01T00:00:00.000Z",
    };

    await ingestHandler(buildEventWithToken(validToken, { code: "test-pass-code", acquisition }));

    expect(mockGrantBundle.mock.calls[0][1].acquisition).toEqual(acquisition);
  });

  test("an msclkid is kept and unknown fields in the acquisition are dropped", async () => {
    mockRedeemPass.mockResolvedValue({ valid: true, bundleId: "week-guest", pass: { testPass: false } });

    await ingestHandler(buildEventWithToken(validToken, { code: "test-pass-code", acquisition: { msclkid: "ms-click", email: "a@b.c" } }));

    expect(mockGrantBundle.mock.calls[0][1].acquisition).toEqual({ msclkid: "ms-click" });
  });

  describe("the customer email request", () => {
    beforeEach(() => {
      mockRequestCustomerEmail.mockReset();
      mockRequestCustomerEmail.mockResolvedValue({ requested: true });
    });

    test("a redemption requests a pass-redeemed email for the account", async () => {
      mockRedeemPass.mockResolvedValue({ valid: true, bundleId: "day-guest", pass: { passTypeId: "day-guest-pass", testPass: false } });

      await ingestHandler(buildEventWithToken(validToken, { code: "test-pass-code" }));

      expect(mockRequestCustomerEmail).toHaveBeenCalledTimes(1);
      expect(mockRequestCustomerEmail).toHaveBeenCalledWith({
        kind: "pass-redeemed",
        userSub: "test-user-sub",
        synthetic: false,
        data: { bundleId: "day-guest", passTypeId: "day-guest-pass", expiry: "2026-03-01T00:00:00.000Z" },
      });
    });

    test("a test pass marks the request synthetic", async () => {
      mockRedeemPass.mockResolvedValue({ valid: true, bundleId: "day-guest", pass: { passTypeId: "day-guest-pass", testPass: true } });

      await ingestHandler(buildEventWithToken(validToken, { code: "test-pass-code" }));

      expect(mockRequestCustomerEmail.mock.calls[0][0].synthetic).toBe(true);
    });

    test("an invalid pass requests no email", async () => {
      mockRedeemPass.mockResolvedValue({ valid: false, reason: "not_found" });

      await ingestHandler(buildEventWithToken(validToken, { code: "invalid-code" }));

      expect(mockRequestCustomerEmail).not.toHaveBeenCalled();
    });

    test("a bundle that needs a subscription requests no email", async () => {
      mockRedeemPass.mockResolvedValue({ valid: true, bundleId: "test-subscription-bundle", pass: { testPass: false } });

      await ingestHandler(buildEventWithToken(validToken, { code: "test-pass-code" }));

      expect(mockRequestCustomerEmail).not.toHaveBeenCalled();
    });

    test("the response is unchanged when the request fails", async () => {
      mockRedeemPass.mockResolvedValue({ valid: true, bundleId: "day-guest", pass: { passTypeId: "day-guest-pass", testPass: false } });
      mockRequestCustomerEmail.mockResolvedValue({ requested: false });

      const result = await ingestHandler(buildEventWithToken(validToken, { code: "test-pass-code" }));

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.redeemed).toBe(true);
      expect(body.bundleId).toBe("day-guest");
    });
  });
});
