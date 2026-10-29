// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, vi, beforeEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const mockSend = vi.fn();
const dynamoDbModule = {
  QueryCommand: class QueryCommand {
    constructor(params) {
      this.kind = "query";
      this.input = params;
    }
  },
  DeleteCommand: class DeleteCommand {
    constructor(params) {
      this.kind = "delete";
      this.input = params;
    }
  },
};
vi.mock("@app/lib/dynamoDbClient.js", () => ({
  getDynamoDbDocClient: vi.fn().mockResolvedValue({ docClient: { send: (...args) => mockSend(...args) }, module: dynamoDbModule }),
  executeDynamoDbCommand: (commandBuilder) => mockSend(commandBuilder(dynamoDbModule)),
  getResourceName: (envVarName) => process.env[envVarName] || "",
}));

vi.mock("@app/services/subHasher.js", () => ({
  hashSub: vi.fn().mockResolvedValue("hashed-sub"),
  hashSubWithVersion: vi.fn().mockResolvedValue("hashed-sub"),
  getSaltVersion: vi.fn().mockReturnValue("v1"),
  getPreviousVersions: vi.fn().mockReturnValue([]),
}));

const { deleteAllBundles, ACCOUNT_SETTINGS_ITEM_ID } = await import("@app/data/dynamoDbBundleRepository.js");

describe("data/dynamoDbBundleRepository - deleteAllBundles", () => {
  beforeEach(() => {
    mockSend.mockReset();
  });

  test("deletes every bundle and leaves the account settings item", async () => {
    const deleted = [];
    mockSend.mockImplementation(async (command) => {
      if (command.kind === "query") {
        return {
          Items: [
            { hashedSub: "hashed-sub", bundleId: "day-guest" },
            { hashedSub: "hashed-sub", bundleId: "test" },
            { hashedSub: "hashed-sub", bundleId: ACCOUNT_SETTINGS_ITEM_ID, settings: { passGeneration: false } },
          ],
          Count: 3,
        };
      }
      deleted.push(command.input.Key.bundleId);
      return {};
    });

    await deleteAllBundles("user-1");

    expect(deleted.sort()).toEqual(["day-guest", "test"]);
  });
});
