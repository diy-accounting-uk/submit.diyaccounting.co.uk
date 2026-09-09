// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/data/dynamoDbPassRepository.getPassesByIssuer.test.js

import { describe, test, expect, vi, beforeEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const mockSend = vi.fn();
const mockScanCommand = vi.fn();
const dynamoDbModule = {
  QueryCommand: class QueryCommand {
    constructor(params) {
      this.params = params;
    }
  },
  ScanCommand: class ScanCommand {
    constructor(params) {
      mockScanCommand(params);
      this.params = params;
    }
  },
};
vi.mock("@app/lib/dynamoDbClient.js", () => ({
  getDynamoDbDocClient: vi.fn().mockResolvedValue({
    docClient: { send: (...args) => mockSend(...args) },
    module: dynamoDbModule,
  }),
  executeDynamoDbCommand: (commandBuilder) => mockSend(commandBuilder(dynamoDbModule)),
}));

const { getPassesByIssuer } = await import("@app/data/dynamoDbPassRepository.js");

describe("data/dynamoDbPassRepository - getPassesByIssuer", () => {
  beforeEach(() => {
    mockSend.mockReset();
    mockScanCommand.mockClear();
    process.env.PASSES_DYNAMODB_TABLE_NAME = "test-passes-table";
  });

  test("queries issuedBy-index and returns the matching items", async () => {
    mockSend.mockResolvedValue({ Items: [{ pk: "pass#one" }] });

    const result = await getPassesByIssuer("hashed-issuer", { limit: 10 });

    expect(mockSend).toHaveBeenCalledTimes(1);
    const command = mockSend.mock.calls[0][0];
    expect(command.params).toMatchObject({
      TableName: "test-passes-table",
      IndexName: "issuedBy-index",
      KeyConditionExpression: "issuedBy = :ib",
      ExpressionAttributeValues: { ":ib": "hashed-issuer" },
    });
    expect(result.items).toEqual([{ pk: "pass#one" }]);
  });

  test("rethrows a failed index query and never falls back to a scan", async () => {
    mockSend.mockRejectedValue(new Error("ValidationException: index not found"));

    await expect(getPassesByIssuer("hashed-issuer")).rejects.toThrow("index not found");
    expect(mockScanCommand).not.toHaveBeenCalled();
  });
});
