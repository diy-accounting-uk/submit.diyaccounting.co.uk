// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/hmrcVatAssistAcknowledgePost.test.js
import { describe, test, beforeEach, expect, vi } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { buildHmrcEvent } from "@app/test-helpers/eventBuilders.js";
import { setupTestEnv, setupFetchMock, mockHmrcError } from "@app/test-helpers/mockHelpers.js";

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

import { ingestHandler } from "@app/functions/hmrc/hmrcVatAssistAcknowledgePost.js";
import { vatAssist } from "@app/lib/hmrcAssistApi.js";

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

const VRN = "123456789";
const RECEIPT_ID = `2000-01-01T00:00:00.000Z-${REPORT_ID}`;
const STORED_RECEIPT = { kind: "vat-assist-report", reportId: REPORT_ID, correlationId: CORRELATION_ID, messages: HMRC_REPORT.messages };

function buildEvent({ body = {}, headers = {} } = {}) {
  return buildHmrcEvent({
    body: { vrn: VRN, reportId: REPORT_ID, correlationId: CORRELATION_ID, receiptId: RECEIPT_ID, ...body },
    headers: { authorization: "Bearer test-token", ...headers },
  });
}

describe("hmrcVatAssistAcknowledgePost ingestHandler", () => {
  beforeEach(() => {
    Object.assign(process.env, setupTestEnv());
    mockFetch = setupFetchMock();
    vi.resetAllMocks();
    mockEventBridgeSend.mockResolvedValue({});
    mockSend.mockImplementation(async (cmd) => {
      const lib = await import("@aws-sdk/lib-dynamodb");
      if (cmd instanceof lib.QueryCommand) return { Items: [], Count: 0 };
      if (cmd instanceof lib.GetCommand && cmd.input.TableName === process.env.RECEIPTS_DYNAMODB_TABLE_NAME)
        return { Item: { receipt: STORED_RECEIPT } };
      if (cmd instanceof lib.GetCommand) return { Item: null };
      return {};
    });
  });

  test("returns 400 when vrn is missing", async () => {
    const response = await ingestHandler(buildEvent({ body: { vrn: undefined } }));
    expect(response.statusCode).toBe(400);
    expect(hmrcCalls()).toHaveLength(0);
  });

  test("returns 400 when reportId is missing", async () => {
    const response = await ingestHandler(buildEvent({ body: { reportId: undefined } }));
    expect(response.statusCode).toBe(400);
    expect(hmrcCalls()).toHaveLength(0);
  });

  test("returns 400 when correlationId is missing", async () => {
    const response = await ingestHandler(buildEvent({ body: { correlationId: undefined } }));
    expect(response.statusCode).toBe(400);
    expect(hmrcCalls()).toHaveLength(0);
  });

  test("returns 400 when receiptId is missing", async () => {
    const response = await ingestHandler(buildEvent({ body: { receiptId: undefined } }));
    expect(response.statusCode).toBe(400);
    expect(hmrcCalls()).toHaveLength(0);
  });

  test("posts to the HMRC acknowledge URL with the version 1.0 Accept header and a bearer token", async () => {
    mockHmrcNoContent();
    await ingestHandler(buildEvent());

    expect(hmrcCalls()).toHaveLength(1);
    const [calledUrl, calledInit] = hmrcCalls()[0];
    expect(calledInit.method).toBe("POST");
    expect(calledUrl).toBe(
      vatAssist.acknowledgeUrl(process.env.HMRC_BASE_URI, { vrn: VRN, reportId: REPORT_ID, correlationId: CORRELATION_ID }),
    );
    expect(calledInit.headers.Accept).toBe(vatAssist.acceptHeader);
    expect(calledInit.headers.Authorization).toBe("Bearer test-token");
  });

  test("the contract names the scopes the sign-in must grant", () => {
    expect(vatAssist.scopes).toEqual(["read:vat", "write:vat"]);
  });

  test("returns 204 and stamps the stored receipt with acknowledgedAt", async () => {
    mockHmrcNoContent();
    const response = await ingestHandler(buildEvent());

    expect(response.statusCode).toBe(204);
    const puts = receiptPuts();
    expect(puts).toHaveLength(1);
    expect(puts[0].input.Item.receiptId).toBe(RECEIPT_ID);
    expect(puts[0].input.Item.receipt.acknowledgedAt).toBeTruthy();
    expect(puts[0].input.Item.receipt.kind).toBe("vat-assist-report");
    expect(puts[0].input.Item.receipt.messages).toEqual(HMRC_REPORT.messages);
  });

  test.each([
    [400, "INVALID_REQUEST"],
    [403, "CORRELATION_ID_NOT_AUTHORISED"],
    [404, "MATCHING_RESOURCE_NOT_FOUND"],
  ])("maps an HMRC %i (%s) to the same status and leaves the receipt unstamped", async (status, code) => {
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
    event.requestContext.http.path = "/api/v1/hmrc/vat/assist/acknowledge";
    const response = await ingestHandler(event);
    expect(response.statusCode).toBe(403);
    expect(hmrcCalls()).toHaveLength(0);
  });
});
