// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/hmrcItsaUkPropertyPeriodPut.test.js
import { describe, test, beforeEach, expect, vi } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { buildHmrcEvent } from "@app/test-helpers/eventBuilders.js";
import { setupTestEnv, parseResponseBody, setupFetchMock, mockHmrcSuccess, mockHmrcError } from "@app/test-helpers/mockHelpers.js";

const mockSend = vi.fn();
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

vi.mock("@aws-sdk/lib-dynamodb", () => {
  class PutCommand {
    constructor(input) {
      this.input = input;
    }
  }
  class QueryCommand {
    constructor(input) {
      this.input = input;
    }
  }
  class DeleteCommand {
    constructor(input) {
      this.input = input;
    }
  }
  class GetCommand {
    constructor(input) {
      this.input = input;
    }
  }
  class UpdateCommand {
    constructor(input) {
      this.input = input;
    }
  }
  return {
    DynamoDBDocumentClient: { from: () => ({ send: mockSend }) },
    PutCommand,
    QueryCommand,
    DeleteCommand,
    GetCommand,
    UpdateCommand,
  };
});

vi.mock("@aws-sdk/client-dynamodb", () => {
  class DynamoDBClient {
    constructor(_config) {}
  }
  return { DynamoDBClient };
});

const mockEventBridgeSend = vi.fn().mockResolvedValue({});
vi.mock("@aws-sdk/client-eventbridge", () => ({
  EventBridgeClient: class {
    send(...args) {
      return mockEventBridgeSend(...args);
    }
  },
  PutEventsCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
}));

import {
  ingestHandler as hmrcItsaUkPropertyPeriodPutHandler,
  buildAmendUkPropertyPeriodRequestBody,
} from "@app/functions/hmrc/hmrcItsaUkPropertyPeriodPut.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

describe("buildAmendUkPropertyPeriodRequestBody", () => {
  test("carries no fromDate or toDate - the period is identified by the request path", () => {
    const body = buildAmendUkPropertyPeriodRequestBody({
      ukNonFhlProperty: { income: { periodAmount: 500 } },
    });
    expect(body).not.toHaveProperty("fromDate");
    expect(body).not.toHaveProperty("toDate");
  });

  test("omits a property type entirely when the caller entered nothing for it", () => {
    const body = buildAmendUkPropertyPeriodRequestBody({
      ukFhlProperty: {},
      ukNonFhlProperty: { expenses: { consolidatedExpenses: 50 } },
    });
    expect(body).not.toHaveProperty("ukFhlProperty");
    expect(body.ukNonFhlProperty).toEqual({ expenses: { consolidatedExpenses: 50 } });
  });
});

const VALID_NINO = "AB123456C";
const VALID_BUSINESS_ID = "XAIS12345678910";
const VALID_TAX_YEAR = "2023-24";
const VALID_SUBMISSION_ID = "4557ecb5-fd32-48cc-81f5-e6acd1099f3c";

function buildAmendBody(overrides = {}) {
  return {
    nino: VALID_NINO,
    businessId: VALID_BUSINESS_ID,
    taxYear: VALID_TAX_YEAR,
    submissionId: VALID_SUBMISSION_ID,
    ukNonFhlProperty: { income: { periodAmount: 1000 } },
    ...overrides,
  };
}

let mockFetch;

describe("hmrcItsaUkPropertyPeriodPut ingestHandler", () => {
  beforeEach(() => {
    Object.assign(process.env, setupTestEnv());
    mockFetch = setupFetchMock();
    vi.resetAllMocks();
    mockEventBridgeSend.mockResolvedValue({});
    mockSend.mockImplementation(async (cmd) => {
      const lib = await import("@aws-sdk/lib-dynamodb");
      if (cmd instanceof lib.QueryCommand) return { Items: [], Count: 0 };
      if (cmd instanceof lib.GetCommand) return { Item: null };
      return {};
    });
  });

  test("returns 400 when submissionId is missing", async () => {
    const event = buildHmrcEvent({
      body: buildAmendBody({ submissionId: undefined }),
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcItsaUkPropertyPeriodPutHandler(event);
    expect(response.statusCode).toBe(400);
    const body = parseResponseBody(response);
    expect(body.message).toContain("submissionId");
  });

  test("returns 400 for invalid taxYear format", async () => {
    const event = buildHmrcEvent({
      body: buildAmendBody({ taxYear: "not-a-year" }),
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcItsaUkPropertyPeriodPutHandler(event);
    expect(response.statusCode).toBe(400);
  });

  test("calls the typed uk-property path with taxYear and submissionId", async () => {
    mockHmrcSuccess(mockFetch, {});

    const event = buildHmrcEvent({
      body: buildAmendBody(),
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcItsaUkPropertyPeriodPutHandler(event);

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain(
      `/individuals/business/property/uk/${VALID_NINO}/${VALID_BUSINESS_ID}/period/${VALID_TAX_YEAR}/${VALID_SUBMISSION_ID}`,
    );
    expect(response.statusCode).toBe(200);
  });

  test("returns a client error when HMRC rejects the amendment", async () => {
    mockHmrcError(mockFetch, 400, { code: "TYPE_OF_BUSINESS_INCORRECT", message: "The businessId is not a UK property business" });

    const event = buildHmrcEvent({
      body: buildAmendBody(),
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcItsaUkPropertyPeriodPutHandler(event);
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
  });

  test("returns 403 JSON when the authenticated user holds no bundle entitled to amend a quarterly update", async () => {
    const event = buildHmrcEvent({
      body: buildAmendBody(),
      headers: { authorization: "Bearer test-token" },
    });
    event.requestContext.http.path = "/api/v1/hmrc/itsa/uk-property/period";
    const response = await hmrcItsaUkPropertyPeriodPutHandler(event);
    expect(response.statusCode).toBe(403);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
