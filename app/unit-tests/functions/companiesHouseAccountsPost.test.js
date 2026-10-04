// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/companiesHouseAccountsPost.test.js
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
    DeleteCommand: class {
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

const mockBuildMicroEntityAccounts = vi.fn();
vi.mock("@app/services/microEntityAccountsIxbrl.js", async (importOriginal) => ({
  ...(await importOriginal()),
  buildMicroEntityAccounts: (...args) => mockBuildMicroEntityAccounts(...args),
}));

const mockBuildAccountsSubmission = vi.fn();
const mockAllocateSubmissionNumber = vi.fn();
const mockResolvePresenterCredentials = vi.fn();
const mockPostToGateway = vi.fn();
const mockParseGatewayResponse = vi.fn();
vi.mock("@app/services/companiesHouseXmlGateway.js", () => ({
  hashPresenterCredential: vi.fn((value) => `hashed-${value}`),
  buildAccountsSubmission: (...args) => mockBuildAccountsSubmission(...args),
  buildStatusRequest: vi.fn(),
  parseGatewayResponse: (...args) => mockParseGatewayResponse(...args),
  allocateSubmissionNumber: (...args) => mockAllocateSubmissionNumber(...args),
  postToGateway: (...args) => mockPostToGateway(...args),
  resolvePresenterCredentials: (...args) => mockResolvePresenterCredentials(...args),
}));

import { ingestHandler as companiesHouseAccountsPostHandler } from "@app/functions/companies-house/companiesHouseAccountsPost.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

function buildAccountsBody(overrides = {}) {
  return {
    companyNumber: "00000001",
    companyName: "SIMULATOR EXAMPLE COMPANY LIMITED",
    companyAuthCode: "AB12CD",
    periodStart: "2025-01-01",
    periodEnd: "2025-12-31",
    balanceSheet: {
      currentYear: {
        fixedAssets: 1000,
        currentAssets: 5000,
        creditorsWithinOneYear: 2000,
        creditorsAfterOneYear: 0,
        calledUpShareCapital: 100,
        profitAndLossAccount: 3900,
        capitalAndReserves: 4000,
      },
      priorYear: {
        fixedAssets: 900,
        currentAssets: 3500,
        creditorsWithinOneYear: 1500,
        creditorsAfterOneYear: 0,
        calledUpShareCapital: 100,
        profitAndLossAccount: 2800,
        capitalAndReserves: 2900,
      },
    },
    averageEmployees: 2,
    director: { name: "Jo Director", dateApproved: "2026-01-15" },
    statementsAccepted: {
      section477Exemption: true,
      membersNotRequiredAudit: true,
      directorsResponsibilities: true,
      microEntityProvisions: true,
    },
    ...overrides,
  };
}

function buildDormantBody(overrides = {}) {
  const body = buildAccountsBody({
    dormant: true,
    dormantTradingStatus: "noLongerTrading",
    shareClass: "ordinaryShares",
    nominalValue: 1,
    ...overrides,
  });
  body.balanceSheet.currentYear.profitAndLossAccount = body.balanceSheet.priorYear.profitAndLossAccount;
  body.balanceSheet.currentYear.capitalAndReserves = body.balanceSheet.priorYear.capitalAndReserves;
  body.balanceSheet.currentYear.fixedAssets = body.balanceSheet.priorYear.fixedAssets;
  body.balanceSheet.currentYear.currentAssets = body.balanceSheet.priorYear.currentAssets;
  body.balanceSheet.currentYear.creditorsWithinOneYear = body.balanceSheet.priorYear.creditorsWithinOneYear;
  return body;
}

function buildSmallCompanyBody(overrides = {}, smallOverrides = {}) {
  return buildAccountsBody({
    balanceSheet: undefined,
    statementsAccepted: {
      section477Exemption: true,
      membersNotRequiredAudit: true,
      directorsResponsibilities: true,
      smallCompaniesRegime: true,
    },
    smallCompany: {
      principalActivity: "Software consultancy",
      accountingPolicies: "Historical cost convention.",
      directors: ["Jo Director"],
      balanceSheet: {
        currentYear: {
          fixedAssets: 1000,
          stocks: 500,
          debtors: 2500,
          cashAtBank: 2000,
          tradeCreditors: 1000,
          corporationTax: 700,
          otherCreditors: 300,
          creditorsAfterOneYear: 0,
          calledUpShareCapital: 100,
          profitAndLossAccount: 3900,
          capitalAndReserves: 4000,
        },
      },
      profitAndLoss: {
        currentYear: {
          turnover: 20000,
          costOfSales: 5000,
          grossProfit: 15000,
          administrativeExpenses: 12000,
          operatingProfit: 3000,
          interestReceivable: 0,
          profitBeforeTax: 3000,
          tax: 600,
          profit: 2400,
        },
      },
      ...smallOverrides,
    },
    ...overrides,
  });
}

function buildEvent({ body = buildAccountsBody(), headers = {}, authorizer, method = "POST" } = {}) {
  const options = {
    method,
    path: "/api/v1/companies-house/accounts",
    body,
    headers: { Authorization: "Bearer test-cognito-token", ...headers },
  };
  if (authorizer !== undefined) options.authorizer = authorizer;
  return buildLambdaEvent(options);
}

describe("companiesHouseAccountsPost ingestHandler", () => {
  beforeEach(() => {
    Object.assign(
      process.env,
      setupTestEnv({
        COMPANIES_HOUSE_XMLGW_URI: "https://xmlgw.companieshouse.gov.uk/v1-0/xmlgw/Gateway",
        COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME: "test-companies-house-accounts-async-requests-table",
        COMPANIES_HOUSE_PACKAGE_REFERENCE: "0012",
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
    mockBuildMicroEntityAccounts.mockReturnValue('<?xml version="1.0"?><html>fake ixbrl</html>');
    mockAllocateSubmissionNumber.mockResolvedValue("00001A");
    mockResolvePresenterCredentials.mockResolvedValue({ presenterId: "presenter-id", presenterCode: "presenter-code" });
    mockBuildAccountsSubmission.mockReturnValue("<GovTalkMessage>submission</GovTalkMessage>");
    mockPostToGateway.mockResolvedValue({ ok: true, status: 200, data: "<GovTalkMessage>ack</GovTalkMessage>", headers: {}, duration: 1 });
    mockParseGatewayResponse.mockReturnValue({ errors: [], statuses: [], gatewayTimestamp: "2026-01-15T10:00:00Z", pollInterval: 1 });
  });

  test("generates the iXBRL, submits the envelope and returns the submission number", async () => {
    const response = await companiesHouseAccountsPostHandler(buildEvent());
    expect(response.statusCode).toBe(201);
    const body = parseResponseBody(response);
    expect(body.submissionNumber).toBe("00001A");
    expect(body.gatewayTimestamp).toBe("2026-01-15T10:00:00Z");
    expect(body.pollInterval).toBe(1);

    expect(mockBuildMicroEntityAccounts).toHaveBeenCalledTimes(1);
    const [generatorInput] = mockBuildMicroEntityAccounts.mock.calls[0];
    expect(generatorInput.companyNumber).toBe("00000001");

    expect(mockBuildAccountsSubmission).toHaveBeenCalledTimes(1);
    const [submissionArgs] = mockBuildAccountsSubmission.mock.calls[0];
    expect(submissionArgs).toMatchObject({
      presenterId: "presenter-id",
      presenterCode: "presenter-code",
      companyNumber: "00000001",
      companyName: "SIMULATOR EXAMPLE COMPANY LIMITED",
      companyAuthenticationCode: "AB12CD",
      packageReference: "0012",
      submissionNumber: "00001A",
      dateSigned: "2026-01-15",
      ixbrl: '<?xml version="1.0"?><html>fake ixbrl</html>',
      gatewayTest: false,
    });

    expect(mockPostToGateway).toHaveBeenCalledWith("<GovTalkMessage>submission</GovTalkMessage>", {});
  });

  test("forwards a Gov-Test-Scenario header to the gateway call", async () => {
    await companiesHouseAccountsPostHandler(buildEvent({ headers: { "Gov-Test-Scenario": "ACCOUNTS_REJECTED" } }));
    expect(mockPostToGateway).toHaveBeenCalledWith("<GovTalkMessage>submission</GovTalkMessage>", {
      "Gov-Test-Scenario": "ACCOUNTS_REJECTED",
    });
  });

  test("sets gatewayTest true when COMPANIES_HOUSE_GATEWAY_TEST is true", async () => {
    process.env.COMPANIES_HOUSE_GATEWAY_TEST = "true";
    await companiesHouseAccountsPostHandler(buildEvent());
    const [submissionArgs] = mockBuildAccountsSubmission.mock.calls[0];
    expect(submissionArgs.gatewayTest).toBe(true);
  });

  test("fails rather than submit a blank package reference when COMPANIES_HOUSE_PACKAGE_REFERENCE is unset", async () => {
    delete process.env.COMPANIES_HOUSE_PACKAGE_REFERENCE;
    await expect(companiesHouseAccountsPostHandler(buildEvent())).rejects.toThrow(/COMPANIES_HOUSE_PACKAGE_REFERENCE/);
    expect(mockPostToGateway).not.toHaveBeenCalled();
  });

  test("rejects a company authentication code that is too short", async () => {
    const response = await companiesHouseAccountsPostHandler(buildEvent({ body: buildAccountsBody({ companyAuthCode: "AB1" }) }));
    expect(response.statusCode).toBe(400);
    expect(mockPostToGateway).not.toHaveBeenCalled();
  });

  test("rejects a balance sheet where capital and reserves does not equal net assets", async () => {
    const body = buildAccountsBody();
    body.balanceSheet.priorYear.capitalAndReserves = 1;
    const response = await companiesHouseAccountsPostHandler(buildEvent({ body }));
    expect(response.statusCode).toBe(400);
    expect(mockPostToGateway).not.toHaveBeenCalled();
  });

  test("marks the submission failed and returns 500 when the gateway rejects the envelope", async () => {
    mockParseGatewayResponse.mockReturnValue({
      errors: [{ raisedBy: "Gateway", number: "502", type: "fatal", text: "Authentication Failure", location: "" }],
    });
    const response = await companiesHouseAccountsPostHandler(buildEvent());
    expect(response.statusCode).toBe(500);
    const body = parseResponseBody(response);
    expect(body.errors[0].number).toBe("502");
  });

  describe("dormant filings", () => {
    test("passes the dormant flag, trading status, share class and nominal value to the generator", async () => {
      const response = await companiesHouseAccountsPostHandler(buildEvent({ body: buildDormantBody() }));
      expect(response.statusCode).toBe(201);
      const [input] = mockBuildMicroEntityAccounts.mock.calls[0];
      expect(input).toMatchObject({
        dormant: true,
        dormantTradingStatus: "noLongerTrading",
        shareClass: "ordinaryShares",
        nominalValue: 1,
      });
    });

    test("leaves the dormant fields off a filing that does not tick dormant", async () => {
      await companiesHouseAccountsPostHandler(buildEvent());
      const [input] = mockBuildMicroEntityAccounts.mock.calls[0];
      expect(input.dormant).toBeUndefined();
      expect(input.shareClass).toBeUndefined();
    });

    test("rejects a dormant filing whose profit and loss account moved in the period", async () => {
      const body = buildDormantBody();
      body.balanceSheet.currentYear.profitAndLossAccount += 50;
      body.balanceSheet.currentYear.capitalAndReserves += 50;
      body.balanceSheet.currentYear.currentAssets += 50;
      const response = await companiesHouseAccountsPostHandler(buildEvent({ body }));
      expect(response.statusCode).toBe(400);
      expect(parseResponseBody(response).message).toContain("dormant company cannot report a profit or loss");
      expect(mockBuildMicroEntityAccounts).not.toHaveBeenCalled();
    });

    test("rejects a dormant filing with no share class, trading status or nominal value", async () => {
      const response = await companiesHouseAccountsPostHandler(
        buildEvent({ body: buildDormantBody({ shareClass: undefined, dormantTradingStatus: undefined, nominalValue: undefined }) }),
      );
      expect(response.statusCode).toBe(400);
      const message = parseResponseBody(response).message;
      expect(message).toContain("shareClass");
      expect(message).toContain("dormantTradingStatus");
      expect(message).toContain("nominalValue");
    });

    test("rejects a nominal value that does not divide the called up share capital into whole shares", async () => {
      const response = await companiesHouseAccountsPostHandler(buildEvent({ body: buildDormantBody({ nominalValue: 30 }) }));
      expect(response.statusCode).toBe(400);
      expect(parseResponseBody(response).message).toContain("whole number of shares");
    });
  });

  test("returns 401 when the Cognito bearer token is missing", async () => {
    const response = await companiesHouseAccountsPostHandler(buildEvent({ authorizer: {} }));
    expect(response.statusCode).toBe(401);
    expect(mockPostToGateway).not.toHaveBeenCalled();
  });

  test("returns 403 when the environment does not list the matched activity", async () => {
    process.env.ENVIRONMENT_NAME = "not-a-listed-environment";
    const response = await companiesHouseAccountsPostHandler(buildEvent());
    expect(response.statusCode).toBe(403);
    expect(mockPostToGateway).not.toHaveBeenCalled();
  });

  test("returns 200 with an empty object for a HEAD request", async () => {
    const response = await companiesHouseAccountsPostHandler(buildEvent({ method: "HEAD" }));
    expect(response.statusCode).toBe(200);
    expect(parseResponseBody(response)).toEqual({});
  });
});

describe("companiesHouseAccountsPost client-scoped requests", () => {
  const CLIENT_TABLE = "test-practice-clients-table";

  function mockPracticeAndClient(clientItem) {
    mockSend.mockImplementation(async (cmd) => {
      const lib = await import("@aws-sdk/lib-dynamodb");
      if (cmd instanceof lib.QueryCommand) {
        return { Items: [{ bundleId: "resident-pro", subscriptionStatus: "active" }], Count: 1 };
      }
      if (cmd instanceof lib.GetCommand) {
        if (cmd.input?.TableName === CLIENT_TABLE) {
          return { Item: clientItem };
        }
        return { Item: null };
      }
      return {};
    });
  }

  beforeEach(() => {
    Object.assign(
      process.env,
      setupTestEnv({
        COMPANIES_HOUSE_XMLGW_URI: "https://xmlgw.companieshouse.gov.uk/v1-0/xmlgw/Gateway",
        COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME: "test-companies-house-accounts-async-requests-table",
        COMPANIES_HOUSE_PACKAGE_REFERENCE: "0012",
        ENVIRONMENT_NAME: "test",
        PRACTICE_CLIENTS_DYNAMODB_TABLE_NAME: CLIENT_TABLE,
      }),
    );
    vi.clearAllMocks();
    mockEventBridgeSend.mockResolvedValue({});
    mockBuildMicroEntityAccounts.mockReturnValue('<?xml version="1.0"?><html>fake ixbrl</html>');
    mockAllocateSubmissionNumber.mockResolvedValue("00001A");
    mockResolvePresenterCredentials.mockResolvedValue({ presenterId: "presenter-id", presenterCode: "presenter-code" });
    mockBuildAccountsSubmission.mockReturnValue("<GovTalkMessage>submission</GovTalkMessage>");
    mockPostToGateway.mockResolvedValue({ ok: true, status: 200, data: "<GovTalkMessage>ack</GovTalkMessage>", headers: {}, duration: 1 });
    mockParseGatewayResponse.mockReturnValue({ errors: [], statuses: [], gatewayTimestamp: "2026-01-15T10:00:00Z", pollInterval: 1 });
  });

  test("resolves the company number from the client row when the client is present and authorised", async () => {
    mockPracticeAndClient({
      clientId: "c1",
      identifiers: { companyNumber: "00000099" },
      authorisations: { "CH-ACCOUNTS": { status: "authorised" } },
      archivedAt: null,
    });

    const body = buildAccountsBody({ clientId: "c1" });
    delete body.companyNumber;
    const response = await companiesHouseAccountsPostHandler(buildEvent({ body }));

    expect(response.statusCode).toBe(201);
    const [generatorInput] = mockBuildMicroEntityAccounts.mock.calls[0];
    expect(generatorInput.companyNumber).toBe("00000099");
    const [submissionArgs] = mockBuildAccountsSubmission.mock.calls[0];
    expect(submissionArgs.companyNumber).toBe("00000099");
  });

  test("returns 403 JSON when the client is present but not authorised for Companies House filing", async () => {
    mockPracticeAndClient({
      clientId: "c1",
      identifiers: { companyNumber: "00000099" },
      authorisations: {},
      archivedAt: null,
    });

    const response = await companiesHouseAccountsPostHandler(buildEvent({ body: buildAccountsBody({ clientId: "c1" }) }));

    expect(response.statusCode).toBe(403);
    const body = parseResponseBody(response);
    expect(body.code).toBe("client-not-authorised");
    expect(mockPostToGateway).not.toHaveBeenCalled();
  });

  test("returns 403 JSON for a client id belonging to another practice", async () => {
    mockPracticeAndClient(null);

    const response = await companiesHouseAccountsPostHandler(buildEvent({ body: buildAccountsBody({ clientId: "not-mine" }) }));

    expect(response.statusCode).toBe(403);
    const body = parseResponseBody(response);
    expect(body.code).toBe("CLIENT_NOT_FOUND");
    expect(mockPostToGateway).not.toHaveBeenCalled();
  });

  test("uses the body companyNumber as before when no clientId is given", async () => {
    mockSend.mockImplementation(async (cmd) => {
      const lib = await import("@aws-sdk/lib-dynamodb");
      if (cmd instanceof lib.QueryCommand) return { Items: [], Count: 0 };
      return {};
    });

    const response = await companiesHouseAccountsPostHandler(buildEvent());

    expect(response.statusCode).toBe(201);
    const [generatorInput] = mockBuildMicroEntityAccounts.mock.calls[0];
    expect(generatorInput.companyNumber).toBe("00000001");
  });

  describe("small company filings", () => {
    test("builds the small company document and submits it, never calling the micro-entity builder", async () => {
      const response = await companiesHouseAccountsPostHandler(buildEvent({ body: buildSmallCompanyBody() }));
      expect(response.statusCode).toBe(201);
      expect(mockBuildMicroEntityAccounts).not.toHaveBeenCalled();
      const [submissionArgs] = mockBuildAccountsSubmission.mock.calls[0];
      expect(submissionArgs.ixbrl).toContain('name="core:TurnoverRevenue"');
      expect(submissionArgs.ixbrl).toContain("subject to the small companies regime");
      expect(submissionArgs.ixbrl).toContain('name="bus:DescriptionPrincipalActivities"');
      expect(submissionArgs.companyNumber).toBe("00000001");
    });

    test("filleting writes the section 444(5A) statement and drops the profit and loss account", async () => {
      const body = buildSmallCompanyBody({}, { filleted: true });
      body.smallCompany.balanceSheet = buildSmallCompanyBody().smallCompany.balanceSheet;
      const response = await companiesHouseAccountsPostHandler(buildEvent({ body }));
      expect(response.statusCode).toBe(201);
      const [submissionArgs] = mockBuildAccountsSubmission.mock.calls[0];
      expect(submissionArgs.ixbrl).toContain("section 444(5A)");
      expect(submissionArgs.ixbrl).not.toContain('name="core:TurnoverRevenue"');
      expect(submissionArgs.ixbrl).not.toContain('name="bus:DescriptionPrincipalActivities"');
    });

    test("filing is full accounts when filleted is not given", async () => {
      await companiesHouseAccountsPostHandler(buildEvent({ body: buildSmallCompanyBody() }));
      const [submissionArgs] = mockBuildAccountsSubmission.mock.calls[0];
      expect(submissionArgs.ixbrl).not.toContain("section 444(5A)");
    });

    test("comparatives render when supplied", async () => {
      const body = buildSmallCompanyBody();
      body.smallCompany.balanceSheet.priorYear = { ...body.smallCompany.balanceSheet.currentYear };
      body.smallCompany.profitAndLoss.priorYear = { ...body.smallCompany.profitAndLoss.currentYear };
      await companiesHouseAccountsPostHandler(buildEvent({ body }));
      const [submissionArgs] = mockBuildAccountsSubmission.mock.calls[0];
      expect(submissionArgs.ixbrl).toContain('contextRef="y2024"');
      expect(submissionArgs.ixbrl).toContain('contextRef="e2024"');
    });

    test("rejects a balance sheet whose capital and reserves differ from net assets", async () => {
      const body = buildSmallCompanyBody();
      body.smallCompany.balanceSheet.currentYear.capitalAndReserves = 1;
      const response = await companiesHouseAccountsPostHandler(buildEvent({ body }));
      expect(response.statusCode).toBe(400);
      expect(mockPostToGateway).not.toHaveBeenCalled();
    });

    test("rejects a profit and loss account that does not add up", async () => {
      const body = buildSmallCompanyBody();
      body.smallCompany.profitAndLoss.currentYear.profit = 1;
      const response = await companiesHouseAccountsPostHandler(buildEvent({ body }));
      expect(response.statusCode).toBe(400);
      expect(parseResponseBody(response).message).toContain("profit must equal profitBeforeTax less tax");
    });

    test("rejects a fixed asset note whose net book value differs from fixed assets", async () => {
      const body = buildSmallCompanyBody({}, {});
      body.smallCompany.fixedAssetNote = {
        computerEquipment: {
          costAtStart: 500,
          additions: 0,
          disposals: 0,
          depreciationAtStart: 0,
          depreciationCharge: 0,
          depreciationOnDisposals: 0,
        },
      };
      const response = await companiesHouseAccountsPostHandler(buildEvent({ body }));
      expect(response.statusCode).toBe(400);
      expect(parseResponseBody(response).message).toContain("fixedAssetNote net book value");
    });

    test("rejects a missing principal activity, no directors and an unaccepted regime statement", async () => {
      const body = buildSmallCompanyBody();
      body.smallCompany.principalActivity = "";
      body.smallCompany.directors = [];
      body.statementsAccepted.smallCompaniesRegime = false;
      const response = await companiesHouseAccountsPostHandler(buildEvent({ body }));
      expect(response.statusCode).toBe(400);
      const message = parseResponseBody(response).message;
      expect(message).toContain("smallCompany.principalActivity");
      expect(message).toContain("smallCompany.directors");
      expect(message).toContain("smallCompaniesRegime");
    });

    test("rejects a dormant flag combined with a small company filing", async () => {
      const response = await companiesHouseAccountsPostHandler(buildEvent({ body: buildSmallCompanyBody({ dormant: true }) }));
      expect(response.statusCode).toBe(400);
      expect(parseResponseBody(response).message).toContain("dormant cannot be combined with smallCompany");
    });

    test("a micro-entity filing still goes through the micro-entity builder", async () => {
      await companiesHouseAccountsPostHandler(buildEvent());
      expect(mockBuildMicroEntityAccounts).toHaveBeenCalledTimes(1);
    });
  });
});
