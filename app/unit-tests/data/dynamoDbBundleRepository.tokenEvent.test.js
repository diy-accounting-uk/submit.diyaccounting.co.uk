// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/data/dynamoDbBundleRepository.tokenEvent.test.js

import { describe, test, expect, vi, beforeEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

// Mock DynamoDB client
const mockSend = vi.fn().mockResolvedValue({});
const dynamoDbModule = {
  UpdateCommand: class UpdateCommand {
    constructor(params) {
      this.params = params;
    }
  },
  PutCommand: class PutCommand {
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
};
vi.mock("@app/lib/dynamoDbClient.js", () => ({
  getDynamoDbDocClient: vi.fn().mockResolvedValue({
    docClient: { send: (...args) => mockSend(...args) },
    module: dynamoDbModule,
  }),
  executeDynamoDbCommand: (commandBuilder) => mockSend(commandBuilder(dynamoDbModule)),
  getResourceName: (envVarName) => process.env[envVarName] || "",
}));

const { initializeSalt } = await import("@app/services/subHasher.js");
const { recordTokenEvent } = await import("@app/data/dynamoDbBundleRepository.js");

describe("data/dynamoDbBundleRepository - recordTokenEvent", () => {
  beforeEach(async () => {
    mockSend.mockClear();
    process.env.BUNDLE_DYNAMODB_TABLE_NAME = "test-bundle-table";
    await initializeSalt();
  });

  test("appends a token event using list_append", async () => {
    await recordTokenEvent("test-user-sub", "day-guest", { activity: "submit-vat", tokensUsed: 1 });

    expect(mockSend).toHaveBeenCalledTimes(1);
    const command = mockSend.mock.calls[0][0];
    expect(command.params.UpdateExpression).toContain("list_append");
    expect(command.params.UpdateExpression).toContain("tokenEvents");
    expect(command.params.ExpressionAttributeValues[":event"][0]).toMatchObject({
      activity: "submit-vat",
      tokensUsed: 1,
    });
    expect(command.params.ExpressionAttributeValues[":event"][0].timestamp).toBeDefined();
    expect(command.params.ExpressionAttributeValues[":empty"]).toEqual([]);
  });

  test("throws on DynamoDB error", async () => {
    mockSend.mockRejectedValueOnce(new Error("DynamoDB failure"));
    await expect(recordTokenEvent("test-user", "bundle-1", { activity: "test" })).rejects.toThrow("DynamoDB failure");
  });
});
