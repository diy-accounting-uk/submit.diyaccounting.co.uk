// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/data/dynamoDbCompaniesHouseFilingStateRepository.test.js

import { describe, test, beforeEach, expect, vi } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { setupTestEnv } from "@app/test-helpers/mockHelpers.js";
import { COMPANIES_HOUSE_FORM_KINDS } from "../../../web/public/lib/companies-house-forms.js";

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
    BatchGetCommand: command("BatchGet"),
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
  listCompanyTaxReturnsInProgress,
  recordPresenterPollAsked,
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
        {
          requestId: "00001A",
          status: "pending",
          createdAt: "2026-11-18T10:00:00.000Z",
          data: { kind: "accounts", companyNumber: "00000001" },
        },
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
        companyNumber: "00000001",
        status: "pending",
        submittedAt: "2026-11-18T10:00:00.000Z",
        rejections: [],
        clientId: null,
        askedOnSchedule: false,
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
    const [[query], [nextPage], [coverage]] = mockSend.mock.calls;
    expect(coverage.name).toBe("BatchGet");
    expect(query.name).toBe("Query");
    expect(query.input.ExpressionAttributeValues[":hashedSub"]).toBe(hashSub("filer-sub-1"));
    expect(query.input.ProjectionExpression).not.toContain("filedDocument");
    const filteredKinds = query.input.FilterExpression.match(/#data\.#kind IN \(([^)]*)\)/)[1]
      .split(", ")
      .map((placeholder) => query.input.ExpressionAttributeValues[placeholder]);
    expect(filteredKinds).toEqual(COMPANIES_HOUSE_FORM_KINDS);
    expect(filteredKinds).toEqual(
      expect.arrayContaining(["accounts", "confirmation-statement", "psc-cessation", "accounting-reference-date"]),
    );
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

  test("the presenter poll's answer is recorded on its shared state item", async () => {
    await recordPresenterPollAsked(new Date("2026-11-26T09:15:02.000Z"));
    const [[update]] = mockSend.mock.calls;
    expect(update.input.Key).toEqual({ hashedSub: "companies-house-xmlgw", requestId: "presenter-poll-state" });
    expect(update.input.UpdateExpression).toBe("SET lastAskedAt = :askedAt");
    expect(update.input.ExpressionAttributeValues).toEqual({ ":askedAt": "2026-11-26T09:15:02.000Z" });
  });

  test("a pending filing under our presenter was last asked about at the later of its own poll and the presenter poll", async () => {
    mockSend.mockResolvedValueOnce({
      Items: [
        { requestId: "00003A", status: "pending", createdAt: "2026-11-26T08:00:00.000Z", data: { kind: "accounts" } },
        {
          requestId: "00003B",
          status: "pending",
          createdAt: "2026-11-26T08:00:00.000Z",
          data: { kind: "accounts", lastCheckedAt: "2026-11-26T09:20:00.000Z" },
        },
        {
          requestId: "00003C",
          status: "pending",
          createdAt: "2026-11-26T08:00:00.000Z",
          data: { kind: "accounts", lastCheckedAt: "2026-11-26T08:30:00.000Z" },
        },
        { requestId: "00003D", status: "pending", createdAt: "2026-11-26T09:16:00.000Z", data: { kind: "accounts" } },
      ],
    });
    mockSend.mockResolvedValueOnce({
      Responses: {
        [TABLE]: [
          { requestId: "presenter-poll-state", lastAskedAt: "2026-11-26T09:15:00.000Z" },
          { requestId: "pending#00003A", kind: "accounts" },
          { requestId: "pending#00003B", kind: "accounts" },
          { requestId: "pending#00003D", kind: "accounts" },
        ],
      },
    });

    const filings = await listFilingsInProgress("filer-sub-1");

    const asked = Object.fromEntries(filings.map((filing) => [filing.submissionNumber, [filing.askedOnSchedule, filing.lastCheckedAt]]));
    expect(asked).toEqual({
      "00003A": [true, "2026-11-26T09:15:00.000Z"],
      "00003B": [true, "2026-11-26T09:20:00.000Z"],
      // Under the customer's own presenter: only its own poll counts.
      "00003C": [false, "2026-11-26T08:30:00.000Z"],
      // Sent after the last presenter poll: not asked about yet.
      "00003D": [true, undefined],
    });
    const [, [coverage]] = mockSend.mock.calls;
    expect(coverage.input.RequestItems[TABLE].Keys).toEqual([
      { hashedSub: "companies-house-xmlgw", requestId: "presenter-poll-state" },
      { hashedSub: "companies-house-xmlgw", requestId: "pending#00003A" },
      { hashedSub: "companies-house-xmlgw", requestId: "pending#00003B" },
      { hashedSub: "companies-house-xmlgw", requestId: "pending#00003C" },
      { hashedSub: "companies-house-xmlgw", requestId: "pending#00003D" },
    ]);
    expect(coverage.input.RequestItems[TABLE].ProjectionExpression).not.toContain("sealedFiler");
  });

  test("keys the batch read leaves unprocessed are read again", async () => {
    mockSend.mockResolvedValueOnce({
      Items: [{ requestId: "00004A", status: "pending", createdAt: "2026-11-26T08:00:00.000Z", data: { kind: "accounts" } }],
    });
    mockSend.mockResolvedValueOnce({
      Responses: { [TABLE]: [{ requestId: "pending#00004A", kind: "accounts" }] },
      UnprocessedKeys: { [TABLE]: { Keys: [{ hashedSub: "companies-house-xmlgw", requestId: "presenter-poll-state" }] } },
    });
    mockSend.mockResolvedValueOnce({
      Responses: { [TABLE]: [{ requestId: "presenter-poll-state", lastAskedAt: "2026-11-26T09:00:00.000Z" }] },
    });

    const [filing] = await listFilingsInProgress("filer-sub-1");

    expect(filing).toMatchObject({ askedOnSchedule: true, lastCheckedAt: "2026-11-26T09:00:00.000Z" });
    expect(mockSend).toHaveBeenCalledTimes(3);
  });

  test("a list with no pending filing reads no presenter poll state", async () => {
    mockSend.mockResolvedValueOnce({
      Items: [
        {
          requestId: "00005A",
          status: "failed",
          createdAt: "2026-11-26T08:00:00.000Z",
          data: { kind: "accounts", statusCode: "REJECT", rejections: [], lastCheckedAt: "2026-11-26T08:10:00.000Z" },
        },
      ],
    });

    const [filing] = await listFilingsInProgress("filer-sub-1");

    expect(filing.lastCheckedAt).toBeUndefined();
    expect(filing.askedOnSchedule).toBeUndefined();
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  test("the Company Tax Returns in progress are the reader's pending requests of that kind, read by a Query on its own key", async () => {
    mockSend.mockResolvedValueOnce({
      Items: [
        {
          requestId: "46DCD4CC7E194088B99857931C185829",
          status: "pending",
          createdAt: "2026-11-25T10:00:00.000Z",
          data: {
            utr: "8596148860",
            lastCheckedAt: "2026-11-25T10:05:00.000Z",
            formRequest: { company: { companyName: "EXAMPLE LIMITED", companyNumber: "00000001" } },
            filed: { boxes: { 30: "2025-04-01", 35: "2026-03-31" } },
          },
        },
      ],
      LastEvaluatedKey: { hashedSub: "x", requestId: "46DCD4CC7E194088B99857931C185829" },
    });
    mockSend.mockResolvedValueOnce({ Items: [] });

    const returns = await listCompanyTaxReturnsInProgress("filer-sub-1");

    expect(returns).toEqual([
      {
        correlationId: "46DCD4CC7E194088B99857931C185829",
        status: "pending",
        submittedAt: "2026-11-25T10:00:00.000Z",
        lastCheckedAt: "2026-11-25T10:05:00.000Z",
        utr: "8596148860",
        companyName: "EXAMPLE LIMITED",
        companyNumber: "00000001",
        periodStart: "2025-04-01",
        periodEnd: "2026-03-31",
        clientId: null,
      },
    ]);
    const [[query], [nextPage]] = mockSend.mock.calls;
    expect(query.name).toBe("Query");
    expect(query.input.TableName).toBe(TABLE);
    expect(query.input.KeyConditionExpression).toBe("hashedSub = :hashedSub");
    expect(query.input.ExpressionAttributeValues).toMatchObject({
      ":hashedSub": hashSub("filer-sub-1"),
      ":ctReturn": "company-tax-return",
      ":pending": "pending",
    });
    // A completed or failed request is final and left out by the filter.
    expect(query.input.FilterExpression).toBe("#data.#kind = :ctReturn AND #status = :pending");
    expect(query.input.ProjectionExpression).not.toMatch(/accountsIxbrl|computationsIxbrl|#data\.#filed(?!\.#boxes\.#period)/);
    expect(nextPage.input.ExclusiveStartKey).toEqual({ hashedSub: "x", requestId: "46DCD4CC7E194088B99857931C185829" });
    expect(mockSend.mock.calls.every(([command]) => command.name !== "Scan")).toBe(true);
  });

  test("answers a practice client's Company Tax Returns in progress for its id, and the returns made for no client without one", async () => {
    mockSend.mockResolvedValue({
      Items: [
        { requestId: "AAA1", status: "pending", createdAt: "2026-11-25T10:00:00.000Z", data: {} },
        { requestId: "AAA2", status: "pending", createdAt: "2026-11-25T11:00:00.000Z", data: { clientId: "client-1" } },
      ],
    });

    expect((await listCompanyTaxReturnsInProgress("practice-sub")).map((ctReturn) => ctReturn.correlationId)).toEqual(["AAA1"]);
    expect((await listCompanyTaxReturnsInProgress("practice-sub", "client-1")).map((ctReturn) => ctReturn.correlationId)).toEqual(["AAA2"]);
  });
});
