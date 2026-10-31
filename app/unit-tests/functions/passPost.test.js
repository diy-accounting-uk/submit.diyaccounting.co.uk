// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { buildEventWithToken, makeIdToken } from "@app/test-helpers/eventBuilders.js";

// Mock passService
const mockRedeemPass = vi.fn();
const mockGetPassRecord = vi.fn();
const mockClaimReferral = vi.fn();
const mockReleaseReferral = vi.fn();
const mockRecordRedemption = vi.fn();
vi.mock("@app/services/passService.js", () => ({
  redeemPass: (...args) => mockRedeemPass(...args),
  getPassRecord: (...args) => mockGetPassRecord(...args),
  claimReferral: (...args) => mockClaimReferral(...args),
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

import { ingestHandler } from "@app/functions/account/passPost.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

describe("passPost", () => {
  const validToken = makeIdToken("test-user-sub", { email: "user@example.com" });

  beforeEach(() => {
    mockRedeemPass.mockReset();
    mockGetPassRecord.mockReset();
    mockGetPassRecord.mockResolvedValue({ code: "test-pass-code", passTypeId: "day-guest-pass" });
    mockClaimReferral.mockReset();
    mockClaimReferral.mockResolvedValue(true);
    mockReleaseReferral.mockReset();
    mockRecordRedemption.mockReset();
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
});
