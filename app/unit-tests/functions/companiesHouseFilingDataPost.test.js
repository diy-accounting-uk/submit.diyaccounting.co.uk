// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/companiesHouseFilingDataPost.test.js
import { describe, test, beforeEach, afterEach, expect, vi } from "vitest";
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

function buildEvent({ companyNumber = "00000004", body = buildBody(), headers = {}, authorizer, method = "POST" } = {}) {
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
        return { Items: [{ bundleId: "resident-pro", subscriptionStatus: "active" }], Count: 1 };
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
      companyNumber: "00000004",
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
    expect(body.companyNumber).toBe("00000004");
    expect(body.officers).toHaveLength(1);
    expect(body.paymentPeriods).toEqual([{ startDate: "2025-09-22", endDate: "2026-09-21", periodPaid: false }]);
    expect(body.paymentPeriodPaid).toBe(false);

    expect(mockBuildCompanyDataRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        presenterId: "presenter-id",
        presenterCode: "presenter-code",
        companyNumber: "00000004",
        companyAuthenticationCode: "SIMCS01",
        madeUpDate: "2025-09-21",
      }),
    );
    expect(mockBuildPaymentPeriodsRequest).toHaveBeenCalledWith(
      expect.objectContaining({ companyNumber: "00000004", companyAuthenticationCode: "SIMCS01" }),
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

  test("reads both gateway requests under the customer's own presenter and never resolves ours", async () => {
    const response = await companiesHouseFilingDataPostHandler(
      buildEvent({ body: buildBody({ ownPresenter: { id: "OWN-PRES-7731", code: "OwnSecretCode#42" } }) }),
    );
    expect(response.statusCode).toBe(200);
    expect(mockResolvePresenterCredentials).not.toHaveBeenCalled();
    const own = { presenterId: "OWN-PRES-7731", presenterCode: "OwnSecretCode#42" };
    expect(mockBuildCompanyDataRequest).toHaveBeenCalledWith(expect.objectContaining(own));
    expect(mockBuildPaymentPeriodsRequest).toHaveBeenCalledWith(expect.objectContaining(own));
  });

  test("rejects an own presenter with a blank authentication code", async () => {
    const response = await companiesHouseFilingDataPostHandler(
      buildEvent({ body: buildBody({ ownPresenter: { id: "OWN-PRES-7731", code: "  " } }) }),
    );
    expect(response.statusCode).toBe(400);
    expect(mockPostToGateway).not.toHaveBeenCalled();
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

  test("returns 400 with a message the customer can act on when the gateway says the authentication code is invalid", async () => {
    mockParseGatewayResponse.mockReturnValueOnce({
      errors: [{ raisedBy: "CompanyDataRequest", number: 9999, type: "fatal", text: "Invalid CompanyAuthenticationCode", location: "" }],
    });
    const response = await companiesHouseFilingDataPostHandler(buildEvent());
    expect(response.statusCode).toBe(400);
    const body = parseResponseBody(response);
    expect(body.message).toMatch(/authentication code/i);
    expect(body.reason).toBe("invalid-company-authentication-code");
    expect(mockBuildPaymentPeriodsRequest).not.toHaveBeenCalled();
  });

  test("returns 500 for another gateway error that shares number 9999", async () => {
    mockParseGatewayResponse.mockReturnValueOnce({
      errors: [{ raisedBy: "Gateway", number: 9999, type: "fatal", text: "No presenter ID supplied" }],
    });
    const response = await companiesHouseFilingDataPostHandler(buildEvent());
    expect(response.statusCode).toBe(500);
  });

  test("returns 400 when the PaymentPeriodsRequest reports the authentication code as invalid", async () => {
    mockParseGatewayResponse.mockReturnValueOnce({ errors: [] }).mockReturnValueOnce({
      errors: [{ raisedBy: "PaymentPeriodsRequest", number: 9999, type: "fatal", text: "Invalid CompanyAuthenticationCode" }],
    });
    const response = await companiesHouseFilingDataPostHandler(buildEvent());
    expect(response.statusCode).toBe(400);
  });

  // The logger writes JSON lines to stdout; this collects the level of each line a call writes.
  async function logLevelsOf(call) {
    const levels = [];
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      for (const line of String(chunk).split("\n").filter(Boolean)) {
        try {
          levels.push(JSON.parse(line).level);
        } catch {
          // a line that is not the logger's JSON carries no level
        }
      }
      return true;
    });
    try {
      return { result: await call(), levels };
    } finally {
      spy.mockRestore();
    }
  }

  test("answers 400 before calling the gateway for a made-up date after today, and logs no error", async () => {
    const afterToday = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
    const { result: response, levels } = await logLevelsOf(() =>
      companiesHouseFilingDataPostHandler(buildEvent({ body: buildBody({ madeUpDate: afterToday }) })),
    );
    expect(response.statusCode).toBe(400);
    const body = parseResponseBody(response);
    expect(body.reason).toBe("made-up-date-after-today");
    expect(body.message).toMatch(/after today/i);
    expect(mockPostToGateway).not.toHaveBeenCalled();
    expect(levels.length).toBeGreaterThan(0);
    expect(levels).not.toContain(50);
  });

  test("answers 400 with the made-up date message when the gateway says the request date must be today or before, and logs no error", async () => {
    mockParseGatewayResponse.mockReturnValueOnce({
      errors: [
        {
          raisedBy: "CompanyDataRequest",
          number: 9999,
          type: "fatal",
          text: "Request date must be today's date or before 30/06/2016",
          location: "",
        },
      ],
    });
    const { result: response, levels } = await logLevelsOf(() => companiesHouseFilingDataPostHandler(buildEvent()));
    expect(response.statusCode).toBe(400);
    const body = parseResponseBody(response);
    expect(body.reason).toBe("made-up-date-after-today");
    expect(mockBuildPaymentPeriodsRequest).not.toHaveBeenCalled();
    expect(levels.length).toBeGreaterThan(0);
    expect(levels).not.toContain(50);
  });

  describe("the made-up date against today in the United Kingdom at 23:30 UTC", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    async function statusAt(instant, madeUpDate) {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date(instant));
      const response = await companiesHouseFilingDataPostHandler(buildEvent({ body: buildBody({ madeUpDate }) }));
      return response.statusCode;
    }

    test("in British Summer Time the UK date is the next UTC day, so that day is read and the one after refused", async () => {
      expect(await statusAt("2026-07-01T23:30:00Z", "2026-07-02")).toBe(200);
      expect(await statusAt("2026-07-01T23:30:00Z", "2026-07-03")).toBe(400);
    });

    test("in Greenwich Mean Time the UK date is the UTC date, so the next day is refused", async () => {
      expect(await statusAt("2026-01-15T23:30:00Z", "2026-01-15")).toBe(200);
      expect(await statusAt("2026-01-15T23:30:00Z", "2026-01-16")).toBe(400);
    });
  });

  test("still logs an error for a gateway rejection it cannot name", async () => {
    mockParseGatewayResponse.mockReturnValueOnce({
      errors: [{ raisedBy: "Gateway", number: 9999, type: "fatal", text: "No presenter ID supplied" }],
    });
    const { result: response, levels } = await logLevelsOf(() => companiesHouseFilingDataPostHandler(buildEvent()));
    expect(response.statusCode).toBe(500);
    expect(levels).toContain(50);
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
