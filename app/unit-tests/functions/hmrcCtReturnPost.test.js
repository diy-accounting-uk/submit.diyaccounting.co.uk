// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/hmrcCtReturnPost.test.js
import { describe, test, beforeAll, beforeEach, afterEach, expect, vi } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { buildLambdaEvent } from "@app/test-helpers/eventBuilders.js";
import { setupTestEnv, parseResponseBody } from "@app/test-helpers/mockHelpers.js";
import { buildCtReturnBodyFromBook } from "@app/test-helpers/ctReturnFixture.js";
import { extractAndValidateCtReturnParameters, buildCtReturnDocuments } from "@app/services/hmrcCtReturnRequest.js";
import { TRANSACTION_ENGINE_TEST_SUBMISSION_URL } from "@app/services/hmrcTransactionEngine.js";

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

const mockLogs = [];
vi.mock("@app/lib/logger.js", async (importOriginal) => {
  const actual = await importOriginal();
  const record = (obj) => mockLogs.push(JSON.stringify(obj));
  return {
    ...actual,
    createLogger: () => ({ info: record, warn: record, error: record, debug: record, trace: record, fatal: record }),
  };
});

import { ingestHandler as hmrcCtReturnPostHandler } from "@app/functions/hmrc/hmrcCtReturnPost.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const PASSWORD = "gateway-password-9";
const USER_ID = "gateway-user-9";
const CORRELATION_ID = "46DCD4CC7E194088B99857931C185829";

function acknowledgementXml(endPoint = "https://test-transaction-engine.tax.service.gov.uk/poll") {
  return `<?xml version="1.0"?><GovTalkMessage xmlns="http://www.govtalk.gov.uk/CM/envelope"><EnvelopeVersion>2.0</EnvelopeVersion><Header><MessageDetails><Class>HMRC-CT-CT600</Class><Qualifier>acknowledgement</Qualifier><Function>submit</Function><CorrelationID>${CORRELATION_ID}</CorrelationID><ResponseEndPoint PollInterval="7">${endPoint}</ResponseEndPoint><Transformation>XML</Transformation></MessageDetails><SenderDetails/></Header><GovTalkDetails><Keys/></GovTalkDetails><Body/></GovTalkMessage>`;
}

const GATEWAY_ERROR_XML = `<?xml version="1.0"?><GovTalkMessage xmlns="http://www.govtalk.gov.uk/CM/envelope"><EnvelopeVersion>2.0</EnvelopeVersion><Header><MessageDetails><Class>HMRC-CT-CT600</Class><Qualifier>error</Qualifier><Function>submit</Function><CorrelationID></CorrelationID><Transformation>XML</Transformation></MessageDetails><SenderDetails/></Header><GovTalkDetails><Keys/><GovTalkErrors><Error><RaisedBy>Gateway</RaisedBy><Number>1046</Number><Type>fatal</Type><Text>Authentication Failure</Text><Location></Location></Error></GovTalkErrors></GovTalkDetails><Body/></GovTalkMessage>`;

let baseBody;

function buildEvent({
  body = { ...baseBody, gatewayUserId: USER_ID, gatewayPassword: PASSWORD },
  headers = {},
  authorizer,
  method = "POST",
} = {}) {
  const options = {
    method,
    path: "/api/v1/hmrc/ct/return",
    body,
    headers: { Authorization: "Bearer test-cognito-token", ...headers },
  };
  if (authorizer !== undefined) options.authorizer = authorizer;
  return buildLambdaEvent(options);
}

describe("hmrcCtReturnPost ingestHandler", () => {
  beforeAll(async () => {
    const body = await buildCtReturnBodyFromBook();
    const request = extractAndValidateCtReturnParameters({ body: JSON.stringify(body) }, [], {
      requireGatewayCredentials: false,
      requireReviewedBoxes: false,
    });
    baseBody = { ...body, reviewedBoxes: buildCtReturnDocuments(request).boxes };
  });

  beforeEach(() => {
    Object.assign(
      process.env,
      setupTestEnv({
        ENVIRONMENT_NAME: "test",
        COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME: "test-companies-house-accounts-async-requests-table",
        HMRC_CT_VENDOR_ID: "1000",
        HMRC_CT_GATEWAY_TEST: "true",
      }),
    );
    delete process.env.HMRC_TRANSACTION_ENGINE_URL;
    vi.clearAllMocks();
    mockLogs.length = 0;
    mockEventBridgeSend.mockResolvedValue({});
    mockSend.mockImplementation(async (cmd) => {
      const lib = await import("@aws-sdk/lib-dynamodb");
      if (cmd instanceof lib.QueryCommand) {
        return { Items: [{ bundleId: "resident", subscriptionStatus: "active" }], Count: 1 };
      }
      return {};
    });
    mockPostToTransactionEngine.mockResolvedValue({ ok: true, status: 200, data: acknowledgementXml(), headers: {}, duration: 1 });
  });

  afterEach(() => {
    delete process.env.HMRC_TRANSACTION_ENGINE_URL;
  });

  test("posts the signed CT600 to the External Test Service and records a pending request", async () => {
    const response = await hmrcCtReturnPostHandler(buildEvent());
    expect(response.statusCode).toBe(201);
    const body = parseResponseBody(response);
    expect(body.correlationId).toBe(CORRELATION_ID);
    expect(body.irmark).toMatch(/^[A-Z2-7]{32}$/);
    expect(body.pollIntervalSeconds).toBe(7);

    const [url, xml] = mockPostToTransactionEngine.mock.calls[0];
    expect(url).toBe(TRANSACTION_ENGINE_TEST_SUBMISSION_URL);
    expect(xml).toContain(`<SenderID>${USER_ID}</SenderID>`);
    expect(xml).toContain(`<Value>${PASSWORD}</Value>`);
    expect(xml).toContain("<GatewayTest>1</GatewayTest>");
    expect(xml).toMatch(/<IRmark Type="generic">[A-Za-z0-9+/]{27}=<\/IRmark>/);

    const lib = await import("@aws-sdk/lib-dynamodb");
    const update = mockSend.mock.calls.map(([cmd]) => cmd).find((cmd) => cmd instanceof lib.UpdateCommand);
    expect(update.input.Key.requestId).toBe(CORRELATION_ID);
    expect(update.input.ExpressionAttributeValues[":status"]).toBe("pending");
    expect(update.input.ExpressionAttributeValues[":data"]).toMatchObject({
      kind: "company-tax-return",
      pollUrl: "https://test-transaction-engine.tax.service.gov.uk/poll",
      irmark: body.irmark,
      utr: baseBody.utr,
      gatewayTest: true,
    });
    expect(JSON.stringify(update.input)).not.toContain(PASSWORD);
    expect(JSON.stringify(update.input)).not.toContain(USER_ID);
  });

  test("resolves a relative poll end point against the submission URL and forwards Gov-Test-Scenario", async () => {
    process.env.HMRC_TRANSACTION_ENGINE_URL = "http://localhost:9000/hmrc-transaction-engine/submission";
    mockPostToTransactionEngine.mockResolvedValue({
      ok: true,
      status: 200,
      data: acknowledgementXml("/hmrc-transaction-engine/poll"),
      headers: {},
      duration: 1,
    });
    const response = await hmrcCtReturnPostHandler(buildEvent({ headers: { "Gov-Test-Scenario": "CT600_REJECT_IRMARK" } }));
    expect(response.statusCode).toBe(201);
    expect(mockPostToTransactionEngine.mock.calls[0][0]).toBe("http://localhost:9000/hmrc-transaction-engine/submission");
    expect(mockPostToTransactionEngine.mock.calls[0][2]).toEqual({ "Gov-Test-Scenario": "CT600_REJECT_IRMARK" });

    const lib = await import("@aws-sdk/lib-dynamodb");
    const update = mockSend.mock.calls.map(([cmd]) => cmd).find((cmd) => cmd instanceof lib.UpdateCommand);
    expect(update.input.ExpressionAttributeValues[":data"].pollUrl).toBe("http://localhost:9000/hmrc-transaction-engine/poll");
  });

  test("answers 409 naming the boxes that differ from the reviewed boxes, and calls nothing", async () => {
    const reviewedBoxes = { ...baseBody.reviewedBoxes, 155: baseBody.reviewedBoxes[155] + 1 };
    const response = await hmrcCtReturnPostHandler(
      buildEvent({ body: { ...baseBody, reviewedBoxes, gatewayUserId: USER_ID, gatewayPassword: PASSWORD } }),
    );
    expect(response.statusCode).toBe(409);
    const body = parseResponseBody(response);
    expect(body.differingBoxes).toEqual(["155"]);
    expect(body.message).toContain("box 155");
    expect(mockPostToTransactionEngine).not.toHaveBeenCalled();
    expect(JSON.stringify(body)).not.toContain(PASSWORD);
  });

  test("answers 409 when a reviewed box is missing", async () => {
    const { 155: _dropped, ...reviewedBoxes } = baseBody.reviewedBoxes;
    const response = await hmrcCtReturnPostHandler(
      buildEvent({ body: { ...baseBody, reviewedBoxes, gatewayUserId: USER_ID, gatewayPassword: PASSWORD } }),
    );
    expect(response.statusCode).toBe(409);
    expect(parseResponseBody(response).differingBoxes).toContain("155");
  });

  test("answers 400 when reviewedBoxes is absent", async () => {
    const { reviewedBoxes: _removed, ...withoutReviewed } = baseBody;
    const response = await hmrcCtReturnPostHandler(
      buildEvent({ body: { ...withoutReviewed, gatewayUserId: USER_ID, gatewayPassword: PASSWORD } }),
    );
    expect(response.statusCode).toBe(400);
    expect(JSON.stringify(parseResponseBody(response))).toMatch(/reviewedBoxes/);
    expect(mockPostToTransactionEngine).not.toHaveBeenCalled();
  });

  test("never logs the Government Gateway user ID or password", async () => {
    await hmrcCtReturnPostHandler(buildEvent());
    const logged = mockLogs.join("\n");
    expect(logged).toContain("HMRC Transaction Engine CT600 submission request");
    expect(logged).not.toContain(PASSWORD);
    expect(logged).not.toContain(USER_ID);
    expect(logged).toContain("***");
  });

  test("answers 502 with HMRC's errors when the Transaction Engine does not acknowledge", async () => {
    mockPostToTransactionEngine.mockResolvedValue({ ok: true, status: 200, data: GATEWAY_ERROR_XML, headers: {}, duration: 1 });
    const response = await hmrcCtReturnPostHandler(buildEvent());
    expect(response.statusCode).toBe(502);
    expect(parseResponseBody(response).errors[0]).toMatchObject({ number: "1046", text: "Authentication Failure" });
    const lib = await import("@aws-sdk/lib-dynamodb");
    expect(mockSend.mock.calls.some(([cmd]) => cmd instanceof lib.UpdateCommand)).toBe(false);
  });

  test("answers a JSON 500 when the post throws", async () => {
    mockPostToTransactionEngine.mockRejectedValue(new Error("socket hang up"));
    const response = await hmrcCtReturnPostHandler(buildEvent());
    expect(response.statusCode).toBe(500);
    expect(parseResponseBody(response).message).toBe("Internal server error");
    expect(JSON.stringify(parseResponseBody(response))).not.toContain(PASSWORD);
  });

  test.each([
    ["no user ID", { gatewayUserId: "" }, /gatewayUserId/],
    ["no password", { gatewayPassword: undefined }, /gatewayPassword/],
    ["a director's loan account overdrawn", { directorsLoanOverdrawn: true }, /CT600A/],
    ["an unaccepted declaration", { declarationAccepted: false }, /declaration/],
  ])("answers 400 without calling HMRC for %s", async (_label, overrides, message) => {
    const response = await hmrcCtReturnPostHandler(
      buildEvent({ body: { ...baseBody, gatewayUserId: USER_ID, gatewayPassword: PASSWORD, ...overrides } }),
    );
    expect(response.statusCode).toBe(400);
    expect(JSON.stringify(parseResponseBody(response))).toMatch(message);
    expect(mockPostToTransactionEngine).not.toHaveBeenCalled();
  });

  test("returns 401 when the Cognito bearer token is missing", async () => {
    const response = await hmrcCtReturnPostHandler(buildEvent({ authorizer: {} }));
    expect(response.statusCode).toBe(401);
    expect(mockPostToTransactionEngine).not.toHaveBeenCalled();
  });

  test("returns 403 when the environment does not list the matched activity", async () => {
    process.env.ENVIRONMENT_NAME = "prod";
    const response = await hmrcCtReturnPostHandler(buildEvent());
    expect(response.statusCode).toBe(403);
    expect(mockPostToTransactionEngine).not.toHaveBeenCalled();
  });

  test("returns 200 with an empty object for a HEAD request", async () => {
    const response = await hmrcCtReturnPostHandler(buildEvent({ method: "HEAD" }));
    expect(response.statusCode).toBe(200);
    expect(parseResponseBody(response)).toEqual({});
  });
});
