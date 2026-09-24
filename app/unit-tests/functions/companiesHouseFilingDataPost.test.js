// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/companiesHouseFilingDataPost.test.js
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

const mockBuildCompanyDataRequest = vi.fn();
const mockBuildPaymentPeriodsRequest = vi.fn();
const mockResolvePresenterCredentials = vi.fn();
const mockPostToGateway = vi.fn();
const mockParseGatewayResponse = vi.fn();
const mockParseCompanyDataResponse = vi.fn();
const mockParsePaymentPeriodsResponse = vi.fn();
vi.mock("@app/services/companiesHouseXmlGateway.js", () => ({
  buildCompanyDataRequest: (...args) => mockBuildCompanyDataRequest(...args),
  buildPaymentPeriodsRequest: (...args) => mockBuildPaymentPeriodsRequest(...args),
  resolvePresenterCredentials: (...args) => mockResolvePresenterCredentials(...args),
  postToGateway: (...args) => mockPostToGateway(...args),
  parseGatewayResponse: (...args) => mockParseGatewayResponse(...args),
  parseCompanyDataResponse: (...args) => mockParseCompanyDataResponse(...args),
  parsePaymentPeriodsResponse: (...args) => mockParsePaymentPeriodsResponse(...args),
}));

import { ingestHandler as companiesHouseFilingDataPostHandler } from "@app/functions/companies-house/companiesHouseFilingDataPost.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

function buildBody(overrides = {}) {
  return { companyAuthCode: "SIMCS01", madeUpDate: "2025-09-21", ...overrides };
}

function buildEvent({ companyNumber = "06846849", body = buildBody(), headers = {}, authorizer, method = "POST" } = {}) {
  const options = {
    method,
    path: `/api/v1/companies-house/company/${companyNumber}/filing-data`,
    pathParameters: { companyNumber },
    body,
    headers: { Authorization: "Bearer test-cognito-token", ...headers },
  };
  if (authorizer !== undefined) options.authorizer = authorizer;
  return buildLambdaEvent(options);
}

describe("companiesHouseFilingDataPost ingestHandler", () => {
  beforeEach(() => {
    Object.assign(
      process.env,
      setupTestEnv({
        COMPANIES_HOUSE_XMLGW_URI: "https://xmlgw.companieshouse.gov.uk/v1-0/xmlgw/Gateway",
        ENVIRONMENT_NAME: "test",
      }),
    );
    vi.clearAllMocks();
    mockEventBridgeSend.mockResolvedValue({});
    mockSend.mockImplementation(async (cmd) => {
      const lib = await import("@aws-sdk/lib-dynamodb");
      if (cmd instanceof lib.QueryCommand) {
        return { Items: [], Count: 0 };
      }
      return {};
    });
    mockResolvePresenterCredentials.mockResolvedValue({ presenterId: "presenter-id", presenterCode: "presenter-code" });
    mockBuildCompanyDataRequest.mockReturnValue("<GovTalkMessage>CompanyDataRequest</GovTalkMessage>");
    mockBuildPaymentPeriodsRequest.mockReturnValue("<GovTalkMessage>PaymentPeriodsRequest</GovTalkMessage>");
    mockPostToGateway.mockResolvedValue({
      ok: true,
      status: 200,
      data: "<GovTalkMessage>response</GovTalkMessage>",
      headers: {},
      duration: 1,
    });
    mockParseGatewayResponse.mockReturnValue({ errors: [] });
    mockParseCompanyDataResponse.mockReturnValue({
      companyNumber: "06846849",
      companyName: "EXAMPLE CONFIRMATION STATEMENT LIMITED",
      madeUpDate: "2025-09-21",
      nextDueDate: "2026-10-05",
      sicCodes: ["69201"],
      officers: [{ role: "director", type: "person", forename: "ALICE", surname: "EXAMPLE", dob: "1970-01-01" }],
    });
    mockParsePaymentPeriodsResponse.mockReturnValue({ periods: [{ startDate: "2025-09-22", endDate: "2026-09-21", periodPaid: false }] });
  });

  test("reads CompanyDataRequest and PaymentPeriodsRequest and returns the combined filing data", async () => {
    const response = await companiesHouseFilingDataPostHandler(buildEvent());
    expect(response.statusCode).toBe(200);
    const body = parseResponseBody(response);
    expect(body.companyNumber).toBe("06846849");
    expect(body.officers).toHaveLength(1);
    expect(body.paymentPeriods).toEqual([{ startDate: "2025-09-22", endDate: "2026-09-21", periodPaid: false }]);
    expect(body.paymentPeriodPaid).toBe(false);

    expect(mockBuildCompanyDataRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        presenterId: "presenter-id",
        presenterCode: "presenter-code",
        companyNumber: "06846849",
        companyAuthenticationCode: "SIMCS01",
        madeUpDate: "2025-09-21",
      }),
    );
    expect(mockBuildPaymentPeriodsRequest).toHaveBeenCalledWith(
      expect.objectContaining({ companyNumber: "06846849", companyAuthenticationCode: "SIMCS01" }),
    );
  });

  test("forwards a Gov-Test-Scenario header to both gateway calls", async () => {
    await companiesHouseFilingDataPostHandler(buildEvent({ headers: { "Gov-Test-Scenario": "CS_PERIOD_PAID" } }));
    expect(mockPostToGateway).toHaveBeenCalledWith("<GovTalkMessage>CompanyDataRequest</GovTalkMessage>", {
      "Gov-Test-Scenario": "CS_PERIOD_PAID",
    });
    expect(mockPostToGateway).toHaveBeenCalledWith("<GovTalkMessage>PaymentPeriodsRequest</GovTalkMessage>", {
      "Gov-Test-Scenario": "CS_PERIOD_PAID",
    });
  });

  test("rejects a company authentication code that is too short", async () => {
    const response = await companiesHouseFilingDataPostHandler(buildEvent({ body: buildBody({ companyAuthCode: "AB" }) }));
    expect(response.statusCode).toBe(400);
    expect(mockPostToGateway).not.toHaveBeenCalled();
  });

  test("rejects a missing madeUpDate", async () => {
    const response = await companiesHouseFilingDataPostHandler(buildEvent({ body: buildBody({ madeUpDate: undefined }) }));
    expect(response.statusCode).toBe(400);
    expect(mockPostToGateway).not.toHaveBeenCalled();
  });

  test("returns 500 when the gateway rejects the CompanyDataRequest", async () => {
    mockParseGatewayResponse.mockReturnValueOnce({
      errors: [{ raisedBy: "Gateway", number: 604, type: "fatal", text: "Invalid Request" }],
    });
    const response = await companiesHouseFilingDataPostHandler(buildEvent());
    expect(response.statusCode).toBe(500);
    expect(mockBuildPaymentPeriodsRequest).not.toHaveBeenCalled();
  });

  test("returns 401 when the Cognito bearer token is missing", async () => {
    const response = await companiesHouseFilingDataPostHandler(buildEvent({ authorizer: {} }));
    expect(response.statusCode).toBe(401);
    expect(mockPostToGateway).not.toHaveBeenCalled();
  });

  test("returns 200 with an empty object for a HEAD request", async () => {
    const response = await companiesHouseFilingDataPostHandler(buildEvent({ method: "HEAD" }));
    expect(response.statusCode).toBe(200);
    expect(parseResponseBody(response)).toEqual({});
  });
});
