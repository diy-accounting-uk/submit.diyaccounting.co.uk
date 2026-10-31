// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/data/dynamoDbPassRepository.referral.test.js

import { describe, test, expect, vi, beforeEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const mockSend = vi.fn();
const dynamoDbModule = {
  PutCommand: class PutCommand {
    constructor(params) {
      this.params = params;
    }
  },
  UpdateCommand: class UpdateCommand {
    constructor(params) {
      this.params = params;
    }
  },
  DeleteCommand: class DeleteCommand {
    constructor(params) {
      this.params = params;
    }
  },
};
vi.mock("@app/lib/dynamoDbClient.js", () => ({
  executeDynamoDbCommand: (commandBuilder) => mockSend(commandBuilder(dynamoDbModule)),
  getResourceName: (envVarName) => process.env[envVarName] || "",
}));

const { putReferralClaim, deleteReferralClaim, putRedemption, redeemPass } = await import("@app/data/dynamoDbPassRepository.js");

describe("data/dynamoDbPassRepository - referral claim, redemption record and review limit", () => {
  beforeEach(() => {
    mockSend.mockReset();
  });

  test("putReferralClaim writes one item per account and refuses to overwrite it", async () => {
    mockSend.mockResolvedValue({});
    expect(await putReferralClaim("hash-1", "code-1", "2026-01-01T00:00:00.000Z")).toBe(true);
    const command = mockSend.mock.calls[0][0];
    expect(command.params.Item.pk).toBe("referral#hash-1");
    expect(command.params.ConditionExpression).toBe("attribute_not_exists(pk)");
  });

  test("putReferralClaim returns false when the account already holds a claim", async () => {
    mockSend.mockRejectedValue(Object.assign(new Error("exists"), { name: "ConditionalCheckFailedException" }));
    expect(await putReferralClaim("hash-1", "code-1", "2026-01-01T00:00:00.000Z")).toBe(false);
  });

  test("deleteReferralClaim removes the account's claim", async () => {
    mockSend.mockResolvedValue({});
    await deleteReferralClaim("hash-1");
    expect(mockSend.mock.calls[0][0].params.Key).toEqual({ pk: "referral#hash-1" });
  });

  test("putRedemption keys the item by code and redeemer", async () => {
    mockSend.mockResolvedValue({});
    await putRedemption({ code: "code-1", hashedSub: "hash-1", issuedBy: "hash-2", passTypeId: "digital-pass", redeemedAt: "t" });
    expect(mockSend.mock.calls[0][0].params.Item).toEqual({
      pk: "redemption#code-1#hash-1",
      code: "code-1",
      redeemedBy: "hash-1",
      issuedBy: "hash-2",
      passTypeId: "digital-pass",
      redeemedAt: "t",
    });
  });

  test("redeemPass checks maxUses only when set and reviewLimit only when set", async () => {
    mockSend.mockResolvedValue({ Attributes: {} });
    await redeemPass("code-1", "2026-01-01T00:00:00.000Z");
    const condition = mockSend.mock.calls[0][0].params.ConditionExpression;
    expect(condition).toContain("(attribute_not_exists(maxUses) OR useCount < maxUses)");
    expect(condition).toContain("(attribute_not_exists(reviewLimit) OR useCount < reviewLimit)");
  });
});
