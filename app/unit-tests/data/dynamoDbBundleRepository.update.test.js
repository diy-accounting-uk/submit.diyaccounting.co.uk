// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, vi, beforeEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const mockExecute = vi.fn();
vi.mock("@app/lib/dynamoDbClient.js", () => ({
  executeDynamoDbCommand: (...args) => mockExecute(...args),
  getResourceName: (name) => `resolved-${name}`,
}));

vi.mock("@app/services/subHasher.js", () => ({
  hashSub: vi.fn(),
  getSaltVersion: vi.fn().mockReturnValue("v1"),
  subHashCandidates: vi.fn().mockReturnValue([{ version: "v1", hashedSub: "hash1" }]),
}));

const { updateBundleSubscriptionFields, resetTokensByHashedSub, putBundleByHashedSub, BUNDLE_MISSING } =
  await import("@app/data/dynamoDbBundleRepository.js");
const { calculateOneMonthTtl } = await import("@app/lib/dateUtils.js");

const module = {
  UpdateCommand: class UpdateCommand {
    constructor(input) {
      this.input = input;
    }
  },
  PutCommand: class PutCommand {
    constructor(input) {
      this.input = input;
    }
  },
};

function missingItemError() {
  const error = new Error("The conditional request failed");
  error.name = "ConditionalCheckFailedException";
  return error;
}

describe("dynamoDbBundleRepository updates", () => {
  beforeEach(() => {
    mockExecute.mockReset();
  });

  test("an update with a new expiry sets ttl and ttl_datestamp from it in the same update", async () => {
    let command;
    mockExecute.mockImplementationOnce(async (build) => {
      command = build(module);
      return {};
    });
    const expiry = "2026-12-09T10:00:00.000Z";

    const result = await updateBundleSubscriptionFields("hash1", "resident-pro", { currentPeriodEnd: expiry, expiry });

    expect(result).toEqual({ updated: true });
    const { ttl, ttl_datestamp } = calculateOneMonthTtl(new Date(expiry));
    expect(command.input.ExpressionAttributeValues[":ttl"]).toBe(ttl);
    expect(command.input.ExpressionAttributeValues[":ttl_datestamp"]).toBe(ttl_datestamp);
    expect(command.input.UpdateExpression).toContain("#ttl = :ttl");
    expect(command.input.UpdateExpression).toContain("#ttl_datestamp = :ttl_datestamp");
  });

  test("an update without an expiry leaves ttl alone", async () => {
    let command;
    mockExecute.mockImplementationOnce(async (build) => {
      command = build(module);
      return {};
    });

    await updateBundleSubscriptionFields("hash1", "resident-pro", { subscriptionStatus: "past_due" });

    expect(command.input.ExpressionAttributeValues).not.toHaveProperty(":ttl");
    expect(command.input.ExpressionAttributeNames).not.toHaveProperty("#ttl");
  });

  test("an update requires the item to exist", async () => {
    let command;
    mockExecute.mockImplementationOnce(async (build) => {
      command = build(module);
      return {};
    });

    await updateBundleSubscriptionFields("hash1", "resident-pro", { subscriptionStatus: "active" });

    expect(command.input.ConditionExpression).toBe("attribute_exists(hashedSub)");
  });

  test("an update of a missing item creates nothing and answers the named result", async () => {
    mockExecute.mockRejectedValueOnce(missingItemError());

    const result = await updateBundleSubscriptionFields("hash1", "resident-pro", { subscriptionStatus: "active" });

    expect(result).toEqual({ updated: false, reason: BUNDLE_MISSING });
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  test("an error that is not a missing item reaches the caller", async () => {
    mockExecute.mockRejectedValueOnce(new Error("throttled"));

    await expect(updateBundleSubscriptionFields("hash1", "resident-pro", { subscriptionStatus: "active" })).rejects.toThrow("throttled");
  });

  test("a token reset requires the item to exist and answers the named result when it does not", async () => {
    let command;
    mockExecute.mockImplementationOnce(async (build) => {
      command = build(module);
      throw missingItemError();
    });

    const result = await resetTokensByHashedSub("hash1", "resident-pro", 100, "2026-12-09T10:00:00.000Z");

    expect(command.input.ConditionExpression).toBe("attribute_exists(hashedSub)");
    expect(result).toEqual({ updated: false, reason: BUNDLE_MISSING });
  });

  test("a token reset of an existing item answers updated", async () => {
    mockExecute.mockResolvedValueOnce({});
    expect(await resetTokensByHashedSub("hash1", "resident-pro", 100, "2026-12-09T10:00:00.000Z")).toEqual({ updated: true });
  });

  test("a put of a day pass keeps its ttl from its expiry and carries no condition", async () => {
    let command;
    mockExecute.mockImplementationOnce(async (build) => {
      command = build(module);
      return {};
    });
    const expiry = "2026-11-07T10:00:00.000Z";

    await putBundleByHashedSub("hash1", { bundleId: "day-guest", expiry });

    const { ttl, ttl_datestamp } = calculateOneMonthTtl(new Date(expiry));
    expect(command.input.Item.ttl).toBe(ttl);
    expect(command.input.Item.ttl_datestamp).toBe(ttl_datestamp);
    expect(command.input).not.toHaveProperty("ConditionExpression");
  });
});
