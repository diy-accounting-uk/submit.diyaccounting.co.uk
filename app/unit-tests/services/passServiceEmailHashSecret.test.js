// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect, vi, beforeEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

vi.mock("@app/data/dynamoDbPassRepository.js", () => ({
  putPass: vi.fn().mockResolvedValue(undefined),
  getPass: vi.fn().mockResolvedValue(null),
  redeemPass: vi.fn().mockResolvedValue(null),
  revokePass: vi.fn().mockResolvedValue(null),
}));

vi.mock("@app/lib/emailHash.js", () => ({
  hashEmail: vi.fn().mockReturnValue("explicit-hash"),
  hashEmailWithEnvSecret: vi.fn().mockReturnValue({ hash: "env-hash", secretVersion: "v1" }),
  initializeEmailHashSecret: vi.fn().mockResolvedValue(undefined),
}));

const { getPass, redeemPass: redeemPassRepo } = await import("@app/data/dynamoDbPassRepository.js");
const { initializeEmailHashSecret } = await import("@app/lib/emailHash.js");
const { checkPass, redeemPass, createPass } = await import("../../services/passService.js");

describe("email hash secret is fetched only for email-restricted passes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    initializeEmailHashSecret.mockResolvedValue(undefined);
  });

  it("redeems an unrestricted pass without fetching the secret", async () => {
    redeemPassRepo.mockResolvedValue({
      pk: "pass#code",
      bundleId: "day-guest",
      maxUses: 1,
      useCount: 1,
    });

    const result = await redeemPass("code", "user@example.com");

    expect(result.valid).toBe(true);
    expect(initializeEmailHashSecret).not.toHaveBeenCalled();
  });

  it("propagates a failed secret fetch when redeeming an email-restricted pass", async () => {
    redeemPassRepo.mockResolvedValue({
      pk: "pass#code",
      bundleId: "day-guest",
      maxUses: 1,
      useCount: 1,
      restrictedToEmailHash: "some-hash-value",
    });
    initializeEmailHashSecret.mockRejectedValue(new Error("access denied"));

    await expect(redeemPass("code", "user@example.com")).rejects.toThrow("access denied");
  });

  it("checks an unrestricted pass without fetching the secret", async () => {
    getPass.mockResolvedValue({
      pk: "pass#code",
      bundleId: "day-guest",
      maxUses: 1,
      useCount: 0,
      validFrom: "2020-01-01T00:00:00.000Z",
      validUntil: null,
    });

    const result = await checkPass("code", "user@example.com");

    expect(result.valid).toBe(true);
    expect(initializeEmailHashSecret).not.toHaveBeenCalled();
  });

  it("propagates a failed secret fetch when checking an email-restricted pass", async () => {
    getPass.mockResolvedValue({
      pk: "pass#code",
      bundleId: "day-guest",
      maxUses: 1,
      useCount: 0,
      validFrom: "2020-01-01T00:00:00.000Z",
      validUntil: null,
      restrictedToEmailHash: "some-hash-value",
    });
    initializeEmailHashSecret.mockRejectedValue(new Error("access denied"));

    await expect(checkPass("code", "user@example.com")).rejects.toThrow("access denied");
  });

  it("creates an unrestricted pass without fetching the secret", async () => {
    await createPass({ passTypeId: "day-guest", bundleId: "day-guest", maxUses: 1 });

    expect(initializeEmailHashSecret).not.toHaveBeenCalled();
  });

  it("propagates a failed secret fetch when creating an email-restricted pass", async () => {
    initializeEmailHashSecret.mockRejectedValue(new Error("access denied"));

    await expect(
      createPass({ passTypeId: "day-guest", bundleId: "day-guest", maxUses: 1, restrictedToEmail: "user@example.com" }),
    ).rejects.toThrow("access denied");
  });
});
