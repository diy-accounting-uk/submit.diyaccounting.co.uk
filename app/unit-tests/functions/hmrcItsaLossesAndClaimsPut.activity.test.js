// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/hmrcItsaLossesAndClaimsPut.activity.test.js
// NOTE: Test data in this file (test-token, test-sub, etc.) are not real credentials

import { describe, test, beforeAll, beforeEach, expect, vi } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { buildHmrcEvent } from "@app/test-helpers/eventBuilders.js";
import { setupTestEnv, setupFetchMock, mockHmrcSuccess } from "@app/test-helpers/mockHelpers.js";
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

import { ingestHandler as hmrcItsaLossesAndClaimsPutHandler } from "@app/functions/hmrc/hmrcItsaLossesAndClaimsPut.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const mockFetch = setupFetchMock();

const VALID_NINO = "AB123456C";
const VALID_BUSINESS_ID = "XAIS12345678901";
const VALID_TAX_YEAR = "2023-24";

function buildLossesBody(overrides = {}) {
  return {
    nino: VALID_NINO,
    businessId: VALID_BUSINESS_ID,
    taxYear: VALID_TAX_YEAR,
    typeOfBusiness: "self-employment",
    claims: { carryForward: { currentYearLosses: 1000 } },
    ...overrides,
  };
}

function buildInitialLossesEvent({ body = {}, headers = {} } = {}) {
  return buildHmrcEvent({
    body: buildLossesBody(body),
    headers: { authorization: "Bearer test-token", "x-initial-request": "true", ...headers },
  });
}

function failureEventsWithCategory(category) {
  return mockPublishActivityFailureEvent.mock.calls.filter((call) => call[0].failure === category);
}

function metricCalls(metricName) {
  return mockEmitMetric.mock.calls.filter((call) => call[0].metricName === metricName);
}

describe("hmrcItsaLossesAndClaimsPut token charge", () => {
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

  test("charges one token for the self-employed-year-end activity on the initial request, before HMRC is called", async () => {
    mockHmrcSuccess(mockFetch, {});

    const response = await hmrcItsaLossesAndClaimsPutHandler(buildInitialLossesEvent());
    expect(response.statusCode).toBe(200);

    expect(mockConsumeTokenForActivity).toHaveBeenCalledTimes(1);
    expect(mockConsumeTokenForActivity).toHaveBeenCalledWith("test-sub", "self-employed-year-end", expect.any(Object));
    const tokenCallOrder = mockConsumeTokenForActivity.mock.invocationCallOrder[0];
    const fetchCallOrder = mockFetch.mock.invocationCallOrder[0];
    expect(tokenCallOrder).toBeLessThan(fetchCallOrder);
  });

  test("does not charge a token for a request our own validation rejects before it reaches HMRC", async () => {
    const event = buildHmrcEvent({
      body: buildLossesBody({ nino: undefined }),
      headers: { authorization: "Bearer test-token", "x-initial-request": "true" },
    });

    const response = await hmrcItsaLossesAndClaimsPutHandler(event);
    expect(response.statusCode).toBe(400);

    expect(mockConsumeTokenForActivity).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("an exhausted allowance answers 403 with tokens_exhausted and never calls HMRC", async () => {
    mockConsumeTokenForActivity.mockResolvedValue({ consumed: false, reason: "tokens_exhausted", tokensRemaining: 0 });

    const response = await hmrcItsaLossesAndClaimsPutHandler(buildInitialLossesEvent());
    expect(response.statusCode).toBe(403);
    const body = JSON.parse(response.body);
    expect(body.reason).toBe("tokens_exhausted");

    expect(mockFetch).not.toHaveBeenCalled();
    expect(failureEventsWithCategory("tokens-exhausted")).toHaveLength(1);
    expect(metricCalls("ItsaSubmissionFailure")).toHaveLength(1);
  });
});
