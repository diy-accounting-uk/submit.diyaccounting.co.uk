// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/unit-tests/data/dynamoDbBundleRepository.putBundle.test.js

import { describe, test, expect, vi, beforeEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const mockSend = vi.fn();
const mockPutCommand = vi.fn();
const dynamoDbModule = {
  PutCommand: class PutCommand {
    constructor(params) {
      mockPutCommand(params);
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

vi.mock("@app/services/subHasher.js", () => ({
  hashSub: vi.fn().mockResolvedValue("hashed-sub"),
  hashSubWithVersion: vi.fn().mockResolvedValue("hashed-sub"),
  getSaltVersion: vi.fn().mockReturnValue("v1"),
  getPreviousVersions: vi.fn().mockReturnValue([]),
}));

const { putBundle, putBundleByHashedSub } = await import("@app/data/dynamoDbBundleRepository.js");

describe("data/dynamoDbBundleRepository - putBundle", () => {
  beforeEach(() => {
    mockSend.mockReset();
    mockPutCommand.mockClear();
    mockSend.mockResolvedValue({});
    process.env.BUNDLE_DYNAMODB_TABLE_NAME = "test-bundle-table";
  });

  test("a bundle with no expiry is written without an expiry attribute", async () => {
    await putBundle("user-1", { bundleId: "resident-vat", expiry: "" });

    const item = mockPutCommand.mock.calls[0][0].Item;
    expect(item.bundleId).toBe("resident-vat");
    expect("expiry" in item).toBe(false);
    expect("ttl" in item).toBe(false);
  });

  test("a bundle with an expiry is written with the ISO expiry and a TTL", async () => {
    await putBundleByHashedSub("hashed-sub", { bundleId: "day-guest", expiry: "2026-09-07" });

    const item = mockPutCommand.mock.calls[0][0].Item;
    expect(item.expiry).toBe("2026-09-07T00:00:00.000Z");
    expect(typeof item.ttl).toBe("number");
  });

  test("a null expiry is dropped the same way as an empty one", async () => {
    await putBundleByHashedSub("hashed-sub", { bundleId: "resident-vat", expiry: null });

    const item = mockPutCommand.mock.calls[0][0].Item;
    expect("expiry" in item).toBe(false);
  });
});
