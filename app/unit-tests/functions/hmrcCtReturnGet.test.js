// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/hmrcCtReturnGet.test.js
import { describe, test, beforeEach, expect, vi } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { buildLambdaEvent } from "@app/test-helpers/eventBuilders.js";
import { setupTestEnv, parseResponseBody } from "@app/test-helpers/mockHelpers.js";

const mockSend = vi.fn();

vi.mock("@aws-sdk/lib-dynamodb", () => {
  class QueryCommand {
    constructor(input) {
      this.input = input;
    }
  }
  return {
    DynamoDBDocumentClient: { from: () => ({ send: mockSend }) },
    QueryCommand,
    PutCommand: class {
      constructor(input) {
        this.input = input;
      }
    },
    GetCommand: class {
      constructor(input) {
        this.input = input;
      }
    },
    UpdateCommand: class {
      constructor(input) {
        this.input = input;
      }
    },
  };
});

vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: class {
    constructor() {}
  },
}));

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

const mockPostToTransactionEngine = vi.fn();
vi.mock("@app/services/hmrcTransactionEngine.js", async (importOriginal) => ({
  ...(await importOriginal()),
  postToTransactionEngine: (...args) => mockPostToTransactionEngine(...args),
}));

const mockChargeTokenOnSuccess = vi.fn();
vi.mock("@app/services/tokenEnforcement.js", async (importOriginal) => ({
  ...(await importOriginal()),
  chargeTokenOnSuccess: (...args) => mockChargeTokenOnSuccess(...args),
}));

import { ingestHandler as hmrcCtReturnGetHandler } from "@app/functions/hmrc/hmrcCtReturnGet.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const CORRELATION_ID = "46DCD4CC7E194088B99857931C185829";
const POLL_URL = "https://test-transaction-engine.tax.service.gov.uk/poll";

function engineXml({ qualifier, messageFunction = "submit", body = "", errors = "", endPoint = "" }) {
  return `<?xml version="1.0"?><GovTalkMessage xmlns="http://www.govtalk.gov.uk/CM/envelope"><EnvelopeVersion>2.0</EnvelopeVersion><Header><MessageDetails><Class>HMRC-CT-CT600</Class><Qualifier>${qualifier}</Qualifier><Function>${messageFunction}</Function><CorrelationID>${CORRELATION_ID}</CorrelationID>${endPoint}<Transformation>XML</Transformation></MessageDetails><SenderDetails/></Header><GovTalkDetails><Keys/>${errors}</GovTalkDetails><Body>${body}</Body></GovTalkMessage>`;
}

const ACKNOWLEDGEMENT = engineXml({
  qualifier: "acknowledgement",
  endPoint: `<ResponseEndPoint PollInterval="4">${POLL_URL}</ResponseEndPoint>`,
});
const SUCCESS = engineXml({
  qualifier: "response",
  body: '<SuccessResponse xmlns="http://www.inlandrevenue.gov.uk/SuccessResponse"><IRmarkReceipt><dsig:Signature xmlns:dsig="http://www.w3.org/2000/09/xmldsig#"><dsig:SignedInfo><dsig:Reference><dsig:DigestValue>RPfWtxHeCZRcwfitnIJmK9xc4OQ=</dsig:DigestValue></dsig:Reference></dsig:SignedInfo></dsig:Signature><Message code="0000">HMRC has received the HMRC-CT-CT600 document ref: 8596148860. The associated IRmark was: ABC.</Message></IRmarkReceipt></SuccessResponse>',
});
const IRMARK_ERROR = engineXml({
  qualifier: "error",
  errors:
    "<GovTalkErrors><Error><RaisedBy>ChRIS</RaisedBy><Number>3001</Number><Type>business</Type><Text>Business validation errors</Text></Error></GovTalkErrors>",
  body: '<ErrorResponse xmlns="http://www.govtalk.gov.uk/CM/errorresponse" SchemaVersion="2.0"><Error><RaisedBy>ChRIS</RaisedBy><Number>2021</Number><Type>business</Type><Text>The supplied IRmark is incorrect.</Text><Location>IRmark</Location></Error></ErrorResponse>',
});
const DELETE_RESPONSE = engineXml({ qualifier: "response", messageFunction: "delete" });

function pendingRecord(overrides = {}) {
  return {
    status: "pending",
    data: {
      kind: "company-tax-return",
      pollUrl: POLL_URL,
      pollIntervalSeconds: 4,
      nextPollAt: new Date(Date.now() - 1000).toISOString(),
      irmark: "ABCDEFGH",
      utr: "8596148860",
      gatewayTest: true,
      messageClass: "HMRC-CT-CT600",
      ...overrides.data,
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== "data")),
  };
}

function buildEvent({ correlationId = CORRELATION_ID, headers = {}, authorizer, method = "GET" } = {}) {
  const options = {
    method,
    path: `/api/v1/hmrc/ct/return/${correlationId}`,
    pathParameters: { correlationId },
    headers: { Authorization: "Bearer test-cognito-token", ...headers },
  };
  if (authorizer !== undefined) options.authorizer = authorizer;
  return buildLambdaEvent(options);
}

function engineReturns(...xmls) {
  for (const xml of xmls) {
    mockPostToTransactionEngine.mockResolvedValueOnce({ ok: true, status: 200, data: xml, headers: {}, duration: 1 });
  }
}

async function commands(type) {
  const lib = await import("@aws-sdk/lib-dynamodb");
  return mockSend.mock.calls.map(([cmd]) => cmd).filter((cmd) => cmd instanceof lib[type]);
}

describe("hmrcCtReturnGet ingestHandler", () => {
  let storedRecord;

  beforeEach(() => {
    Object.assign(
      process.env,
      setupTestEnv({
        RECEIPTS_DYNAMODB_TABLE_NAME: "test-receipts-table",
        COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME: "test-companies-house-accounts-async-requests-table",
        ENVIRONMENT_NAME: "test",
      }),
    );
    vi.clearAllMocks();
    mockPostToTransactionEngine.mockReset();
    mockEventBridgeSend.mockResolvedValue({});
    storedRecord = pendingRecord();
    mockSend.mockImplementation(async (cmd) => {
      const lib = await import("@aws-sdk/lib-dynamodb");
      if (cmd instanceof lib.QueryCommand) {
        return { Items: [{ bundleId: "resident", subscriptionStatus: "active" }], Count: 1 };
      }
      if (cmd instanceof lib.GetCommand) {
        return storedRecord ? { Item: { requestId: cmd.input.Key.requestId, ...storedRecord } } : {};
      }
      return {};
    });
  });

  test("answers PENDING from the record, sending nothing, inside the poll interval", async () => {
    storedRecord = pendingRecord({ data: { nextPollAt: new Date(Date.now() + 30_000).toISOString() } });
    const response = await hmrcCtReturnGetHandler(buildEvent());
    expect(response.statusCode).toBe(200);
    const body = parseResponseBody(response);
    expect(body.statusCode).toBe("PENDING");
    expect(body.irmark).toBe("ABCDEFGH");
    expect(body.pollIntervalSeconds).toBeGreaterThan(0);
    expect(mockPostToTransactionEngine).not.toHaveBeenCalled();
  });

  test("polls once the interval has passed and moves the next poll time on while HMRC acknowledges", async () => {
    engineReturns(ACKNOWLEDGEMENT);
    const response = await hmrcCtReturnGetHandler(buildEvent({ headers: { "Gov-Test-Scenario": "CT600_REJECT_IRMARK" } }));
    expect(parseResponseBody(response)).toMatchObject({ statusCode: "PENDING", pollIntervalSeconds: 4 });
    const [url, xml, headers] = mockPostToTransactionEngine.mock.calls[0];
    expect(url).toBe(POLL_URL);
    expect(xml).toContain("<Qualifier>poll</Qualifier>");
    expect(xml).toContain(`<CorrelationID>${CORRELATION_ID}</CorrelationID>`);
    expect(xml).toContain("<GatewayTest>1</GatewayTest>");
    expect(headers).toEqual({ "Gov-Test-Scenario": "CT600_REJECT_IRMARK" });
    const [update] = await commands("UpdateCommand");
    expect(update.input.ExpressionAttributeValues[":status"]).toBe("pending");
    expect(Date.parse(update.input.ExpressionAttributeValues[":data"].nextPollAt)).toBeGreaterThan(Date.now());
  });

  test("writes the receipt, completes the request and sends the delete request on HMRC's success response", async () => {
    engineReturns(SUCCESS, DELETE_RESPONSE);
    const response = await hmrcCtReturnGetHandler(buildEvent());
    expect(response.statusCode).toBe(200);
    const body = parseResponseBody(response);
    expect(body).toMatchObject({
      statusCode: "ACCEPT",
      irmark: "ABCDEFGH",
      irmarkReceipt: "RPfWtxHeCZRcwfitnIJmK9xc4OQ=",
      utr: "8596148860",
    });
    expect(body.successMessage).toContain("document ref: 8596148860");
    expect(body.receiptId).toContain(CORRELATION_ID);

    const [receipt] = await commands("PutCommand");
    expect(receipt.input.Item.receipt).toMatchObject({ statusCode: "ACCEPT", irmarkReceipt: "RPfWtxHeCZRcwfitnIJmK9xc4OQ=" });
    const [update] = await commands("UpdateCommand");
    expect(update.input.ExpressionAttributeValues[":status"]).toBe("completed");

    expect(mockPostToTransactionEngine).toHaveBeenCalledTimes(2);
    const deleteXml = mockPostToTransactionEngine.mock.calls[1][1];
    expect(deleteXml).toContain("<Function>delete</Function>");
    expect(deleteXml).toContain(`<CorrelationID>${CORRELATION_ID}</CorrelationID>`);
  });

  test("still accepts the return when the delete request fails", async () => {
    engineReturns(SUCCESS);
    mockPostToTransactionEngine.mockRejectedValueOnce(new Error("delete timed out"));
    const response = await hmrcCtReturnGetHandler(buildEvent());
    expect(parseResponseBody(response).statusCode).toBe("ACCEPT");
  });

  test("records HMRC's error 2021 as a rejection and deletes the response", async () => {
    engineReturns(IRMARK_ERROR, DELETE_RESPONSE);
    const response = await hmrcCtReturnGetHandler(buildEvent());
    expect(response.statusCode).toBe(200);
    const body = parseResponseBody(response);
    expect(body.statusCode).toBe("REJECT");
    expect(body.businessErrors[0]).toMatchObject({ number: "2021", text: "The supplied IRmark is incorrect." });
    const [update] = await commands("UpdateCommand");
    expect(update.input.ExpressionAttributeValues[":status"]).toBe("failed");
    expect(await commands("PutCommand")).toHaveLength(0);
    expect(mockPostToTransactionEngine.mock.calls[1][1]).toContain("<Function>delete</Function>");
  });

  test("returns a finished request without polling", async () => {
    storedRecord = { status: "completed", data: { kind: "company-tax-return", statusCode: "ACCEPT", receiptId: "r-1" } };
    const response = await hmrcCtReturnGetHandler(buildEvent());
    expect(parseResponseBody(response)).toMatchObject({ statusCode: "ACCEPT", receiptId: "r-1" });
    expect(mockPostToTransactionEngine).not.toHaveBeenCalled();
  });

  test("answers 404 without polling when the caller has no request for the correlation id", async () => {
    storedRecord = undefined;
    const response = await hmrcCtReturnGetHandler(buildEvent());
    expect(response.statusCode).toBe(404);
    expect(mockPostToTransactionEngine).not.toHaveBeenCalled();
  });

  test("answers 404 for a request of another kind", async () => {
    storedRecord = { status: "pending", data: { kind: "accounts" } };
    const response = await hmrcCtReturnGetHandler(buildEvent());
    expect(response.statusCode).toBe(404);
  });

  test("answers a JSON 502 when the Transaction Engine cannot be polled", async () => {
    mockPostToTransactionEngine.mockRejectedValueOnce(new Error("socket hang up"));
    const response = await hmrcCtReturnGetHandler(buildEvent());
    expect(response.statusCode).toBe(502);
    expect(parseResponseBody(response).correlationId).toBe(CORRELATION_ID);
  });

  test("answers 400 for a correlation id that is not upper-case hex", async () => {
    const response = await hmrcCtReturnGetHandler(buildEvent({ correlationId: "not-hex" }));
    expect(response.statusCode).toBe(400);
    expect(mockPostToTransactionEngine).not.toHaveBeenCalled();
  });

  test("returns 401 when the Cognito bearer token is missing", async () => {
    const response = await hmrcCtReturnGetHandler(buildEvent({ authorizer: {} }));
    expect(response.statusCode).toBe(401);
  });

  test("returns 403 when the environment does not list the matched activity", async () => {
    process.env.ENVIRONMENT_NAME = "prod";
    const response = await hmrcCtReturnGetHandler(buildEvent());
    expect(response.statusCode).toBe(403);
  });

  describe("a return sent as half of a pair", () => {
    const JOINT_FILING_ID = "7d1c0f0e-5a3b-4c8e-9f21-0a6b3c9d4e11";

    test("writes the jointFilingId into the receipt and the completed request, and charges one token", async () => {
      storedRecord = pendingRecord({ data: { jointFilingId: JOINT_FILING_ID } });
      engineReturns(SUCCESS, DELETE_RESPONSE);
      const response = await hmrcCtReturnGetHandler(buildEvent());
      expect(parseResponseBody(response)).toMatchObject({ statusCode: "ACCEPT", jointFilingId: JOINT_FILING_ID });
      const [receipt] = await commands("PutCommand");
      expect(receipt.input.Item.receipt).toMatchObject({ statusCode: "ACCEPT", jointFilingId: JOINT_FILING_ID });
      const [update] = await commands("UpdateCommand");
      expect(update.input.ExpressionAttributeValues[":data"]).toMatchObject({ jointFilingId: JOINT_FILING_ID });
      expect(mockChargeTokenOnSuccess).toHaveBeenCalledTimes(1);
      expect(mockChargeTokenOnSuccess).toHaveBeenCalledWith(expect.any(String), "file-company-tax-return");
    });

    test("keeps the jointFilingId on a rejection and charges nothing", async () => {
      storedRecord = pendingRecord({ data: { jointFilingId: JOINT_FILING_ID } });
      engineReturns(IRMARK_ERROR, DELETE_RESPONSE);
      const response = await hmrcCtReturnGetHandler(buildEvent());
      expect(parseResponseBody(response)).toMatchObject({ statusCode: "REJECT", jointFilingId: JOINT_FILING_ID });
      expect(mockChargeTokenOnSuccess).not.toHaveBeenCalled();
    });

    test("writes the amended mark into the receipt and the result of an amended return", async () => {
      storedRecord = pendingRecord({ data: { jointFilingId: JOINT_FILING_ID, amended: true } });
      engineReturns(SUCCESS, DELETE_RESPONSE);
      const response = await hmrcCtReturnGetHandler(buildEvent());
      expect(parseResponseBody(response)).toMatchObject({ statusCode: "ACCEPT", jointFilingId: JOINT_FILING_ID, amended: true });
      const [receipt] = await commands("PutCommand");
      expect(receipt.input.Item.receipt).toMatchObject({ jointFilingId: JOINT_FILING_ID, amended: true });
    });

    test("an original return writes no amended mark", async () => {
      storedRecord = pendingRecord({ data: { jointFilingId: JOINT_FILING_ID } });
      engineReturns(SUCCESS, DELETE_RESPONSE);
      await hmrcCtReturnGetHandler(buildEvent());
      const [receipt] = await commands("PutCommand");
      expect(receipt.input.Item.receipt).not.toHaveProperty("amended");
    });

    test("a return sent alone writes no jointFilingId and charges nothing", async () => {
      engineReturns(SUCCESS, DELETE_RESPONSE);
      await hmrcCtReturnGetHandler(buildEvent());
      const [receipt] = await commands("PutCommand");
      expect(receipt.input.Item.receipt).not.toHaveProperty("jointFilingId");
      expect(mockChargeTokenOnSuccess).not.toHaveBeenCalled();
    });
  });

  test("returns 200 with an empty object for a HEAD request", async () => {
    const response = await hmrcCtReturnGetHandler(buildEvent({ method: "HEAD" }));
    expect(response.statusCode).toBe(200);
    expect(parseResponseBody(response)).toEqual({});
  });
});
