// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect, vi, beforeEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { _setTestEmailHashSecret, hashEmail } from "../../lib/emailHash.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

// Mock the pass repository
vi.mock("@app/data/dynamoDbPassRepository.js", () => ({
  putPass: vi.fn().mockResolvedValue(undefined),
  getPass: vi.fn().mockResolvedValue(null),
  redeemPass: vi.fn().mockResolvedValue(null),
  revokePass: vi.fn().mockResolvedValue(null),
  setReviewLimit: vi.fn().mockResolvedValue(null),
  putHeldPointer: vi.fn().mockResolvedValue(undefined),
  deleteHeldPointer: vi.fn().mockResolvedValue(undefined),
  getHeldPasses: vi.fn().mockResolvedValue({ items: [] }),
  putReferralClaim: vi.fn().mockResolvedValue(true),
  deleteReferralClaim: vi.fn().mockResolvedValue(undefined),
  putRedemption: vi.fn().mockResolvedValue(undefined),
}));

const {
  putPass,
  getPass,
  redeemPass: redeemPassRepo,
  putReferralClaim,
  deleteReferralClaim,
  putRedemption,
  setReviewLimit,
  putHeldPointer,
  deleteHeldPointer,
  getHeldPasses,
} = await import("@app/data/dynamoDbPassRepository.js");
const {
  buildPassRecord,
  createPass,
  checkPass,
  redeemPass,
  diagnoseFailure,
  addDuration,
  claimReferral,
  releaseReferral,
  recordRedemption,
  releasePass,
  listHeldPasses,
} = await import("../../services/passService.js");

describe("passService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _setTestEmailHashSecret("test-email-hash-secret-for-unit-tests", "test-v1");
  });

  describe("addDuration", () => {
    it("should add days to a date", () => {
      const base = new Date("2026-01-01T00:00:00.000Z");
      const result = addDuration(base, "P7D");
      expect(result.toISOString()).toBe("2026-01-08T00:00:00.000Z");
    });

    it("should add months to a date", () => {
      const base = new Date("2026-01-15T00:00:00.000Z");
      const result = addDuration(base, "P1M");
      expect(result.toISOString()).toBe("2026-02-15T00:00:00.000Z");
    });

    it("should add years to a date", () => {
      const base = new Date("2026-01-01T00:00:00.000Z");
      const result = addDuration(base, "P1Y");
      expect(result.toISOString()).toBe("2027-01-01T00:00:00.000Z");
    });

    it("should add combined durations", () => {
      const base = new Date("2026-01-01T00:00:00.000Z");
      const result = addDuration(base, "P1Y2M3D");
      expect(result.toISOString()).toBe("2027-03-04T00:00:00.000Z");
    });

    it("should throw for invalid duration format", () => {
      const base = new Date("2026-01-01T00:00:00.000Z");
      expect(() => addDuration(base, "invalid")).toThrow("Invalid ISO 8601 duration");
    });
  });

  describe("buildPassRecord", () => {
    it("should build a pass record with required fields", () => {
      const pass = buildPassRecord({
        passTypeId: "day-guest-test-pass",
        bundleId: "day-guest",
        validityPeriod: "P7D",
        createdBy: "admin",
      });

      expect(pass.pk).toMatch(/^pass#/);
      expect(pass.code).toBeTruthy();
      expect(pass.bundleId).toBe("day-guest");
      expect(pass.passTypeId).toBe("day-guest-test-pass");
      expect(pass.maxUses).toBe(1);
      expect(pass.useCount).toBe(0);
      expect(pass.revokedAt).toBeUndefined();
      expect(pass.restrictedToEmailHash).toBeUndefined();
      expect(pass.createdBy).toBe("admin");
      expect(pass.validFrom).toBeTruthy();
      expect(pass.validUntil).toBeTruthy();
      expect(pass.ttl).toBeTypeOf("number");
      expect(pass.createdAt).toBeTruthy();
    });

    it("should calculate validUntil from validityPeriod", () => {
      const now = new Date();
      const pass = buildPassRecord({
        passTypeId: "day-guest-test-pass",
        bundleId: "day-guest",
        validityPeriod: "P1D",
        createdBy: "admin",
      });

      const validUntil = new Date(pass.validUntil);
      const validFrom = new Date(pass.validFrom);
      const diffMs = validUntil.getTime() - validFrom.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      expect(diffDays).toBeCloseTo(1, 0);
    });

    it("should allow unlimited passes with no validUntil", () => {
      const pass = buildPassRecord({
        passTypeId: "resident-guest",
        bundleId: "resident-guest",
        createdBy: "admin",
      });

      expect(pass.validUntil).toBeUndefined();
      // TTL should still be set (1 year + 30 days from now)
      expect(pass.ttl).toBeTypeOf("number");
    });

    it("should hash email for restricted passes", () => {
      const pass = buildPassRecord({
        passTypeId: "invited-guest",
        bundleId: "invited-guest",
        validityPeriod: "P1M",
        restrictedToEmail: "user@example.com",
        createdBy: "admin",
      });

      expect(pass.restrictedToEmailHash).toBeTruthy();
      expect(pass.restrictedToEmailHash).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(pass.emailHashSecretVersion).toBe("test-v1");
    });

    it("should set testPass when true", () => {
      const pass = buildPassRecord({
        passTypeId: "day-guest-test-pass",
        bundleId: "day-guest",
        testPass: true,
        validityPeriod: "P30D",
        maxUses: 10,
        createdBy: "admin",
      });

      expect(pass.testPass).toBe(true);
      expect(pass.bundleId).toBe("day-guest");
    });

    it("should omit testPass when false or undefined", () => {
      const pass = buildPassRecord({
        passTypeId: "day-guest-test-pass",
        bundleId: "day-guest",
        validityPeriod: "P7D",
        createdBy: "admin",
      });

      expect(pass.testPass).toBeUndefined();
    });

    it("should set issuedBy for user-issued passes", () => {
      const pass = buildPassRecord({
        passTypeId: "campaign",
        bundleId: "invited-guest",
        validityPeriod: "P3D",
        issuedBy: "user#abc123",
        createdBy: "user#abc123",
      });

      expect(pass.issuedBy).toBe("user#abc123");
    });

    it("should set actor when supplied", () => {
      const pass = buildPassRecord({
        passTypeId: "day-guest-test-pass",
        bundleId: "day-guest",
        validityPeriod: "P7D",
        createdBy: "admin",
        actor: "customer",
      });

      expect(pass.actor).toBe("customer");
    });

    it("should omit actor when not supplied", () => {
      const pass = buildPassRecord({
        passTypeId: "day-guest-test-pass",
        bundleId: "day-guest",
        validityPeriod: "P7D",
        createdBy: "admin",
      });

      expect(pass.actor).toBeUndefined();
    });
  });

  describe("createPass", () => {
    it("should create and store a pass", async () => {
      putPass.mockResolvedValueOnce(undefined);

      const pass = await createPass({
        passTypeId: "day-guest-test-pass",
        bundleId: "day-guest",
        validityPeriod: "P7D",
        createdBy: "admin",
      });

      expect(putPass).toHaveBeenCalledTimes(1);
      expect(pass.bundleId).toBe("day-guest");
      expect(pass.code).toBeTruthy();
    });

    it("should retry once on code collision", async () => {
      putPass.mockRejectedValueOnce(new Error("Pass code collision")).mockResolvedValueOnce(undefined);

      const pass = await createPass({
        passTypeId: "day-guest-test-pass",
        bundleId: "day-guest",
        validityPeriod: "P7D",
        createdBy: "admin",
      });

      expect(putPass).toHaveBeenCalledTimes(2);
      expect(pass.bundleId).toBe("day-guest");
    });

    it("should throw non-collision errors", async () => {
      putPass.mockRejectedValueOnce(new Error("DynamoDB error"));

      await expect(
        createPass({
          passTypeId: "day-guest-test-pass",
          bundleId: "day-guest",
          validityPeriod: "P7D",
          createdBy: "admin",
        }),
      ).rejects.toThrow("DynamoDB error");
    });
  });

  describe("checkPass", () => {
    it("should return not_found for non-existent pass", async () => {
      getPass.mockResolvedValueOnce(null);

      const result = await checkPass("nonexistent-code");
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("not_found");
    });

    it("should return valid for a good pass", async () => {
      getPass.mockResolvedValueOnce({
        pk: "pass#test-code",
        code: "test-code",
        bundleId: "day-guest",
        validFrom: "2020-01-01T00:00:00.000Z",
        validUntil: "2030-12-31T23:59:59.000Z",
        maxUses: 5,
        useCount: 2,
        revokedAt: null,
        restrictedToEmailHash: null,
      });

      const result = await checkPass("test-code");
      expect(result.valid).toBe(true);
      expect(result.bundleId).toBe("day-guest");
      expect(result.usesRemaining).toBe(3);
    });

    it("should return exhausted for fully-used pass", async () => {
      getPass.mockResolvedValueOnce({
        pk: "pass#test-code",
        code: "test-code",
        bundleId: "day-guest",
        validFrom: "2020-01-01T00:00:00.000Z",
        validUntil: "2030-12-31T23:59:59.000Z",
        maxUses: 3,
        useCount: 3,
        revokedAt: null,
        restrictedToEmailHash: null,
      });

      const result = await checkPass("test-code");
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("exhausted");
    });

    it("should return revoked for revoked pass", async () => {
      getPass.mockResolvedValueOnce({
        pk: "pass#test-code",
        code: "test-code",
        bundleId: "day-guest",
        validFrom: "2020-01-01T00:00:00.000Z",
        validUntil: "2030-12-31T23:59:59.000Z",
        maxUses: 5,
        useCount: 0,
        revokedAt: "2025-06-01T00:00:00.000Z",
        restrictedToEmailHash: null,
      });

      const result = await checkPass("test-code");
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("revoked");
    });

    it("should return expired for expired pass", async () => {
      getPass.mockResolvedValueOnce({
        pk: "pass#test-code",
        code: "test-code",
        bundleId: "day-guest",
        validFrom: "2020-01-01T00:00:00.000Z",
        validUntil: "2020-12-31T23:59:59.000Z",
        maxUses: 5,
        useCount: 0,
        revokedAt: null,
        restrictedToEmailHash: null,
      });

      const result = await checkPass("test-code");
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("expired");
    });

    it("should return valid with emailRestricted for email-restricted pass without email", async () => {
      getPass.mockResolvedValueOnce({
        pk: "pass#test-code",
        code: "test-code",
        bundleId: "invited-guest",
        validFrom: "2020-01-01T00:00:00.000Z",
        validUntil: "2030-12-31T23:59:59.000Z",
        maxUses: 1,
        useCount: 0,
        revokedAt: null,
        restrictedToEmailHash: "some-hash-value",
      });

      const result = await checkPass("test-code");
      expect(result.valid).toBe(true);
      expect(result.emailRestricted).toBe(true);
      expect(result.bundleId).toBe("invited-guest");
      expect(result.usesRemaining).toBe(1);
    });

    it("should return wrong_email for email-restricted pass with a mismatched email", async () => {
      getPass.mockResolvedValueOnce({
        pk: "pass#test-code",
        code: "test-code",
        bundleId: "invited-guest",
        validFrom: "2020-01-01T00:00:00.000Z",
        validUntil: "2030-12-31T23:59:59.000Z",
        maxUses: 1,
        useCount: 0,
        revokedAt: null,
        restrictedToEmailHash: hashEmail("invited@example.com", "test-email-hash-secret-for-unit-tests"),
      });

      const result = await checkPass("test-code", "someone-else@example.com");
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("wrong_email");
    });

    it("should return valid for email-restricted pass with a matching email", async () => {
      getPass.mockResolvedValueOnce({
        pk: "pass#test-code",
        code: "test-code",
        bundleId: "invited-guest",
        validFrom: "2020-01-01T00:00:00.000Z",
        validUntil: "2030-12-31T23:59:59.000Z",
        maxUses: 1,
        useCount: 0,
        revokedAt: null,
        restrictedToEmailHash: hashEmail("invited@example.com", "test-email-hash-secret-for-unit-tests"),
      });

      const result = await checkPass("test-code", "invited@example.com");
      expect(result.valid).toBe(true);
      expect(result.emailRestricted).toBeUndefined();
      expect(result.bundleId).toBe("invited-guest");
    });
  });

  describe("diagnoseFailure", () => {
    it("should return not_found for missing pass", async () => {
      getPass.mockResolvedValueOnce(null);
      const reason = await diagnoseFailure("missing-code");
      expect(reason).toBe("not_found");
    });

    it("should return revoked for revoked pass", async () => {
      getPass.mockResolvedValueOnce({
        revokedAt: "2025-01-01T00:00:00.000Z",
        useCount: 0,
        maxUses: 5,
        validFrom: "2020-01-01T00:00:00.000Z",
        validUntil: "2030-12-31T23:59:59.000Z",
      });
      const reason = await diagnoseFailure("revoked-code");
      expect(reason).toBe("revoked");
    });

    it("should return exhausted when all uses consumed", async () => {
      getPass.mockResolvedValueOnce({
        revokedAt: null,
        useCount: 5,
        maxUses: 5,
        validFrom: "2020-01-01T00:00:00.000Z",
        validUntil: "2030-12-31T23:59:59.000Z",
      });
      const reason = await diagnoseFailure("exhausted-code");
      expect(reason).toBe("exhausted");
    });
  });

  describe("a pass with no use cap and a review limit", () => {
    const heldPass = {
      revokedAt: null,
      useCount: 1000,
      reviewLimit: 1000,
      validFrom: "2020-01-01T00:00:00.000Z",
      validUntil: "2099-12-31T23:59:59.000Z",
      bundleId: "day-guest",
    };

    it("buildPassRecord omits maxUses when the cap is null and stores the review limit", () => {
      const record = buildPassRecord({
        passTypeId: "digital-pass",
        bundleId: "day-guest",
        validityPeriod: "P90D",
        maxUses: null,
        reviewLimit: 1000,
      });
      expect(record).not.toHaveProperty("maxUses");
      expect(record.reviewLimit).toBe(1000);
    });

    it("buildPassRecord keeps one use by default and stores no review limit", () => {
      const record = buildPassRecord({ passTypeId: "x", bundleId: "day-guest" });
      expect(record.maxUses).toBe(1);
      expect(record).not.toHaveProperty("reviewLimit");
    });

    it("checkPass is valid below the review limit with no maxUses", async () => {
      getPass.mockResolvedValueOnce({ ...heldPass, useCount: 999 });
      const result = await checkPass("code");
      expect(result.valid).toBe(true);
      expect(result.usesRemaining).toBe(1);
    });

    it("checkPass refuses a held pass with held_for_review", async () => {
      getPass.mockResolvedValueOnce(heldPass);
      const result = await checkPass("code");
      expect(result).toMatchObject({ valid: false, reason: "held_for_review" });
    });

    it("redeemPass reports held_for_review when the atomic redeem fails at the limit", async () => {
      redeemPassRepo.mockResolvedValueOnce(null);
      getPass.mockResolvedValueOnce(heldPass);
      const result = await redeemPass("code");
      expect(result).toMatchObject({ valid: false, reason: "held_for_review" });
    });

    it("the redemption that brings useCount up to reviewLimit writes the held pointer", async () => {
      redeemPassRepo.mockResolvedValueOnce({
        code: "code",
        bundleId: "b",
        issuedBy: "issuer-hash",
        useCount: 10,
        reviewLimit: 10,
        updatedAt: "2026-10-30T09:00:00.000Z",
        ttl: 123,
      });
      const result = await redeemPass("code");
      expect(result.valid).toBe(true);
      expect(putHeldPointer).toHaveBeenCalledWith({
        code: "code",
        passIssuedBy: "issuer-hash",
        useCount: 10,
        reviewLimit: 10,
        heldAt: "2026-10-30T09:00:00.000Z",
        ttl: 123,
      });
    });

    it("a redemption below the review limit writes no held pointer", async () => {
      redeemPassRepo.mockResolvedValueOnce({ code: "code", bundleId: "b", useCount: 9, reviewLimit: 10 });
      await redeemPass("code");
      expect(putHeldPointer).not.toHaveBeenCalled();
    });

    it("a failure to write the held pointer does not fail the redemption", async () => {
      redeemPassRepo.mockResolvedValueOnce({ code: "code", bundleId: "b", useCount: 10, reviewLimit: 10 });
      putHeldPointer.mockRejectedValueOnce(new Error("throttled"));
      const result = await redeemPass("code");
      expect(result.valid).toBe(true);
    });

    it("a redemption refused at the limit writes the held pointer again", async () => {
      redeemPassRepo.mockResolvedValueOnce(null);
      getPass.mockResolvedValue(heldPass);
      await redeemPass("code");
      expect(putHeldPointer).toHaveBeenCalledWith(expect.objectContaining({ code: heldPass.code }));
    });

    it("diagnoseFailure returns held_for_review at the limit", async () => {
      getPass.mockResolvedValueOnce(heldPass);
      expect(await diagnoseFailure("code")).toBe("held_for_review");
    });
  });

  describe("referral claim and redemption record", () => {
    it("claimReferral hands the hashed sub and code to the repository", async () => {
      putReferralClaim.mockResolvedValueOnce(false);
      expect(await claimReferral("hash-1", "code-1")).toBe(false);
      expect(putReferralClaim).toHaveBeenCalledWith("hash-1", "code-1", expect.any(String));
    });

    it("releaseReferral deletes the claim", async () => {
      await releaseReferral("hash-1");
      expect(deleteReferralClaim).toHaveBeenCalledWith("hash-1");
    });

    it("recordRedemption stores the code, redeemer, issuer, pass type and time", async () => {
      await recordRedemption({ code: "code-1", hashedSub: "hash-1", issuedBy: "hash-2", passTypeId: "digital-pass" });
      expect(putRedemption).toHaveBeenCalledWith({
        code: "code-1",
        hashedSub: "hash-1",
        issuedBy: "hash-2",
        passTypeId: "digital-pass",
        redeemedAt: expect.any(String),
      });
    });
  });
  describe("releasePass", () => {
    const held = { code: "c", useCount: 1000, reviewLimit: 1000 };

    it("raises a held pass's limit above its use count", async () => {
      getPass.mockResolvedValue(held);
      setReviewLimit.mockResolvedValue({ ...held, reviewLimit: 2000 });
      await releasePass("c", { raiseBy: 1000 });
      expect(setReviewLimit).toHaveBeenCalledWith("c", 2000, expect.any(String));
    });

    it("raises from the use count when the count has passed the limit", async () => {
      getPass.mockResolvedValue({ code: "c", useCount: 1003, reviewLimit: 1000 });
      await releasePass("c", { raiseBy: 10 });
      expect(setReviewLimit).toHaveBeenCalledWith("c", 1013, expect.any(String));
    });

    it("sets the limit to the given value", async () => {
      getPass.mockResolvedValue(held);
      await releasePass("c", { reviewLimit: 5000 });
      expect(setReviewLimit).toHaveBeenCalledWith("c", 5000, expect.any(String));
    });

    it("removes the limit", async () => {
      getPass.mockResolvedValue(held);
      await releasePass("c", { remove: true });
      expect(setReviewLimit).toHaveBeenCalledWith("c", null, expect.any(String));
    });

    it("deletes the held pointer when the release lifts the hold", async () => {
      getPass.mockResolvedValue(held);
      setReviewLimit.mockResolvedValue({ ...held, reviewLimit: 2000 });
      await releasePass("c", { raiseBy: 1000 });
      expect(deleteHeldPointer).toHaveBeenCalledWith("c");
      expect(putHeldPointer).not.toHaveBeenCalled();
    });

    it("keeps the held pointer when the new limit is still at the use count", async () => {
      getPass.mockResolvedValue(held);
      setReviewLimit.mockResolvedValue({ ...held, reviewLimit: 1000 });
      await releasePass("c", { reviewLimit: 1000 });
      expect(putHeldPointer).toHaveBeenCalled();
      expect(deleteHeldPointer).not.toHaveBeenCalled();
    });

    it("lists the held passes with issuer hash, use count, review limit and held time", async () => {
      getHeldPasses.mockResolvedValue({
        items: [{ pk: "held#c", code: "c", issuedBy: "held", passIssuedBy: "hash-1", useCount: 5, reviewLimit: 5, createdAt: "t1" }],
      });
      expect(await listHeldPasses()).toEqual([{ code: "c", issuedBy: "hash-1", useCount: 5, reviewLimit: 5, heldAt: "t1" }]);
    });

    it("returns null and writes nothing for a missing pass", async () => {
      getPass.mockResolvedValue(null);
      expect(await releasePass("c", { raiseBy: 1 })).toBeNull();
      expect(setReviewLimit).not.toHaveBeenCalled();
    });
  });
});
