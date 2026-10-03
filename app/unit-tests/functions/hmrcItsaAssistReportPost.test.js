// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/hmrcItsaAssistReportPost.test.js
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

import { ingestHandler } from "@app/functions/hmrc/hmrcItsaAssistReportPost.js";
import { itsaAssist } from "@app/lib/hmrcAssistApi.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const REPORT_ID = "11111111-2222-4333-8444-555555555555";
const CORRELATION_ID = "c".repeat(64);
const HMRC_REPORT = {
  reportId: REPORT_ID,
  correlationId: CORRELATION_ID,
  messages: [
    {
      title: "First",
      body: "Body one",
      action: "Action one",
      links: [{ title: "Link one", url: "https://www.gov.uk/one" }],
      path: "/path/one",
    },
    {
      title: "Second",
      body: "Body two",
      action: "Action two",
      links: [{ title: "Link two", url: "https://www.gov.uk/two" }],
      path: "/path/two",
    },
  ],
};

let mockFetch;

function mockHmrcNoContent() {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 204,
    json: () => Promise.reject(new Error("no body")),
    text: () => Promise.resolve(""),
  });
}

function hmrcCalls() {
  return mockFetch.mock.calls.filter((call) => String(call[0]).startsWith(process.env.HMRC_BASE_URI));
}

function receiptPuts() {
  return mockSend.mock.calls
    .map((call) => call[0])
    .filter((cmd) => cmd.input?.TableName === process.env.RECEIPTS_DYNAMODB_TABLE_NAME && cmd.input?.Item);
}

const NINO = "AB123456C";
const TAX_YEAR = "2025-26";
const CALCULATION_ID = "f2fb30e5-4ab6-4a29-b3c1-c7264259ff1c";

function buildEvent({ body = {}, headers = {} } = {}) {
  return buildHmrcEvent({
    body: { nino: NINO, taxYear: TAX_YEAR, calculationId: CALCULATION_ID, ...body },
    headers: { authorization: "Bearer test-token", ...headers },
  });
}

describe("hmrcItsaAssistReportPost ingestHandler", () => {
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

  test("returns 400 when nino is missing", async () => {
    const response = await ingestHandler(buildEvent({ body: { nino: undefined } }));
    expect(response.statusCode).toBe(400);
    expect(hmrcCalls()).toHaveLength(0);
  });

  test("returns 400 when nino is malformed", async () => {
    const response = await ingestHandler(buildEvent({ body: { nino: "nope" } }));
    expect(response.statusCode).toBe(400);
    expect(hmrcCalls()).toHaveLength(0);
  });

  test("returns 400 when taxYear is malformed", async () => {
    const response = await ingestHandler(buildEvent({ body: { taxYear: "2025" } }));
    expect(response.statusCode).toBe(400);
    expect(hmrcCalls()).toHaveLength(0);
  });

  test("returns 400 when calculationId is missing", async () => {
    const response = await ingestHandler(buildEvent({ body: { calculationId: undefined } }));
    expect(response.statusCode).toBe(400);
    expect(hmrcCalls()).toHaveLength(0);
  });

  test("returns 400 when calculationId is malformed", async () => {
    const response = await ingestHandler(buildEvent({ body: { calculationId: "not-a-calculation-id" } }));
    expect(response.statusCode).toBe(400);
    expect(hmrcCalls()).toHaveLength(0);
  });

  test("posts to the HMRC report URL with the version 1.0 Accept header and a bearer token", async () => {
    mockHmrcSuccess(mockFetch, HMRC_REPORT);
    await ingestHandler(buildEvent());

    expect(hmrcCalls()).toHaveLength(1);
    const [calledUrl, calledInit] = hmrcCalls()[0];
    expect(calledInit.method).toBe("POST");
    expect(calledUrl).toBe(
      itsaAssist.reportUrl(process.env.HMRC_BASE_URI, { nino: NINO, taxYear: TAX_YEAR, calculationId: CALCULATION_ID }),
    );
    expect(calledInit.headers.Accept).toBe(itsaAssist.acceptHeader);
    expect(calledInit.headers.Authorization).toBe("Bearer test-token");
    expect(calledInit.body).toBeUndefined();
  });

  test("the contract names the scopes the sign-in must grant", () => {
    expect(itsaAssist.scopes).toEqual(["read:self-assessment-assist", "write:self-assessment-assist"]);
  });

  test("returns the normalised report and stores a receipt of kind itsa-assist-report", async () => {
    mockHmrcSuccess(mockFetch, HMRC_REPORT);
    const response = await ingestHandler(buildEvent());

    expect(response.statusCode).toBe(200);
    const body = parseResponseBody(response);
    expect(body.reportId).toBe(REPORT_ID);
    expect(body.correlationId).toBe(CORRELATION_ID);
    expect(body.messages.map((message) => message.title)).toEqual(["First", "Second"]);
    expect(body.receiptId).toContain(REPORT_ID);

    const puts = receiptPuts();
    expect(puts).toHaveLength(1);
    const receipt = puts[0].input.Item.receipt;
    expect(puts[0].input.Item.receiptId).toBe(body.receiptId);
    expect(receipt.kind).toBe("itsa-assist-report");
    expect(receipt.reportId).toBe(REPORT_ID);
    expect(receipt.correlationId).toBe(CORRELATION_ID);
    expect(receipt.messages).toEqual(HMRC_REPORT.messages);
    expect(receipt.requestedAt).toBeTruthy();
    expect(receipt.nino).toBe(NINO);
    expect(receipt.taxYear).toBe(TAX_YEAR);
    expect(receipt.calculationId).toBe(CALCULATION_ID);
  });

  test("passes HMRC's 204 through as 204 and stores no receipt", async () => {
    mockHmrcNoContent();
    const response = await ingestHandler(buildEvent());

    expect(response.statusCode).toBe(204);
    expect(receiptPuts()).toHaveLength(0);
  });

  test.each([
    [400, "FORMAT_CALC_ID"],
    [403, "CLIENT_OR_AGENT_NOT_AUTHORISED"],
    [404, "MATCHING_CALCULATION_ID_NOT_FOUND"],
  ])("maps an HMRC %i (%s) to the same status", async (status, code) => {
    mockHmrcError(mockFetch, status, { code, message: "HMRC says no" });
    const response = await ingestHandler(buildEvent());

    expect(response.statusCode).toBe(status);
    expect(receiptPuts()).toHaveLength(0);
  });

  test("returns 202 when x-wait-time-ms is 0", async () => {
    const response = await ingestHandler(buildEvent({ headers: { "x-wait-time-ms": "0" } }));
    expect(response.statusCode).toBe(202);
  });

  test("returns 403 when the user holds no entitled bundle", async () => {
    const event = buildEvent();
    event.requestContext.http.path = "/api/v1/hmrc/itsa/assist/report";
    const response = await ingestHandler(event);
    expect(response.statusCode).toBe(403);
    expect(hmrcCalls()).toHaveLength(0);
  });
});
