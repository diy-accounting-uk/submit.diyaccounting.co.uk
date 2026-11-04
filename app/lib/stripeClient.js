// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/stripeClient.js

import Stripe from "stripe";
import { readSecret, refreshAfterAuthFailure } from "./cachedSecret.js";
import { createLogger } from "./logger.js";
import { StripeRecordingHttpClient, stripeCallTarget } from "./stripeRecordingHttpClient.js";

const logger = createLogger({ source: "app/lib/stripeClient.js" });

let cachedLiveClient = null;
let cachedLiveKey = null;
let cachedTestClient = null;
let cachedTestKey = null;

/**
 * The secret key for one mode, and the Secrets Manager id it was read from (null when an
 * environment variable supplied it).
 */
async function resolveSecretKey({ test = false } = {}) {
  if (test) {
    // Test mode: prefer STRIPE_TEST_SECRET_KEY, then STRIPE_TEST_SECRET_KEY_ARN
    if (process.env.STRIPE_TEST_SECRET_KEY) {
      return { secretKey: process.env.STRIPE_TEST_SECRET_KEY, secretId: null };
    }
    const arn = process.env.STRIPE_TEST_SECRET_KEY_ARN;
    if (arn) {
      return { secretKey: await readSecret(arn), secretId: arn };
    }
    // Fall through to live key if no test key configured
    logger.warn({ message: "No test Stripe key configured, falling back to default key" });
  }

  // Live mode (or fallback): prefer STRIPE_SECRET_KEY, then STRIPE_SECRET_KEY_ARN
  if (process.env.STRIPE_SECRET_KEY) {
    return { secretKey: process.env.STRIPE_SECRET_KEY, secretId: null };
  }

  const arn = process.env.STRIPE_SECRET_KEY_ARN;
  if (!arn) {
    throw new Error("Neither STRIPE_SECRET_KEY nor STRIPE_SECRET_KEY_ARN is set");
  }

  return { secretKey: await readSecret(arn), secretId: arn };
}

// A 401 from Stripe means the key was rolled. The HTTP client reads the secret again and sends the
// request once more, only when the secret now holds another key; the next getStripeClient call
// then builds a client with that key.
function buildStripeOptions(secretKey, secretId) {
  const refreshKey = secretId ? (usedKey) => refreshAfterAuthFailure(secretId, usedKey) : undefined;
  const options = { httpClient: new StripeRecordingHttpClient({ target: stripeCallTarget(secretKey), refreshKey }) };
  if (process.env.STRIPE_API_BASE_URL) {
    options.apiVersion = "2024-12-18.acacia";
    options.host = new URL(process.env.STRIPE_API_BASE_URL).hostname;
    options.port = new URL(process.env.STRIPE_API_BASE_URL).port;
    options.protocol = new URL(process.env.STRIPE_API_BASE_URL).protocol.replace(":", "");
    logger.info({ message: "Using Stripe API base URL override", baseUrl: process.env.STRIPE_API_BASE_URL });
  }
  return options;
}

/**
 * Get a lazy-initialized Stripe SDK client.
 * Caches the client across Lambda warm starts.
 * Supports test/live mode switching — same pattern as HMRC synthetic/live selection.
 * @param {{ test?: boolean }} options - Set test=true for Stripe test mode
 * @returns {Promise<Stripe>}
 */
export async function getStripeClient({ test = false } = {}) {
  const { secretKey, secretId } = await resolveSecretKey({ test });
  const options = buildStripeOptions(secretKey, secretId);

  if (test) {
    if (cachedTestClient && cachedTestKey === secretKey) {
      return cachedTestClient;
    }
    cachedTestClient = new Stripe(secretKey, options);
    cachedTestKey = secretKey;
    return cachedTestClient;
  }

  if (cachedLiveClient && cachedLiveKey === secretKey) {
    return cachedLiveClient;
  }
  cachedLiveClient = new Stripe(secretKey, options);
  cachedLiveKey = secretKey;
  return cachedLiveClient;
}
