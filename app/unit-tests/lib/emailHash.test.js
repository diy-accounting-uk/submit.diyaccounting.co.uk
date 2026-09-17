// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  hashEmail,
  _setTestEmailHashSecret,
  _setTestEmailHashSecretRegistry,
  _clearEmailHashSecret,
  hashEmailWithEnvSecret,
  hashEmailWithVersion,
  getEmailHashSecretVersion,
  initializeEmailHashSecret,
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

  describe("hashEmailWithVersion", () => {
    beforeEach(() => {
      _setTestEmailHashSecretRegistry({
        current: "v2",
        versions: { v1: "secret-v1", v2: "secret-v2" },
      });
    });

    it("hashes with a specific non-current version, for re-checking an older pass", () => {
      const hash = hashEmailWithVersion("user@example.com", "v1");
      expect(hash).toBe(hashEmail("user@example.com", "secret-v1"));
      expect(hash).not.toBe(hashEmailWithVersion("user@example.com", "v2"));
    });

    it("hashes with the current version too", () => {
      expect(hashEmailWithVersion("user@example.com", "v2")).toBe(hashEmail("user@example.com", "secret-v2"));
    });

    it("throws for a version not in the registry", () => {
      expect(() => hashEmailWithVersion("user@example.com", "v99")).toThrow(
        'Email hash secret version "v99" not found in registry',
      );
    });

    it("throws when the secret is not initialized", () => {
      _clearEmailHashSecret();
      expect(() => hashEmailWithVersion("user@example.com", "v1")).toThrow("not initialized");
    });
  });

  describe("initializeEmailHashSecret", () => {
    afterEach(() => {
      delete process.env.EMAIL_HASH_SECRET;
      _clearEmailHashSecret();
    });

    it("initializes from a JSON registry in EMAIL_HASH_SECRET", async () => {
      process.env.EMAIL_HASH_SECRET = '{"current":"v1","versions":{"v1":"env-var-secret"}}';

      await initializeEmailHashSecret();

      expect(getEmailHashSecretVersion()).toBe("v1");
      expect(hashEmailWithEnvSecret("user@example.com").hash).toBe(hashEmail("user@example.com", "env-var-secret"));
    });

    it("accepts a legacy raw (non-JSON) secret value as v1, so the secret created by hand keeps working", async () => {
      process.env.EMAIL_HASH_SECRET = "raw-string-secret";

      await initializeEmailHashSecret();

      expect(getEmailHashSecretVersion()).toBe("v1");
      expect(hashEmailWithEnvSecret("user@example.com").hash).toBe(hashEmail("user@example.com", "raw-string-secret"));
    });

    it("treats a JSON value with no current field as a legacy raw secret too", async () => {
      process.env.EMAIL_HASH_SECRET = '{"versions":{"v1":"secret"}}';

      await initializeEmailHashSecret();

      expect(getEmailHashSecretVersion()).toBe("v1");
      expect(hashEmailWithEnvSecret("user@example.com").hash).toBe(
        hashEmail("user@example.com", '{"versions":{"v1":"secret"}}'),
      );
    });

    it("rejects a registry where current points to a missing version", async () => {
      process.env.EMAIL_HASH_SECRET = '{"current":"v2","versions":{"v1":"secret"}}';

      await expect(initializeEmailHashSecret()).rejects.toThrow("registry missing required fields");
    });
  });
});
