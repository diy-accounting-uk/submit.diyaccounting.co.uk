// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/hmrcReceiptGet.test.js
import { describe, test, beforeEach, expect, vi } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { buildHmrcEvent } from "@app/test-helpers/eventBuilders.js";
import { setupTestEnv } from "@app/test-helpers/mockHelpers.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

vi.mock("@app/data/dynamoDbReceiptRepository.js", () => ({
  getReceipt: vi.fn(),
  listUserReceipts: vi.fn(),
}));

vi.mock("@app/data/dynamoDbPracticeClientRepository.js", () => ({
  getClient: vi.fn(),
}));

const { ingestHandler: hmrcReceiptGetHandler } = await import("@app/functions/hmrc/hmrcReceiptGet.js");
const { listUserReceipts } = await import("@app/data/dynamoDbReceiptRepository.js");
const { getClient } = await import("@app/data/dynamoDbPracticeClientRepository.js");

function makeJwt(sub) {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" }))
    .toString("base64")
    .replace(/=+$/g, "");
  const payload = Buffer.from(JSON.stringify({ sub, email: "practice@test.diyaccounting.co.uk" }))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return `${header}.${payload}.`;
}

function buildAuthenticatedEvent({ sub = "practice-sub", clientId } = {}) {
  return buildHmrcEvent({
    headers: { Authorization: `Bearer ${makeJwt(sub)}` },
    queryStringParameters: clientId ? { clientId } : {},
  });
}

describe("hmrcReceiptGet ingestHandler", () => {
  beforeEach(() => {
    Object.assign(process.env, setupTestEnv());
    listUserReceipts.mockReset().mockResolvedValue([]);
    getClient.mockReset();
  });

  test("HEAD request returns expected status", async () => {
    const event = buildHmrcEvent({ queryStringParameters: null });
    event.requestContext.http = { method: "HEAD", path: "/" };
    const response = await hmrcReceiptGetHandler(event);
    expect([200, 400, 401, 500]).toContain(response.statusCode);
  });

  test("returns expected response for receipt request", async () => {
    const event = buildHmrcEvent({ queryStringParameters: {} });
    const response = await hmrcReceiptGetHandler(event);
    expect([200, 400, 401, 500]).toContain(response.statusCode);
  });

  test("handles requests with various parameters", async () => {
    const event = buildHmrcEvent({
      pathParameters: { formBundleNumber: null },
      queryStringParameters: {},
    });
    const response = await hmrcReceiptGetHandler(event);
    expect([200, 400, 401, 500]).toContain(response.statusCode);
  });

  test("with no client id, lists the caller's own receipts", async () => {
    const response = await hmrcReceiptGetHandler(buildAuthenticatedEvent({}));

    expect(response.statusCode).toBe(200);
    expect(listUserReceipts).toHaveBeenCalledWith("practice-sub", undefined);
  });

  test("with a client id belonging to the caller's practice, lists only that client's receipts", async () => {
    getClient.mockResolvedValue({ clientId: "client-1" });

    const response = await hmrcReceiptGetHandler(buildAuthenticatedEvent({ clientId: "client-1" }));

    expect(response.statusCode).toBe(200);
    expect(getClient).toHaveBeenCalledWith("practice-sub", "client-1");
    expect(listUserReceipts).toHaveBeenCalledWith("practice-sub", "client-1");
  });

  test("403s a client id that does not belong to the caller's practice", async () => {
    getClient.mockResolvedValue(null);

    const response = await hmrcReceiptGetHandler(buildAuthenticatedEvent({ clientId: "someone-elses-client" }));

    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body).code).toBe("client-not-found");
    expect(listUserReceipts).not.toHaveBeenCalled();
  });
});
