// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/hmrcItsaSelfEmploymentPeriodPost.activity.test.js
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

import { ingestHandler as hmrcItsaSelfEmploymentPeriodPostHandler } from "@app/functions/hmrc/hmrcItsaSelfEmploymentPeriodPost.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const mockFetch = setupFetchMock();

const VALID_NINO = "AB123456C";
const VALID_BUSINESS_ID = "XAIS12345678910";

function buildPeriodBody(overrides = {}) {
  return {
    nino: VALID_NINO,
    businessId: VALID_BUSINESS_ID,
    periodStartDate: "2024-04-06",
    periodEndDate: "2024-07-05",
    periodIncome: { turnover: 1000, other: 0 },
    periodExpenses: { costOfGoods: 100 },
    periodDisallowableExpenses: {},
    ...overrides,
  };
}

function buildInitialSubmissionEvent(headers = {}) {
  return buildHmrcEvent({
    body: buildPeriodBody(),
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

describe("hmrcItsaSelfEmploymentPeriodPost token charge, receipt and failure reporting", () => {
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
    mockConsumeTokenForActivity.mockResolvedValue({ consumed: true, tokensRemaining: 4, cost: 1 });
  });

  test("charges one token for the self-employed activity on the initial request, before HMRC is called", async () => {
    mockHmrcSuccess(mockFetch, { periodId: "2024-04-06_2024-07-05" });

    const response = await hmrcItsaSelfEmploymentPeriodPostHandler(buildInitialSubmissionEvent());
    expect(response.statusCode).toBe(200);

    expect(mockConsumeTokenForActivity).toHaveBeenCalledTimes(1);
    expect(mockConsumeTokenForActivity).toHaveBeenCalledWith("test-sub", "self-employed", expect.any(Object));
    const tokenCallOrder = mockConsumeTokenForActivity.mock.invocationCallOrder[0];
    const fetchCallOrder = mockFetch.mock.invocationCallOrder[0];
    expect(tokenCallOrder).toBeLessThan(fetchCallOrder);
  });

  test("does not charge a token for a request our own validation rejects before it reaches HMRC", async () => {
    const event = buildHmrcEvent({
      body: buildPeriodBody({ nino: undefined }),
      headers: { authorization: "Bearer test-token", "x-initial-request": "true" },
    });

    const response = await hmrcItsaSelfEmploymentPeriodPostHandler(event);
    expect(response.statusCode).toBe(400);

    expect(mockConsumeTokenForActivity).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("an exhausted allowance answers 403 with tokens_exhausted and never calls HMRC", async () => {
    mockConsumeTokenForActivity.mockResolvedValue({ consumed: false, reason: "tokens_exhausted", tokensRemaining: 0 });

    const response = await hmrcItsaSelfEmploymentPeriodPostHandler(buildInitialSubmissionEvent());
    expect(response.statusCode).toBe(403);
    const body = JSON.parse(response.body);
    expect(body.reason).toBe("tokens_exhausted");

    expect(mockFetch).not.toHaveBeenCalled();
    expect(failureEventsWithCategory("tokens-exhausted")).toHaveLength(1);
    expect(metricCalls("ItsaSubmissionFailure")).toHaveLength(1);
  });

  test("a successful filing stores a receipt keyed on HMRC's periodId, carrying what HMRC returned", async () => {
    const periodSummary = { periodId: "2024-04-06_2024-07-05" };
    mockHmrcSuccess(mockFetch, periodSummary);

    await hmrcItsaSelfEmploymentPeriodPostHandler(buildInitialSubmissionEvent());

    const receipts = await storedReceiptItems();
    expect(receipts).toHaveLength(1);
    expect(receipts[0].receiptId.endsWith("-2024-04-06_2024-07-05")).toBe(true);
    expect(receipts[0].receipt).toEqual(periodSummary);
    expect(receipts[0].actor).toBe("customer");
    expect(receipts[0].hashedSub).toBeDefined();
    expect(receipts[0].ttl).toBeDefined();
  });

  test("a successful filing emits a success metric alongside the success event", async () => {
    mockHmrcSuccess(mockFetch, { periodId: "2024-04-06_2024-07-05" });

    await hmrcItsaSelfEmploymentPeriodPostHandler(buildInitialSubmissionEvent());

    expect(mockPublishActivityEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: "itsa-self-employment-period-created", userSub: "test-sub" }),
    );
    expect(metricCalls("ItsaSubmissionSuccess")).toHaveLength(1);
    expect(metricCalls("ItsaSubmissionFailure")).toHaveLength(0);
  });

  test("an HMRC rejection emits a failure event and a failure metric", async () => {
    mockHmrcError(mockFetch, 400, { code: "RULE_OVERLAPPING_PERIOD", message: "The submission overlaps another period" });

    await hmrcItsaSelfEmploymentPeriodPostHandler(buildInitialSubmissionEvent());

    const rejections = failureEventsWithCategory("hmrc-rejected");
    expect(rejections).toHaveLength(1);
    expect(rejections[0][0]).toMatchObject({ event: "itsa-self-employment-period-failed", detail: { hmrcStatus: 400 } });
    expect(metricCalls("ItsaSubmissionFailure")).toHaveLength(1);
    expect(metricCalls("ItsaSubmissionSuccess")).toHaveLength(0);
  });

  test("no NINO or HMRC payload reaches the failure event", async () => {
    mockHmrcError(mockFetch, 400, { code: "FORMAT_NINO", message: `The NINO ${VALID_NINO} is invalid` });

    await hmrcItsaSelfEmploymentPeriodPostHandler(buildInitialSubmissionEvent());

    const published = JSON.stringify(failureEventsWithCategory("hmrc-rejected")[0][0]);
    expect(published).not.toContain(VALID_NINO);
    expect(published).not.toContain("FORMAT_NINO");
    expect(published).not.toContain("test-token");
  });
});
