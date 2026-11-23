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
  GetCommand: class GetCommand {
    constructor(params) {
      this.params = params;
    }
  },
  DeleteCommand: class DeleteCommand {
    constructor(params) {
      this.params = params;
    }
  },
  QueryCommand: class QueryCommand {
    constructor(params) {
      this.params = params;
    }
  },
  BatchGetCommand: class BatchGetCommand {
    constructor(params) {
      this.params = params;
    }
  },
};
vi.mock("@app/lib/dynamoDbClient.js", () => ({
  executeDynamoDbCommand: (commandBuilder) => mockSend(commandBuilder(dynamoDbModule)),
  getResourceName: (envVarName) => process.env[envVarName] || "",
}));

const {
  putReferralClaim,
  deleteReferralClaim,
  addRedemption,
  putCampaignPointer,
  getCampaignPasses,
  redeemPass,
  getReferralClaim,
  getRedemption,
  getAffiliate,
  setReviewLimit,
  putAffiliate,
  startAffiliateApplication,
  recordAffiliateAccountStatus,
} = await import("@app/data/dynamoDbPassRepository.js");

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

  test("addRedemption keys the item by code and redeemer and adds one to its count", async () => {
    mockSend.mockResolvedValue({ Attributes: { redemptions: 2 } });
    const count = await addRedemption({
      code: "code-1",
      hashedSub: "hash-1",
      issuedBy: "hash-2",
      passTypeId: "digital-pass",
      redeemedAt: "t",
    });
    const params = mockSend.mock.calls[0][0].params;
    expect(params.Key).toEqual({ pk: "redemption#code-1#hash-1" });
    expect(params.UpdateExpression).toBe(
      "SET code = :code, redeemedBy = :by, passTypeId = :type, redeemedAt = :at, issuedBy = :issuer ADD redemptions :one",
    );
    expect(params.ExpressionAttributeValues).toEqual({
      ":code": "code-1",
      ":by": "hash-1",
      ":type": "digital-pass",
      ":at": "t",
      ":one": 1,
      ":issuer": "hash-2",
    });
    expect(count).toBe(2);
  });

  test("addRedemption adds to the count only below the limit, and answers null at the limit", async () => {
    mockSend.mockResolvedValueOnce({ Attributes: { redemptions: 1 } });
    await addRedemption({ code: "code-1", hashedSub: "hash-1", passTypeId: "custom-campaign", redeemedAt: "t", limit: 2 });
    const params = mockSend.mock.calls[0][0].params;
    expect(params.ConditionExpression).toBe("attribute_not_exists(pk) OR redemptions < :limit");
    expect(params.ExpressionAttributeValues[":limit"]).toBe(2);

    mockSend.mockRejectedValueOnce(Object.assign(new Error("The conditional request failed"), { name: "ConditionalCheckFailedException" }));
    expect(
      await addRedemption({ code: "code-1", hashedSub: "hash-1", passTypeId: "custom-campaign", redeemedAt: "t", limit: 2 }),
    ).toBeNull();
  });

  test("addRedemption of a pass with no issuer writes no issuedBy", async () => {
    mockSend.mockResolvedValue({ Attributes: { redemptions: 1 } });
    await addRedemption({ code: "code-1", hashedSub: "hash-1", passTypeId: "custom-campaign", redeemedAt: "t" });
    const params = mockSend.mock.calls[0][0].params;
    expect(params.UpdateExpression).not.toContain("issuedBy");
    expect(params.ExpressionAttributeValues[":issuer"]).toBeUndefined();
  });

  test("putCampaignPointer stores a pointer under the campaign index key, never on the pass item", async () => {
    mockSend.mockResolvedValue({});
    await putCampaignPointer({ code: "code-1", createdAt: "2026-11-22T10:00:00.000Z", ttl: 123 });
    expect(mockSend.mock.calls[0][0].params.Item).toEqual({
      pk: "campaign#code-1",
      code: "code-1",
      issuedBy: "campaign",
      createdAt: "2026-11-22T10:00:00.000Z",
      ttl: 123,
    });
  });

  test("getCampaignPasses queries the campaign index newest first and reads each pass by key", async () => {
    mockSend.mockResolvedValueOnce({ Items: [{ code: "b" }, { code: "a" }, { code: "gone" }] }).mockResolvedValueOnce({
      Responses: {
        "test-passes": [
          { code: "a", useCount: 1 },
          { code: "b", useCount: 0 },
        ],
      },
    });
    process.env.PASSES_DYNAMODB_TABLE_NAME = "test-passes";

    const { items } = await getCampaignPasses();

    const query = mockSend.mock.calls[0][0].params;
    expect(query.IndexName).toBe("issuedBy-index");
    expect(query.ExpressionAttributeValues).toEqual({ ":campaign": "campaign" });
    expect(query.ScanIndexForward).toBe(false);
    expect(mockSend.mock.calls[1][0].params.RequestItems["test-passes"].Keys).toEqual([
      { pk: "pass#b" },
      { pk: "pass#a" },
      { pk: "pass#gone" },
    ]);
    expect(items.map((item) => item.code)).toEqual(["b", "a"]);
  });

  test("redeemPass checks maxUses only when set and reviewLimit only when set", async () => {
    mockSend.mockResolvedValue({ Attributes: {} });
    await redeemPass("code-1", "2026-01-01T00:00:00.000Z");
    const condition = mockSend.mock.calls[0][0].params.ConditionExpression;
    expect(condition).toContain("(attribute_not_exists(maxUses) OR useCount < maxUses)");
    expect(condition).toContain("(attribute_not_exists(reviewLimit) OR useCount < reviewLimit)");
  });

  test("getReferralClaim reads the account's claim item", async () => {
    mockSend.mockResolvedValue({ Item: { pk: "referral#hash-1", code: "code-1" } });
    expect(await getReferralClaim("hash-1")).toEqual({ pk: "referral#hash-1", code: "code-1" });
    expect(mockSend.mock.calls[0][0].params.Key).toEqual({ pk: "referral#hash-1" });
  });

  test("getRedemption reads the redemption item and returns null when absent", async () => {
    mockSend.mockResolvedValue({});
    expect(await getRedemption("code-1", "hash-1")).toBeNull();
    expect(mockSend.mock.calls[0][0].params.Key).toEqual({ pk: "redemption#code-1#hash-1" });
  });

  test("getRedemption returns the stored redemption item when the account redeemed the pass", async () => {
    const item = { pk: "redemption#code-1#hash-1", code: "code-1", redeemedBy: "hash-1" };
    mockSend.mockResolvedValue({ Item: item });
    expect(await getRedemption("code-1", "hash-1")).toEqual(item);
  });

  test("getAffiliate reads the affiliate item of a referrer", async () => {
    mockSend.mockResolvedValue({ Item: { pk: "affiliate#ref-1", tier: "casual", state: "approved" } });
    expect((await getAffiliate("ref-1")).tier).toBe("casual");
    expect(mockSend.mock.calls[0][0].params.Key).toEqual({ pk: "affiliate#ref-1" });
  });

  test("setReviewLimit sets the limit on an existing pass", async () => {
    mockSend.mockResolvedValue({ Attributes: { reviewLimit: 2000 } });
    expect(await setReviewLimit("code-1", 2000, "2026-01-01T00:00:00.000Z")).toEqual({ reviewLimit: 2000 });
    const { params } = mockSend.mock.calls[0][0];
    expect(params.Key).toEqual({ pk: "pass#code-1" });
    expect(params.UpdateExpression).toBe("SET reviewLimit = :limit, updatedAt = :now");
    expect(params.ExpressionAttributeValues[":limit"]).toBe(2000);
    expect(params.ConditionExpression).toBe("attribute_exists(pk)");
  });

  test("setReviewLimit with null removes the limit", async () => {
    mockSend.mockResolvedValue({ Attributes: {} });
    await setReviewLimit("code-1", null, "2026-01-01T00:00:00.000Z");
    const { params } = mockSend.mock.calls[0][0];
    expect(params.UpdateExpression).toBe("REMOVE reviewLimit SET updatedAt = :now");
    expect(params.ExpressionAttributeValues).toEqual({ ":now": "2026-01-01T00:00:00.000Z" });
  });

  test("setReviewLimit returns null when the pass does not exist", async () => {
    mockSend.mockRejectedValue(Object.assign(new Error("missing"), { name: "ConditionalCheckFailedException" }));
    expect(await setReviewLimit("code-1", 2000, "2026-01-01T00:00:00.000Z")).toBeNull();
  });

  test("putAffiliate sets tier, state and time, keeping other attributes", async () => {
    mockSend.mockResolvedValue({ Attributes: { tier: "casual", state: "applied" } });
    await putAffiliate({ referrerHash: "h1", tier: "casual", state: "applied", now: "2026-01-01T00:00:00.000Z" });
    const { params } = mockSend.mock.calls[0][0];
    expect(params.Key).toEqual({ pk: "affiliate#h1" });
    expect(params.UpdateExpression).toBe("SET tier = :tier, #state = :state, updatedAt = :now");
    expect(params.ExpressionAttributeNames).toEqual({ "#state": "state" });
    expect(params.ExpressionAttributeValues).toEqual({ ":tier": "casual", ":state": "applied", ":now": "2026-01-01T00:00:00.000Z" });
  });

  test("putAffiliate sets approvedAt when the state is approved", async () => {
    mockSend.mockResolvedValue({ Attributes: { tier: "casual", state: "approved" } });
    await putAffiliate({ referrerHash: "h1", tier: "casual", state: "approved", now: "2026-01-01T00:00:00.000Z" });
    const { params } = mockSend.mock.calls[0][0];
    expect(params.UpdateExpression).toBe("SET tier = :tier, #state = :state, updatedAt = :now, approvedAt = :now");
  });

  test("startAffiliateApplication stores the account id once and keeps an existing tier and state", async () => {
    mockSend.mockResolvedValue({});
    const written = await startAffiliateApplication({
      referrerHash: "h1",
      tier: "casual",
      stripeAccountId: "acct_1",
      stripeTest: true,
      now: "2026-01-01T00:00:00.000Z",
    });
    expect(written).toBe(true);
    const { params } = mockSend.mock.calls[0][0];
    expect(params.Key).toEqual({ pk: "affiliate#h1" });
    expect(params.ConditionExpression).toBe("attribute_not_exists(stripeAccountId)");
    expect(params.UpdateExpression).toContain("tier = if_not_exists(tier, :tier)");
    expect(params.UpdateExpression).toContain("#state = if_not_exists(#state, :applied)");
    expect(params.ExpressionAttributeValues).toMatchObject({ ":accountId": "acct_1", ":test": true, ":applied": "applied" });
  });

  test("startAffiliateApplication answers false when the item already holds an account", async () => {
    mockSend.mockRejectedValue(Object.assign(new Error("exists"), { name: "ConditionalCheckFailedException" }));
    expect(
      await startAffiliateApplication({ referrerHash: "h1", tier: "casual", stripeAccountId: "acct_2", now: "2026-01-01T00:00:00.000Z" }),
    ).toBe(false);
  });

  test("startAffiliateApplication rethrows any other failure", async () => {
    mockSend.mockRejectedValue(new Error("boom"));
    await expect(
      startAffiliateApplication({ referrerHash: "h1", tier: "casual", stripeAccountId: "acct_2", now: "2026-01-01T00:00:00.000Z" }),
    ).rejects.toThrow("boom");
  });

  test("recordAffiliateAccountStatus updates the flags of an existing item only", async () => {
    mockSend.mockResolvedValue({ Attributes: { detailsSubmitted: true } });
    const item = await recordAffiliateAccountStatus({
      referrerHash: "h1",
      detailsSubmitted: true,
      transfersActive: false,
      now: "2026-01-01T00:00:00.000Z",
    });
    expect(item.detailsSubmitted).toBe(true);
    const { params } = mockSend.mock.calls[0][0];
    expect(params.ConditionExpression).toBe("attribute_exists(pk)");
    expect(params.ExpressionAttributeValues).toEqual({ ":details": true, ":transfers": false, ":now": "2026-01-01T00:00:00.000Z" });
  });
});
