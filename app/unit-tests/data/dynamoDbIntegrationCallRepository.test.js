// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, vi, beforeEach } from "vitest";

const mockSend = vi.fn();
const command = (name) =>
  class {
    constructor(params) {
      this.name = name;
      this.params = params;
    }
  };
const dynamoDbModule = { GetCommand: command("Get"), PutCommand: command("Put"), QueryCommand: command("Query") };
vi.mock("@app/lib/dynamoDbClient.js", () => ({
  executeDynamoDbCommand: (commandBuilder) => mockSend(commandBuilder(dynamoDbModule)),
  getResourceName: () => "test-env-integration-calls",
}));

const repo = await import("@app/data/dynamoDbIntegrationCallRepository.js");

beforeEach(() => {
  mockSend.mockReset();
});

describe("data/dynamoDbIntegrationCallRepository listFphCheckResults", () => {
  test("queries the day's partition key on the integration calls table", async () => {
    mockSend.mockResolvedValue({ Items: [{ pk: "fph#2026-11-08", sk: "a" }] });
    const items = await repo.listFphCheckResults("fph#2026-11-08");
    expect(items).toEqual([{ pk: "fph#2026-11-08", sk: "a" }]);
    expect(mockSend).toHaveBeenCalledTimes(1);
    const sent = mockSend.mock.calls[0][0];
    expect(sent.name).toBe("Query");
    expect(sent.params).toMatchObject({
      TableName: "test-env-integration-calls",
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: { ":pk": "fph#2026-11-08" },
    });
  });

  test("follows LastEvaluatedKey until the day is read", async () => {
    mockSend
      .mockResolvedValueOnce({ Items: [{ sk: "a" }], LastEvaluatedKey: { pk: "fph#2026-11-08", sk: "a" } })
      .mockResolvedValueOnce({ Items: [{ sk: "b" }] });
    const items = await repo.listFphCheckResults("fph#2026-11-08");
    expect(items).toEqual([{ sk: "a" }, { sk: "b" }]);
    expect(mockSend.mock.calls[1][0].params.ExclusiveStartKey).toEqual({ pk: "fph#2026-11-08", sk: "a" });
  });

  test("a day with no items gives an empty list", async () => {
    mockSend.mockResolvedValue({});
    expect(await repo.listFphCheckResults("fph#2026-11-01")).toEqual([]);
  });
});
