// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/emailHash.js
// HMAC-SHA256 email hashing for pass email restrictions.
//
// Email addresses are hashed before storage so that passes can be email-restricted
// without storing plaintext email addresses in the passes table.

import { createHmac } from "node:crypto";
import { createLogger } from "./logger.js";

const logger = createLogger({ source: "app/lib/emailHash.js" });

/**
 * Hash an email address using HMAC-SHA256 with the provided secret.
 * The email is normalised (lowercased, trimmed) before hashing for consistency.
 *
 * @param {string} email - The email address to hash
 * @param {string} secret - The HMAC secret (from EMAIL_HASH_SECRET env var or Secrets Manager)
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

let __cachedEmailHashSecret = null;
let __cachedEmailHashSecretVersion = null;
let __initPromise = null;

/**
 * Initialize the email hash secret from environment variable or AWS Secrets Manager.
 * Call this at the top of your Lambda handler before using hashEmailWithEnvSecret().
 *
 * @returns {Promise<void>}
 */
export async function initializeEmailHashSecret() {
  if (__cachedEmailHashSecret) {
    logger.debug({ message: "Email hash secret already initialized" });
    return;
  }

  if (__initPromise) {
    return __initPromise;
  }

  __initPromise = (async () => {
    try {
      if (process.env.EMAIL_HASH_SECRET) {
        logger.info({ message: "Using EMAIL_HASH_SECRET from environment (local dev/test)" });
        __cachedEmailHashSecret = process.env.EMAIL_HASH_SECRET;
        __cachedEmailHashSecretVersion = process.env.EMAIL_HASH_SECRET_VERSION || "v1";
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

      __cachedEmailHashSecret = response.SecretString;
      __cachedEmailHashSecretVersion = response.VersionId || "v1";
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
 * Hash an email using the cached environment secret.
 * initializeEmailHashSecret() must be called before this function.
 *
 * @param {string} email - The email address to hash
 * @returns {{ hash: string, secretVersion: string }} The hash and the secret version used
 * @throws {Error} If secret not initialized
 */
export function hashEmailWithEnvSecret(email) {
  if (!__cachedEmailHashSecret) {
    throw new Error("Email hash secret not initialized. Call initializeEmailHashSecret() first.");
  }
  return {
    hash: hashEmail(email, __cachedEmailHashSecret),
    secretVersion: __cachedEmailHashSecretVersion,
  };
}

/**
 * Get the current secret version (for storing on pass records).
 * @returns {string|null} The secret version or null if not initialized
 */
export function getEmailHashSecretVersion() {
  return __cachedEmailHashSecretVersion;
}

// Test helpers
export function _setTestEmailHashSecret(secret, version = "test-v1") {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("_setTestEmailHashSecret can only be used in test environment");
  }
  __cachedEmailHashSecret = secret;
  __cachedEmailHashSecretVersion = version;
  __initPromise = null;
}

export function _clearEmailHashSecret() {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("_clearEmailHashSecret can only be used in test environment");
  }
  __cachedEmailHashSecret = null;
  __cachedEmailHashSecretVersion = null;
  __initPromise = null;
}
