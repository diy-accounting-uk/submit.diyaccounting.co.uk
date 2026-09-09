// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/hmrcItsaSelfEmploymentAnnualPut.activity.test.js
// NOTE: Test data in this file (test-token, test-sub, etc.) are not real credentials

import { describe, test, beforeAll, beforeEach, expect, vi } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { buildHmrcEvent } from "@app/test-helpers/eventBuilders.js";
import { setupTestEnv, setupFetchMock, mockHmrcSuccess, mockHmrcError } from "@app/test-helpers/mockHelpers.js";
import {
  mockSend,
  mockLibDynamoDb,
  mockClientDynamoDb,
  MockQueryCommand,
  MockPutCommand,
  MockGetCommand,
  MockUpdateCommand,
} from "@app/test-helpers/dynamoDbMock.js";

vi.mock("@aws-sdk/lib-dynamodb", () => mockLibDynamoDb);
vi.mock("@aws-sdk/client-dynamodb", () => mockClientDynamoDb);

const mockSqsSend = vi.fn();
vi.mock("@aws-sdk/client-sqs", () => {
  class SQSClient {
    constructor(_config) {}
    send(cmd) {
      return mockSqsSend(cmd);
    }
  }
  class SendMessageCommand {
    constructor(input) {
      this.input = input;
    }
  }
  return { SQSClient, SendMessageCommand };
});

const mockConsumeTokenForActivity = vi.fn();
vi.mock("@app/services/tokenEnforcement.js", () => ({
  consumeTokenForActivity: (...args) => mockConsumeTokenForActivity(...args),
}));

// Capture activity events and metrics rather than reaching EventBridge or the log stream.
const mockPublishActivityEvent = vi.fn();
const mockPublishActivityFailureEvent = vi.fn();
vi.mock("@app/lib/activityAlert.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    publishActivityEvent: (...args) => mockPublishActivityEvent(...args),
    publishActivityFailureEvent: (...args) => mockPublishActivityFailureEvent(...args),
  };
});

const mockEmitMetric = vi.fn();
vi.mock("@app/lib/emfMetrics.js", () => ({
  emitMetric: (...args) => mockEmitMetric(...args),
}));

import { ingestHandler as hmrcItsaSelfEmploymentAnnualPutHandler } from "@app/functions/hmrc/hmrcItsaSelfEmploymentAnnualPut.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const mockFetch = setupFetchMock();

const VALID_NINO = "AB123456C";
const VALID_BUSINESS_ID = "XAIS12345678901";
const VALID_TAX_YEAR = "2023-24";

function buildAnnualBody(overrides = {}) {
  return {
    nino: VALID_NINO,
    businessId: VALID_BUSINESS_ID,
    taxYear: VALID_TAX_YEAR,
    adjustments: { includedNonTaxableProfits: 200 },
    ...overrides,
  };
}

function buildInitialAnnualEvent({ body = {}, headers = {} } = {}) {
  return buildHmrcEvent({
    body: buildAnnualBody(body),
    headers: { authorization: "Bearer test-token", "x-initial-request": "true", ...headers },
  });
}

function failureEventsWithCategory(category) {
  return mockPublishActivityFailureEvent.mock.calls.filter((call) => call[0].failure === category);
}

function metricCalls(metricName) {
  return mockEmitMetric.mock.calls.filter((call) => call[0].metricName === metricName);
}

async function storedReceiptItems() {
  const lib = await import("@aws-sdk/lib-dynamodb");
  return mockSend.mock.calls
    .filter((call) => call[0] instanceof lib.PutCommand && call[0].input.TableName === process.env.RECEIPTS_DYNAMODB_TABLE_NAME)
    .map((call) => call[0].input.Item);
}

describe("hmrcItsaSelfEmploymentAnnualPut token cost, receipt and failure reporting", () => {
  beforeAll(async () => {
    // The vendor IP lookup runs once per module, so settle it before any test queues
    // an HMRC response - otherwise the first test's response is consumed by the lookup.
    const { detectVendorPublicIp } = await import("@app/lib/buildFraudHeaders.js");
    await detectVendorPublicIp();
  });

  beforeEach(() => {
    Object.assign(process.env, setupTestEnv());
    vi.clearAllMocks();
    mockSend.mockImplementation(async (cmd) => {
      if (cmd instanceof MockQueryCommand) return { Items: [], Count: 0 };
      if (cmd instanceof MockPutCommand) return {};
      if (cmd instanceof MockUpdateCommand) return {};
      if (cmd instanceof MockGetCommand) return { Item: null };
      return {};
    });
  });

  test("charges no token for the annual submission", async () => {
    mockHmrcSuccess(mockFetch, {});

    const response = await hmrcItsaSelfEmploymentAnnualPutHandler(buildInitialAnnualEvent());
    expect(response.statusCode).toBe(200);

    expect(mockConsumeTokenForActivity).not.toHaveBeenCalled();
  });

  test("a successful submission stores a receipt keyed on businessId and taxYear, carrying what was sent and HMRC's correlation id", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve("{}"),
      headers: { forEach: (cb) => cb("test-correlation-id", "X-CorrelationId") },
    });

    await hmrcItsaSelfEmploymentAnnualPutHandler(buildInitialAnnualEvent());

    const receipts = await storedReceiptItems();
    expect(receipts).toHaveLength(1);
    expect(receipts[0].receiptId.endsWith(`-${VALID_BUSINESS_ID}-${VALID_TAX_YEAR}`)).toBe(true);
    expect(receipts[0].receipt).toMatchObject({
      businessId: VALID_BUSINESS_ID,
      taxYear: VALID_TAX_YEAR,
      adjustments: { includedNonTaxableProfits: 200 },
      correlationId: "test-correlation-id",
    });
    expect(receipts[0].actor).toBe("customer");
    expect(receipts[0].hashedSub).toBeDefined();
    expect(receipts[0].ttl).toBeDefined();
  });

  test("a successful submission emits a success metric alongside the filed event", async () => {
    mockHmrcSuccess(mockFetch, {});

    await hmrcItsaSelfEmploymentAnnualPutHandler(buildInitialAnnualEvent());

    expect(mockPublishActivityEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: "itsa-annual-submission-filed", userSub: "test-sub" }),
    );
    expect(metricCalls("ItsaSubmissionSuccess")).toHaveLength(1);
    expect(metricCalls("ItsaSubmissionFailure")).toHaveLength(0);
  });

  test("an HMRC rejection emits a failure event and a failure metric", async () => {
    mockHmrcError(mockFetch, 400, { code: "RULE_TAX_YEAR_NOT_SUPPORTED", message: "The tax year is not supported" });

    await hmrcItsaSelfEmploymentAnnualPutHandler(buildInitialAnnualEvent());

    const rejections = failureEventsWithCategory("hmrc-rejected");
    expect(rejections).toHaveLength(1);
    expect(rejections[0][0]).toMatchObject({ event: "itsa-annual-submission-failed", detail: { hmrcStatus: 400 } });
    expect(metricCalls("ItsaSubmissionFailure")).toHaveLength(1);
    expect(metricCalls("ItsaSubmissionSuccess")).toHaveLength(0);
  });

  test("no NINO or HMRC payload reaches the failure event", async () => {
    mockHmrcError(mockFetch, 400, { code: "FORMAT_NINO", message: `The NINO ${VALID_NINO} is invalid` });

    await hmrcItsaSelfEmploymentAnnualPutHandler(buildInitialAnnualEvent());

    const published = JSON.stringify(failureEventsWithCategory("hmrc-rejected")[0][0]);
    expect(published).not.toContain(VALID_NINO);
    expect(published).not.toContain("FORMAT_NINO");
    expect(published).not.toContain("test-token");
  });
});
