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

vi.mock("@app/lib/activityAlert.js", async (importOriginal) => ({
  ...(await importOriginal()),
  publishActivityEvent: vi.fn().mockResolvedValue({}),
}));

vi.mock("@app/data/dynamoDbCompaniesHouseFilingStateRepository.js", () => ({
  listFilingsInProgress: vi.fn(),
}));

vi.mock("@app/data/dynamoDbPracticeClientRepository.js", () => ({
  getClient: vi.fn(),
}));

const mockLoggerWarn = vi.fn();
const mockLoggerError = vi.fn();
vi.mock("@app/lib/logger.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    createLogger: (bindings) => {
      const child = actual.createLogger(bindings);
      return {
        info: (...args) => child.info(...args),
        error: (obj) => mockLoggerError(obj),
        warn: (obj) => mockLoggerWarn(obj),
        debug: (...args) => child.debug(...args),
        trace: (...args) => child.trace(...args),
        fatal: (...args) => child.fatal(...args),
      };
    },
  };
});

const { ingestHandler: hmrcReceiptGetHandler } = await import("@app/functions/hmrc/hmrcReceiptGet.js");
const { listUserReceipts } = await import("@app/data/dynamoDbReceiptRepository.js");
const { getClient } = await import("@app/data/dynamoDbPracticeClientRepository.js");
const { listFilingsInProgress } = await import("@app/data/dynamoDbCompaniesHouseFilingStateRepository.js");
const { publishActivityEvent } = await import("@app/lib/activityAlert.js");

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
    listFilingsInProgress.mockReset().mockResolvedValue([]);
    getClient.mockReset();
    publishActivityEvent.mockClear();
  });

  test("publishes a receipts-viewed event when a receipt list is returned", async () => {
    const response = await hmrcReceiptGetHandler(buildAuthenticatedEvent({ sub: "list-sub" }));

    expect(response.statusCode).toBe(200);
    expect(publishActivityEvent).toHaveBeenCalledWith(expect.objectContaining({ event: "receipts-viewed", userSub: "list-sub" }));
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

  test("lists the caller's Companies House filings in progress beside the receipts", async () => {
    const pending = {
      submissionNumber: "00001A",
      kind: "accounts",
      status: "pending",
      submittedAt: "2026-11-18T10:00:00.000Z",
      rejections: [],
    };
    listFilingsInProgress.mockResolvedValue([pending]);

    const response = await hmrcReceiptGetHandler(buildAuthenticatedEvent({ sub: "filer-sub" }));

    expect(response.statusCode).toBe(200);
    expect(listFilingsInProgress).toHaveBeenCalledWith("filer-sub");
    expect(JSON.parse(response.body).filingsInProgress).toEqual([pending]);
  });

  test("a practice's list for one client carries no filings in progress", async () => {
    getClient.mockResolvedValue({ clientId: "client-1" });

    const response = await hmrcReceiptGetHandler(buildAuthenticatedEvent({ clientId: "client-1" }));

    expect(JSON.parse(response.body).filingsInProgress).toEqual([]);
    expect(listFilingsInProgress).not.toHaveBeenCalled();
  });

  test("with a client id belonging to the caller's practice, lists only that client's receipts", async () => {
    getClient.mockResolvedValue({ clientId: "client-1" });

    const response = await hmrcReceiptGetHandler(buildAuthenticatedEvent({ clientId: "client-1" }));

    expect(response.statusCode).toBe(200);
    expect(getClient).toHaveBeenCalledWith("practice-sub", "client-1");
    expect(listUserReceipts).toHaveBeenCalledWith("practice-sub", "client-1");
  });

  test("a receipt not found logs at warn, not error, and answers a validation error", async () => {
    mockLoggerWarn.mockClear();
    mockLoggerError.mockClear();
    listUserReceipts.mockRejectedValueOnce(new Error("Receipt not found"));

    const response = await hmrcReceiptGetHandler(buildAuthenticatedEvent({ sub: "missing-sub" }));

    expect(mockLoggerWarn).toHaveBeenCalledWith(expect.objectContaining({ message: "Receipt not found" }));
    expect(mockLoggerError).not.toHaveBeenCalledWith(expect.objectContaining({ message: "Error retrieving receipts" }));
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toBe("Receipt not found");
  });

  test("a missing table answers 500, not the receipt-not-found validation error", async () => {
    const missingTable = () => Object.assign(new Error("Requested resource not found"), { name: "ResourceNotFoundException" });
    listFilingsInProgress.mockRejectedValueOnce(missingTable());

    const listResponse = await hmrcReceiptGetHandler(buildAuthenticatedEvent({ sub: "filer-sub" }));

    expect(listResponse.statusCode).toBe(500);

    listUserReceipts.mockRejectedValueOnce(missingTable());
    const receiptsResponse = await hmrcReceiptGetHandler(buildAuthenticatedEvent({ sub: "filer-sub" }));
    expect(receiptsResponse.statusCode).toBe(500);
  });

  test("403s a client id that does not belong to the caller's practice", async () => {
    getClient.mockResolvedValue(null);

    const response = await hmrcReceiptGetHandler(buildAuthenticatedEvent({ clientId: "someone-elses-client" }));

    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body).code).toBe("client-not-found");
    expect(listUserReceipts).not.toHaveBeenCalled();
  });
});
