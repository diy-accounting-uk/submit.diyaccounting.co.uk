// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/hmrcItsaUkPropertyPeriodPut.activity.test.js
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

const mockHasTokensForActivity = vi.fn();
const mockChargeTokenOnSuccess = vi.fn();
vi.mock("@app/services/tokenEnforcement.js", () => ({
  hasTokensForActivity: (...args) => mockHasTokensForActivity(...args),
  chargeTokenOnSuccess: (...args) => mockChargeTokenOnSuccess(...args),
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

import { ingestHandler as hmrcItsaUkPropertyPeriodPutHandler } from "@app/functions/hmrc/hmrcItsaUkPropertyPeriodPut.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const mockFetch = setupFetchMock();

const VALID_NINO = "AB123456C";
const VALID_BUSINESS_ID = "XAIS12345678901";
const VALID_TAX_YEAR = "2023-24";
const VALID_SUBMISSION_ID = "2023-04-06_2023-07-05";

function buildPeriodBody(overrides = {}) {
  return {
    nino: VALID_NINO,
    businessId: VALID_BUSINESS_ID,
    taxYear: VALID_TAX_YEAR,
    submissionId: VALID_SUBMISSION_ID,
    ...overrides,
  };
}

function buildInitialAmendEvent({ body = {}, headers = {} } = {}) {
  return buildHmrcEvent({
    body: buildPeriodBody(body),
    headers: { authorization: "Bearer test-token", "x-initial-request": "true", ...headers },
  });
}

function failureEventsWithCategory(category) {
  return mockPublishActivityFailureEvent.mock.calls.filter((call) => call[0].failure === category);
}

function metricCalls(metricName) {
  return mockEmitMetric.mock.calls.filter((call) => call[0].metricName === metricName);
}

describe("hmrcItsaUkPropertyPeriodPut token charge", () => {
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
    mockHasTokensForActivity.mockResolvedValue({ available: true, cost: 1 });
    mockChargeTokenOnSuccess.mockResolvedValue({ consumed: true, tokensRemaining: 4, cost: 1 });
  });

  test("checks token availability for the self-employed activity on the initial request, before HMRC is called", async () => {
    mockHmrcSuccess(mockFetch, {});

    const response = await hmrcItsaUkPropertyPeriodPutHandler(buildInitialAmendEvent());
    expect(response.statusCode).toBe(200);

    expect(mockHasTokensForActivity).toHaveBeenCalledTimes(1);
    expect(mockHasTokensForActivity).toHaveBeenCalledWith("test-sub", "self-employed", expect.any(Object));
    const tokenCallOrder = mockHasTokensForActivity.mock.invocationCallOrder[0];
    const fetchCallOrder = mockFetch.mock.invocationCallOrder[0];
    expect(tokenCallOrder).toBeLessThan(fetchCallOrder);
  });

  test("does not charge a token for a request our own validation rejects before it reaches HMRC", async () => {
    const event = buildInitialAmendEvent({ body: { nino: undefined } });

    const response = await hmrcItsaUkPropertyPeriodPutHandler(event);
    expect(response.statusCode).toBe(400);

    expect(mockHasTokensForActivity).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("an exhausted allowance answers 403 with tokens_exhausted and never calls HMRC", async () => {
    mockHasTokensForActivity.mockResolvedValue({ available: false, reason: "tokens_exhausted", tokensRemaining: 0 });

    const response = await hmrcItsaUkPropertyPeriodPutHandler(buildInitialAmendEvent());
    expect(response.statusCode).toBe(403);
    const body = JSON.parse(response.body);
    expect(body.reason).toBe("tokens_exhausted");

    expect(mockFetch).not.toHaveBeenCalled();
    expect(failureEventsWithCategory("tokens-exhausted")).toHaveLength(1);
    expect(metricCalls("ItsaSubmissionFailure")).toHaveLength(1);
  });

  test("a successful amendment emits a success metric alongside the success event", async () => {
    mockHmrcSuccess(mockFetch, {});

    await hmrcItsaUkPropertyPeriodPutHandler(buildInitialAmendEvent());

    expect(mockPublishActivityEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: "itsa-uk-property-period-amended", userSub: "test-sub" }),
    );
    expect(metricCalls("ItsaSubmissionSuccess")).toHaveLength(1);
    expect(metricCalls("ItsaSubmissionFailure")).toHaveLength(0);
  });

  test("an HMRC rejection emits a failure event and a failure metric", async () => {
    mockHmrcError(mockFetch, 400, { code: "RULE_OVERLAPPING_PERIOD", message: "The submission overlaps another period" });

    await hmrcItsaUkPropertyPeriodPutHandler(buildInitialAmendEvent());

    const rejections = failureEventsWithCategory("hmrc-rejected");
    expect(rejections).toHaveLength(1);
    expect(rejections[0][0]).toMatchObject({ event: "itsa-uk-property-period-failed", detail: { hmrcStatus: 400 } });
    expect(metricCalls("ItsaSubmissionFailure")).toHaveLength(1);
    expect(metricCalls("ItsaSubmissionSuccess")).toHaveLength(0);
  });

  test("charges the token only after HMRC accepts the amendment", async () => {
    mockHmrcSuccess(mockFetch, {});

    const response = await hmrcItsaUkPropertyPeriodPutHandler(buildInitialAmendEvent());
    expect(response.statusCode).toBe(200);

    expect(mockChargeTokenOnSuccess).toHaveBeenCalledTimes(1);
    expect(mockChargeTokenOnSuccess).toHaveBeenCalledWith("test-sub", "self-employed");
    const chargeCallOrder = mockChargeTokenOnSuccess.mock.invocationCallOrder[0];
    const fetchCallOrder = mockFetch.mock.invocationCallOrder[0];
    expect(fetchCallOrder).toBeLessThan(chargeCallOrder);
  });

  test("an HMRC rejection never charges a token", async () => {
    mockHmrcError(mockFetch, 503, { code: "SERVICE_UNAVAILABLE", message: "Service temporarily unavailable" });

    await hmrcItsaUkPropertyPeriodPutHandler(buildInitialAmendEvent());

    expect(mockChargeTokenOnSuccess).not.toHaveBeenCalled();
  });
});
