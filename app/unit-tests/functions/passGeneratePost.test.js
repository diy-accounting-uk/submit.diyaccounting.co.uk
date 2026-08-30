// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { buildEventWithToken, makeIdToken } from "@app/test-helpers/eventBuilders.js";

// Mock passService
const mockCreatePass = vi.fn();
vi.mock("@app/services/passService.js", () => ({
  createPass: (...args) => mockCreatePass(...args),
}));

// Mock tokenEnforcement
const mockConsumeTokenForActivity = vi.fn();
vi.mock("@app/services/tokenEnforcement.js", () => ({
  consumeTokenForActivity: (...args) => mockConsumeTokenForActivity(...args),
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

import { ingestHandler } from "@app/functions/account/passGeneratePost.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

describe("passGeneratePost", () => {
  const validToken = makeIdToken("test-user-sub", { email: "user@example.com" });

  beforeEach(() => {
    mockCreatePass.mockReset();
    mockConsumeTokenForActivity.mockReset();
    mockEventBridgeSend.mockClear();
    process.env.PASSES_DYNAMODB_TABLE_NAME = "test-passes";
    process.env.BUNDLE_DYNAMODB_TABLE_NAME = "test-bundles";
    process.env.USER_SUB_HASH_SALT = '{"current":"v1","versions":{"v1":"test-salt-for-unit-tests"}}';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("returns 403 when no authorization header", async () => {
    const event = buildEventWithToken(null, { passTypeId: "digital-pass" });
    const result = await ingestHandler(event);
    expect(result.statusCode).toBe(403);
  });

  test("returns 400 when passTypeId is missing", async () => {
    const event = buildEventWithToken(validToken, {});
    const result = await ingestHandler(event);
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.message).toContain("passTypeId");
  });

  test("returns 400 for unknown pass type", async () => {
    const event = buildEventWithToken(validToken, { passTypeId: "unknown-type" });
    const result = await ingestHandler(event);
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.message).toContain("Unknown pass type");
  });

  test("returns 400 for non-user-issuable pass type", async () => {
    const event = buildEventWithToken(validToken, { passTypeId: "day-guest-test-pass" });
    const result = await ingestHandler(event);
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.message).toContain("not user-issuable");
  });

  test("returns 403 when tokens are exhausted", async () => {
    mockConsumeTokenForActivity.mockResolvedValue({ consumed: false, reason: "tokens_exhausted", tokensRemaining: 0 });

    const event = buildEventWithToken(validToken, { passTypeId: "digital-pass" });
    const result = await ingestHandler(event);
    expect(result.statusCode).toBe(403);
    const body = JSON.parse(result.body);
    expect(body.message).toContain("Insufficient tokens");
  });

  test("returns 200 with pass details on success (digital-pass)", async () => {
    mockConsumeTokenForActivity.mockResolvedValue({ consumed: true, tokensRemaining: 90, cost: 10 });
    mockCreatePass.mockResolvedValue({
      code: "tiger-happy-mountain-silver",
      passTypeId: "digital-pass",
      bundleId: "day-guest",
      validFrom: "2026-02-17T00:00:00.000Z",
      validUntil: "2026-02-24T00:00:00.000Z",
      maxUses: 20,
    });

    const event = buildEventWithToken(validToken, { passTypeId: "digital-pass", notes: "Test campaign" });
    const result = await ingestHandler(event);
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body);
    expect(body.code).toBe("tiger-happy-mountain-silver");
    expect(body.passTypeId).toBe("digital-pass");
    expect(body.bundleId).toBe("day-guest");
    expect(body.maxUses).toBe(20);
    expect(body.tokensConsumed).toBe(10);
    expect(body.tokensRemaining).toBe(90);
    expect(body.url).toContain("bundles.html?pass=tiger-happy-mountain-silver");
  });

  test("returns 200 with pass details on success (physical-pass)", async () => {
    mockConsumeTokenForActivity.mockResolvedValue({ consumed: true, tokensRemaining: 90, cost: 10 });
    mockCreatePass.mockResolvedValue({
      code: "ocean-purple-forest-dawn",
      passTypeId: "physical-pass",
      bundleId: "day-guest",
      validFrom: "2026-02-17T00:00:00.000Z",
      maxUses: 1,
    });

    const event = buildEventWithToken(validToken, { passTypeId: "physical-pass" });
    const result = await ingestHandler(event);
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body);
    expect(body.code).toBe("ocean-purple-forest-dawn");
    expect(body.passTypeId).toBe("physical-pass");
    expect(body.validUntil).toBeNull();
  });

  test("passes correct parameters to createPass", async () => {
    mockConsumeTokenForActivity.mockResolvedValue({ consumed: true, tokensRemaining: 90, cost: 10 });
    mockCreatePass.mockResolvedValue({
      code: "test-code",
      passTypeId: "digital-pass",
      bundleId: "day-guest",
      validFrom: "2026-02-17T00:00:00.000Z",
      validUntil: "2026-02-24T00:00:00.000Z",
      maxUses: 20,
    });

    const event = buildEventWithToken(validToken, { passTypeId: "digital-pass", notes: "My note" });
    await ingestHandler(event);

    expect(mockCreatePass).toHaveBeenCalledWith(
      expect.objectContaining({
        passTypeId: "digital-pass",
        bundleId: "day-guest",
        validityPeriod: "P7D",
        maxUses: 20,
        issuedBy: "hashed_test-user-sub",
        createdBy: "user",
        notes: "My note",
      }),
    );
  });

  test("returns 500 when createPass fails", async () => {
    mockConsumeTokenForActivity.mockResolvedValue({ consumed: true, tokensRemaining: 90, cost: 10 });
    mockCreatePass.mockRejectedValue(new Error("DynamoDB error"));

    const event = buildEventWithToken(validToken, { passTypeId: "digital-pass" });
    const result = await ingestHandler(event);
    expect(result.statusCode).toBe(500);
  });

  test("publishes the pass-generated event with the hashed sub, never the raw sub", async () => {
    mockConsumeTokenForActivity.mockResolvedValue({ consumed: true, tokensRemaining: 90, cost: 10 });
    mockCreatePass.mockResolvedValue({
      code: "tiger-happy-mountain-silver",
      passTypeId: "digital-pass",
      bundleId: "day-guest",
      validFrom: "2026-02-17T00:00:00.000Z",
      validUntil: "2026-02-24T00:00:00.000Z",
      maxUses: 20,
    });

    const event = buildEventWithToken(validToken, { passTypeId: "digital-pass" });
    await ingestHandler(event);

    expect(mockEventBridgeSend).toHaveBeenCalledTimes(1);
    const rawDetail = mockEventBridgeSend.mock.calls[0][0].input.Entries[0].Detail;
    // Only the hashed form ("hashed_test-user-sub") should appear, never the bare raw sub as its own field value.
    expect(rawDetail).not.toContain('"test-user-sub"');
    const detail = JSON.parse(rawDetail);
    expect(detail.event).toBe("pass-generated");
    expect(detail.hashedSub).toBe("hashed_test-user-sub");
  });
});
