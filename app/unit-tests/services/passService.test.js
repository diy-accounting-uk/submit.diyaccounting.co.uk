// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect, vi, beforeEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { _setTestEmailHashSecret } from "../../lib/emailHash.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

// Mock the pass repository
vi.mock("@app/data/dynamoDbPassRepository.js", () => ({
  putPass: vi.fn().mockResolvedValue(undefined),
  getPass: vi.fn().mockResolvedValue(null),
  redeemPass: vi.fn().mockResolvedValue(null),
  revokePass: vi.fn().mockResolvedValue(null),
}));

const { putPass, getPass, redeemPass: redeemPassRepo } = await import("@app/data/dynamoDbPassRepository.js");
const { buildPassRecord, createPass, checkPass, redeemPass, diagnoseFailure, addDuration } = await import("../../services/passService.js");

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

    it("should return email_required for email-restricted pass without email", async () => {
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
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("email_required");
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
});
