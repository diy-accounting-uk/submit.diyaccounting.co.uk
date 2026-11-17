// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

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
  getResourceName: (envVarName) => process.env[envVarName] || "",
}));

vi.mock("@app/services/subHasher.js", () => ({
  hashSub: vi.fn().mockResolvedValue("hashed-sub"),
  hashSubWithVersion: vi.fn().mockResolvedValue("hashed-sub"),
  getSaltVersion: vi.fn().mockReturnValue("v1"),
  getPreviousVersions: vi.fn().mockReturnValue([]),
  subHashCandidates: vi.fn().mockReturnValue([{ version: "v1", hashedSub: "hashed-sub" }]),
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

  test.each(["test-user", "probe"])("a %s bundle with no expiry gets a ttl 2 days from now", async (actor) => {
    const before = Math.floor(Date.now() / 1000);
    await putBundle("user-1", { bundleId: "resident-vat", expiry: "", actor });

    const item = mockPutCommand.mock.calls[0][0].Item;
    expect("expiry" in item).toBe(false);
    expect(item.ttl).toBeGreaterThanOrEqual(before + 2 * 86400);
    expect(item.ttl).toBeLessThanOrEqual(before + 2 * 86400 + 60);
  });

  test("a test-user bundle with a far expiry still gets a ttl 2 days from now", async () => {
    const before = Math.floor(Date.now() / 1000);
    await putBundleByHashedSub("hashed-sub", { bundleId: "day-guest", expiry: "2099-01-01", actor: "test-user" });

    const item = mockPutCommand.mock.calls[0][0].Item;
    expect(item.expiry).toBe("2099-01-01T00:00:00.000Z");
    expect(item.ttl).toBeLessThanOrEqual(before + 2 * 86400 + 60);
  });

  test("a customer bundle with an expiry keeps a ttl one month past it", async () => {
    await putBundleByHashedSub("hashed-sub", { bundleId: "day-guest", expiry: "2099-01-01", actor: "customer" });

    expect(mockPutCommand.mock.calls[0][0].Item.ttl_datestamp.slice(0, 10)).toBe("2099-02-01");
  });

  test("a null expiry is dropped the same way as an empty one", async () => {
    await putBundleByHashedSub("hashed-sub", { bundleId: "resident-vat", expiry: null });

    const item = mockPutCommand.mock.calls[0][0].Item;
    expect("expiry" in item).toBe(false);
  });
});
