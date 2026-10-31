// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

const mockSecretsSend = vi.fn();
vi.mock("@aws-sdk/client-secrets-manager", () => ({
  SecretsManagerClient: class {
    send(...args) {
      return mockSecretsSend(...args);
    }
  },
  GetSecretValueCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
}));

import { _clearFamilyAffiliatesCache, isFamilyAffiliateEmail, loadFamilyAffiliateEmails } from "../../lib/familyAffiliates.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

describe("familyAffiliates.js", () => {
  const originalList = process.env.FAMILY_AFFILIATE_EMAILS;
  const originalEnvironmentName = process.env.ENVIRONMENT_NAME;

  beforeEach(() => {
    _clearFamilyAffiliatesCache();
    mockSecretsSend.mockReset();
  });

  afterEach(() => {
    process.env.FAMILY_AFFILIATE_EMAILS = originalList;
    process.env.ENVIRONMENT_NAME = originalEnvironmentName;
    _clearFamilyAffiliatesCache();
  });

  it("loads emails from FAMILY_AFFILIATE_EMAILS, trimmed, lowercased, blank entries dropped", async () => {
    process.env.FAMILY_AFFILIATE_EMAILS = " Family@Example.com ,, second@example.com ,";
    expect(await loadFamilyAffiliateEmails()).toEqual(["family@example.com", "second@example.com"]);
    expect(mockSecretsSend).not.toHaveBeenCalled();
  });

  it("matches a listed email case-insensitively and nothing else", async () => {
    process.env.FAMILY_AFFILIATE_EMAILS = "family@example.com";
    expect(await isFamilyAffiliateEmail("  FAMILY@example.com ")).toBe(true);
    expect(await isFamilyAffiliateEmail("other@example.com")).toBe(false);
    expect(await isFamilyAffiliateEmail("")).toBe(false);
    expect(await isFamilyAffiliateEmail(undefined)).toBe(false);
  });

  it("reads {ENVIRONMENT_NAME}/submit/family-affiliate-emails when the override is unset", async () => {
    delete process.env.FAMILY_AFFILIATE_EMAILS;
    process.env.ENVIRONMENT_NAME = "prod";
    mockSecretsSend.mockResolvedValue({ SecretString: "a@example.com,b@example.com" });
    expect(await loadFamilyAffiliateEmails()).toEqual(["a@example.com", "b@example.com"]);
    expect(mockSecretsSend.mock.calls[0][0].input.SecretId).toBe("prod/submit/family-affiliate-emails");
  });

  it("reads an empty list when the secret does not exist", async () => {
    delete process.env.FAMILY_AFFILIATE_EMAILS;
    process.env.ENVIRONMENT_NAME = "ci";
    mockSecretsSend.mockRejectedValue(Object.assign(new Error("not found"), { name: "ResourceNotFoundException" }));
    expect(await loadFamilyAffiliateEmails()).toEqual([]);
  });

  it("fails on any other Secrets Manager error", async () => {
    delete process.env.FAMILY_AFFILIATE_EMAILS;
    process.env.ENVIRONMENT_NAME = "ci";
    mockSecretsSend.mockRejectedValue(Object.assign(new Error("denied"), { name: "AccessDeniedException" }));
    await expect(loadFamilyAffiliateEmails()).rejects.toThrow("denied");
  });
});
