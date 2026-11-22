// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/companiesHouseChangeOfNamePost.test.js
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

const mockBuildFormSubmission = vi.fn();
const mockAllocateSubmissionNumber = vi.fn();
const mockResolvePresenterCredentials = vi.fn();
const mockPostToGateway = vi.fn();
const mockParseGatewayResponse = vi.fn();
vi.mock("@app/services/companiesHouseXmlGateway.js", async (importOriginal) => ({
  gatewayRequestNotDelivered: (await importOriginal()).gatewayRequestNotDelivered,
  buildFormSubmission: (...args) => mockBuildFormSubmission(...args),
  allocateSubmissionNumber: (...args) => mockAllocateSubmissionNumber(...args),
  postToGateway: (...args) => mockPostToGateway(...args),
  parseGatewayResponse: (...args) => mockParseGatewayResponse(...args),
  resolvePresenterCredentials: (...args) => mockResolvePresenterCredentials(...args),
}));

import { ingestHandler } from "@app/functions/companies-house/companiesHouseChangeOfNamePost.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const PDF_BASE64 = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n").toString("base64");

function buildNameBody(overrides = {}) {
  return {
    companyNumber: "00000001",
    companyName: "SIMULATOR EXAMPLE COMPANY LIMITED",
    companyAuthCode: "SIMCS01",
    dateSigned: "2026-11-22",
    method: "resolution",
    proposedName: "Bramwell Tennant Trading Limited",
    meetingDate: "2026-11-20",
    sameDay: false,
    noticeGiven: true,
    ...overrides,
  };
}

function buildEvent({ body = buildNameBody(), headers = {}, authorizer, method = "POST" } = {}) {
  const options = {
    method,
    path: "/api/v1/companies-house/change-of-name",
    body,
    headers: { Authorization: "Bearer test-cognito-token", ...headers },
  };
  if (authorizer !== undefined) options.authorizer = authorizer;
  return buildLambdaEvent(options);
}

describe("companiesHouseChangeOfNamePost ingestHandler", () => {
  beforeEach(() => {
    Object.assign(
      process.env,
      setupTestEnv({
        COMPANIES_HOUSE_XMLGW_URI: "https://xmlgw.companieshouse.gov.uk/v1-0/xmlgw/Gateway",
        COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME: "test-companies-house-accounts-async-requests-table",
        COMPANIES_HOUSE_PACKAGE_REFERENCE: "0012",
        COMPANIES_HOUSE_GATEWAY_TEST: "true",
        ENVIRONMENT_NAME: "test",
      }),
    );
    vi.clearAllMocks();
    mockEventBridgeSend.mockResolvedValue({});
    mockSend.mockImplementation(async (cmd) => {
      const lib = await import("@aws-sdk/lib-dynamodb");
      if (cmd instanceof lib.QueryCommand) {
        return { Items: [{ bundleId: "resident-pro", subscriptionStatus: "active" }], Count: 1 };
      }
      return {};
    });
    mockAllocateSubmissionNumber.mockResolvedValue("00001A");
    mockResolvePresenterCredentials.mockResolvedValue({ presenterId: "presenter-id", presenterCode: "presenter-code" });
    mockBuildFormSubmission.mockReturnValue("<GovTalkMessage>submission</GovTalkMessage>");
    mockPostToGateway.mockResolvedValue({ ok: true, status: 200, data: "<GovTalkMessage>ack</GovTalkMessage>", headers: {}, duration: 1 });
    mockParseGatewayResponse.mockReturnValue({ errors: [], statuses: [], gatewayTimestamp: "2026-11-22T10:00:00Z", pollInterval: 1 });
  });

  const submission = () => mockBuildFormSubmission.mock.calls[0][0];

  test("a change by resolution is sent in a ChangeOfName envelope with the name in upper case and no document", async () => {
    const response = await ingestHandler(buildEvent());

    expect(response.statusCode).toBe(201);
    expect(parseResponseBody(response)).toMatchObject({ submissionNumber: "00001A", pollInterval: 1 });
    expect(submission()).toMatchObject({
      formIdentifier: "ChangeOfName",
      companyNumber: "00000001",
      companyAuthenticationCode: "SIMCS01",
      submissionNumber: "00001A",
      dateSigned: "2026-11-22",
    });
    expect(submission().document).toBeUndefined();
    expect(submission().formXml).toContain(
      "<MethodOfChange>RESOLUTION</MethodOfChange><ProposedCompanyName>BRAMWELL TENNANT TRADING LIMITED</ProposedCompanyName>" +
        "<MeetingDate>2026-11-20</MeetingDate><SameDay>false</SameDay><NoticeGiven>true</NoticeGiven>",
    );
  });

  test("the same-day service is sent as asked", async () => {
    await ingestHandler(buildEvent({ body: buildNameBody({ sameDay: true }) }));
    expect(submission().formXml).toContain("<SameDay>true</SameDay>");
  });

  test("a change by the articles is refused, as the online service files a change by special resolution only", async () => {
    const response = await ingestHandler(buildEvent({ body: buildNameBody({ method: "articles", meetingDate: undefined }) }));
    expect(response.statusCode).toBe(400);
    expect(parseResponseBody(response).message).toContain("Invalid method - must be one of resolution");
    expect(mockPostToGateway).not.toHaveBeenCalled();
  });

  test("a name with a sensitive word is sent with its permission letter as the envelope's document", async () => {
    const response = await ingestHandler(
      buildEvent({
        body: buildNameBody({
          proposedName: "BRAMWELL ACCREDITED TRAINING LIMITED",
          supportingDocument: { kind: "sensitive-word-permission", contentBase64: PDF_BASE64 },
        }),
      }),
    );

    expect(response.statusCode).toBe(201);
    expect(submission().document).toEqual({
      data: PDF_BASE64,
      date: "2026-11-22",
      filename: "name-permission.pdf",
      contentType: "application/pdf",
      category: "SUPPNAMEAUTH",
    });
  });

  test("the letter is kept out of the filing state and the events", async () => {
    await ingestHandler(
      buildEvent({ body: buildNameBody({ supportingDocument: { kind: "same-as-no-objection", contentBase64: PDF_BASE64 } }) }),
    );
    const lib = await import("@aws-sdk/lib-dynamodb");
    const writes = mockSend.mock.calls
      .map(([cmd]) => cmd)
      .filter((cmd) => cmd instanceof lib.UpdateCommand || cmd instanceof lib.PutCommand);
    const stored = JSON.stringify(writes.map((cmd) => cmd.input));
    expect(stored).toContain('"kind":"change-of-name"');
    expect(stored).not.toContain(PDF_BASE64);
    expect(JSON.stringify(mockEventBridgeSend.mock.calls)).not.toContain(PDF_BASE64);
  });

  test("names a refused proposed name by the page's message id", async () => {
    const response = await ingestHandler(buildEvent({ body: buildNameBody({ proposedName: "BRAMWELL 🚀 LIMITED" }) }));

    expect(response.statusCode).toBe(400);
    expect(parseResponseBody(response).messageIds).toEqual(["ch.name.name-characters"]);
    expect(mockPostToGateway).not.toHaveBeenCalled();
  });

  test("answers 400 in JSON, sending nothing, for each field that is wrong", async () => {
    for (const [overrides, message] of [
      [{ method: "llp" }, "Invalid method"],
      [{ proposedName: "AB" }, "Invalid proposedName - must be 3 to 160 characters"],
      [{ proposedName: "BRAMWELL\tTENNANT LTD" }, "Invalid proposedName - must be 3 to 160 characters"],
      [{ proposedName: "BRAMWELL_TENNANT LTD" }, "Invalid proposedName - must be 3 to 160 characters"],
      [{ proposedName: "simulator example company limited" }, "must differ from the company's present name"],
      [{ meetingDate: undefined }, "Missing meetingDate"],
      [{ meetingDate: "20/11/2026" }, "Invalid meetingDate - must be YYYY-MM-DD"],
      [{ meetingDate: "2026-11-23" }, "must not be after dateSigned"],
      [{ sameDay: "yes" }, "Invalid sameDay"],
      [{ noticeGiven: false }, "Missing noticeGiven"],
      [{ supportingDocument: { kind: "resolution", contentBase64: PDF_BASE64 } }, "Invalid supportingDocument.kind"],
      [{ supportingDocument: { kind: "sensitive-word-permission", contentBase64: "not base64!" } }, "must be the PDF as base64"],
      [
        { supportingDocument: { kind: "sensitive-word-permission", contentBase64: Buffer.from("GIF89a....").toString("base64") } },
        "must be a PDF",
      ],
      [
        {
          supportingDocument: {
            kind: "sensitive-word-permission",
            contentBase64: Buffer.concat([Buffer.from("%PDF-"), Buffer.alloc(3_000_000)]).toString("base64"),
          },
        },
        "at most 3000000 bytes",
      ],
      [{ companyAuthCode: "AB" }, "Invalid companyAuthCode"],
    ]) {
      const response = await ingestHandler(buildEvent({ body: buildNameBody(overrides) }));
      expect(response.statusCode, message).toBe(400);
      expect(response.headers["Content-Type"]).toBe("application/json");
      expect(JSON.stringify(parseResponseBody(response))).toContain(message);
    }
    expect(mockPostToGateway).not.toHaveBeenCalled();
  });

  describe("the fee", () => {
    test("on a live gateway under our presenter the filing is refused with 402 and nothing is sent or recorded", async () => {
      delete process.env.COMPANIES_HOUSE_GATEWAY_TEST;
      const response = await ingestHandler(buildEvent());

      expect(response.statusCode).toBe(402);
      expect(response.headers["Content-Type"]).toBe("application/json");
      expect(parseResponseBody(response)).toMatchObject({ code: "fee-path-not-wired", fee: { standard: 20, sameDay: 85 } });
      expect(mockAllocateSubmissionNumber).not.toHaveBeenCalled();
      expect(mockPostToGateway).not.toHaveBeenCalled();
    });

    test("on a live gateway no request field or header turns the refusal into a test submission", async () => {
      delete process.env.COMPANIES_HOUSE_GATEWAY_TEST;
      for (const [overrides, headers] of [
        [{ gatewayTest: true, GatewayTest: "1", testFlag: "1", COMPANIES_HOUSE_GATEWAY_TEST: "true" }, {}],
        [{ sameDay: false }, { "Gov-Test-Scenario": "ACCEPT" }],
        [{ ownPresenter: null }, { "X-Presenter-Id": "66666666000", "X-Presenter-Code": "OWNCODE1" }],
      ]) {
        const response = await ingestHandler(buildEvent({ body: buildNameBody(overrides), headers }));
        expect(response.statusCode).toBe(402);
        expect(response.headers["Content-Type"]).toBe("application/json");
      }
      expect(mockAllocateSubmissionNumber).not.toHaveBeenCalled();
      expect(mockPostToGateway).not.toHaveBeenCalled();
    });

    test("on a live gateway under the filer's own presenter, whose credit account pays the fee, the filing is sent", async () => {
      delete process.env.COMPANIES_HOUSE_GATEWAY_TEST;
      const response = await ingestHandler(buildEvent({ body: buildNameBody({ ownPresenter: { id: "66666666000", code: "OWNCODE1" } }) }));

      expect(response.statusCode).toBe(201);
      expect(submission()).toMatchObject({ presenterId: "66666666000", presenterCode: "OWNCODE1" });
    });
  });

  test("answers 500 in JSON and marks the filing failed when the gateway rejects the envelope", async () => {
    mockParseGatewayResponse.mockReturnValue({ errors: [{ number: "604", text: "Invalid Request" }], statuses: [] });
    const response = await ingestHandler(buildEvent());
    expect(response.statusCode).toBe(500);
    expect(parseResponseBody(response).message).toBe("Companies House rejected the change of company name submission envelope");
  });

  test("returns 401 when the Cognito bearer token is missing", async () => {
    const response = await ingestHandler(buildEvent({ authorizer: {} }));
    expect(response.statusCode).toBe(401);
    expect(mockPostToGateway).not.toHaveBeenCalled();
  });

  test("refuses the form on prod, where it is not listed, and sends nothing", async () => {
    process.env.ENVIRONMENT_NAME = "prod";
    delete process.env.COMPANIES_HOUSE_GATEWAY_TEST;
    const response = await ingestHandler(buildEvent());
    expect(response.statusCode).toBe(403);
    expect(parseResponseBody(response)).toMatchObject({ code: "ACTIVITY_ENVIRONMENT_RESTRICTED", activityId: "change-company-name" });
    expect(mockPostToGateway).not.toHaveBeenCalled();
  });
});
