// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, vi, beforeEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

const mockCheckPass = vi.fn();
vi.mock("@app/services/passService.js", () => ({
  checkPass: (...args) => mockCheckPass(...args),
}));

const mockPublish = vi.fn();
vi.mock("@app/lib/activityAlert.js", () => ({
  publishActivityEvent: (...args) => mockPublish(...args),
}));

import { ingestHandler } from "@app/functions/account/passGet.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const eventFor = (code) => ({ queryStringParameters: code ? { code } : {}, headers: {} });

describe("passGet", () => {
  beforeEach(() => {
    mockCheckPass.mockReset();
    mockPublish.mockReset();
    process.env.PASSES_DYNAMODB_TABLE_NAME = "test-passes";
  });

  test("returns 400 without a code and records no visit", async () => {
    const result = await ingestHandler(eventFor(null));
    expect(result.statusCode).toBe(400);
    expect(mockPublish).not.toHaveBeenCalled();
  });

  test("a visit to an issued pass records one visit event naming the issuer and the pass type, never the code", async () => {
    mockCheckPass.mockResolvedValue({
      valid: true,
      bundleId: "day-guest",
      pass: { passTypeId: "digital-pass", issuedBy: "issuer-hash" },
    });
    const result = await ingestHandler(eventFor("tiger-happy-mountain-silver"));
    expect(result.statusCode).toBe(200);
    expect(mockPublish).toHaveBeenCalledTimes(1);
    const published = mockPublish.mock.calls[0][0];
    expect(published).toMatchObject({
      event: "pass-link-visited",
      actor: "visitor",
      detail: { passTypeId: "digital-pass", issuedBy: "issuer-hash", valid: true },
    });
    expect(JSON.stringify(published)).not.toContain("tiger-happy-mountain-silver");
  });

  test("a pass with no issuer, such as an operator-created one, records no visit", async () => {
    mockCheckPass.mockResolvedValue({ valid: true, bundleId: "day-guest", pass: { passTypeId: "day-guest" } });
    await ingestHandler(eventFor("some-code"));
    expect(mockPublish).not.toHaveBeenCalled();
  });

  test("an unknown code records no visit", async () => {
    mockCheckPass.mockResolvedValue({ valid: false, reason: "not_found" });
    const result = await ingestHandler(eventFor("nope"));
    expect(result.statusCode).toBe(200);
    expect(mockPublish).not.toHaveBeenCalled();
  });
});
