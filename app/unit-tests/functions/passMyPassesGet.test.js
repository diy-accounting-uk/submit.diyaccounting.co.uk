// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { buildEventWithToken, makeIdToken, buildLambdaEvent } from "@app/test-helpers/eventBuilders.js";

// Mock passRepository
const mockGetPassesByIssuer = vi.fn();
vi.mock("@app/data/dynamoDbPassRepository.js", () => ({
  getPassesByIssuer: (...args) => mockGetPassesByIssuer(...args),
}));

// Mock subHasher
vi.mock("@app/services/subHasher.js", () => ({
  initializeSalt: vi.fn().mockResolvedValue(undefined),
  hashSub: vi.fn((sub) => `hashed_${sub}`),
}));

import { ingestHandler } from "@app/functions/account/passMyPassesGet.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

describe("passMyPassesGet", () => {
  const validToken = makeIdToken("test-user-sub", { email: "user@example.com" });

  beforeEach(() => {
    mockGetPassesByIssuer.mockReset();
    process.env.PASSES_DYNAMODB_TABLE_NAME = "test-passes";
    process.env.USER_SUB_HASH_SALT = '{"current":"v1","versions":{"v1":"test-salt-for-unit-tests"}}';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("returns 403 when no authorization header", async () => {
    const event = buildLambdaEvent({ method: "GET", headers: {} });
    const result = await ingestHandler(event);
    expect(result.statusCode).toBe(403);
  });

  test("returns empty list when no passes found", async () => {
    mockGetPassesByIssuer.mockResolvedValue({ items: [] });

    const event = buildEventWithToken(validToken, null, { method: "GET" });
    const result = await ingestHandler(event);
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body);
    expect(body.passes).toEqual([]);
    expect(body.count).toBe(0);
  });

  test("returns passes with correct fields", async () => {
    mockGetPassesByIssuer.mockResolvedValue({
      items: [
        {
          pk: "pass#tiger-happy-mountain-silver",
          code: "tiger-happy-mountain-silver",
          passTypeId: "digital-pass",
          bundleId: "day-guest",
          validFrom: "2026-02-17T00:00:00.000Z",
          validUntil: "2026-02-24T00:00:00.000Z",
          maxUses: 20,
          useCount: 5,
          createdAt: "2026-02-17T00:00:00.000Z",
          issuedBy: "hashed_test-user-sub",
          notes: "Campaign 1",
        },
        {
          pk: "pass#ocean-purple-forest-dawn",
          code: "ocean-purple-forest-dawn",
          passTypeId: "physical-pass",
          bundleId: "day-guest",
          validFrom: "2026-02-16T00:00:00.000Z",
          maxUses: 1,
          useCount: 0,
          createdAt: "2026-02-16T00:00:00.000Z",
          issuedBy: "hashed_test-user-sub",
        },
      ],
    });

    const event = buildEventWithToken(validToken, null, { method: "GET" });
    const result = await ingestHandler(event);
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body);
    expect(body.passes).toHaveLength(2);
    expect(body.count).toBe(2);

    const first = body.passes[0];
    expect(first.code).toBe("tiger-happy-mountain-silver");
    expect(first.passTypeId).toBe("digital-pass");
    expect(first.useCount).toBe(5);
    expect(first.notes).toBe("Campaign 1");

    const second = body.passes[1];
    expect(second.validUntil).toBeNull();
    expect(second.notes).toBeNull();

    // Verify sensitive fields are NOT exposed
    expect(first.pk).toBeUndefined();
    expect(first.issuedBy).toBeUndefined();
  });

  test("passes hashedSub and limit to repository", async () => {
    mockGetPassesByIssuer.mockResolvedValue({ items: [] });

    const event = buildEventWithToken(validToken, null, {
      method: "GET",
      queryStringParameters: { limit: "10" },
    });
    await ingestHandler(event);

    expect(mockGetPassesByIssuer).toHaveBeenCalledWith("hashed_test-user-sub", { limit: 10 });
  });

  test("caps limit at 50", async () => {
    mockGetPassesByIssuer.mockResolvedValue({ items: [] });

    const event = buildEventWithToken(validToken, null, {
      method: "GET",
      queryStringParameters: { limit: "100" },
    });
    await ingestHandler(event);

    expect(mockGetPassesByIssuer).toHaveBeenCalledWith("hashed_test-user-sub", { limit: 50 });
  });

  test("returns 500 when repository fails", async () => {
    mockGetPassesByIssuer.mockRejectedValue(new Error("DynamoDB error"));

    const event = buildEventWithToken(validToken, null, { method: "GET" });
    const result = await ingestHandler(event);
    expect(result.statusCode).toBe(500);
  });
});
