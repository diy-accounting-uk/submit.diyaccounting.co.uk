// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/deleteUserData.test.js

import { describe, test, expect, vi } from "vitest";
import { DeleteCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

import {
  anonymizeReceipts,
  deleteSubscriptions,
  deleteUserData,
  lookupSubscriptionIdsInLake,
  TABLE_DEFS,
} from "../../../scripts/delete-user-data.js";

const RECEIPT = {
  hashedSub: "hash-of-user",
  receiptId: "2026-01-01T00:00:00.000Z-123456789",
  receipt: { formBundleNumber: "123456789" },
  actor: "customer",
  email: "person@example.com",
  userName: "A Person",
  address: "1 High Street",
  ttl: 1900000000,
};

function recordingClient(failOn) {
  const sent = [];
  return {
    sent,
    send: vi.fn(async (command) => {
      sent.push(command);
      if (failOn && failOn(command)) throw new Error("write refused");
      return {};
    }),
  };
}

describe("anonymizeReceipts", () => {
  test("writes the DELETED copy before it deletes the receipt", async () => {
    const client = recordingClient();

    const count = await anonymizeReceipts(client, "ci-env-receipts", [RECEIPT]);

    expect(count).toBe(1);
    expect(client.sent).toHaveLength(2);
    expect(client.sent[0]).toBeInstanceOf(PutCommand);
    expect(client.sent[1]).toBeInstanceOf(DeleteCommand);
    expect(client.sent[1].input.Key).toEqual({ hashedSub: "hash-of-user", receiptId: RECEIPT.receiptId });
  });

  test("the copy keeps the filing and drops the personal fields and the link to the user", async () => {
    const client = recordingClient();

    await anonymizeReceipts(client, "ci-env-receipts", [RECEIPT]);

    const copy = client.sent[0].input.Item;
    expect(copy.hashedSub).toBe("DELETED");
    expect(copy.receiptId).toBe(RECEIPT.receiptId);
    expect(copy.receipt).toEqual(RECEIPT.receipt);
    expect(copy.ttl).toBe(RECEIPT.ttl);
    expect(copy.anonymizedAt).toEqual(expect.any(String));
    expect(copy).not.toHaveProperty("email");
    expect(copy).not.toHaveProperty("userName");
    expect(copy).not.toHaveProperty("address");
    expect(JSON.stringify(copy)).not.toContain("hash-of-user");
  });

  test("a failed write stops the delete of that receipt", async () => {
    const client = recordingClient((command) => command instanceof PutCommand);

    await expect(anonymizeReceipts(client, "ci-env-receipts", [RECEIPT])).rejects.toThrow("write refused");

    expect(client.sent.some((command) => command instanceof DeleteCommand)).toBe(false);
  });
});

describe("deleteSubscriptions", () => {
  test("deletes each row by its stripe key", async () => {
    const client = recordingClient();

    const count = await deleteSubscriptions(client, "ci-env-subscriptions", ["sub_1", "sub_2"]);

    expect(count).toBe(2);
    expect(client.sent.map((command) => command.input.Key)).toEqual([{ pk: "stripe#sub_1" }, { pk: "stripe#sub_2" }]);
    expect(client.sent[0].input.TableName).toBe("ci-env-subscriptions");
  });
});

describe("lookupSubscriptionIdsInLake", () => {
  test("refuses a hashed sub that could change the query", async () => {
    await expect(lookupSubscriptionIdsInLake({ environmentName: "ci", hashedSubs: ["x' OR '1'='1"] })).rejects.toThrow("does not accept");
  });
});

describe("TABLE_DEFS", () => {
  test("covers the activity charges and practice clients tables", () => {
    expect(TABLE_DEFS).toContainEqual({ suffix: "activity-charges", sortKey: "chargeKey", action: "delete" });
    expect(TABLE_DEFS).toContainEqual({ suffix: "practice-clients", sortKey: "clientId", action: "delete" });
  });
});

describe("deleteUserData", () => {
  function clientWithItems() {
    const sent = [];
    return {
      sent,
      send: vi.fn(async (command) => {
        sent.push(command);
        if (command.input.KeyConditionExpression && command.input.TableName === "ci-env-receipts") return { Items: [RECEIPT] };
        return { Items: [] };
      }),
    };
  }

  test("deletes the subscription rows named by the lake and anonymizes the receipt", async () => {
    const docClient = clientWithItems();
    const lookupSubscriptionIds = vi.fn(async () => ["sub_9"]);

    const summary = await deleteUserData({
      environmentName: "ci",
      hashedSubs: ["hash-of-user"],
      confirm: true,
      jsonOutput: true,
      docClient,
      lookupSubscriptionIds,
    });

    expect(lookupSubscriptionIds).toHaveBeenCalledWith({ environmentName: "ci", hashedSubs: ["hash-of-user"] });
    expect(summary.tables.subscriptions).toEqual({ found: 1, action: "delete", processed: 1 });
    expect(summary.totals.anonymized).toBe(1);
    expect(docClient.sent.filter((c) => c instanceof DeleteCommand && c.input.TableName === "ci-env-subscriptions")).toHaveLength(1);
  });

  test("a dry run reads and deletes nothing", async () => {
    const docClient = clientWithItems();

    const summary = await deleteUserData({
      environmentName: "ci",
      hashedSubs: ["hash-of-user"],
      confirm: false,
      jsonOutput: true,
      docClient,
      lookupSubscriptionIds: async () => ["sub_9"],
    });

    expect(summary.tables.subscriptions).toEqual({ found: 1, action: "delete" });
    expect(docClient.sent.some((c) => c instanceof DeleteCommand || c instanceof PutCommand)).toBe(false);
  });

  test("a failed lake lookup stops the run before any subscription delete", async () => {
    const docClient = clientWithItems();

    await expect(
      deleteUserData({
        environmentName: "ci",
        hashedSubs: ["hash-of-user"],
        confirm: true,
        jsonOutput: true,
        docClient,
        lookupSubscriptionIds: async () => {
          throw new Error("The lake query FAILED");
        },
      }),
    ).rejects.toThrow("The lake query FAILED");
    expect(docClient.sent.some((c) => c instanceof DeleteCommand && c.input.TableName === "ci-env-subscriptions")).toBe(false);
  });
});
