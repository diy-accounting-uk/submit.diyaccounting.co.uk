// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability OPS-165 Read a Secrets Manager secret with a five minute cache and a forced refresh
// - **Use when:** a Lambda reads a secret that can be rolled and must pick up the new value without a deploy.
// - **Does:** cachedSecret.js reads a secret once in five minutes and shares one request between concurrent reads. After an authentication failure, refreshAfterAuthFailure reads it again and gives the new value, or null when the value is unchanged. withSecretRetry runs a call with the value and, on an authentication failure, runs it once more with the refreshed value. A forced refresh inside ten seconds of the last read returns the cached value, so bad requests cannot flood Secrets Manager.
// - **Run:** `import { readSecret, withSecretRetry } from "app/lib/cachedSecret.js"`
// - **Entry:** `app/lib/cachedSecret.js:readSecret`; `app/lib/cachedSecret.js:refreshAfterAuthFailure`; `app/lib/cachedSecret.js:withSecretRetry`
// - **Files:** app/lib/cachedSecret.js, app/unit-tests/lib/cachedSecret.test.js, app/unit-tests/lib/secretRollRetry.test.js
// - **Keywords:** secret cache, forced refresh, authentication failure retry, rolled secret, warm container, secrets manager read
// - **Related:** OPS-45, OPS-85
// @end-capability

// app/lib/cachedSecret.js
// One cached read of a Secrets Manager secret. A value lives for five minutes, so a warm Lambda
// container picks up a rolled secret without a deploy. A caller that meets an authentication
// failure asks for a forced refresh and retries once with the new value.

import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

export const SECRET_TTL_MS = 5 * 60 * 1000;
// A forced refresh inside this window of the last read returns the cached value, so a stream of
// bad requests cannot turn into a stream of Secrets Manager calls.
export const FORCE_REFRESH_MIN_MS = 10 * 1000;

const smClient = new SecretsManagerClient({ region: process.env.AWS_REGION || "eu-west-2" });
const entries = new Map();

/**
 * The value of one secret, read from Secrets Manager at most once in five minutes.
 * Concurrent reads of one secret share one request. A failed read is not cached. A forced refresh
 * reads again unless the last read is under ten seconds old.
 * @param {string} secretId - the secret name or ARN
 * @param {{forceRefresh?: boolean, now?: number}} [options] - `now` in epoch milliseconds
 * @returns {Promise<string>}
 */
export function readSecret(secretId, { forceRefresh = false, now = Date.now() } = {}) {
  const entry = entries.get(secretId);
  if (entry) {
    const age = now - entry.readAt;
    if (entry.pending || age < (forceRefresh ? FORCE_REFRESH_MIN_MS : SECRET_TTL_MS)) return entry.promise;
  }
  const promise = (async () => {
    const result = await smClient.send(new GetSecretValueCommand({ SecretId: secretId }));
    if (!result.SecretString) throw new Error(`Secret ${secretId} exists but has no SecretString value`);
    return result.SecretString;
  })();
  const fresh = { promise, readAt: now, pending: true };
  entries.set(secretId, fresh);
  const settle = (failed) => {
    fresh.pending = false;
    if (failed && entries.get(secretId) === fresh) entries.delete(secretId);
  };
  promise
    .then(
      () => settle(false),
      () => settle(true),
    )
    .catch(() => {});
  return promise;
}

/**
 * Re-read a secret after an authentication failure.
 * @param {string} secretId
 * @param {string} usedValue - the value the failed call used
 * @param {{now?: number}} [options] - `now` in epoch milliseconds
 * @returns {Promise<string|null>} the new value, or null when the secret still holds the used value, so a retry would fail the same way
 */
export async function refreshAfterAuthFailure(secretId, usedValue, { now } = {}) {
  const value = await readSecret(secretId, { forceRefresh: true, now });
  return value === usedValue ? null : value;
}

/**
 * Run `attempt` with a secret's value. When it throws an authentication failure, read the secret
 * again and run it once more, only when the secret now holds another value. A second failure
 * throws.
 * @param {string} secretId
 * @param {(value: string) => Promise<T>} attempt
 * @param {(error: Error) => boolean} isAuthFailure
 * @returns {Promise<T>}
 * @template T
 */
export async function withSecretRetry(secretId, attempt, isAuthFailure) {
  const value = await readSecret(secretId);
  try {
    return await attempt(value);
  } catch (error) {
    if (!isAuthFailure(error)) throw error;
    const refreshedValue = await refreshAfterAuthFailure(secretId, value);
    if (refreshedValue === null) throw error;
    return attempt(refreshedValue);
  }
}

export function resetSecretCache() {
  entries.clear();
}
