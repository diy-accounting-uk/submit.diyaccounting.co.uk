// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// A pass created before an email hash secret rotation must still check and redeem correctly
// after the registry's current version moves on, because each pass stores the exact version
// it was hashed with (passService.js's emailHashSecretVersion field).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

vi.mock("@app/data/dynamoDbPassRepository.js", () => ({
  putPass: vi.fn().mockResolvedValue(undefined),
  getPass: vi.fn(),
  redeemPass: vi.fn(),
  revokePass: vi.fn(),
}));

const { getPass, redeemPass: redeemPassRepo } = await import("@app/data/dynamoDbPassRepository.js");
const { _setTestEmailHashSecretRegistry } = await import("@app/lib/emailHash.js");
const { buildPassRecord, checkPass, redeemPass } = await import("../../services/passService.js");

const V1_SECRET = "email-hash-secret-v1";
const V2_SECRET = "email-hash-secret-v2";

function checkable(pass) {
  return { ...pass, validFrom: "2020-01-01T00:00:00.000Z", validUntil: null };
}

describe("email hash secret rotation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records the current version on a newly created pass", () => {
    _setTestEmailHashSecretRegistry({ current: "v1", versions: { v1: V1_SECRET } });

    const pass = buildPassRecord({
      passTypeId: "invited-guest",
      bundleId: "day-guest",
      maxUses: 1,
      restrictedToEmail: "user@example.com",
    });

    expect(pass.emailHashSecretVersion).toBe("v1");
  });

  it("checks a pass created under v1 correctly after the registry rotates to v2", async () => {
    _setTestEmailHashSecretRegistry({ current: "v1", versions: { v1: V1_SECRET } });
    const pass = buildPassRecord({
      passTypeId: "invited-guest",
      bundleId: "day-guest",
      maxUses: 1,
      restrictedToEmail: "user@example.com",
    });

    // Rotate: v2 becomes current, v1 stays in the registry for existing passes to read against.
    _setTestEmailHashSecretRegistry({ current: "v2", versions: { v1: V1_SECRET, v2: V2_SECRET } });

    getPass.mockResolvedValue(checkable(pass));
    const result = await checkPass(pass.code, "user@example.com");

    expect(result.valid).toBe(true);
  });

  it("creates and checks a pass with the current version after rotation", async () => {
    _setTestEmailHashSecretRegistry({ current: "v2", versions: { v1: V1_SECRET, v2: V2_SECRET } });
    const pass = buildPassRecord({
      passTypeId: "invited-guest",
      bundleId: "day-guest",
      maxUses: 1,
      restrictedToEmail: "user@example.com",
    });

    expect(pass.emailHashSecretVersion).toBe("v2");

    getPass.mockResolvedValue(checkable(pass));
    const result = await checkPass(pass.code, "user@example.com");

    expect(result.valid).toBe(true);
  });

  it("still rejects the wrong email for a pre-rotation pass", async () => {
    _setTestEmailHashSecretRegistry({ current: "v1", versions: { v1: V1_SECRET } });
    const pass = buildPassRecord({
      passTypeId: "invited-guest",
      bundleId: "day-guest",
      maxUses: 1,
      restrictedToEmail: "user@example.com",
    });

    _setTestEmailHashSecretRegistry({ current: "v2", versions: { v1: V1_SECRET, v2: V2_SECRET } });

    getPass.mockResolvedValue(checkable(pass));
    const result = await checkPass(pass.code, "wrong@example.com");

    expect(result.valid).toBe(false);
    expect(result.reason).toBe("wrong_email");
  });

  it("redeems a pre-rotation pass using the version recorded on the record, not the current one", async () => {
    _setTestEmailHashSecretRegistry({ current: "v1", versions: { v1: V1_SECRET } });
    const pass = buildPassRecord({
      passTypeId: "invited-guest",
      bundleId: "day-guest",
      maxUses: 1,
      restrictedToEmail: "user@example.com",
    });

    _setTestEmailHashSecretRegistry({ current: "v2", versions: { v1: V1_SECRET, v2: V2_SECRET } });

    redeemPassRepo.mockResolvedValue({ ...pass, useCount: 1 });
    const result = await redeemPass(pass.code, "user@example.com");

    expect(result.valid).toBe(true);
  });

  it("fails loudly if a version an existing pass depends on is pruned from the registry", async () => {
    _setTestEmailHashSecretRegistry({ current: "v1", versions: { v1: V1_SECRET } });
    const pass = buildPassRecord({
      passTypeId: "invited-guest",
      bundleId: "day-guest",
      maxUses: 1,
      restrictedToEmail: "user@example.com",
    });

    // v1 removed entirely instead of kept alongside v2 — the rotation runbook must not do this
    // while any live pass still carries emailHashSecretVersion "v1".
    _setTestEmailHashSecretRegistry({ current: "v2", versions: { v2: V2_SECRET } });

    getPass.mockResolvedValue(checkable(pass));

    await expect(checkPass(pass.code, "user@example.com")).rejects.toThrow('version "v1" not found in registry');
  });
});
