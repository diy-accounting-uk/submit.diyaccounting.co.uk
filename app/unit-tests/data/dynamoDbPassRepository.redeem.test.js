// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/data/dynamoDbPassRepository.redeem.test.js

import { describe, test, expect, vi, beforeEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const mockSend = vi.fn();
const command = (name) =>
  class {
    constructor(params) {
      this.name = name;
      this.params = params;
    }
  };
const dynamoDbModule = { UpdateCommand: command("Update") };
vi.mock("@app/lib/dynamoDbClient.js", () => ({
  executeDynamoDbCommand: (commandBuilder) => mockSend(commandBuilder(dynamoDbModule)),
  getResourceName: (envVarName) => process.env[envVarName] || "",
}));

const { redeemPass } = await import("@app/data/dynamoDbPassRepository.js");

const NOW = "2026-11-06T12:00:00.000Z";

describe("data/dynamoDbPassRepository - ttl at the last use", () => {
  beforeEach(() => {
    mockSend.mockReset();
  });

  test("the last use of a pass with no end date sets a ttl 30 days on", async () => {
    mockSend.mockResolvedValueOnce({ Attributes: { pk: "pass#a", maxUses: 1, useCount: 1 } }).mockResolvedValueOnce({});

    const pass = await redeemPass("a", NOW);

    expect(mockSend).toHaveBeenCalledTimes(2);
    const update = mockSend.mock.calls[1][0].params;
    expect(update.Key).toEqual({ pk: "pass#a" });
    expect(update.ConditionExpression).toContain("attribute_not_exists(#ttl)");
    const seconds = update.ExpressionAttributeValues[":ttl"];
    expect(Math.abs(seconds - (Math.floor(Date.now() / 1000) + 30 * 86400))).toBeLessThan(60);
    expect(pass.ttl).toBe(seconds);
  });

  test("a use that leaves uses over writes no ttl", async () => {
    mockSend.mockResolvedValueOnce({ Attributes: { pk: "pass#a", maxUses: 3, useCount: 1 } });

    await redeemPass("a", NOW);

    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  test("a pass with an end date or a ttl already writes no second ttl", async () => {
    mockSend.mockResolvedValueOnce({
      Attributes: { pk: "pass#a", maxUses: 1, useCount: 1, validUntil: "2027-01-01T00:00:00.000Z", ttl: 5 },
    });

    await redeemPass("a", NOW);

    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  test("a failed ttl write leaves the redemption standing", async () => {
    mockSend.mockResolvedValueOnce({ Attributes: { pk: "pass#a", maxUses: 1, useCount: 1 } }).mockRejectedValueOnce(new Error("throttled"));

    const pass = await redeemPass("a", NOW);

    expect(pass.useCount).toBe(1);
    expect(pass.ttl).toBeUndefined();
  });
});
