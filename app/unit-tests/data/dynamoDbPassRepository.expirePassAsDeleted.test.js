// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/data/dynamoDbPassRepository.expirePassAsDeleted.test.js

import { describe, test, expect, vi, beforeEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const mockSend = vi.fn();
const dynamoDbModule = {
  UpdateCommand: class UpdateCommand {
    constructor(params) {
      this.params = params;
    }
  },
};
vi.mock("@app/lib/dynamoDbClient.js", () => ({
  executeDynamoDbCommand: (commandBuilder) => mockSend(commandBuilder(dynamoDbModule)),
  getResourceName: (envVarName) => process.env[envVarName] || "",
}));

const { expirePassAsDeleted } = await import("@app/data/dynamoDbPassRepository.js");

describe("data/dynamoDbPassRepository - expirePassAsDeleted", () => {
  beforeEach(() => {
    mockSend.mockReset();
    process.env.PASSES_DYNAMODB_TABLE_NAME = "test-passes-table";
  });

  test("sets deletedAt and validUntil to now only for the issuer's undeleted pass", async () => {
    mockSend.mockResolvedValue({ Attributes: { pk: "pass#one", deletedAt: "2026-11-03T10:00:00.000Z" } });

    const result = await expirePassAsDeleted("one", "hashed-issuer", "2026-11-03T10:00:00.000Z");

    const command = mockSend.mock.calls[0][0];
    expect(command.params.TableName).toBe("test-passes-table");
    expect(command.params.Key).toEqual({ pk: "pass#one" });
    expect(command.params.UpdateExpression).toBe("SET deletedAt = :now, validUntil = :now, updatedAt = :now");
    expect(command.params.ConditionExpression).toBe("attribute_exists(pk) AND issuedBy = :issuedBy AND attribute_not_exists(deletedAt)");
    expect(command.params.ExpressionAttributeValues).toEqual({ ":now": "2026-11-03T10:00:00.000Z", ":issuedBy": "hashed-issuer" });
    expect(result.deletedAt).toBe("2026-11-03T10:00:00.000Z");
  });

  test("returns null when the condition fails", async () => {
    mockSend.mockRejectedValue(Object.assign(new Error("condition"), { name: "ConditionalCheckFailedException" }));

    expect(await expirePassAsDeleted("one", "someone-else", "2026-11-03T10:00:00.000Z")).toBeNull();
  });

  test("rethrows any other failure", async () => {
    mockSend.mockRejectedValue(new Error("ProvisionedThroughputExceededException"));

    await expect(expirePassAsDeleted("one", "hashed-issuer", "2026-11-03T10:00:00.000Z")).rejects.toThrow("Throughput");
  });
});
