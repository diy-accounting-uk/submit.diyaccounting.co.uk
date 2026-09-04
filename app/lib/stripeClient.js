// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/lib/stripeClient.js

import Stripe from "stripe";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { createLogger } from "./logger.js";

const logger = createLogger({ source: "app/lib/stripeClient.js" });

const smClient = new SecretsManagerClient({ region: process.env.AWS_REGION || "eu-west-2" });

let cachedLiveClient = null;
let cachedLiveKey = null;
let cachedTestClient = null;
let cachedTestKey = null;

async function resolveSecretKey({ test = false } = {}) {
  if (test) {
    // Test mode: prefer STRIPE_TEST_SECRET_KEY, then STRIPE_TEST_SECRET_KEY_ARN
    if (process.env.STRIPE_TEST_SECRET_KEY) {
      return process.env.STRIPE_TEST_SECRET_KEY;
    }
    const arn = process.env.STRIPE_TEST_SECRET_KEY_ARN;
    if (arn) {
      const result = await smClient.send(new GetSecretValueCommand({ SecretId: arn }));
      return result.SecretString;
    }
    // Fall through to live key if no test key configured
    logger.warn({ message: "No test Stripe key configured, falling back to default key" });
  }

  // Live mode (or fallback): prefer STRIPE_SECRET_KEY, then STRIPE_SECRET_KEY_ARN
  if (process.env.STRIPE_SECRET_KEY) {
    return process.env.STRIPE_SECRET_KEY;
  }

  const arn = process.env.STRIPE_SECRET_KEY_ARN;
  if (!arn) {
    throw new Error("Neither STRIPE_SECRET_KEY nor STRIPE_SECRET_KEY_ARN is set");
  }

  const result = await smClient.send(new GetSecretValueCommand({ SecretId: arn }));
  return result.SecretString;
}

function buildStripeOptions() {
  const options = {};
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
 * Supports test/live mode switching — same pattern as HMRC sandbox/live selection.
 * @param {{ test?: boolean }} options - Set test=true for Stripe test mode
 * @returns {Promise<Stripe>}
 */
export async function getStripeClient({ test = false } = {}) {
  const secretKey = await resolveSecretKey({ test });
  const options = buildStripeOptions();

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
