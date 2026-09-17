// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/emailHash.js
// HMAC-SHA256 email hashing for pass email restrictions.
//
// Email addresses are hashed before storage so that passes can be email-restricted
// without storing plaintext email addresses in the passes table.
//
// The secret is a versioned registry, the same shape subHasher.js uses for the user sub
// hash salt: {"current":"v1","versions":{"v1":"secret-value"}}. Every pass record stores
// the emailHashSecretVersion it was hashed with, so re-checking a stored hash re-derives it
// with that exact version rather than falling back through every previous one.

import { createHmac } from "node:crypto";
import { createLogger } from "./logger.js";

const logger = createLogger({ source: "app/lib/emailHash.js" });

/**
 * Hash an email address using HMAC-SHA256 with the provided secret.
 * The email is normalised (lowercased, trimmed) before hashing for consistency.
 *
 * @param {string} email - The email address to hash
 * @param {string} secret - The HMAC secret
 * @returns {string} Base64url-encoded HMAC-SHA256 hash
 * @throws {Error} If email or secret is missing/invalid
 */
export function hashEmail(email, secret) {
  if (!email || typeof email !== "string") {
    throw new Error("Invalid email: must be a non-empty string");
  }
  if (!secret || typeof secret !== "string") {
    throw new Error("Invalid secret: must be a non-empty string");
  }

  const normalised = email.toLowerCase().trim();
  return createHmac("sha256", secret).update(normalised).digest("base64url");
}

/**
 * Parse an email hash secret value into a registry, tolerating the legacy raw-string form the
 * secret was created in by hand: a value that isn't JSON with a "current" field is wrapped as
 * that raw string's v1, exactly what it meant before the registry format existed. Running
 * email-hash-rotate.yml once converts a live secret from this legacy form to a real registry,
 * because rotation always writes the registry shape back.
 *
 * @param {string} raw - The secret value: registry JSON, or a legacy raw secret string
 * @returns {object} The registry object
 * @throws {Error} If it parses as JSON with a "current" field but is otherwise malformed
 */
function parseEmailHashSecretRegistry(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }
  if (!parsed || typeof parsed !== "object" || !parsed.current) {
    return { current: "v1", versions: { v1: raw } };
  }
  if (!parsed.versions || !parsed.versions[parsed.current]) {
    throw new Error(
      `Email hash secret registry missing required fields. Got current="${parsed.current}" ` +
        `but versions has keys: [${Object.keys(parsed.versions || {})}]`,
    );
  }
  return parsed;
}

let __emailHashRegistry = null; // { current: "v1", versions: { "v1": "secret..." } }
let __initPromise = null;
let __registryFetchedAt = 0;
const REGISTRY_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes — warm containers re-fetch after rotation

/**
 * Initialize the email hash secret from environment variable or AWS Secrets Manager.
 * Call this at the top of your Lambda handler before using hashEmailWithEnvSecret().
 *
 * The secret must be in multi-version registry JSON format:
 * {"current":"v1","versions":{"v1":"secret-value"}}
 *
 * @returns {Promise<void>}
 */
export async function initializeEmailHashSecret() {
  if (__emailHashRegistry && Date.now() - __registryFetchedAt < REGISTRY_CACHE_TTL_MS) {
    logger.debug({ message: "Email hash secret already initialized (warm start)" });
    return;
  }

  // TTL expired — clear cache so we re-fetch
  if (__emailHashRegistry) {
    logger.info({ message: "Email hash secret cache TTL expired, re-fetching from Secrets Manager" });
    __emailHashRegistry = null;
    __initPromise = null;
  }

  // Prevent concurrent initialization during cold start
  if (__initPromise) {
    return __initPromise;
  }

  __initPromise = (async () => {
    try {
      if (process.env.EMAIL_HASH_SECRET) {
        logger.info({ message: "Using EMAIL_HASH_SECRET from environment (local dev/test)" });
        __emailHashRegistry = parseEmailHashSecretRegistry(process.env.EMAIL_HASH_SECRET);
        __registryFetchedAt = Date.now();
        return;
      }

      const envName = process.env.ENVIRONMENT_NAME;
      if (!envName) {
        throw new Error("ENVIRONMENT_NAME environment variable is required for Secrets Manager access.");
      }
      const secretName = `${envName}/submit/email-hash-secret`;

      logger.info({ message: "Fetching email hash secret from Secrets Manager", secretName });

      const { SecretsManagerClient, GetSecretValueCommand } = await import("@aws-sdk/client-secrets-manager");
      const client = new SecretsManagerClient({
        region: process.env.AWS_REGION || "eu-west-2",
      });

      const response = await client.send(new GetSecretValueCommand({ SecretId: secretName }));
      if (!response.SecretString) {
        throw new Error(`Secret ${secretName} exists but has no SecretString value`);
      }

      __emailHashRegistry = parseEmailHashSecretRegistry(response.SecretString);
      __registryFetchedAt = Date.now();
      logger.info({ message: "Email hash secret successfully fetched and cached" });
    } catch (error) {
      logger.error({ message: "Failed to fetch email hash secret", error: error.message });
      __initPromise = null;
      throw new Error(`Failed to initialize email hash secret: ${error.message}.`);
    }
  })();

  return __initPromise;
}

/**
 * Hash an email using the current version of the cached registry.
 * initializeEmailHashSecret() must be called before this function.
 *
 * @param {string} email - The email address to hash
 * @returns {{ hash: string, secretVersion: string }} The hash and the secret version used
 * @throws {Error} If secret not initialized
 */
export function hashEmailWithEnvSecret(email) {
  if (!__emailHashRegistry) {
    throw new Error("Email hash secret not initialized. Call initializeEmailHashSecret() first.");
  }
  const secret = __emailHashRegistry.versions[__emailHashRegistry.current];
  return {
    hash: hashEmail(email, secret),
    secretVersion: __emailHashRegistry.current,
  };
}

/**
 * Hash an email using a specific secret version from the registry.
 * Used to re-check a pass's stored restrictedToEmailHash against the exact version recorded
 * on that pass (buildPassRecord stores emailHashSecretVersion), so a rotation never needs to
 * try every version in turn.
 *
 * @param {string} email - The email address to hash
 * @param {string} version - The secret version to use (e.g., "v1", "v2")
 * @returns {string} Base64url-encoded HMAC-SHA256 hash
 * @throws {Error} If email is invalid, the secret is not initialized, or the version is unknown
 */
export function hashEmailWithVersion(email, version) {
  if (!__emailHashRegistry) {
    throw new Error("Email hash secret not initialized. Call initializeEmailHashSecret() first.");
  }
  const secret = __emailHashRegistry.versions[version];
  if (!secret) {
    throw new Error(
      `Email hash secret version "${version}" not found in registry. Available: [${Object.keys(__emailHashRegistry.versions)}]`,
    );
  }
  return hashEmail(email, secret);
}

/**
 * Get the current secret version (for storing on pass records).
 * @returns {string|null} The current version or null if not initialized
 */
export function getEmailHashSecretVersion() {
  return __emailHashRegistry ? __emailHashRegistry.current : null;
}

// Test helpers
export function _setTestEmailHashSecret(secret, version = "test-v1") {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("_setTestEmailHashSecret can only be used in test environment");
  }
  __emailHashRegistry = { current: version, versions: { [version]: secret } };
  __initPromise = null;
  __registryFetchedAt = Date.now();
}

export function _setTestEmailHashSecretRegistry(registry) {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("_setTestEmailHashSecretRegistry can only be used in test environment");
  }
  __emailHashRegistry = registry;
  __initPromise = null;
  __registryFetchedAt = Date.now();
}

export function _clearEmailHashSecret() {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("_clearEmailHashSecret can only be used in test environment");
  }
  __emailHashRegistry = null;
  __initPromise = null;
  __registryFetchedAt = 0;
}
