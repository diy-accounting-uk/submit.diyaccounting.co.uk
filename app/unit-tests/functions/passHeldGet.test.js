// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, vi, beforeEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { buildEventWithToken, makeIdToken } from "@app/test-helpers/eventBuilders.js";

const mockListHeldPasses = vi.fn();
vi.mock("@app/services/passService.js", () => ({
  listHeldPasses: (...args) => mockListHeldPasses(...args),
}));

import { ingestHandler } from "@app/functions/account/passHeldGet.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const operatorEmail = "operator@example.com";
const tokenFor = (email) => makeIdToken("caller-sub", { email });
const held = [
  { code: "tiger-happy-mountain-silver", issuedBy: "hash-1", useCount: 1000, reviewLimit: 1000, heldAt: "2026-10-30T09:15:00.000Z" },
];

describe("passHeldGet", () => {
  beforeEach(() => {
    mockListHeldPasses.mockReset();
    mockListHeldPasses.mockResolvedValue(held);
    process.env.PASSES_DYNAMODB_TABLE_NAME = "test-passes";
    process.env.OPERATOR_EMAILS = operatorEmail;
  });

  test("returns 401 and lists nothing without an authorization header", async () => {
    const result = await ingestHandler(buildEventWithToken(null, null, { method: "GET" }));
    expect(result.statusCode).toBe(401);
    expect(mockListHeldPasses).not.toHaveBeenCalled();
  });

  test("returns 403 and lists nothing for a customer", async () => {
    const result = await ingestHandler(buildEventWithToken(tokenFor("customer@example.com"), null, { method: "GET" }));
    expect(result.statusCode).toBe(403);
    expect(mockListHeldPasses).not.toHaveBeenCalled();
  });

  test("an operator gets the held passes", async () => {
    const result = await ingestHandler(buildEventWithToken(tokenFor(operatorEmail), null, { method: "GET" }));
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).passes).toEqual(held);
  });

  test("an empty hold list is an empty array", async () => {
    mockListHeldPasses.mockResolvedValue([]);
    const result = await ingestHandler(buildEventWithToken(tokenFor(operatorEmail), null, { method: "GET" }));
    expect(JSON.parse(result.body).passes).toEqual([]);
  });

  test("returns 500 JSON when the query throws", async () => {
    mockListHeldPasses.mockRejectedValue(new Error("boom"));
    const result = await ingestHandler(buildEventWithToken(tokenFor(operatorEmail), null, { method: "GET" }));
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toBe("Failed to list held passes");
  });
});
