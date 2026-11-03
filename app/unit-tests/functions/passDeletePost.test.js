// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, vi, beforeEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { buildEventWithToken, makeIdToken, buildLambdaEvent } from "@app/test-helpers/eventBuilders.js";

const mockExpirePassAsDeleted = vi.fn();
const mockGetPass = vi.fn();
vi.mock("@app/data/dynamoDbPassRepository.js", () => ({
  expirePassAsDeleted: (...args) => mockExpirePassAsDeleted(...args),
  getPass: (...args) => mockGetPass(...args),
}));

vi.mock("@app/services/subHasher.js", () => ({
  initializeSalt: vi.fn().mockResolvedValue(undefined),
  hashSub: vi.fn((sub) => `hashed_${sub}`),
}));

import { ingestHandler } from "@app/functions/account/passDeletePost.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

describe("passDeletePost", () => {
  const validToken = makeIdToken("issuer-sub", { email: "issuer@example.com" });
  const post = (codes) => ingestHandler(buildEventWithToken(validToken, { codes }));

  beforeEach(() => {
    mockExpirePassAsDeleted.mockReset();
    mockGetPass.mockReset();
    process.env.PASSES_DYNAMODB_TABLE_NAME = "test-passes";
    process.env.USER_SUB_HASH_SALT = '{"current":"v1","versions":{"v1":"test-salt-for-unit-tests"}}';
  });

  test("returns 403 when no authorization header", async () => {
    const result = await ingestHandler(buildLambdaEvent({ method: "POST", headers: {}, body: { codes: ["a"] } }));
    expect(result.statusCode).toBe(403);
    expect(mockExpirePassAsDeleted).not.toHaveBeenCalled();
  });

  test("deletes the issuer's pass, passing the caller's hashed sub as the issuer", async () => {
    mockExpirePassAsDeleted.mockResolvedValue({ pk: "pass#one" });

    const result = await post(["one"]);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toMatchObject({ results: [{ code: "one", status: "deleted" }], deletedCount: 1 });
    expect(mockExpirePassAsDeleted).toHaveBeenCalledWith("one", "hashed_issuer-sub", expect.any(String));
  });

  test("answers per code for a mixed list: deleted, already deleted, not found or not yours", async () => {
    mockExpirePassAsDeleted.mockImplementation(async (code) => (code === "mine" ? { pk: "pass#mine" } : null));
    mockGetPass.mockImplementation(async (code) => {
      if (code === "gone") return { pk: "pass#gone", issuedBy: "hashed_issuer-sub", deletedAt: "2026-11-01T00:00:00.000Z" };
      if (code === "theirs") return { pk: "pass#theirs", issuedBy: "hashed_someone-else" };
      return null;
    });

    const result = await post(["mine", "gone", "theirs", "missing"]);

    const body = JSON.parse(result.body);
    expect(body.results).toEqual([
      { code: "mine", status: "deleted" },
      { code: "gone", status: "already_deleted" },
      { code: "theirs", status: "not_found_or_not_yours" },
      { code: "missing", status: "not_found_or_not_yours" },
    ]);
    expect(body.deletedCount).toBe(1);
  });

  test("another issuer's deleted pass reads as not_found_or_not_yours", async () => {
    mockExpirePassAsDeleted.mockResolvedValue(null);
    mockGetPass.mockResolvedValue({ pk: "pass#x", issuedBy: "hashed_someone-else", deletedAt: "2026-11-01T00:00:00.000Z" });

    const body = JSON.parse((await post(["x"])).body);

    expect(body.results[0].status).toBe("not_found_or_not_yours");
  });

  test.each([
    ["no codes field", undefined],
    ["an empty list", []],
    ["a non-list", "one"],
    ["a non-string code", [1]],
    ["a malformed code", ["has space"]],
    ["more than 100 codes", Array.from({ length: 101 }, (_, i) => `code-${i}`)],
  ])("returns 400 for %s", async (_name, codes) => {
    const result = await post(codes);
    expect(result.statusCode).toBe(400);
    expect(mockExpirePassAsDeleted).not.toHaveBeenCalled();
  });

  test("accepts exactly 100 codes and deletes a repeated code once", async () => {
    mockExpirePassAsDeleted.mockResolvedValue({ pk: "pass#x" });

    const codes = Array.from({ length: 100 }, (_, i) => `code-${i}`);
    const result = await post([...codes, "code-0"].slice(0, 100));
    expect(result.statusCode).toBe(200);
    expect(mockExpirePassAsDeleted).toHaveBeenCalledTimes(100);

    mockExpirePassAsDeleted.mockClear();
    await post(["dup", "dup"]);
    expect(mockExpirePassAsDeleted).toHaveBeenCalledTimes(1);
  });

  test("returns 500 when the repository fails", async () => {
    mockExpirePassAsDeleted.mockRejectedValue(new Error("boom"));
    const result = await post(["one"]);
    expect(result.statusCode).toBe(500);
  });
});
