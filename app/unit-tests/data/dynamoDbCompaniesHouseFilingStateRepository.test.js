// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/data/dynamoDbCompaniesHouseFilingStateRepository.test.js

import { describe, test, beforeEach, expect, vi } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { setupTestEnv } from "@app/test-helpers/mockHelpers.js";

const mockSend = vi.fn();

vi.mock("@aws-sdk/lib-dynamodb", () => {
  const command = (name) =>
    class {
      constructor(input) {
        this.name = name;
        this.input = input;
      }
    };
  return {
    DynamoDBDocumentClient: { from: () => ({ send: mockSend }) },
    GetCommand: command("Get"),
    PutCommand: command("Put"),
    UpdateCommand: command("Update"),
    QueryCommand: command("Query"),
  };
});

vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: class {
    constructor() {}
  },
}));

dotenvConfigIfNotBlank({ path: ".env.test" });

const {
  FINAL_STATUS_CLAIM_STALE_MINUTES,
  claimFinalStatus,
  releaseFinalStatus,
  claimPresenterPollSlot,
  deferPresenterPoll,
  listFilingsInProgress,
} = await import("@app/data/dynamoDbCompaniesHouseFilingStateRepository.js");
const { initializeSalt, hashSub } = await import("@app/services/subHasher.js");

const TABLE = "test-companies-house-accounts-async-requests-table";

function conditionalCheckFailure() {
  return Object.assign(new Error("The conditional request failed"), { name: "ConditionalCheckFailedException" });
}

describe("dynamoDbCompaniesHouseFilingStateRepository", () => {
  beforeEach(async () => {
    Object.assign(process.env, setupTestEnv({ COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME: TABLE }));
    mockSend.mockReset();
    mockSend.mockResolvedValue({});
    await initializeSalt();
  });

  test("the first claim of a final status wins and a second finds it taken", async () => {
    expect(await claimFinalStatus("00001A")).toBe(true);
    const [[claim]] = mockSend.mock.calls;
    expect(claim.input.Key).toEqual({ hashedSub: "companies-house-xmlgw", requestId: "pending#00001A" });
    expect(claim.input.ConditionExpression).toBe("attribute_not_exists(claimedAt) OR claimedAt < :staleBefore");

    mockSend.mockRejectedValueOnce(conditionalCheckFailure());
    expect(await claimFinalStatus("00001A")).toBe(false);
  });

  test("a claim older than the stale limit may be taken again", async () => {
    const now = new Date("2026-11-19T10:00:00.000Z");
    await claimFinalStatus("00001A", { now });
    const values = mockSend.mock.calls[0][0].input.ExpressionAttributeValues;
    expect(values[":now"]).toBe("2026-11-19T10:00:00.000Z");
    expect(FINAL_STATUS_CLAIM_STALE_MINUTES).toBeGreaterThan(15);
    expect(values[":staleBefore"]).toBe(new Date(now.getTime() - FINAL_STATUS_CLAIM_STALE_MINUTES * 60 * 1000).toISOString());
  });

  test("a claim that fails for another reason is not taken as already recorded", async () => {
    mockSend.mockRejectedValueOnce(Object.assign(new Error("throttled"), { name: "ProvisionedThroughputExceededException" }));
    await expect(claimFinalStatus("00001A")).rejects.toThrow("throttled");
  });

  test("a released claim removes claimedAt", async () => {
    await releaseFinalStatus("00001A");
    expect(mockSend.mock.calls[0][0].input.UpdateExpression).toBe("REMOVE claimedAt");
  });

  test("the poll slot is taken only when the last poll's interval has passed", async () => {
    expect(await claimPresenterPollSlot({ nowSeconds: 1000, intervalSeconds: 600 })).toBe(true);
    const [[slot]] = mockSend.mock.calls;
    expect(slot.input.Key).toEqual({ hashedSub: "companies-house-xmlgw", requestId: "presenter-poll-state" });
    expect(slot.input.ConditionExpression).toBe("attribute_not_exists(nextPollAt) OR nextPollAt <= :now");
    expect(slot.input.ExpressionAttributeValues).toEqual({ ":now": 1000, ":next": 1600 });

    mockSend.mockRejectedValueOnce(conditionalCheckFailure());
    expect(await claimPresenterPollSlot({ nowSeconds: 1100, intervalSeconds: 600 })).toBe(false);
  });

  test("a deferred poll only ever moves later", async () => {
    mockSend.mockRejectedValueOnce(conditionalCheckFailure());
    await deferPresenterPoll(2000);
    expect(mockSend.mock.calls[0][0].input.ConditionExpression).toBe("nextPollAt < :next");
  });

  test("the filings in progress are the reader's own pending and rejected requests, read without the filed document", async () => {
    mockSend.mockResolvedValueOnce({
      Items: [
        { requestId: "00001A", status: "pending", createdAt: "2026-11-18T10:00:00.000Z", data: { kind: "accounts" } },
        {
          requestId: "00001B",
          status: "failed",
          createdAt: "2026-11-17T10:00:00.000Z",
          data: { kind: "confirmation-statement", statusCode: "REJECT", rejections: [{ rejectCode: "1", description: "No" }] },
        },
      ],
      LastEvaluatedKey: { hashedSub: "x", requestId: "00001B" },
    });
    mockSend.mockResolvedValueOnce({ Items: [] });

    const filings = await listFilingsInProgress("filer-sub-1");

    expect(filings).toEqual([
      {
        submissionNumber: "00001A",
        kind: "accounts",
        status: "pending",
        submittedAt: "2026-11-18T10:00:00.000Z",
        rejections: [],
        clientId: null,
      },
      {
        submissionNumber: "00001B",
        kind: "confirmation-statement",
        status: "rejected",
        submittedAt: "2026-11-17T10:00:00.000Z",
        rejections: [{ rejectCode: "1", description: "No" }],
        clientId: null,
      },
    ]);
    const [[query], [nextPage]] = mockSend.mock.calls;
    expect(query.name).toBe("Query");
    expect(query.input.ExpressionAttributeValues[":hashedSub"]).toBe(hashSub("filer-sub-1"));
    expect(query.input.ProjectionExpression).not.toContain("filedDocument");
    const filteredKinds = query.input.FilterExpression.match(/#data\.#kind IN \(([^)]*)\)/)[1]
      .split(", ")
      .map((placeholder) => query.input.ExpressionAttributeValues[placeholder]);
    expect(filteredKinds).toEqual([
      "accounts",
      "confirmation-statement",
      "psc-verification-statement",
      "psc-cessation",
      "psc-change-details",
    ]);
    expect(nextPage.input.ExclusiveStartKey).toEqual({ hashedSub: "x", requestId: "00001B" });
  });

  test("answers a practice client's filings in progress for its id, and the filings made for no client without one", async () => {
    const items = [
      { requestId: "00002A", status: "pending", createdAt: "2026-11-18T10:00:00.000Z", data: { kind: "accounts" } },
      { requestId: "00002B", status: "pending", createdAt: "2026-11-18T11:00:00.000Z", data: { kind: "accounts", clientId: "client-1" } },
      {
        requestId: "00002C",
        status: "failed",
        createdAt: "2026-11-18T12:00:00.000Z",
        data: { kind: "accounts", statusCode: "REJECT", rejections: [], clientId: "client-2" },
      },
    ];
    mockSend.mockResolvedValue({ Items: items });

    expect((await listFilingsInProgress("practice-sub")).map((filing) => filing.submissionNumber)).toEqual(["00002A"]);
    expect((await listFilingsInProgress("practice-sub", "client-1")).map((filing) => filing.submissionNumber)).toEqual(["00002B"]);
    expect(await listFilingsInProgress("practice-sub", "client-2")).toEqual([
      {
        submissionNumber: "00002C",
        kind: "accounts",
        status: "rejected",
        submittedAt: "2026-11-18T12:00:00.000Z",
        rejections: [],
        clientId: "client-2",
      },
    ]);
    expect(mockSend.mock.calls[0][0].input.ProjectionExpression).toContain("#data.#clientId");
  });
});
