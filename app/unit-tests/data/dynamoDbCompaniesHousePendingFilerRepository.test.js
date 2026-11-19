// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/data/dynamoDbCompaniesHousePendingFilerRepository.test.js

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

const { putPendingFiling, getPendingFiling } = await import("@app/data/dynamoDbCompaniesHousePendingFilerRepository.js");

const TABLE = "test-companies-house-accounts-async-requests-table";

describe("dynamoDbCompaniesHousePendingFilerRepository", () => {
  beforeEach(() => {
    Object.assign(process.env, setupTestEnv({ COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME: TABLE }));
    mockSend.mockReset();
    mockSend.mockResolvedValue({});
  });

  test("the filing state keeps the filer's sub sealed, and opens it again from the submission number", async () => {
    await putPendingFiling({ submissionNumber: "00001A", userSub: "filer-sub-1", kind: "accounts" });

    const [[update]] = mockSend.mock.calls;
    expect(update.name).toBe("Update");
    expect(update.input.TableName).toBe(TABLE);
    expect(update.input.Key).toEqual({ hashedSub: "companies-house-xmlgw", requestId: "pending#00001A" });
    const values = update.input.ExpressionAttributeValues;
    expect(values[":kind"]).toBe("accounts");
    expect(JSON.stringify(update.input)).not.toContain("filer-sub-1");
    const retentionDays = (values[":ttl"] - Date.now() / 1000) / 86400;
    expect(retentionDays).toBeGreaterThan(99);

    mockSend.mockResolvedValueOnce({ Item: { ...update.input.Key, sealedFiler: values[":sealedFiler"], kind: "accounts" } });
    expect(await getPendingFiling("00001A")).toEqual({ userSub: "filer-sub-1", kind: "accounts" });
  });

  test("a sealed sub does not open under another submission number", async () => {
    await putPendingFiling({ submissionNumber: "00001A", userSub: "filer-sub-1", kind: "accounts" });
    const [[update]] = mockSend.mock.calls;
    mockSend.mockResolvedValueOnce({
      Item: {
        hashedSub: "companies-house-xmlgw",
        requestId: "pending#00001B",
        sealedFiler: update.input.ExpressionAttributeValues[":sealedFiler"],
      },
    });

    await expect(getPendingFiling("00001B")).rejects.toThrow();
  });

  test("no filing state for a submission reads as null", async () => {
    expect(await getPendingFiling("00009Z")).toBeNull();
  });
});
