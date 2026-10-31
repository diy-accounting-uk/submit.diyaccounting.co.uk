// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, vi, beforeEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { buildEventWithToken, makeIdToken } from "@app/test-helpers/eventBuilders.js";

const mockReleasePass = vi.fn();
vi.mock("@app/services/passService.js", () => ({
  releasePass: (...args) => mockReleasePass(...args),
}));

import { ingestHandler } from "@app/functions/account/passReleasePost.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const operatorEmail = "operator@example.com";
const customerEmail = "customer@example.com";
const tokenFor = (email) => makeIdToken("caller-sub", { email });
const code = "tiger-happy-mountain-silver";

describe("passReleasePost", () => {
  beforeEach(() => {
    mockReleasePass.mockReset();
    mockReleasePass.mockResolvedValue({ code, useCount: 1000, reviewLimit: 2000 });
    process.env.PASSES_DYNAMODB_TABLE_NAME = "test-passes";
    process.env.OPERATOR_EMAILS = operatorEmail;
  });

  test("returns 401 and releases nothing without an authorization header", async () => {
    const result = await ingestHandler(buildEventWithToken(null, { code, raiseBy: 1000 }));
    expect(result.statusCode).toBe(401);
    expect(mockReleasePass).not.toHaveBeenCalled();
  });

  test("returns 403 and releases nothing for a customer", async () => {
    const result = await ingestHandler(buildEventWithToken(tokenFor(customerEmail), { code, raiseBy: 1000 }));
    expect(result.statusCode).toBe(403);
    expect(JSON.parse(result.body).message).toBe("Not permitted to release passes");
    expect(mockReleasePass).not.toHaveBeenCalled();
  });

  test("an operator raises the limit and gets the new limit back", async () => {
    const result = await ingestHandler(buildEventWithToken(tokenFor(operatorEmail), { code, raiseBy: 1000 }));
    expect(result.statusCode).toBe(200);
    expect(mockReleasePass).toHaveBeenCalledWith(code, { raiseBy: 1000, reviewLimit: undefined, remove: undefined });
    expect(JSON.parse(result.body)).toEqual({ code, useCount: 1000, reviewLimit: 2000, heldForReview: false });
  });

  test("an operator sets the limit to a value", async () => {
    const result = await ingestHandler(buildEventWithToken(tokenFor(operatorEmail), { code, reviewLimit: 5000 }));
    expect(result.statusCode).toBe(200);
    expect(mockReleasePass).toHaveBeenCalledWith(code, { raiseBy: undefined, reviewLimit: 5000, remove: undefined });
  });

  test("an operator removes the limit and the answer carries no limit", async () => {
    mockReleasePass.mockResolvedValue({ code, useCount: 1000 });
    const result = await ingestHandler(buildEventWithToken(tokenFor(operatorEmail), { code, remove: true }));
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ code, useCount: 1000, reviewLimit: null, heldForReview: false });
  });

  test.each([
    ["no code", { raiseBy: 1 }],
    ["no change", { code }],
    ["two changes", { code, raiseBy: 1, remove: true }],
    ["a zero raise", { code, raiseBy: 0 }],
    ["a fractional limit", { code, reviewLimit: 1.5 }],
    ["remove set to false", { code, remove: false }],
  ])("returns 400 JSON for %s", async (_name, body) => {
    const result = await ingestHandler(buildEventWithToken(tokenFor(operatorEmail), body));
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBeTruthy();
    expect(mockReleasePass).not.toHaveBeenCalled();
  });

  test("returns 404 JSON when the pass does not exist", async () => {
    mockReleasePass.mockResolvedValue(null);
    const result = await ingestHandler(buildEventWithToken(tokenFor(operatorEmail), { code, raiseBy: 1 }));
    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body).message).toBe("Pass not found");
  });

  test("returns 500 JSON when the update throws", async () => {
    mockReleasePass.mockRejectedValue(new Error("boom"));
    const result = await ingestHandler(buildEventWithToken(tokenFor(operatorEmail), { code, raiseBy: 1 }));
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toBe("Failed to release pass");
  });
});
