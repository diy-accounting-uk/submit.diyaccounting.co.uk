// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// System tests for token consumption and exhaustion.
//
// Uses dynalite for DynamoDB and exercises:
// - consumeToken (atomic conditional update)
// - consumeTokenForActivity (service layer)
// - Token exhaustion when all tokens are consumed

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getBundle, getActivity } from "./helpers/catalogueValues.js";

let stopDynalite;
let store;
let tokenEnforcement;

const bundleTableName = "bundles-system-test-tokens";

beforeAll(async () => {
  const { ensureBundleTableExists } = await import("../bin/dynamodb.js");
  const { default: dynalite } = await import("dynalite");

  const host = "127.0.0.1";
  const server = dynalite({ createTableMs: 0 });
  const address = await new Promise((resolve, reject) => {
    server.listen(0, host, (err) => (err ? reject(err) : resolve(server.address())));
  });
  stopDynalite = async () => {
    try {
      server.close();
    } catch {}
  };
  const endpoint = `http://${host}:${address.port}`;

  process.env.AWS_REGION = process.env.AWS_REGION || "us-east-1";
  process.env.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || "dummy";
  process.env.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || "dummy";
  process.env.AWS_ENDPOINT_URL = endpoint;
  process.env.AWS_ENDPOINT_URL_DYNAMODB = endpoint;
  process.env.BUNDLE_DYNAMODB_TABLE_NAME = bundleTableName;
  process.env.USER_SUB_HASH_SALT = '{"current":"v1","versions":{"v1":"test-salt-for-token-tests"}}';

  const { initializeSalt } = await import("../services/subHasher.js");
  await initializeSalt();

  await ensureBundleTableExists(bundleTableName, endpoint);

  store = await import("../data/dynamoDbBundleRepository.js");
  tokenEnforcement = await import("../services/tokenEnforcement.js");
});

afterAll(async () => {
  try {
    await stopDynalite?.();
  } catch {}
});

const dayGuestTokens = getBundle("day-guest").tokensGranted;
const submitVatCost = getActivity("submit-vat").tokenCost;

const catalog = {
  bundles: [{ id: "day-guest", tokensGranted: dayGuestTokens }],
  activities: [
    {
      id: "submit-vat",
      tokenCost: submitVatCost,
      bundles: ["day-guest", "invited-guest"],
    },
    {
      id: "vat-obligations",
      tokenCost: 0,
      bundles: ["day-guest"],
    },
  ],
};

describe("System: token consumption with dynalite", () => {
  const userId = "token-test-user-1";
  const bundleId = "day-guest";

  describe("consumeToken (repository)", () => {
    it("should set up a bundle with tokens", async () => {
      const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      await store.putBundle(userId, {
        bundleId,
        expiry,
        tokensGranted: dayGuestTokens,
        tokensConsumed: 0,
      });

      const bundles = await store.getUserBundles(userId);
      const bundle = bundles.find((b) => b.bundleId === bundleId);
      expect(bundle).toBeTruthy();
      expect(bundle.tokensGranted).toBe(dayGuestTokens);
      expect(bundle.tokensConsumed).toBe(0);
    });

    it("should atomically consume tokens until exhausted", async () => {
      // Consume all tokens one by one
      for (let i = 1; i <= dayGuestTokens; i++) {
        const result = await store.consumeToken(userId, bundleId);
        expect(result.consumed).toBe(true);
        expect(result.tokensRemaining).toBe(dayGuestTokens - i);
        expect(result.bundle.tokensConsumed).toBe(i);
      }
    });

    it("should reject consumption when tokens exhausted", async () => {
      const result = await store.consumeToken(userId, bundleId);

      expect(result.consumed).toBe(false);
      expect(result.reason).toBe("tokens_exhausted");
      expect(result.tokensRemaining).toBe(0);
    });

    it("should verify final state in DynamoDB", async () => {
      const bundles = await store.getUserBundles(userId);
      const bundle = bundles.find((b) => b.bundleId === bundleId);
      expect(bundle.tokensConsumed).toBe(dayGuestTokens);
      expect(bundle.tokensGranted).toBe(dayGuestTokens);
    });
  });

  describe("consumeTokenForActivity (service)", () => {
    const userId2 = "token-test-user-2";

    it("should set up a bundle with tokens for service test", async () => {
      const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      await store.putBundle(userId2, {
        bundleId: "day-guest",
        expiry,
        tokensGranted: 2,
        tokensConsumed: 0,
      });
    });

    it("should consume a token via service for submit-vat", async () => {
      const result = await tokenEnforcement.consumeTokenForActivity(userId2, "submit-vat", catalog);

      expect(result.consumed).toBe(true);
      expect(result.tokensRemaining).toBe(1);
      expect(result.cost).toBe(1);
    });

    it("should allow free activity without consuming tokens", async () => {
      const result = await tokenEnforcement.consumeTokenForActivity(userId2, "vat-obligations", catalog);

      expect(result.consumed).toBe(true);
      expect(result.cost).toBe(0);
    });

    it("should consume second (last) token via service", async () => {
      const result = await tokenEnforcement.consumeTokenForActivity(userId2, "submit-vat", catalog);

      expect(result.consumed).toBe(true);
      expect(result.tokensRemaining).toBe(0);
    });

    it("should reject when tokens exhausted via service", async () => {
      const result = await tokenEnforcement.consumeTokenForActivity(userId2, "submit-vat", catalog);

      expect(result.consumed).toBe(false);
      expect(result.reason).toBe("tokens_exhausted");
      expect(result.tokensRemaining).toBe(0);
    });

    it("should still allow free activities when tokens are exhausted", async () => {
      const result = await tokenEnforcement.consumeTokenForActivity(userId2, "vat-obligations", catalog);

      expect(result.consumed).toBe(true);
      expect(result.cost).toBe(0);
    });
  });

  describe("token reset and re-consumption", () => {
    const userId3 = "token-test-user-3";

    it("should set up, exhaust, reset, and consume again", async () => {
      const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      await store.putBundle(userId3, {
        bundleId: "day-guest",
        expiry,
        tokensGranted: 1,
        tokensConsumed: 0,
      });

      // Consume the only token
      const consumed = await store.consumeToken(userId3, "day-guest");
      expect(consumed.consumed).toBe(true);
      expect(consumed.tokensRemaining).toBe(0);

      // Verify exhausted
      const exhausted = await store.consumeToken(userId3, "day-guest");
      expect(exhausted.consumed).toBe(false);

      // Reset tokens (simulates what bundleGet lazy refresh does)
      const nextReset = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      await store.resetTokens(userId3, "day-guest", 3, nextReset);

      // Verify tokens are replenished
      const bundles = await store.getUserBundles(userId3);
      const bundle = bundles.find((b) => b.bundleId === "day-guest");
      expect(bundle.tokensConsumed).toBe(0);
      expect(bundle.tokensGranted).toBe(3);

      // Consume again after reset
      const afterReset = await store.consumeToken(userId3, "day-guest");
      expect(afterReset.consumed).toBe(true);
      expect(afterReset.tokensRemaining).toBe(2);
    });
  });
});
