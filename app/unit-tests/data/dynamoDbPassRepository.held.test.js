// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/data/dynamoDbPassRepository.held.test.js

import { describe, test, expect, vi, beforeEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const mockSend = vi.fn();
const command = (name) =>
  class {
    constructor(params) {
      this.name = name;
      this.params = params;
    }
  };
const dynamoDbModule = { PutCommand: command("Put"), DeleteCommand: command("Delete"), QueryCommand: command("Query") };
vi.mock("@app/lib/dynamoDbClient.js", () => ({
  executeDynamoDbCommand: (commandBuilder) => mockSend(commandBuilder(dynamoDbModule)),
  getResourceName: (envVarName) => process.env[envVarName] || "",
}));

const { putHeldPointer, deleteHeldPointer, getHeldPasses, HELD_INDEX_KEY } = await import("@app/data/dynamoDbPassRepository.js");

describe("data/dynamoDbPassRepository - held pointers", () => {
  beforeEach(() => {
    mockSend.mockReset();
    mockSend.mockResolvedValue({});
  });

  test("putHeldPointer stores one item per pass under the held index key, sorted by the held time", async () => {
    await putHeldPointer({ code: "c", passIssuedBy: "hash-1", useCount: 5, reviewLimit: 5, heldAt: "t1", ttl: 99 });
    expect(mockSend.mock.calls[0][0].params.Item).toEqual({
      pk: "held#c",
      code: "c",
      issuedBy: HELD_INDEX_KEY,
      createdAt: "t1",
      useCount: 5,
      reviewLimit: 5,
      passIssuedBy: "hash-1",
      ttl: 99,
    });
  });

  test("deleteHeldPointer removes the pointer by key", async () => {
    await deleteHeldPointer("c");
    expect(mockSend.mock.calls[0][0].params.Key).toEqual({ pk: "held#c" });
  });

  test("getHeldPasses queries the issuedBy-index under the held key and never scans", async () => {
    mockSend.mockResolvedValue({ Items: [{ code: "c" }] });
    expect(await getHeldPasses()).toEqual({ items: [{ code: "c" }] });
    const sent = mockSend.mock.calls[0][0];
    expect(sent.name).toBe("Query");
    expect(sent.params.IndexName).toBe("issuedBy-index");
    expect(sent.params.ExpressionAttributeValues).toEqual({ ":held": "held" });
  });
});
