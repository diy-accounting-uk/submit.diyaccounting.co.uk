// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, vi, beforeEach } from "vitest";

const mockExecute = vi.fn();
vi.mock("@app/lib/dynamoDbClient.js", () => ({
  executeDynamoDbCommand: (...args) => mockExecute(...args),
  getResourceName: (name) => `resolved-${name}`,
}));

const { updateSubscription } = await import("@app/data/dynamoDbSubscriptionRepository.js");

const module = {
  UpdateCommand: class UpdateCommand {
    constructor(input) {
      this.input = input;
    }
  },
};

async function commandFor(...args) {
  let command;
  mockExecute.mockImplementationOnce(async (build) => {
    command = build(module);
    return {};
  });
  await updateSubscription(...args);
  return command.input;
}

describe("updateSubscription", () => {
  beforeEach(() => {
    mockExecute.mockReset();
  });

  test("a test-mode event fills a missing actor with a test user and keeps an actor the row has", async () => {
    const input = await commandFor("stripe#sub_1", { status: "active" }, { test: true });
    expect(input.UpdateExpression).toContain("#actor = if_not_exists(#actor, :testActor)");
    expect(input.ExpressionAttributeValues[":testActor"]).toBe("test-user");
  });

  test("a live-mode event leaves a missing actor missing", async () => {
    const input = await commandFor("stripe#sub_1", { status: "active" }, { test: false });
    expect(input.UpdateExpression).not.toContain("actor");
    expect(input.ExpressionAttributeNames["#actor"]).toBeUndefined();
  });
});
