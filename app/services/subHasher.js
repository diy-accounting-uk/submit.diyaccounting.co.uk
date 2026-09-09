// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/subHasher.js

import crypto from "crypto";
import { createLogger } from "../lib/logger.js";

const logger = createLogger({ source: "app/services/subHasher.js" });

let __saltRegistry = null; // { current: "v1", versions: { "v1": "salt..." } }
let __initPromise = null;
let __saltFetchedAt = 0;
const SALT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes — warm containers re-fetch after rotation

/**
 * Parse and validate a salt registry JSON string.
 * Expected format: {"current":"v1","versions":{"v1":"salt-value"}}
 *
 * @param {string} raw - JSON string containing the salt registry
 * @returns {object} Parsed and validated registry object
 * @throws {Error} If not valid JSON or missing required fields
 */
function parseSaltRegistry(raw) {
  let registry;
  try {
    registry = JSON.parse(raw);
  } catch {
    throw new Error(
      "Salt secret is not valid JSON. Expected format: " +
        '{"current":"v1","versions":{"v1":"salt-value"}}. ' +
        "Run Migration 001 to convert from raw string format.",
    );
  }
  if (!registry.current || !registry.versions || !registry.versions[registry.current]) {
    throw new Error(
      `Salt registry missing required fields. Got current="${registry.current}" ` +
        `but versions has keys: [${Object.keys(registry.versions || {})}]`,
    );
  }
  return registry;
}

/**
 * Initialize the salt from environment variable or AWS Secrets Manager.
 * Call this at the top of your Lambda handler before using hashSub().
 *
 * The salt must be in multi-version registry JSON format:
 * {"current":"v1","versions":{"v1":"salt-value"}}
 *
 * Features:
 * - One-time fetch per Lambda container (cold start), then cached
 * - Concurrent initialization protection (prevents race conditions)
 * - Clear error messages for troubleshooting
 *
 * @returns {Promise<void>}
 */
export async function initializeSalt() {
  if (__saltRegistry && Date.now() - __saltFetchedAt < SALT_CACHE_TTL_MS) {
    logger.debug({ message: "Salt already initialized (warm start)" });
    return;
  }

  // TTL expired — clear cache so we re-fetch
  if (__saltRegistry) {
    logger.info({ message: "Salt cache TTL expired, re-fetching from Secrets Manager" });
    __saltRegistry = null;
    __initPromise = null;
  }

  // Prevent concurrent initialization during cold start
  if (__initPromise) {
    logger.debug({ message: "Salt initialization in progress, waiting..." });
    return __initPromise;
  }

  __initPromise = (async () => {
    try {
      // For local development/testing, allow env var override
      if (process.env.USER_SUB_HASH_SALT) {
        logger.info({ message: "Using USER_SUB_HASH_SALT from environment (local dev/test)" });
        __saltRegistry = parseSaltRegistry(process.env.USER_SUB_HASH_SALT);
        __saltFetchedAt = Date.now();
        return;
      }

      // For deployed environments, fetch from Secrets Manager
      const envName = process.env.ENVIRONMENT_NAME;
      if (!envName) {
        throw new Error(
          "ENVIRONMENT_NAME environment variable is required for Secrets Manager access. " +
            "This must be set by the CDK stack (e.g., 'ci' or 'prod').",
        );
      }
      const secretName = `${envName}/submit/user-sub-hash-salt`;

      logger.info({ message: "Fetching salt from Secrets Manager", secretName });

      const { SecretsManagerClient, GetSecretValueCommand } = await import("@aws-sdk/client-secrets-manager");
      const client = new SecretsManagerClient({
        region: process.env.AWS_REGION || "eu-west-2",
      });

      const response = await client.send(new GetSecretValueCommand({ SecretId: secretName }));

      if (!response.SecretString) {
        throw new Error(`Secret ${secretName} exists but has no SecretString value`);
      }

      __saltRegistry = parseSaltRegistry(response.SecretString);
      __saltFetchedAt = Date.now();
      logger.info({ message: "Salt successfully fetched and cached" });
    } catch (error) {
      logger.error({ message: "Failed to fetch salt", error: error.message });
      __initPromise = null; // Clear promise so next call will retry
      throw new Error(
        `Failed to initialize salt: ${error.message}. ` + `Ensure secret exists and Lambda has secretsmanager:GetSecretValue permission.`,
      );
    }
  })();

  return __initPromise;
}

/**
 * Check if salt has been initialized.
 * @returns {boolean}
 */
export function isSaltInitialized() {
  return __saltRegistry !== null;
}

/**
 * Hash a user sub using HMAC-SHA256 with the current salt version.
 * The salt must be initialized via initializeSalt() before calling this function.
 *
 * @param {string} sub - The user's subject identifier from OAuth/Cognito
 * @returns {string} 64-character hexadecimal HMAC-SHA256 hash
 * @throws {Error} If sub is invalid or salt not initialized
 */
export function hashSub(sub) {
  if (!sub || typeof sub !== "string") {
    throw new Error("Invalid sub: must be a non-empty string");
  }

  if (!__saltRegistry) {
    throw new Error(
      "Salt not initialized. Call initializeSalt() in your Lambda handler before using hashSub(). " +
        "For local dev, set USER_SUB_HASH_SALT in .env file.",
    );
  }

  const salt = __saltRegistry.versions[__saltRegistry.current];
  return crypto.createHmac("sha256", salt).update(sub).digest("hex");
}

/**
 * Hash a user sub using HMAC-SHA256 with a specific salt version.
 * Used for read-path fallback during migration windows and by migration scripts.
 *
 * @param {string} sub - The user's subject identifier from OAuth/Cognito
 * @param {string} version - The salt version to use (e.g., "v1", "v2")
 * @returns {string} 64-character hexadecimal HMAC-SHA256 hash
 * @throws {Error} If sub is invalid, salt not initialized, or version not found
 */
export function hashSubWithVersion(sub, version) {
  if (!sub || typeof sub !== "string") {
    throw new Error("Invalid sub: must be a non-empty string");
  }
  if (!__saltRegistry) {
    throw new Error("Salt not initialized. Call initializeSalt() first.");
  }
  const salt = __saltRegistry.versions[version];
  if (!salt) {
    throw new Error(`Salt version "${version}" not found in registry. Available: [${Object.keys(__saltRegistry.versions)}]`);
  }
  return crypto.createHmac("sha256", salt).update(sub).digest("hex");
}

/**
 * Get the current salt version string (for storing on DynamoDB items).
 * @returns {string} The current version (e.g., "v1")
 * @throws {Error} If salt not initialized
 */
export function getSaltVersion() {
  if (!__saltRegistry) {
    throw new Error("Salt not initialized. Call initializeSalt() first.");
  }
  return __saltRegistry.current;
}

/**
 * Get the list of non-current salt versions (for read-path fallback).
 * Returns versions in registry order, excluding the current version.
 *
 * @returns {string[]} Array of previous version strings
 * @throws {Error} If salt not initialized
 */
export function getPreviousVersions() {
  if (!__saltRegistry) {
    throw new Error("Salt not initialized. Call initializeSalt() first.");
  }
  return Object.keys(__saltRegistry.versions).filter((v) => v !== __saltRegistry.current);
}

// ============================================================================
// Test helpers - only available in test environment
// ============================================================================

/**
 * Set a test salt for unit testing. Only works in test environment.
 * Creates a single-version registry with the given salt and version.
 *
 * @param {string} salt - The test salt to use
 * @param {string} [version="v1"] - The version label
 */
export function _setTestSalt(salt, version = "v1") {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("_setTestSalt can only be used in test environment");
  }
  __saltRegistry = { current: version, versions: { [version]: salt } };
  __initPromise = null;
  __saltFetchedAt = Date.now();
}

/**
 * Clear the cached salt. Only works in test environment.
 */
export function _clearSalt() {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("_clearSalt can only be used in test environment");
  }
  __saltRegistry = null;
  __initPromise = null;
  __saltFetchedAt = 0;
}
