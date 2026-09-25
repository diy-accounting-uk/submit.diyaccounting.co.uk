// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, vi, beforeEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

const mockGetActivityCharge = vi.fn();
const mockPutActivityChargeIfAbsent = vi.fn();
const mockMarkActivityChargeUsed = vi.fn();
vi.mock("@app/data/dynamoDbActivityChargeRepository.js", () => ({
  buildChargeKey: (activityId, subjectKey) => `charge#${activityId}#${subjectKey}`,
  getActivityCharge: (...args) => mockGetActivityCharge(...args),
  putActivityChargeIfAbsent: (...args) => mockPutActivityChargeIfAbsent(...args),
  markActivityChargeUsed: (...args) => mockMarkActivityChargeUsed(...args),
}));

import { hasPaidCharge, recordPaidChargeByHashedSub, markChargeUsed } from "@app/services/activityCharges.js";
import { hashSub, initializeSalt } from "@app/services/subHasher.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

describe("activityCharges", () => {
  beforeEach(async () => {
    mockGetActivityCharge.mockReset();
    mockPutActivityChargeIfAbsent.mockReset();
    mockMarkActivityChargeUsed.mockReset();
    process.env.USER_SUB_HASH_SALT = '{"current":"v1","versions":{"v1":"test-salt-for-unit-tests"}}';
    await initializeSalt();
  });

  test("hasPaidCharge is true for a recorded paid charge", async () => {
    mockGetActivityCharge.mockResolvedValue({ status: "paid" });
    const result = await hasPaidCharge("test-user-sub", "file-confirmation-statement", "12345678#2026-01-01");

    expect(result).toBe(true);
    expect(mockGetActivityCharge).toHaveBeenCalledWith(hashSub("test-user-sub"), "charge#file-confirmation-statement#12345678#2026-01-01");
  });

  test("hasPaidCharge is false when no charge is recorded", async () => {
    mockGetActivityCharge.mockResolvedValue(null);
    const result = await hasPaidCharge("test-user-sub", "file-confirmation-statement", "12345678#2026-01-01");
    expect(result).toBe(false);
  });

  test("hasPaidCharge is false once a charge has been used", async () => {
    mockGetActivityCharge.mockResolvedValue({ status: "used" });
    const result = await hasPaidCharge("test-user-sub", "file-confirmation-statement", "12345678#2026-01-01");
    expect(result).toBe(false);
  });

  test("recordPaidChargeByHashedSub writes a paid charge keyed by the given hashed sub", async () => {
    mockPutActivityChargeIfAbsent.mockResolvedValue(true);
    const result = await recordPaidChargeByHashedSub("hashed-sub-value", "file-confirmation-statement", "12345678#2026-01-01", {
      stripeSessionId: "cs_test_123",
    });

    expect(result).toBe(true);
    expect(mockPutActivityChargeIfAbsent).toHaveBeenCalledWith(
      "hashed-sub-value",
      "charge#file-confirmation-statement#12345678#2026-01-01",
      {
        activityId: "file-confirmation-statement",
        subjectKey: "12345678#2026-01-01",
        status: "paid",
        stripeSessionId: "cs_test_123",
      },
    );
  });

  test("recordPaidChargeByHashedSub returns false for a retried write (idempotent)", async () => {
    mockPutActivityChargeIfAbsent.mockResolvedValue(false);
    const result = await recordPaidChargeByHashedSub("hashed-sub-value", "file-confirmation-statement", "12345678#2026-01-01");
    expect(result).toBe(false);
  });

  test("markChargeUsed hashes the user sub and marks the charge used", async () => {
    mockMarkActivityChargeUsed.mockResolvedValue(true);
    const result = await markChargeUsed("test-user-sub", "file-confirmation-statement", "12345678#2026-01-01");

    expect(result).toBe(true);
    expect(mockMarkActivityChargeUsed).toHaveBeenCalledWith(
      hashSub("test-user-sub"),
      "charge#file-confirmation-statement#12345678#2026-01-01",
    );
  });
});
