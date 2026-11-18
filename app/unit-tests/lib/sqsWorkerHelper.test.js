// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@app/services/subHasher.js", async (importOriginal) => ({
  ...(await importOriginal()),
  initializeSalt: vi.fn(async () => {}),
}));

const { processSqsRecords } = await import("@app/lib/sqsWorkerHelper.js");
const { callActorClass } = await import("@app/lib/integrationCalls.js");
const { resetRememberedActors } = await import("@app/lib/activityAlert.js");

const quietLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

function record(payload, requestId = "req-1") {
  return { messageId: `msg-${requestId}`, body: JSON.stringify({ userId: "sub-1", requestId, payload }) };
}

async function actorsSeenByWorker(records) {
  const actors = [];
  await processSqsRecords(
    { Records: records },
    {
      requiredEnv: [],
      logger: quietLogger,
      errorPolicy: "rethrow",
      processRecord: async () => {
        actors.push(callActorClass());
      },
    },
  );
  return actors;
}

describe("processSqsRecords actor class", () => {
  beforeEach(() => {
    resetRememberedActors();
  });

  it("classes a worker call for a synthetic account as test-user", async () => {
    expect(await actorsSeenByWorker([record({ userEmail: "synthetic-local@test.diyaccounting.co.uk" })])).toEqual(["test-user"]);
  });

  it("classes a worker call for a customer email as customer", async () => {
    expect(await actorsSeenByWorker([record({ userEmail: "someone@example.com" })])).toEqual(["customer"]);
  });

  it("classes a worker call with no email in the payload as customer", async () => {
    expect(await actorsSeenByWorker([record({})])).toEqual(["customer"]);
  });

  it("does not carry one record's email into the next record of the batch", async () => {
    const actors = await actorsSeenByWorker([
      record({ userEmail: "synthetic-local@test.diyaccounting.co.uk" }, "req-1"),
      record({}, "req-2"),
    ]);
    expect(actors).toEqual(["test-user", "customer"]);
  });
});

describe("handlers that enqueue worker payloads", () => {
  it("every HMRC handler that builds a payload puts the caller's email in it", async () => {
    const { readdirSync, readFileSync } = await import("node:fs");
    const dir = new URL("../../functions/hmrc/", import.meta.url);
    const missing = readdirSync(dir)
      .filter((name) => name.endsWith(".js"))
      .filter((name) => {
        const source = readFileSync(new URL(name, dir), "utf8");
        const start = source.indexOf("const payload = {");
        if (start < 0) return false;
        return !source.slice(start, source.indexOf("\n  };", start)).includes("userEmail");
      });
    expect(missing).toEqual([]);
  });
});
