// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/services/subHasher.test.js

import { describe, test, expect, beforeAll, afterAll, beforeEach } from "vitest";
import crypto from "crypto";
import {
  hashSub,
  hashSubWithVersion,
  getSaltVersion,
  getPreviousVersions,
  _setTestSalt,
  _clearSalt,
  initializeSalt,
  isSaltInitialized,
} from "@app/services/subHasher.js";

const TEST_SALT = "test-salt-for-unit-tests";

describe("subHasher.js", () => {
  beforeAll(() => {
    process.env.NODE_ENV = "test";
    _setTestSalt(TEST_SALT);
  });

  afterAll(() => {
    _clearSalt();
  });

  test("should hash a sub claim to a 64-character hex string", () => {
    const sub = "user-12345";
    const hashed = hashSub(sub);

    expect(hashed).toBeDefined();
    expect(typeof hashed).toBe("string");
    expect(hashed).toMatch(/^[a-f0-9]{64}$/); // HMAC-SHA256 produces 64 hex characters
  });

  test("should produce consistent hashes for the same input with same salt", () => {
    const sub = "user-12345";
    const hash1 = hashSub(sub);
    const hash2 = hashSub(sub);

    expect(hash1).toBe(hash2);
  });

  test("should produce known deterministic hash for known input and salt", () => {
    const hash = hashSub("user-12345");
    // Pin the exact expected hash value to detect any change in hashing behaviour
    const expected = crypto.createHmac("sha256", TEST_SALT).update("user-12345").digest("hex");
    expect(hash).toBe(expected);
    expect(hash).toBe("f6be129b315776d9e4bc2d9b4ae03b4dbecf03519968fcbb9cea93cc88667275");
  });

  test("should produce different hashes for different inputs", () => {
    const sub1 = "user-12345";
    const sub2 = "user-67890";
    const hash1 = hashSub(sub1);
    const hash2 = hashSub(sub2);

    expect(hash1).not.toBe(hash2);
  });

  test("should produce different hash than unsalted SHA-256", () => {
    const sub = "user-12345";
    const saltedHash = hashSub(sub);
    const unsaltedHash = crypto.createHash("sha256").update(sub).digest("hex");

    expect(saltedHash).not.toBe(unsaltedHash);
  });

  test("should throw error for empty string", () => {
    expect(() => hashSub("")).toThrow("Invalid sub");
  });

  test("should throw error for null", () => {
    expect(() => hashSub(null)).toThrow("Invalid sub");
  });

  test("should throw error for undefined", () => {
    expect(() => hashSub(undefined)).toThrow("Invalid sub");
  });

  test("should throw error for non-string", () => {
    expect(() => hashSub(12345)).toThrow("Invalid sub");
  });

  test("should throw error if salt not initialized", () => {
    _clearSalt();
    expect(() => hashSub("test")).toThrow("Salt not initialized");
    _setTestSalt(TEST_SALT); // restore for other tests
  });

  test("should report salt initialization status correctly", () => {
    expect(isSaltInitialized()).toBe(true);
    _clearSalt();
    expect(isSaltInitialized()).toBe(false);
    _setTestSalt(TEST_SALT);
    expect(isSaltInitialized()).toBe(true);
  });
});

describe("subHasher.js - multi-version registry", () => {
  beforeAll(() => {
    process.env.NODE_ENV = "test";
  });

  afterAll(() => {
    _clearSalt();
  });

  test("hashSubWithVersion returns correct hash for a specific version", () => {
    _setTestSalt("salt-a", "v1");
    // Also set up a multi-version registry manually
    _clearSalt();
    // Use _setTestSalt for a single-version registry, then test hashSubWithVersion
    _setTestSalt("salt-a", "v1");
    const hash = hashSubWithVersion("user-1", "v1");
    const expected = crypto.createHmac("sha256", "salt-a").update("user-1").digest("hex");
    expect(hash).toBe(expected);
  });

  test("hashSubWithVersion throws for unknown version", () => {
    _setTestSalt("salt-a", "v1");
    expect(() => hashSubWithVersion("user-1", "v99")).toThrow('Salt version "v99" not found in registry');
  });

  test("hashSubWithVersion throws for invalid sub", () => {
    _setTestSalt("salt-a", "v1");
    expect(() => hashSubWithVersion("", "v1")).toThrow("Invalid sub");
    expect(() => hashSubWithVersion(null, "v1")).toThrow("Invalid sub");
  });

  test("hashSubWithVersion throws when salt not initialized", () => {
    _clearSalt();
    expect(() => hashSubWithVersion("user-1", "v1")).toThrow("Salt not initialized");
  });

  test("getSaltVersion returns the current version", () => {
    _setTestSalt("salt-a", "v2");
    expect(getSaltVersion()).toBe("v2");
  });

  test("getSaltVersion throws when salt not initialized", () => {
    _clearSalt();
    expect(() => getSaltVersion()).toThrow("Salt not initialized");
  });

  test("getPreviousVersions returns empty array for single-version registry", () => {
    _setTestSalt("salt-a", "v1");
    expect(getPreviousVersions()).toEqual([]);
  });

  test("getPreviousVersions throws when salt not initialized", () => {
    _clearSalt();
    expect(() => getPreviousVersions()).toThrow("Salt not initialized");
  });

  test("_setTestSalt defaults to version v1", () => {
    _setTestSalt("some-salt");
    expect(getSaltVersion()).toBe("v1");
  });
});

describe("subHasher.js - initializeSalt", () => {
  beforeEach(() => {
    process.env.NODE_ENV = "test";
    _clearSalt();
  });

  afterAll(() => {
    _setTestSalt(TEST_SALT);
  });

  test("should initialize salt from JSON registry in USER_SUB_HASH_SALT environment variable", async () => {
    process.env.USER_SUB_HASH_SALT = '{"current":"v1","versions":{"v1":"env-var-salt-value"}}';

    await initializeSalt();

    expect(isSaltInitialized()).toBe(true);
    expect(getSaltVersion()).toBe("v1");
    // Verify the salt was used by checking hash is deterministic
    const hash1 = hashSub("test-sub");
    const hash2 = hashSub("test-sub");
    expect(hash1).toBe(hash2);

    delete process.env.USER_SUB_HASH_SALT;
  });

  test("should reject non-JSON salt value", async () => {
    process.env.USER_SUB_HASH_SALT = "raw-string-salt";

    await expect(initializeSalt()).rejects.toThrow("Salt secret is not valid JSON");

    delete process.env.USER_SUB_HASH_SALT;
  });

  test("should reject registry missing current field", async () => {
    process.env.USER_SUB_HASH_SALT = '{"versions":{"v1":"salt"}}';

    await expect(initializeSalt()).rejects.toThrow("Salt registry missing required fields");

    delete process.env.USER_SUB_HASH_SALT;
  });

  test("should reject registry where current points to missing version", async () => {
    process.env.USER_SUB_HASH_SALT = '{"current":"v2","versions":{"v1":"salt"}}';

    await expect(initializeSalt()).rejects.toThrow("Salt registry missing required fields");

    delete process.env.USER_SUB_HASH_SALT;
  });

  test("should not reinitialize if salt already set", async () => {
    process.env.USER_SUB_HASH_SALT = '{"current":"v1","versions":{"v1":"first-salt"}}';
    await initializeSalt();
    const hash1 = hashSub("test-sub");

    process.env.USER_SUB_HASH_SALT = '{"current":"v1","versions":{"v1":"second-salt"}}';
    await initializeSalt(); // Should be no-op
    const hash2 = hashSub("test-sub");

    // Hash should be same because salt wasn't re-initialized
    expect(hash1).toBe(hash2);

    delete process.env.USER_SUB_HASH_SALT;
  });
});

describe("subHasher.js - test helpers", () => {
  beforeAll(() => {
    process.env.NODE_ENV = "test";
  });

  test("_setTestSalt should only work in test environment", () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    expect(() => _setTestSalt("test")).toThrow("_setTestSalt can only be used in test environment");

    process.env.NODE_ENV = originalEnv;
  });

  test("_clearSalt should only work in test environment", () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    expect(() => _clearSalt()).toThrow("_clearSalt can only be used in test environment");

    process.env.NODE_ENV = originalEnv;
  });
});
