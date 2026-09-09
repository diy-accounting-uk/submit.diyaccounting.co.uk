// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect, beforeEach } from "vitest";
import {
  hashEmail,
  _setTestEmailHashSecret,
  _clearEmailHashSecret,
  hashEmailWithEnvSecret,
  getEmailHashSecretVersion,
} from "../../lib/emailHash.js";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

describe("emailHash", () => {
  describe("hashEmail", () => {
    const secret = "test-secret-for-hashing";

    it("should produce a deterministic hash for the same email and secret", () => {
      const hash1 = hashEmail("user@example.com", secret);
      const hash2 = hashEmail("user@example.com", secret);
      expect(hash1).toBe(hash2);
    });

    it("should produce different hashes for different emails", () => {
      const hash1 = hashEmail("user1@example.com", secret);
      const hash2 = hashEmail("user2@example.com", secret);
      expect(hash1).not.toBe(hash2);
    });

    it("should produce different hashes for different secrets", () => {
      const hash1 = hashEmail("user@example.com", "secret-a");
      const hash2 = hashEmail("user@example.com", "secret-b");
      expect(hash1).not.toBe(hash2);
    });

    it("should normalise email to lowercase before hashing", () => {
      const hash1 = hashEmail("User@Example.COM", secret);
      const hash2 = hashEmail("user@example.com", secret);
      expect(hash1).toBe(hash2);
    });

    it("should trim whitespace before hashing", () => {
      const hash1 = hashEmail("  user@example.com  ", secret);
      const hash2 = hashEmail("user@example.com", secret);
      expect(hash1).toBe(hash2);
    });

    it("should produce a base64url-encoded string", () => {
      const hash = hashEmail("user@example.com", secret);
      // base64url: alphanumeric, -, _  (no +, /, =)
      expect(hash).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it("should throw for missing email", () => {
      expect(() => hashEmail("", secret)).toThrow("Invalid email");
      expect(() => hashEmail(null, secret)).toThrow("Invalid email");
    });

    it("should throw for missing secret", () => {
      expect(() => hashEmail("user@example.com", "")).toThrow("Invalid secret");
      expect(() => hashEmail("user@example.com", null)).toThrow("Invalid secret");
    });
  });

  describe("hashEmailWithEnvSecret", () => {
    const testSecret = "test-env-secret";

    beforeEach(() => {
      _setTestEmailHashSecret(testSecret, "test-v1");
    });

    it("should hash using the environment secret", () => {
      const result = hashEmailWithEnvSecret("user@example.com");
      expect(result.hash).toBe(hashEmail("user@example.com", testSecret));
      expect(result.secretVersion).toBe("test-v1");
    });

    it("should throw if secret not initialized", () => {
      _clearEmailHashSecret();
      expect(() => hashEmailWithEnvSecret("user@example.com")).toThrow("not initialized");
    });
  });

  describe("getEmailHashSecretVersion", () => {
    it("should return the secret version after initialization", () => {
      _setTestEmailHashSecret("secret", "v2");
      expect(getEmailHashSecretVersion()).toBe("v2");
    });

    it("should return null if not initialized", () => {
      _clearEmailHashSecret();
      expect(getEmailHashSecretVersion()).toBeNull();
    });
  });
});
