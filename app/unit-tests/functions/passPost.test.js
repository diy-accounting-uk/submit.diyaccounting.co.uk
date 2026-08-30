// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { buildEventWithToken, makeIdToken } from "@app/test-helpers/eventBuilders.js";

// Mock passService
const mockRedeemPass = vi.fn();
vi.mock("@app/services/passService.js", () => ({
  redeemPass: (...args) => mockRedeemPass(...args),
}));

// Mock emailHash
vi.mock("@app/lib/emailHash.js", () => ({
  initializeEmailHashSecret: vi.fn().mockResolvedValue(undefined),
}));

// Mock subHasher
vi.mock("@app/services/subHasher.js", () => ({
  initializeSalt: vi.fn().mockResolvedValue(undefined),
  hashSub: vi.fn((sub) => `hashed_${sub}`),
  isSaltInitialized: vi.fn(() => true),
}));

// Mock EventBridge, capturing sent events so activity-event tests can inspect the Detail JSON.
const mockEventBridgeSend = vi.fn().mockResolvedValue({});
vi.mock("@aws-sdk/client-eventbridge", () => ({
  EventBridgeClient: class {
    send(...args) {
      return mockEventBridgeSend(...args);
    }
  },
  PutEventsCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
}));

// Mock grantBundle
const mockGrantBundle = vi.fn();
vi.mock("@app/functions/account/bundlePost.js", () => ({
  grantBundle: (...args) => mockGrantBundle(...args),
}));

import { ingestHandler } from "@app/functions/account/passPost.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

describe("passPost", () => {
  const validToken = makeIdToken("test-user-sub", { email: "user@example.com" });

  beforeEach(() => {
    mockRedeemPass.mockReset();
    mockGrantBundle.mockReset();
    mockGrantBundle.mockResolvedValue({ status: "granted", expiry: "2026-03-01T00:00:00.000Z" });
    mockEventBridgeSend.mockClear();
    process.env.PASSES_DYNAMODB_TABLE_NAME = "test-passes";
    process.env.BUNDLE_DYNAMODB_TABLE_NAME = "test-bundles";
    process.env.USER_SUB_HASH_SALT = '{"current":"v1","versions":{"v1":"test-salt-for-unit-tests"}}';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("returns 401 when no authorization header", async () => {
    const event = buildEventWithToken(null, { code: "test-pass-code" });
    const result = await ingestHandler(event);
    expect(result.statusCode).toBe(401);
  });

  test("returns 400 when code is missing", async () => {
    const event = buildEventWithToken(validToken, {});
    const result = await ingestHandler(event);
    expect(result.statusCode).toBe(400);
  });

  test("returns requiresSubscription for on-pass-on-subscription bundles", async () => {
    mockRedeemPass.mockResolvedValue({
      valid: true,
      bundleId: "resident-pro",
      pass: { testPass: false },
    });

    const event = buildEventWithToken(validToken, { code: "test-pass-code" });
    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.redeemed).toBe(false);
    expect(body.valid).toBe(true);
    expect(body.requiresSubscription).toBe(true);
    expect(body.bundleId).toBe("resident-pro");
    expect(body.testPass).toBe(false);
    // Should NOT have called grantBundle
    expect(mockGrantBundle).not.toHaveBeenCalled();
  });

  test("returns testPass true in requiresSubscription response for test passes", async () => {
    mockRedeemPass.mockResolvedValue({
      valid: true,
      bundleId: "resident-pro",
      pass: { testPass: true },
    });

    const event = buildEventWithToken(validToken, { code: "test-pass-code" });
    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.redeemed).toBe(false);
    expect(body.valid).toBe(true);
    expect(body.requiresSubscription).toBe(true);
    expect(body.testPass).toBe(true);
    expect(mockGrantBundle).not.toHaveBeenCalled();
  });

  test("grants bundle for non-subscription bundles", async () => {
    mockRedeemPass.mockResolvedValue({
      valid: true,
      bundleId: "day-guest",
      pass: { testPass: false },
    });

    const event = buildEventWithToken(validToken, { code: "test-pass-code" });
    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.redeemed).toBe(true);
    expect(body.bundleId).toBe("day-guest");
    expect(body.testPass).toBe(false);
    expect(mockGrantBundle).toHaveBeenCalledTimes(1);
  });

  test("returns testPass true in redeemed response for test passes", async () => {
    mockRedeemPass.mockResolvedValue({
      valid: true,
      bundleId: "day-guest",
      pass: { testPass: true },
    });

    const event = buildEventWithToken(validToken, { code: "test-pass-code" });
    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.redeemed).toBe(true);
    expect(body.testPass).toBe(true);
  });

  test("returns error reason for invalid pass", async () => {
    mockRedeemPass.mockResolvedValue({
      valid: false,
      reason: "not_found",
    });

    const event = buildEventWithToken(validToken, { code: "invalid-code" });
    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.redeemed).toBe(false);
    expect(body.reason).toBe("not_found");
  });

  test("publishes the pass-redeemed event with the hashed sub, never the raw sub", async () => {
    mockRedeemPass.mockResolvedValue({
      valid: true,
      bundleId: "day-guest",
      pass: { testPass: false },
    });

    const event = buildEventWithToken(validToken, { code: "test-pass-code" });
    await ingestHandler(event);

    expect(mockEventBridgeSend).toHaveBeenCalledTimes(1);
    const rawDetail = mockEventBridgeSend.mock.calls[0][0].input.Entries[0].Detail;
    // Only the hashed form ("hashed_test-user-sub") should appear, never the bare raw sub as its own field value.
    expect(rawDetail).not.toContain('"test-user-sub"');
    const detail = JSON.parse(rawDetail);
    expect(detail.event).toBe("pass-redeemed");
    expect(detail.hashedSub).toBe("hashed_test-user-sub");
  });
});
