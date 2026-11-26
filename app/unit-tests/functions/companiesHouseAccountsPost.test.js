// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/companiesHouseAccountsPost.test.js
import { describe, test, beforeEach, afterEach, expect, vi } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { buildLambdaEvent } from "@app/test-helpers/eventBuilders.js";
import { setupTestEnv, parseResponseBody } from "@app/test-helpers/mockHelpers.js";
import {
  INVALID_COMPANY_AUTHENTICATION_CODE_MESSAGE,
  INVALID_COMPANY_AUTHENTICATION_CODE_REASON,
} from "@app/lib/companiesHouseGatewayErrors.js";

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

const mockTakeCodesEntry = vi.fn();
const mockTakeCodesEntryForClient = vi.fn();
vi.mock("@app/data/dynamoDbCodesEntryRepository.js", () => ({
  takeCodesEntry: (...args) => mockTakeCodesEntry(...args),
  takeCodesEntryForClient: (...args) => mockTakeCodesEntryForClient(...args),
}));
vi.mock("@app/lib/codesSeal.js", () => ({
  openCodes: async () => ({ companyAuthCode: "ABC123", personalCodes: [] }),
  sealFor: async () => "v1.sealed-filer",
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
vi.mock("@app/services/companiesHouseXmlGateway.js", async (importOriginal) => ({
  gatewayRequestNotDelivered: (await importOriginal()).gatewayRequestNotDelivered,
  hashPresenterCredential: vi.fn((value) => `hashed-${value}`),
  buildAccountsSubmission: (...args) => mockBuildAccountsSubmission(...args),
  buildStatusRequest: vi.fn(),
  parseGatewayResponse: (...args) => mockParseGatewayResponse(...args),
  allocateSubmissionNumber: (...args) => mockAllocateSubmissionNumber(...args),
  postToGateway: (...args) => mockPostToGateway(...args),
  resolvePresenterCredentials: (...args) => mockResolvePresenterCredentials(...args),
}));

const mockGetReceipt = vi.fn();
vi.mock("@app/data/dynamoDbReceiptRepository.js", async (importOriginal) => ({
  ...(await importOriginal()),
  getReceipt: (...args) => mockGetReceipt(...args),
}));

const mockFilingHistory = vi.fn();
vi.mock("@app/services/companiesHouseApi.js", async (importOriginal) => ({
  ...(await importOriginal()),
  companiesHouseFilingHistory: (...args) => mockFilingHistory(...args),
}));

function accountsHistory(...madeUpDates) {
  const items = madeUpDates.map((madeUpDate) => ({ type: "AA", description_values: { made_up_date: madeUpDate } }));
  return { ok: true, status: 200, data: { items, totalCount: items.length, truncated: false } };
}

// The security state table behind the lookups' limits: the stop a Companies House 429 sets, and
// each account's counter, which here never reaches its share.
const mockStopValue = vi.fn(async () => undefined);
const mockPutCachedValue = vi.fn(async () => {});
vi.mock("@app/data/dynamoDbSecurityStateRepository.js", async (importOriginal) => ({
  ...(await importOriginal()),
  incrementRateCounter: async () => 1,
  getCachedValue: (...args) => mockStopValue(...args),
  putCachedValue: (...args) => mockPutCachedValue(...args),
}));

const mockGetCompanyProfile = vi.fn();
vi.mock("@app/functions/companies-house/companiesHouseCompanyGet.js", () => ({
  getCompanyProfile: (...args) => mockGetCompanyProfile(...args),
}));

import {
  ingestHandler as companiesHouseAccountsPostHandler,
  readRegisteredOffice,
  readAccountantsReport,
  extractAndValidateAccountsParameters,
} from "@app/functions/companies-house/companiesHouseAccountsPost.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

function buildAccountsBody(overrides = {}) {
  return {
    companyNumber: "00000001",
    companyName: "SIMULATOR EXAMPLE COMPANY LIMITED",
    registeredOffice: { addressLine1: "1 Test Street", cityOrTown: "London", postalCode: "EC1A 1AA" },
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
      // The company's first accounts, so they have no prior year.
      dateOfIncorporation: "2025-01-01",
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
    delete process.env.COMPANIES_HOUSE_GATEWAY_TEST;
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
    mockStopValue.mockResolvedValue(undefined);
    // The register shows a company incorporated on the default body's period start, with no accounts filed.
    mockGetCompanyProfile.mockResolvedValue({ profile: { jurisdiction: "england-wales", dateOfCreation: "2025-01-01" } });
    mockEventBridgeSend.mockResolvedValue({});
    mockSend.mockImplementation(async (cmd) => {
      const lib = await import("@aws-sdk/lib-dynamodb");
      if (cmd instanceof lib.QueryCommand) {
        return { Items: [{ bundleId: "resident-pro", subscriptionStatus: "active", tokensGranted: 100, tokensConsumed: 0 }], Count: 1 };
      }
      return {};
    });
    mockBuildMicroEntityAccounts.mockReturnValue('<?xml version="1.0"?><html>fake ixbrl</html>');
    mockAllocateSubmissionNumber.mockResolvedValue("00001A");
    mockResolvePresenterCredentials.mockResolvedValue({ presenterId: "presenter-id", presenterCode: "presenter-code" });
    mockBuildAccountsSubmission.mockReturnValue("<GovTalkMessage>submission</GovTalkMessage>");
    mockPostToGateway.mockResolvedValue({ ok: true, status: 200, data: "<GovTalkMessage>ack</GovTalkMessage>", headers: {}, duration: 1 });
    mockParseGatewayResponse.mockReturnValue({ errors: [], statuses: [], gatewayTimestamp: "2026-01-15T10:00:00Z", pollInterval: 1 });
    mockFilingHistory.mockResolvedValue(accountsHistory("2025-12-31", "2024-12-31"));
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

  test("presents under the customer's own presenter, never resolves ours and never stores it", async () => {
    const response = await companiesHouseAccountsPostHandler(
      buildEvent({ body: { ...buildAccountsBody(), ownPresenter: { id: "OWN-PRES-7731", code: "OwnSecretCode#42" } } }),
    );
    expect(response.statusCode).toBe(201);
    expect(mockResolvePresenterCredentials).not.toHaveBeenCalled();
    const [submissionArgs] = mockBuildAccountsSubmission.mock.calls[0];
    expect(submissionArgs).toMatchObject({ presenterId: "OWN-PRES-7731", presenterCode: "OwnSecretCode#42" });
    const everythingStored = JSON.stringify(mockSend.mock.calls.map(([command]) => command?.input));
    expect(everythingStored).not.toContain("OWN-PRES-7731");
    expect(everythingStored).not.toContain("OwnSecretCode#42");
  });

  test("rejects an own presenter that is missing its authentication code", async () => {
    const response = await companiesHouseAccountsPostHandler(
      buildEvent({ body: { ...buildAccountsBody(), ownPresenter: { id: "OWN-PRES-7731" } } }),
    );
    expect(response.statusCode).toBe(400);
    expect(mockPostToGateway).not.toHaveBeenCalled();
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

  test.each([
    [
      "the current year",
      (body) => {
        body.balanceSheet.currentYear.profitAndLossAccount = 3800;
      },
      "Capital and reserves of £4,000 for the current year do not equal called up share capital plus the profit and loss account, which add up to £3,900.",
    ],
    [
      "the prior year",
      (body) => {
        body.balanceSheet.priorYear.profitAndLossAccount = 1900;
      },
      "Capital and reserves of £2,900 for the prior year do not equal called up share capital plus the profit and loss account, which add up to £2,000.",
    ],
  ])(
    "refuses capital and reserves in %s that differ from share capital plus the profit and loss account, and sends nothing",
    async (_year, change, message) => {
      const body = buildAccountsBody();
      change(body);
      const response = await companiesHouseAccountsPostHandler(buildEvent({ body }));
      expect(response.statusCode).toBe(400);
      expect(response.headers["Content-Type"]).toBe("application/json");
      expect(parseResponseBody(response).message).toContain(message);
      expect(mockPostToGateway).not.toHaveBeenCalled();
    },
  );

  test("refuses small company capital and reserves that differ from share capital plus the profit and loss account", async () => {
    const body = buildSmallCompanyBody();
    body.smallCompany.balanceSheet.currentYear.profitAndLossAccount = 3800;
    const response = await companiesHouseAccountsPostHandler(buildEvent({ body }));
    expect(response.statusCode).toBe(400);
    expect(parseResponseBody(response).message).toContain(
      "Capital and reserves of £4,000 for the current year do not equal called up share capital plus the profit and loss account, which add up to £3,900.",
    );
    expect(mockPostToGateway).not.toHaveBeenCalled();
  });

  test("files dormant accounts whose capital and reserves are the share capital alone", async () => {
    const shareCapitalOnly = {
      fixedAssets: 0,
      currentAssets: 100,
      creditorsWithinOneYear: 0,
      creditorsAfterOneYear: 0,
      calledUpShareCapital: 100,
      profitAndLossAccount: 0,
      capitalAndReserves: 100,
    };
    const body = buildAccountsBody({
      dormant: true,
      dormantTradingStatus: "neverTraded",
      shareClass: "ordinaryShares",
      nominalValue: 1,
      averageEmployees: 0,
      balanceSheet: { currentYear: { ...shareCapitalOnly }, priorYear: { ...shareCapitalOnly } },
    });
    const response = await companiesHouseAccountsPostHandler(buildEvent({ body }));
    expect(response.statusCode).toBe(201);
    expect(mockPostToGateway).toHaveBeenCalled();
  });

  test("files a company's first accounts, whose prior year is all zero", async () => {
    const body = buildAccountsBody();
    body.balanceSheet.priorYear = {
      fixedAssets: 0,
      currentAssets: 0,
      creditorsWithinOneYear: 0,
      creditorsAfterOneYear: 0,
      calledUpShareCapital: 0,
      profitAndLossAccount: 0,
      capitalAndReserves: 0,
    };
    const response = await companiesHouseAccountsPostHandler(buildEvent({ body }));
    expect(response.statusCode).toBe(201);
  });

  test("accepts the optional balance sheet headings when they enter the totals", async () => {
    const body = buildAccountsBody();
    body.balanceSheet.currentYear.prepaymentsAccruedIncome = 300;
    body.balanceSheet.currentYear.accrualsDeferredIncome = 100;
    body.balanceSheet.currentYear.provisionsForLiabilities = "50";
    body.balanceSheet.currentYear.calledUpShareCapitalNotPaid = 10;
    body.balanceSheet.currentYear.capitalAndReserves = 4160;
    body.balanceSheet.currentYear.profitAndLossAccount = 4060;
    const response = await companiesHouseAccountsPostHandler(buildEvent({ body }));
    expect(response.statusCode).toBe(201);
  });

  test("rejects an optional balance sheet heading that is negative or not a number", async () => {
    for (const value of [-5, "abc"]) {
      const body = buildAccountsBody();
      body.balanceSheet.currentYear.accrualsDeferredIncome = value;
      const response = await companiesHouseAccountsPostHandler(buildEvent({ body }));
      expect(response.statusCode).toBe(400);
    }
  });

  test("rejects capital and reserves that ignore an optional heading", async () => {
    const body = buildAccountsBody();
    body.balanceSheet.currentYear.provisionsForLiabilities = 100;
    const response = await companiesHouseAccountsPostHandler(buildEvent({ body }));
    expect(response.statusCode).toBe(400);
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

  test("keeps and answers a rejection with the request's values taken out of its texts", async () => {
    mockParseGatewayResponse.mockReturnValue({
      errors: [
        {
          raisedBy: "Gateway",
          number: "604",
          type: "fatal",
          text: "Jo Director cannot approve SIMULATOR EXAMPLE COMPANY LIMITED",
          location: "",
        },
      ],
    });

    const response = await companiesHouseAccountsPostHandler(buildEvent());

    expect(response.statusCode).toBe(500);
    const kept = JSON.stringify({
      answer: parseResponseBody(response),
      stored: mockSend.mock.calls.map(([command]) => command.input),
      events: mockEventBridgeSend.mock.calls.map(([command]) => command.input),
    });
    expect(kept).toContain("[a value of the request] cannot approve [a value of the request]");
    expect(kept).not.toContain("Jo Director cannot");
  });

  async function asyncRequestWrites() {
    const lib = await import("@aws-sdk/lib-dynamodb");
    return mockSend.mock.calls
      .map(([cmd]) => cmd)
      .filter((cmd) => cmd instanceof lib.UpdateCommand && cmd.input.ExpressionAttributeValues?.[":status"])
      .map((cmd) => cmd.input.ExpressionAttributeValues);
  }

  test("keeps the filing pending with its request data and answers its number when the gateway never answers the sent envelope", async () => {
    mockPostToGateway.mockRejectedValue(new Error("The operation was aborted due to timeout"));

    const response = await companiesHouseAccountsPostHandler(buildEvent());

    expect(response.statusCode).toBe(201);
    expect(parseResponseBody(response).submissionNumber).toBe("00001A");
    const writes = await asyncRequestWrites();
    expect(writes.map((values) => values[":status"])).toEqual(["pending", "pending"]);
    const kept = writes.at(-1)[":data"];
    expect(kept).toMatchObject({ kind: "accounts", outcomeUnknown: true, filedDocument: '<?xml version="1.0"?><html>fake ixbrl</html>' });
    expect(kept.chargeActivityId).toBeTruthy();
  });

  test("marks the filing failed when the connection to the gateway was refused, so nothing was delivered", async () => {
    mockPostToGateway.mockRejectedValue(
      Object.assign(new TypeError("fetch failed"), {
        cause: Object.assign(new Error("connect ECONNREFUSED 10.0.0.1:443"), { code: "ECONNREFUSED", syscall: "connect" }),
      }),
    );

    const response = await companiesHouseAccountsPostHandler(buildEvent());

    expect(response.statusCode).toBe(500);
    expect((await asyncRequestWrites()).map((values) => values[":status"])).toEqual(["pending", "failed"]);
  });

  test("marks the filing failed when the envelope could not be built, before anything was sent", async () => {
    mockBuildAccountsSubmission.mockImplementation(() => {
      throw new Error("envelope build failed");
    });

    const response = await companiesHouseAccountsPostHandler(buildEvent());

    expect(response.statusCode).toBe(500);
    expect(mockPostToGateway).not.toHaveBeenCalled();
    expect((await asyncRequestWrites()).map((values) => values[":status"])).toEqual(["pending", "failed"]);
  });

  test("returns 400 with the gateway errors when the gateway reports the company authentication code as invalid", async () => {
    mockParseGatewayResponse.mockReturnValue({
      errors: [{ raisedBy: "CompanyDataRequest", number: 9999, type: "fatal", text: "Invalid CompanyAuthenticationCode", location: "" }],
    });
    const response = await companiesHouseAccountsPostHandler(buildEvent());
    expect(response.statusCode).toBe(400);
    const body = parseResponseBody(response);
    expect(body.reason).toBe(INVALID_COMPANY_AUTHENTICATION_CODE_REASON);
    expect(body.message).toBe(INVALID_COMPANY_AUTHENTICATION_CODE_MESSAGE);
    expect(body.errors[0].text).toBe("Invalid CompanyAuthenticationCode");
  });

  describe("dormant filings", () => {
    test("rejects unpaid share capital that is not a whole number of shares or exceeds the called up capital", async () => {
      for (const unpaid of [0.5, 101]) {
        const body = buildDormantBody();
        body.balanceSheet.currentYear.calledUpShareCapitalNotPaid = unpaid;
        const response = await companiesHouseAccountsPostHandler(buildEvent({ body }));
        expect(response.statusCode).toBe(400);
      }
    });

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

  describe("accounts written in Welsh", () => {
    async function pendingData() {
      const lib = await import("@aws-sdk/lib-dynamodb");
      const updates = mockSend.mock.calls.map(([cmd]) => cmd).filter((cmd) => cmd instanceof lib.UpdateCommand);
      return updates.find((cmd) => cmd.input.ExpressionAttributeValues[":status"] === "pending").input.ExpressionAttributeValues[":data"];
    }

    test("a Welsh company's Welsh accounts are built in Welsh, kept with the filing and sent with Language CY", async () => {
      mockGetCompanyProfile.mockResolvedValue({ profile: { jurisdiction: "wales" } });
      const response = await companiesHouseAccountsPostHandler(buildEvent({ body: buildAccountsBody({ documentLanguage: "cy" }) }));
      expect(response.statusCode).toBe(201);
      expect(mockGetCompanyProfile).toHaveBeenCalledWith("00000001");
      expect(mockBuildMicroEntityAccounts.mock.calls[0][0].documentLanguage).toBe("cy");
      expect(mockBuildAccountsSubmission.mock.calls[0][0].language).toBe("CY");
      expect(await pendingData()).toMatchObject({ documentLanguage: "cy" });
    });

    test("a Welsh company's small company accounts are built in Welsh and sent with Language CY", async () => {
      mockGetCompanyProfile.mockResolvedValue({ profile: { jurisdiction: "wales", dateOfCreation: "2025-01-01" } });
      const response = await companiesHouseAccountsPostHandler(buildEvent({ body: buildSmallCompanyBody({ documentLanguage: "cy" }) }));
      expect(response.statusCode).toBe(201);
      const submission = mockBuildAccountsSubmission.mock.calls[0][0];
      expect(submission.language).toBe("CY");
      expect(submission.ixbrl).toContain('xml:lang="cy"');
      expect(submission.ixbrl).toContain("Adroddiad y cyfarwyddwyr");
      expect(await pendingData()).toMatchObject({ documentLanguage: "cy" });
    });

    test("a company whose jurisdiction is england-wales cannot file in Welsh, and nothing is sent", async () => {
      mockGetCompanyProfile.mockResolvedValue({ profile: { jurisdiction: "england-wales" } });
      const response = await companiesHouseAccountsPostHandler(buildEvent({ body: buildAccountsBody({ documentLanguage: "cy" }) }));
      expect(response.statusCode).toBe(400);
      expect(JSON.stringify(parseResponseBody(response))).toContain("Welsh accounts are for a Welsh company");
      expect(mockPostToGateway).not.toHaveBeenCalled();
    });

    test("answer a JSON 502 with a reason, and send nothing, when the company's profile cannot be read at all", async () => {
      mockGetCompanyProfile.mockRejectedValue(new Error("Missing required environment variable COMPANIES_HOUSE_BASE_URI"));
      const response = await companiesHouseAccountsPostHandler(buildEvent({ body: buildAccountsBody({ documentLanguage: "cy" }) }));
      expect(response.statusCode).toBe(502);
      expect(parseResponseBody(response)).toMatchObject({ reason: "company-profile-not-read" });
      expect(response.body).not.toContain("COMPANIES_HOUSE_BASE_URI");
      expect(mockPostToGateway).not.toHaveBeenCalled();
    });

    test("read no profile and answer a JSON 429 during the stop a Companies House 429 set", async () => {
      mockStopValue.mockResolvedValue({ until: Date.now() + 60_000 });
      const response = await companiesHouseAccountsPostHandler(buildEvent({ body: buildAccountsBody({ documentLanguage: "cy" }) }));
      expect(response.statusCode).toBe(429);
      expect(Number(response.headers["Retry-After"])).toBeGreaterThan(0);
      expect(mockGetCompanyProfile).not.toHaveBeenCalled();
      expect(mockPostToGateway).not.toHaveBeenCalled();
    });

    test("answer the failed read and set the stop when Companies House answers the profile read with 429", async () => {
      mockGetCompanyProfile.mockResolvedValue({ chResponse: { ok: false, status: 429, headers: { "retry-after": "30" } }, profile: null });
      const response = await companiesHouseAccountsPostHandler(buildEvent({ body: buildAccountsBody({ documentLanguage: "cy" }) }));
      expect(response.statusCode).toBe(429);
      expect(mockPutCachedValue).toHaveBeenCalledWith("chlookup#stopped", { until: expect.any(Number) }, 30);
      expect(mockPostToGateway).not.toHaveBeenCalled();
    });

    test("for a company the register does not hold are refused as accounts of no Welsh company", async () => {
      mockGetCompanyProfile.mockResolvedValue({ chResponse: { ok: false, status: 404 }, profile: null });
      const response = await companiesHouseAccountsPostHandler(buildEvent({ body: buildAccountsBody({ documentLanguage: "cy" }) }));
      expect(response.statusCode).toBe(400);
      expect(JSON.stringify(parseResponseBody(response))).toContain('jurisdiction as \\"unknown\\"');
    });

    test("a filing with no registered office reads the profile within the limits: none during the stop, and nothing sent", async () => {
      mockStopValue.mockResolvedValue({ until: Date.now() + 60_000 });
      const response = await companiesHouseAccountsPostHandler(buildEvent({ body: buildAccountsBody({ registeredOffice: undefined }) }));
      expect(response.statusCode).toBe(429);
      expect(mockGetCompanyProfile).not.toHaveBeenCalled();
      expect(mockPostToGateway).not.toHaveBeenCalled();
    });

    test("a Welsh filing with no registered office reads the profile once, for the office and the jurisdiction", async () => {
      mockGetCompanyProfile.mockResolvedValue({
        profile: {
          jurisdiction: "wales",
          registeredOffice: { addressLine1: "1 Stryd y Castell", cityOrTown: "Caerdydd", postalCode: "CF10 1AA" },
        },
      });
      const response = await companiesHouseAccountsPostHandler(
        buildEvent({ body: buildAccountsBody({ documentLanguage: "cy", registeredOffice: undefined }) }),
      );
      expect(response.statusCode).toBe(201);
      expect(mockGetCompanyProfile).toHaveBeenCalledTimes(1);
      expect(mockBuildMicroEntityAccounts.mock.calls[0][0].registeredOffice).toMatchObject({ addressLine1: "1 Stryd y Castell" });
    });

    test("English accounts read no profile and send no Language", async () => {
      const response = await companiesHouseAccountsPostHandler(buildEvent());
      expect(response.statusCode).toBe(201);
      expect(mockGetCompanyProfile).not.toHaveBeenCalled();
      expect(mockBuildAccountsSubmission.mock.calls[0][0].language).toBeUndefined();
    });
  });

  describe("a filing sent as half of a pair", () => {
    const JOINT_FILING_ID = "7d1c0f0e-5a3b-4c8e-9f21-0a6b3c9d4e11";

    async function pendingData() {
      const lib = await import("@aws-sdk/lib-dynamodb");
      const updates = mockSend.mock.calls.map(([cmd]) => cmd).filter((cmd) => cmd instanceof lib.UpdateCommand);
      return updates.find((cmd) => cmd.input.ExpressionAttributeValues[":status"] === "pending").input.ExpressionAttributeValues[":data"];
    }

    test("stores the jointFilingId and the activity to charge with the pending request", async () => {
      const response = await companiesHouseAccountsPostHandler(buildEvent({ body: buildAccountsBody({ jointFilingId: JOINT_FILING_ID }) }));
      expect(response.statusCode).toBe(201);
      expect(await pendingData()).toMatchObject({ jointFilingId: JOINT_FILING_ID, chargeActivityId: "file-micro-entity-accounts" });
    });

    test("charges the small company activity for a small company filing", async () => {
      const response = await companiesHouseAccountsPostHandler(
        buildEvent({ body: buildSmallCompanyBody({ jointFilingId: JOINT_FILING_ID }) }),
      );
      expect(response.statusCode).toBe(201);
      expect(await pendingData()).toMatchObject({ jointFilingId: JOINT_FILING_ID, chargeActivityId: "file-small-company-accounts" });
    });

    test("stores no jointFilingId for a filing sent alone", async () => {
      await companiesHouseAccountsPostHandler(buildEvent());
      expect(await pendingData()).not.toHaveProperty("jointFilingId");
    });

    test("refuses a jointFilingId that is not a UUID and sends nothing", async () => {
      const response = await companiesHouseAccountsPostHandler(buildEvent({ body: buildAccountsBody({ jointFilingId: "not-a-uuid" }) }));
      expect(response.statusCode).toBe(400);
      expect(JSON.stringify(parseResponseBody(response))).toContain("Invalid jointFilingId");
      expect(mockPostToGateway).not.toHaveBeenCalled();
    });

    describe("on prod, where the joint filing is listed", () => {
      beforeEach(() => {
        process.env.ENVIRONMENT_NAME = "prod";
      });

      test("files a customer's accounts that carry a joint filing id", async () => {
        const response = await companiesHouseAccountsPostHandler(
          buildEvent({ body: buildAccountsBody({ jointFilingId: JOINT_FILING_ID }) }),
        );
        expect(response.statusCode).toBe(201);
        expect(await pendingData()).toMatchObject({ jointFilingId: JOINT_FILING_ID });
      });

      test("files a customer's accounts sent alone", async () => {
        const response = await companiesHouseAccountsPostHandler(buildEvent());
        expect(response.statusCode).toBe(201);
      });
    });
  });

  describe("the form the accounts were made from", () => {
    async function pendingData() {
      const lib = await import("@aws-sdk/lib-dynamodb");
      const updates = mockSend.mock.calls.map(([cmd]) => cmd).filter((cmd) => cmd instanceof lib.UpdateCommand);
      return updates.find((cmd) => cmd.input.ExpressionAttributeValues[":status"] === "pending").input.ExpressionAttributeValues[":data"];
    }

    test("stores the sanitised form answers with the pending request", async () => {
      const response = await companiesHouseAccountsPostHandler(
        buildEvent({
          body: buildAccountsBody({ formValues: { turnover: "1000", presenterCode: "leaked", companyAuthCode: "ABC123" } }),
        }),
      );
      expect(response.statusCode).toBe(201);
      const data = await pendingData();
      expect(data.formRequest.values).toEqual({ turnover: "1000" });
      expect(JSON.stringify(data)).not.toContain("leaked");
      expect(JSON.stringify(data.formRequest)).not.toContain("ABC123");
    });

    test("stores no form request when the page sent no answers", async () => {
      await companiesHouseAccountsPostHandler(buildEvent());
      expect(await pendingData()).not.toHaveProperty("formRequest");
    });
  });

  describe("revised accounts", () => {
    const JOINT_FILING_ID = "7d1c0f0e-5a3b-4c8e-9f21-0a6b3c9d4e11";
    const REVISION = {
      originalDateOfApproval: "2026-01-10",
      nonCompliance: "A liability was left out.",
      amendments: "Creditors are restated.",
    };

    async function pendingData() {
      const lib = await import("@aws-sdk/lib-dynamodb");
      const updates = mockSend.mock.calls.map(([cmd]) => cmd).filter((cmd) => cmd instanceof lib.UpdateCommand);
      return updates.find((cmd) => cmd.input.ExpressionAttributeValues[":status"] === "pending").input.ExpressionAttributeValues[":data"];
    }

    test("stores the amended mark and the jointFilingId, and builds the document with the revision", async () => {
      const response = await companiesHouseAccountsPostHandler(
        buildEvent({ body: buildAccountsBody({ jointFilingId: JOINT_FILING_ID, revision: REVISION }) }),
      );
      expect(response.statusCode).toBe(201);
      const data = await pendingData();
      expect(data).toMatchObject({ jointFilingId: JOINT_FILING_ID, amended: true });
      expect(mockBuildMicroEntityAccounts).toHaveBeenCalledWith(expect.objectContaining({ revision: REVISION }));
    });

    test("a small company revision is revised too", async () => {
      const response = await companiesHouseAccountsPostHandler(buildEvent({ body: buildSmallCompanyBody({ revision: REVISION }) }));
      expect(response.statusCode).toBe(201);
      expect(await pendingData()).toMatchObject({ amended: true });
    });

    test("a revision filed alone is charged to the accounts activity of its regime, as an original filing is", async () => {
      const response = await companiesHouseAccountsPostHandler(buildEvent({ body: buildAccountsBody({ revision: REVISION }) }));
      expect(response.statusCode).toBe(201);
      expect(await pendingData()).toMatchObject({ amended: true, chargeActivityId: "file-micro-entity-accounts" });
    });

    test("an original filing stores no amended mark", async () => {
      await companiesHouseAccountsPostHandler(buildEvent());
      expect(await pendingData()).not.toHaveProperty("amended");
    });

    test("refuses a revision on prod, where revised accounts are not offered, and sends nothing", async () => {
      process.env.ENVIRONMENT_NAME = "prod";
      const response = await companiesHouseAccountsPostHandler(buildEvent({ body: buildAccountsBody({ revision: REVISION }) }));
      expect(response.statusCode).toBe(403);
      expect(parseResponseBody(response)).toMatchObject({ code: "ACTIVITY_ENVIRONMENT_RESTRICTED", activityId: "file-revised-accounts" });
      expect(mockPostToGateway).not.toHaveBeenCalled();
    });

    test("files an original on prod", async () => {
      process.env.ENVIRONMENT_NAME = "prod";
      const response = await companiesHouseAccountsPostHandler(buildEvent());
      expect(response.statusCode).toBe(201);
    });

    test("refuses a revision on prod from a preview request with a synthetic HMRC account, while the accounts go to the live gateway", async () => {
      process.env.ENVIRONMENT_NAME = "prod";
      delete process.env.COMPANIES_HOUSE_GATEWAY_TEST;
      process.env.COMPANIES_HOUSE_FILING_BASE_URI = "https://api.company-information.service.gov.uk";
      const response = await companiesHouseAccountsPostHandler(
        buildEvent({
          body: buildAccountsBody({ revision: REVISION }),
          headers: { "x-preview-features": "on", "hmrcAccount": "synthetic" },
        }),
      );
      expect(response.statusCode).toBe(403);
      expect(parseResponseBody(response)).toMatchObject({ code: "ACTIVITY_ENVIRONMENT_RESTRICTED", activityId: "file-revised-accounts" });
      expect(mockPostToGateway).not.toHaveBeenCalled();
    });

    test("files a revision from a preview request where the accounts go to the Companies House test service", async () => {
      process.env.ENVIRONMENT_NAME = "prod";
      process.env.COMPANIES_HOUSE_GATEWAY_TEST = "true";
      const response = await companiesHouseAccountsPostHandler(
        buildEvent({
          body: buildAccountsBody({ revision: REVISION }),
          headers: { "x-preview-features": "on", "hmrcAccount": "synthetic" },
        }),
      );
      expect(response.statusCode).toBe(201);
      expect(mockPostToGateway).toHaveBeenCalled();
    });

    test("files a revision on ci", async () => {
      process.env.ENVIRONMENT_NAME = "ci";
      const response = await companiesHouseAccountsPostHandler(buildEvent({ body: buildAccountsBody({ revision: REVISION }) }));
      expect(response.statusCode).toBe(201);
      expect(mockPostToGateway).toHaveBeenCalled();
    });

    test("refuses a revision without a description and sends nothing", async () => {
      const response = await companiesHouseAccountsPostHandler(
        buildEvent({ body: buildAccountsBody({ revision: { ...REVISION, amendments: "" } }) }),
      );
      expect(response.statusCode).toBe(400);
      expect(JSON.stringify(parseResponseBody(response))).toContain("revision.amendments");
      expect(mockPostToGateway).not.toHaveBeenCalled();
    });
  });

  describe("the receipt revised accounts name", () => {
    const RECEIPT_NAME = "2026-10-24T10:15:00.000Z-00001A.json";
    const REVISION = {
      originalDateOfApproval: "2026-01-10",
      nonCompliance: "A liability was left out.",
      amendments: "Creditors are restated.",
      revisesReceipt: RECEIPT_NAME,
    };
    const ORIGINAL_RECEIPT = {
      kind: "companies-house-accounts",
      statusCode: "ACCEPT",
      submissionNumber: "00001A",
      companyNumber: "00000001",
      filedDocument: filedDocumentFor("2025-01-01", "2025-12-31"),
    };

    function filedDocumentFor(start, end) {
      return `<html><xbrli:context id="y2025"><xbrli:period><xbrli:startDate>${start}</xbrli:startDate><xbrli:endDate>${end}</xbrli:endDate></xbrli:period></xbrli:context><ix:nonNumeric name="bus:EntityCurrentLegalOrRegisteredName" contextRef="y2025">SIMULATOR EXAMPLE COMPANY LIMITED</ix:nonNumeric></html>`;
    }

    async function pendingData() {
      const lib = await import("@aws-sdk/lib-dynamodb");
      const updates = mockSend.mock.calls.map(([cmd]) => cmd).filter((cmd) => cmd instanceof lib.UpdateCommand);
      return updates.find((cmd) => cmd.input.ExpressionAttributeValues[":status"] === "pending").input.ExpressionAttributeValues[":data"];
    }

    test("files revised accounts that name an accepted accounts receipt of the same company, and keeps its name", async () => {
      mockGetReceipt.mockResolvedValue(ORIGINAL_RECEIPT);
      const response = await companiesHouseAccountsPostHandler(buildEvent({ body: buildAccountsBody({ revision: REVISION }) }));
      expect(response.statusCode).toBe(201);
      expect(mockGetReceipt).toHaveBeenCalledWith(expect.any(String), "2026-10-24T10:15:00.000Z-00001A");
      expect(await pendingData()).toMatchObject({ amended: true, revisesReceipt: RECEIPT_NAME });
    });

    test("files revised accounts that name no receipt when the register holds accounts made up to the period's end", async () => {
      const { revisesReceipt, ...withoutReceipt } = REVISION;
      const response = await companiesHouseAccountsPostHandler(buildEvent({ body: buildAccountsBody({ revision: withoutReceipt }) }));
      expect(response.statusCode).toBe(201);
      expect(mockGetReceipt).not.toHaveBeenCalled();
      expect(mockFilingHistory).toHaveBeenCalledWith("00000001", { category: "accounts" });
      expect(await pendingData()).not.toHaveProperty("revisesReceipt");
      expect(revisesReceipt).toBe(RECEIPT_NAME);
    });

    test("reads no register for revised accounts that name a receipt, or for original accounts", async () => {
      mockGetReceipt.mockResolvedValue(ORIGINAL_RECEIPT);
      for (const body of [buildAccountsBody({ revision: REVISION }), buildAccountsBody()]) {
        expect((await companiesHouseAccountsPostHandler(buildEvent({ body }))).statusCode).toBe(201);
      }
      expect(mockFilingHistory).not.toHaveBeenCalled();
    });

    describe("revised accounts that name no receipt", () => {
      const { revisesReceipt, ...WITHOUT_RECEIPT } = REVISION;

      test("are refused with a sentence and a reason when the register holds no accounts made up to the period's end, and nothing is sent", async () => {
        mockFilingHistory.mockResolvedValue(accountsHistory("2024-12-31", "2023-12-31"));
        const response = await companiesHouseAccountsPostHandler(buildEvent({ body: buildAccountsBody({ revision: WITHOUT_RECEIPT }) }));
        expect(response.statusCode).toBe(400);
        expect(parseResponseBody(response)).toMatchObject({
          message:
            "Companies House holds no accounts for this company made up to 31 December 2025, so there are no accounts for revised accounts to replace.",
          reason: "revision-period-not-on-register",
          companyNumber: "00000001",
          periodEnd: "2025-12-31",
        });
        expect(mockPostToGateway).not.toHaveBeenCalled();
        expect(mockAllocateSubmissionNumber).not.toHaveBeenCalled();
      });

      test("are refused for a small company too", async () => {
        mockFilingHistory.mockResolvedValue(accountsHistory());
        const response = await companiesHouseAccountsPostHandler(
          buildEvent({ body: buildSmallCompanyBody({ revision: WITHOUT_RECEIPT }) }),
        );
        expect(response.statusCode).toBe(400);
        expect(parseResponseBody(response).reason).toBe("revision-period-not-on-register");
        expect(mockPostToGateway).not.toHaveBeenCalled();
      });

      test("are refused with a sentence when the register holds no such company, and nothing is sent", async () => {
        mockFilingHistory.mockResolvedValue({ ok: false, status: 404, data: {} });
        const response = await companiesHouseAccountsPostHandler(buildEvent({ body: buildAccountsBody({ revision: WITHOUT_RECEIPT }) }));
        expect(response.statusCode).toBe(400);
        expect(parseResponseBody(response)).toMatchObject({
          message: "Companies House holds no company with the number 00000001, so there are no accounts to revise.",
          reason: "revision-company-not-on-register",
        });
        expect(mockPostToGateway).not.toHaveBeenCalled();
      });

      test("are not filed when the register cannot be read, and the answer is the failed read", async () => {
        mockFilingHistory.mockResolvedValue({ ok: false, status: 429, data: {}, headers: { "retry-after": "30" } });
        const response = await companiesHouseAccountsPostHandler(buildEvent({ body: buildAccountsBody({ revision: WITHOUT_RECEIPT }) }));
        expect(response.statusCode).toBe(429);
        expect(response.headers["Content-Type"]).toBe("application/json");
        expect(mockPostToGateway).not.toHaveBeenCalled();
      });

      test("are filed without a register read where the accounts go to the Companies House test service", async () => {
        process.env.COMPANIES_HOUSE_GATEWAY_TEST = "true";
        mockFilingHistory.mockResolvedValue(accountsHistory());
        const response = await companiesHouseAccountsPostHandler(buildEvent({ body: buildAccountsBody({ revision: WITHOUT_RECEIPT }) }));
        expect(response.statusCode).toBe(201);
        expect(mockFilingHistory).not.toHaveBeenCalled();
      });
    });

    const refusals = [
      ["a receipt not found in this account", null, "is not in your account"],
      ["a receipt that is not accounts", { ...ORIGINAL_RECEIPT, kind: "company-tax-return" }, "not an accounts filing"],
      ["accounts Companies House did not accept", { ...ORIGINAL_RECEIPT, statusCode: "REJECT" }, "did not accept those accounts"],
      ["accounts filed with a Company Tax Return", { ...ORIGINAL_RECEIPT, jointFilingId: "joint-1" }, "Company Tax Return page"],
      ["accounts that are already revised accounts", { ...ORIGINAL_RECEIPT, amended: true }, "already revised accounts"],
      ["accounts whose filed document was not kept", { ...ORIGINAL_RECEIPT, filedDocument: undefined }, "was not kept"],
      ["accounts of another company", { ...ORIGINAL_RECEIPT, companyNumber: "00000009" }, "for another company"],
      [
        "accounts for another period",
        { ...ORIGINAL_RECEIPT, filedDocument: filedDocumentFor("2024-01-01", "2024-12-31") },
        "The accounts the receipt names are for the period 2024-01-01 to 2024-12-31, so revised accounts for 2025-01-01 to 2025-12-31 cannot replace them.",
      ],
    ];
    for (const [name, receipt, sentence] of refusals) {
      test(`refuses revised accounts that name ${name}, with a sentence, and sends nothing`, async () => {
        mockGetReceipt.mockResolvedValue(receipt);
        const response = await companiesHouseAccountsPostHandler(buildEvent({ body: buildAccountsBody({ revision: REVISION }) }));
        expect(response.statusCode).toBe(400);
        expect(JSON.stringify(parseResponseBody(response))).toContain(sentence);
        expect(mockPostToGateway).not.toHaveBeenCalled();
      });
    }

    test("refuses a receipt name that is not a stored receipt's name", async () => {
      const response = await companiesHouseAccountsPostHandler(
        buildEvent({ body: buildAccountsBody({ revision: { ...REVISION, revisesReceipt: "../other/receipt" } }) }),
      );
      expect(response.statusCode).toBe(400);
      expect(JSON.stringify(parseResponseBody(response))).toContain("revision.revisesReceipt");
      expect(mockGetReceipt).not.toHaveBeenCalled();
    });
  });

  describe("the first accounts of a micro-entity", () => {
    const firstAccountsBody = () => {
      const body = buildAccountsBody({ dateOfIncorporation: "2025-01-01" });
      delete body.balanceSheet.priorYear;
      return body;
    };

    test("files first accounts with one year, marked with the date of incorporation", async () => {
      const response = await companiesHouseAccountsPostHandler(buildEvent({ body: firstAccountsBody() }));
      expect(response.statusCode).toBe(201);
      const [input] = mockBuildMicroEntityAccounts.mock.calls[0];
      expect(input.dateOfIncorporation).toBe("2025-01-01");
      expect(input.balanceSheet.prior).toBeUndefined();
    });

    test("refuses accounts with no prior year that are not first accounts, and first accounts that carry one or start late", async () => {
      const noPrior = firstAccountsBody();
      delete noPrior.dateOfIncorporation;
      const late = { ...firstAccountsBody(), dateOfIncorporation: "2024-12-01" };
      const withPrior = buildAccountsBody({ dateOfIncorporation: "2025-01-01" });
      const answers = [];
      for (const body of [noPrior, late, withPrior]) {
        const response = await companiesHouseAccountsPostHandler(buildEvent({ body }));
        expect(response.statusCode).toBe(400);
        answers.push(JSON.stringify(parseResponseBody(response)));
      }
      expect(answers[0]).toContain("priorYear");
      expect(answers[1]).toContain("dateOfIncorporation must equal periodStart");
      expect(answers[2]).toContain("which have no preceding year");
      expect(mockPostToGateway).not.toHaveBeenCalled();
    });

    test("refuses one year for an established company that names its period's start as the incorporation date, and sends nothing", async () => {
      for (const profile of [
        { dateOfCreation: "2019-06-01", accountsLastPeriodStart: "2024-01-01" },
        { dateOfCreation: "2025-01-01", accountsLastPeriodStart: "2024-01-01", accountsLastPeriodEnd: "2024-12-31" },
      ]) {
        mockGetCompanyProfile.mockResolvedValue({ profile });
        const response = await companiesHouseAccountsPostHandler(buildEvent({ body: firstAccountsBody() }));
        expect(response.statusCode).toBe(400);
        expect(JSON.stringify(parseResponseBody(response))).toContain("must show the prior year");
      }
      expect(mockGetCompanyProfile).toHaveBeenCalledWith("00000001");
      expect(mockPostToGateway).not.toHaveBeenCalled();
    });

    test("refuses one year for an established company that names a period from its incorporation to its latest year end", async () => {
      mockGetCompanyProfile.mockResolvedValue({
        profile: { dateOfCreation: "2019-06-01", accountsLastPeriodStart: "2024-01-01", accountsLastPeriodEnd: "2024-12-31" },
      });
      const body = { ...firstAccountsBody(), dateOfIncorporation: "2019-06-01", periodStart: "2019-06-01", periodEnd: "2025-12-31" };
      const response = await companiesHouseAccountsPostHandler(buildEvent({ body }));
      expect(response.statusCode).toBe(400);
      expect(JSON.stringify(parseResponseBody(response))).toContain("longer than a first financial year can");
      expect(mockPostToGateway).not.toHaveBeenCalled();
    });

    test("files the revision of first accounts after the register holds a later year", async () => {
      mockGetCompanyProfile.mockResolvedValue({
        profile: { dateOfCreation: "2025-01-01", accountsLastPeriodStart: "2026-01-01", accountsLastPeriodEnd: "2026-12-31" },
      });
      expect((await companiesHouseAccountsPostHandler(buildEvent({ body: firstAccountsBody() }))).statusCode).toBe(201);
    });

    test("files the revision of first accounts, which the register holds as the last accounts for the same period", async () => {
      mockGetCompanyProfile.mockResolvedValue({ profile: { dateOfCreation: "2025-01-01", accountsLastPeriodStart: "2025-01-01" } });
      expect((await companiesHouseAccountsPostHandler(buildEvent({ body: firstAccountsBody() }))).statusCode).toBe(201);
    });

    test("answers a JSON 502 when the register cannot be read, passes on the register's failed answer, and refuses a company it does not hold, sending nothing", async () => {
      mockGetCompanyProfile.mockRejectedValue(new Error("Missing required environment variable COMPANIES_HOUSE_BASE_URI"));
      const unread = await companiesHouseAccountsPostHandler(buildEvent({ body: firstAccountsBody() }));
      expect(unread.statusCode).toBe(502);
      expect(parseResponseBody(unread)).toMatchObject({ reason: "company-profile-not-read" });
      mockGetCompanyProfile.mockResolvedValue({ chResponse: { ok: false, status: 500 }, profile: null });
      expect((await companiesHouseAccountsPostHandler(buildEvent({ body: firstAccountsBody() }))).statusCode).toBe(500);
      mockGetCompanyProfile.mockResolvedValue({ chResponse: { ok: false, status: 404 }, profile: null });
      expect((await companiesHouseAccountsPostHandler(buildEvent({ body: firstAccountsBody() }))).statusCode).toBe(400);
      expect(mockPostToGateway).not.toHaveBeenCalled();
    });

    test("an established company's two years are filed as they are, with no date of incorporation", async () => {
      await companiesHouseAccountsPostHandler(buildEvent({ body: buildAccountsBody() }));
      const [input] = mockBuildMicroEntityAccounts.mock.calls[0];
      expect(input.dateOfIncorporation).toBeUndefined();
      expect(input.balanceSheet.prior).toBeDefined();
    });
  });

  describe("an advance to someone who is not a director", () => {
    const ADVANCE = { name: "Sam Lender", terms: "Interest free", balanceAtStart: 0, advanced: 0, repaid: 0, balanceAtEnd: 0 };
    const SENTENCE = "names Sam Lender, who is not among the directors of these accounts: add them to the directors";

    test("refuses micro-entity accounts with a sentence that says an advance names the director who signs them, and sends nothing", async () => {
      const body = buildAccountsBody({ directorsAdvances: [ADVANCE] });
      const response = await companiesHouseAccountsPostHandler(buildEvent({ body }));
      expect(response.statusCode).toBe(400);
      const answer = JSON.stringify(parseResponseBody(response));
      expect(answer).toContain(
        `directorsAdvances[0] names Sam Lender: on micro-entity accounts an advance names the director who signs the accounts, ${body.director.name}`,
      );
      expect(answer).not.toContain(SENTENCE);
      expect(mockPostToGateway).not.toHaveBeenCalled();
    });

    test("refuses small company accounts and revised small company accounts with the same sentence", async () => {
      for (const extra of [{}, { revision: { originalDateOfApproval: "2026-01-10", nonCompliance: "A", amendments: "B" } }]) {
        const response = await companiesHouseAccountsPostHandler(
          buildEvent({ body: buildSmallCompanyBody(extra, { directorsAdvances: [ADVANCE] }) }),
        );
        expect(response.statusCode).toBe(400);
        expect(JSON.stringify(parseResponseBody(response))).toContain(`smallCompany.directorsAdvances[0] ${SENTENCE}`);
      }
      expect(mockPostToGateway).not.toHaveBeenCalled();
    });
  });

  describe("the date the directors approved the accounts", () => {
    const AFTER_TODAY = "2099-01-01";
    const SENTENCE = `The date approved, ${AFTER_TODAY}, is after today. Enter the date the directors approved the accounts.`;

    test("refuses micro-entity accounts approved after today, with a sentence that names the date, and sends nothing", async () => {
      const response = await companiesHouseAccountsPostHandler(
        buildEvent({ body: buildAccountsBody({ director: { name: "Jo Director", dateApproved: AFTER_TODAY } }) }),
      );
      expect(response.statusCode).toBe(400);
      expect(JSON.stringify(parseResponseBody(response))).toContain(SENTENCE);
      expect(mockPostToGateway).not.toHaveBeenCalled();
    });

    test("refuses small company accounts approved after today", async () => {
      const response = await companiesHouseAccountsPostHandler(
        buildEvent({ body: buildSmallCompanyBody({ director: { name: "Jo Director", dateApproved: AFTER_TODAY } }) }),
      );
      expect(response.statusCode).toBe(400);
      expect(JSON.stringify(parseResponseBody(response))).toContain(SENTENCE);
    });

    test("refuses revised accounts approved after today", async () => {
      const revision = { originalDateOfApproval: "2026-01-10", nonCompliance: "A", amendments: "B" };
      const response = await companiesHouseAccountsPostHandler(
        buildEvent({ body: buildAccountsBody({ revision, director: { name: "Jo Director", dateApproved: AFTER_TODAY } }) }),
      );
      expect(response.statusCode).toBe(400);
      expect(JSON.stringify(parseResponseBody(response))).toContain(SENTENCE);
    });

    test("files accounts approved today", async () => {
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
      const response = await companiesHouseAccountsPostHandler(
        buildEvent({ body: buildAccountsBody({ director: { name: "Jo Director", dateApproved: today } }) }),
      );
      expect(response.statusCode).toBe(201);
    });
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
        return { Items: [{ bundleId: "resident-tax-agent", subscriptionStatus: "active", tokensGranted: "unlimited" }], Count: 1 };
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
    delete process.env.COMPANIES_HOUSE_GATEWAY_TEST;
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
    mockStopValue.mockResolvedValue(undefined);
    // The register shows a company incorporated on the default body's period start, with no accounts filed.
    mockGetCompanyProfile.mockResolvedValue({ profile: { jurisdiction: "england-wales", dateOfCreation: "2025-01-01" } });
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

  test("checks a client's revised accounts with no receipt against the client's company, whatever company the body names", async () => {
    delete process.env.COMPANIES_HOUSE_GATEWAY_TEST;
    mockPracticeAndClient({
      clientId: "c1",
      identifiers: { companyNumber: "00000099" },
      authorisations: { "CH-ACCOUNTS": { status: "authorised" } },
      archivedAt: null,
    });
    // The company the body names holds accounts for the period; the client's company holds none.
    mockFilingHistory.mockImplementation(async (companyNumber) => accountsHistory(...(companyNumber === "00000001" ? ["2025-12-31"] : [])));
    const revision = {
      originalDateOfApproval: "2026-01-10",
      nonCompliance: "The turnover was understated.",
      amendments: "Turnover is restated.",
    };

    const response = await companiesHouseAccountsPostHandler(
      buildEvent({ body: buildAccountsBody({ clientId: "c1", companyNumber: "00000001", revision }) }),
    );

    expect(mockFilingHistory).toHaveBeenCalledWith("00000099", { category: "accounts" });
    expect(mockFilingHistory).not.toHaveBeenCalledWith("00000001", expect.anything());
    expect(response.statusCode).toBe(400);
    expect(parseResponseBody(response)).toMatchObject({ reason: "revision-period-not-on-register", companyNumber: "00000099" });
    expect(mockPostToGateway).not.toHaveBeenCalled();
  });

  test("keeps the client id on the pending request, so the receipt of an accepted filing is the client's", async () => {
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
    const lib = await import("@aws-sdk/lib-dynamodb");
    const pending = mockSend.mock.calls
      .map(([cmd]) => cmd)
      .find((cmd) => cmd instanceof lib.UpdateCommand && cmd.input.ExpressionAttributeValues?.[":status"] === "pending");
    expect(pending.input.ExpressionAttributeValues[":data"].clientId).toBe("c1");
  });

  test("keeps no client id on the pending request of the practice's own filing", async () => {
    const response = await companiesHouseAccountsPostHandler(buildEvent({ body: buildAccountsBody() }));

    expect(response.statusCode).toBe(201);
    const lib = await import("@aws-sdk/lib-dynamodb");
    const pending = mockSend.mock.calls
      .map(([cmd]) => cmd)
      .find((cmd) => cmd instanceof lib.UpdateCommand && cmd.input.ExpressionAttributeValues?.[":status"] === "pending");
    expect(pending.input.ExpressionAttributeValues[":data"]).not.toHaveProperty("clientId");
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

  describe("authorisation by a codes entry", () => {
    const unauthorisedClient = {
      clientId: "c1",
      identifiers: { companyNumber: "00000099" },
      authorisations: {},
      archivedAt: null,
    };

    function fileWithEntry(overrides = {}) {
      const body = buildAccountsBody({ clientId: "c1", codesEntryId: "entry-1", ...overrides });
      delete body.companyNumber;
      delete body.companyAuthCode;
      return companiesHouseAccountsPostHandler(buildEvent({ body }));
    }

    beforeEach(() => {
      mockTakeCodesEntry.mockResolvedValue(null);
      mockTakeCodesEntryForClient.mockResolvedValue(null);
    });

    test("accepts a client without the CH-ACCOUNTS key when the batch entry holds that client's codes", async () => {
      mockPracticeAndClient(unauthorisedClient);
      mockTakeCodesEntryForClient.mockResolvedValue({ kind: "accounts", directors: [], sealed: "sealed" });

      const response = await fileWithEntry();

      expect(response.statusCode).toBe(201);
      expect(mockTakeCodesEntryForClient).toHaveBeenCalledWith("entry-1", expect.any(String), "c1");
      expect(mockBuildAccountsSubmission.mock.calls[0][0].companyNumber).toBe("00000099");
      expect(mockPostToGateway).toHaveBeenCalled();
    });

    test("accepts a client without the CH-ACCOUNTS key when a single entry was minted for the client's company", async () => {
      mockPracticeAndClient(unauthorisedClient);
      mockTakeCodesEntry.mockResolvedValue({ kind: "accounts", companyNumber: "00000099", directors: [], sealed: "sealed" });

      const response = await fileWithEntry();

      expect(response.statusCode).toBe(201);
    });

    test("refuses a client without the CH-ACCOUNTS key when the request carries no codes entry", async () => {
      mockPracticeAndClient(unauthorisedClient);

      const response = await companiesHouseAccountsPostHandler(buildEvent({ body: buildAccountsBody({ clientId: "c1" }) }));

      expect(response.statusCode).toBe(403);
      expect(parseResponseBody(response).code).toBe("client-not-authorised");
      expect(mockTakeCodesEntry).not.toHaveBeenCalled();
      expect(mockPostToGateway).not.toHaveBeenCalled();
    });

    test("refuses an entry that is unknown, expired, consumed or another user's", async () => {
      mockPracticeAndClient(unauthorisedClient);

      const response = await fileWithEntry();

      expect(response.statusCode).toBe(400);
      expect(JSON.stringify(parseResponseBody(response))).toContain("codesEntryId names no entry");
      expect(mockPostToGateway).not.toHaveBeenCalled();
    });

    test("refuses an entry whose kind is not accounts", async () => {
      mockPracticeAndClient(unauthorisedClient);
      mockTakeCodesEntryForClient.mockResolvedValue({ kind: "confirmation-statement-data", directors: [], sealed: "sealed" });

      const response = await fileWithEntry();

      expect(response.statusCode).toBe(400);
      expect(mockPostToGateway).not.toHaveBeenCalled();
    });

    test("refuses a single entry minted for another company number", async () => {
      mockPracticeAndClient(unauthorisedClient);
      mockTakeCodesEntry.mockResolvedValue({ kind: "accounts", companyNumber: "00000100", directors: [], sealed: "sealed" });

      const response = await fileWithEntry();

      expect(response.statusCode).toBe(400);
      expect(JSON.stringify(parseResponseBody(response))).toContain("another company number");
      expect(mockPostToGateway).not.toHaveBeenCalled();
    });

    test("refuses a single entry when the client row names no company number", async () => {
      mockPracticeAndClient({ ...unauthorisedClient, identifiers: {} });
      mockTakeCodesEntry.mockResolvedValue({ kind: "accounts", companyNumber: "00000099", directors: [], sealed: "sealed" });

      const response = await fileWithEntry();

      expect(response.statusCode).toBe(400);
      expect(mockPostToGateway).not.toHaveBeenCalled();
    });

    test("refuses codes sent in the body together with a codes entry", async () => {
      mockPracticeAndClient(unauthorisedClient);

      const response = await companiesHouseAccountsPostHandler(
        buildEvent({ body: buildAccountsBody({ clientId: "c1", codesEntryId: "entry-1" }) }),
      );

      expect(response.statusCode).toBe(400);
      expect(mockPostToGateway).not.toHaveBeenCalled();
    });
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
      if (cmd instanceof lib.QueryCommand)
        return { Items: [{ bundleId: "resident-pro", subscriptionStatus: "active", tokensGranted: 100, tokensConsumed: 0 }], Count: 1 };
      return {};
    });

    const response = await companiesHouseAccountsPostHandler(buildEvent());

    expect(response.statusCode).toBe(201);
    const [generatorInput] = mockBuildMicroEntityAccounts.mock.calls[0];
    expect(generatorInput.companyNumber).toBe("00000001");
  });

  describe("the token balance", () => {
    const JOINT_FILING_ID = "7d1c0f0e-5a3b-4c8e-9f21-0a6b3c9d4e11";
    function holdBundle(bundle) {
      mockSend.mockImplementation(async (cmd) => {
        const lib = await import("@aws-sdk/lib-dynamodb");
        if (cmd instanceof lib.QueryCommand) return { Items: [{ subscriptionStatus: "active", ...bundle }], Count: 1 };
        return {};
      });
    }

    test("refuses with 403 tokens_exhausted and sends nothing when no token is left", async () => {
      holdBundle({ bundleId: "resident-pro", tokensGranted: 100, tokensConsumed: 100 });
      const response = await companiesHouseAccountsPostHandler(buildEvent());
      expect(response.statusCode).toBe(403);
      expect(parseResponseBody(response)).toMatchObject({ message: "Token limit reached", reason: "tokens_exhausted", tokensRemaining: 0 });
      expect(mockPostToGateway).not.toHaveBeenCalled();
      expect(mockAllocateSubmissionNumber).not.toHaveBeenCalled();
    });

    test("refuses a small company filing the same way", async () => {
      holdBundle({ bundleId: "resident-pro", tokensGranted: 100, tokensConsumed: 100 });
      const response = await companiesHouseAccountsPostHandler(buildEvent({ body: buildSmallCompanyBody() }));
      expect(response.statusCode).toBe(403);
      expect(mockPostToGateway).not.toHaveBeenCalled();
    });

    test("sends the filing when one token is left", async () => {
      holdBundle({ bundleId: "resident-pro", tokensGranted: 100, tokensConsumed: 99 });
      const response = await companiesHouseAccountsPostHandler(buildEvent());
      expect(response.statusCode).toBe(201);
    });

    test("refuses a joint filing with one token left, charges nothing and sends nothing", async () => {
      holdBundle({ bundleId: "resident-pro", tokensGranted: 100, tokensConsumed: 99 });
      const response = await companiesHouseAccountsPostHandler(buildEvent({ body: buildAccountsBody({ jointFilingId: JOINT_FILING_ID }) }));
      expect(response.statusCode).toBe(403);
      expect(parseResponseBody(response)).toMatchObject({ reason: "tokens_exhausted", tokensRemaining: 1, tokenCost: 2 });
      expect(mockPostToGateway).not.toHaveBeenCalled();
      expect(mockAllocateSubmissionNumber).not.toHaveBeenCalled();
    });

    test("sends a joint filing when two tokens are left", async () => {
      holdBundle({ bundleId: "resident-pro", tokensGranted: 100, tokensConsumed: 98 });
      const response = await companiesHouseAccountsPostHandler(buildEvent({ body: buildAccountsBody({ jointFilingId: JOINT_FILING_ID }) }));
      expect(response.statusCode).toBe(201);
    });

    test("sends the filing for an unlimited grant whatever it has consumed", async () => {
      holdBundle({ bundleId: "resident-tax-agent", tokensGranted: "unlimited", tokensConsumed: 5000 });
      const response = await companiesHouseAccountsPostHandler(buildEvent());
      expect(response.statusCode).toBe(201);
    });
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
      expect(submissionArgs.ixbrl).not.toContain('name="direp:DirectorSigningDirectorsReport"');
    });

    test("filing is full accounts when filleted is not given", async () => {
      await companiesHouseAccountsPostHandler(buildEvent({ body: buildSmallCompanyBody() }));
      const [submissionArgs] = mockBuildAccountsSubmission.mock.calls[0];
      expect(submissionArgs.ixbrl).not.toContain("section 444(5A)");
    });

    test("comparatives render when supplied", async () => {
      const body = buildSmallCompanyBody();
      delete body.smallCompany.dateOfIncorporation;
      body.smallCompany.balanceSheet.priorYear = { ...body.smallCompany.balanceSheet.currentYear };
      body.smallCompany.profitAndLoss.priorYear = { ...body.smallCompany.profitAndLoss.currentYear };
      await companiesHouseAccountsPostHandler(buildEvent({ body }));
      const [submissionArgs] = mockBuildAccountsSubmission.mock.calls[0];
      expect(submissionArgs.ixbrl).toContain('contextRef="y2024"');
      expect(submissionArgs.ixbrl).toContain('contextRef="e2024"');
      expect(submissionArgs.ixbrl).not.toContain("bus:DateFormationOrIncorporation");
    });

    test("refuses accounts that are not the company's first and leave out the prior year's balance sheet", async () => {
      const body = buildSmallCompanyBody();
      delete body.smallCompany.dateOfIncorporation;
      const response = await companiesHouseAccountsPostHandler(buildEvent({ body }));
      expect(response.statusCode).toBe(400);
      expect(JSON.stringify(parseResponseBody(response))).toContain("smallCompany.balanceSheet.priorYear is required");
      expect(mockPostToGateway).not.toHaveBeenCalled();
    });

    test("refuses one year of small company accounts when the register holds accounts filed before", async () => {
      mockGetCompanyProfile.mockResolvedValue({
        profile: { dateOfCreation: "2025-01-01", accountsLastPeriodStart: "2024-01-01", accountsLastPeriodEnd: "2024-12-31" },
      });
      const response = await companiesHouseAccountsPostHandler(buildEvent({ body: buildSmallCompanyBody() }));
      expect(response.statusCode).toBe(400);
      expect(JSON.stringify(parseResponseBody(response))).toContain("must show the prior year");
      expect(mockPostToGateway).not.toHaveBeenCalled();
    });

    test("refuses first accounts that do not start on the day of incorporation, or that carry a prior year", async () => {
      const late = buildSmallCompanyBody();
      late.smallCompany.dateOfIncorporation = "2024-06-01";
      const lateAnswer = JSON.stringify(parseResponseBody(await companiesHouseAccountsPostHandler(buildEvent({ body: late }))));
      expect(lateAnswer).toContain("smallCompany.dateOfIncorporation must equal periodStart");
      const withPrior = buildSmallCompanyBody();
      withPrior.smallCompany.balanceSheet.priorYear = { ...withPrior.smallCompany.balanceSheet.currentYear };
      const priorAnswer = JSON.stringify(parseResponseBody(await companiesHouseAccountsPostHandler(buildEvent({ body: withPrior }))));
      expect(priorAnswer).toContain("which have no preceding year");
      expect(mockPostToGateway).not.toHaveBeenCalled();
    });

    test("refuses first accounts for a company the register shows has filed accounts before", async () => {
      mockGetCompanyProfile.mockResolvedValue({
        profile: { dateOfCreation: "2025-01-01", accountsLastPeriodStart: "2024-01-01", accountsLastPeriodEnd: "2024-12-31" },
      });
      const response = await companiesHouseAccountsPostHandler(buildEvent({ body: buildSmallCompanyBody() }));
      expect(response.statusCode).toBe(400);
      expect(JSON.stringify(parseResponseBody(response))).toContain("Companies House does not hold these as the company's first accounts");
      expect(mockPostToGateway).not.toHaveBeenCalled();
    });

    test("refuses first accounts when the register's last accounts give only their end, and it is before the period", async () => {
      mockGetCompanyProfile.mockResolvedValue({ profile: { dateOfCreation: "2025-01-01", accountsLastPeriodEnd: "2024-12-31" } });
      const response = await companiesHouseAccountsPostHandler(buildEvent({ body: buildSmallCompanyBody() }));
      expect(response.statusCode).toBe(400);
      expect(JSON.stringify(parseResponseBody(response))).toContain("Companies House does not hold these as the company's first accounts");
      expect(mockPostToGateway).not.toHaveBeenCalled();
    });

    test("refuses first accounts whose period does not start on the date of incorporation in the register", async () => {
      mockGetCompanyProfile.mockResolvedValue({ profile: { dateOfCreation: "2015-03-01" } });
      const response = await companiesHouseAccountsPostHandler(buildEvent({ body: buildSmallCompanyBody() }));
      expect(response.statusCode).toBe(400);
      expect(JSON.stringify(parseResponseBody(response))).toContain("Companies House does not hold these as the company's first accounts");
      expect(mockPostToGateway).not.toHaveBeenCalled();
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

describe("readRegisteredOffice", () => {
  test("trims the parts and leaves an absent office absent", () => {
    const errors = [];
    expect(readRegisteredOffice({ addressLine1: " 1 High Street ", cityOrTown: "Leeds", postalCode: "" }, errors)).toEqual({
      addressLine1: "1 High Street",
      cityOrTown: "Leeds",
    });
    expect(readRegisteredOffice(undefined, errors)).toBeUndefined();
    expect(errors).toEqual([]);
  });

  test("refuses a field outside the address parts, a non-string value, a missing addressLine1 and a string office", () => {
    const unknownField = [];
    readRegisteredOffice({ addressLine1: "1 High Street", street: "x" }, unknownField);
    expect(unknownField).toEqual(["Invalid registeredOffice.street"]);
    const notString = [];
    readRegisteredOffice({ addressLine1: 4 }, notString);
    expect(notString).toContain("Invalid registeredOffice.addressLine1");
    const missing = [];
    readRegisteredOffice({ cityOrTown: "Leeds" }, missing);
    expect(missing).toEqual(["Missing registeredOffice.addressLine1"]);
    const text = [];
    readRegisteredOffice("1 High Street, Leeds", text);
    expect(text).toEqual(["Invalid registeredOffice - must be an object of address parts"]);
  });
});

describe("readAccountantsReport", () => {
  test("trims both fields and leaves an absent report absent", () => {
    const errors = [];
    expect(readAccountantsReport({ accountantsName: " Test Firm LLP ", statement: " We compiled these. " }, errors)).toEqual({
      accountantsName: "Test Firm LLP",
      statement: "We compiled these.",
    });
    expect(readAccountantsReport(undefined, errors)).toBeUndefined();
    expect(errors).toEqual([]);
  });

  test("refuses a missing field and a non-object", () => {
    const errors = [];
    readAccountantsReport({ accountantsName: "Test Firm LLP" }, errors);
    expect(errors).toEqual(["Missing accountantsReport.statement"]);
    const text = [];
    readAccountantsReport("Test Firm LLP", text);
    expect(text).toEqual(["Invalid accountantsReport - must be an object"]);
  });
});

describe("the advance to the director of a micro-entity accounts request", () => {
  const ADVANCE = {
    name: "Jo Director",
    terms: "Interest free and repayable on demand",
    balanceAtStart: 200,
    advanced: 1000,
    repaid: 400,
    balanceAtEnd: 800,
  };
  const accountsOf = (overrides) => {
    const errors = [];
    const accounts = extractAndValidateAccountsParameters({ body: JSON.stringify(buildAccountsBody(overrides)) }, errors);
    return { accounts, errors };
  };

  test("carries the advance the form sends", () => {
    const { accounts, errors } = accountsOf({ directorsAdvances: [ADVANCE] });
    expect(errors).toEqual([]);
    expect(accounts.directorsAdvances).toEqual([ADVANCE]);
  });

  test("carries no advance when the form sends none", () => {
    const { accounts, errors } = accountsOf({});
    expect(errors).toEqual([]);
    expect(accounts.directorsAdvances).toBeUndefined();
  });

  test("refuses an advance whose figures do not add up, or that gives no terms", () => {
    expect(accountsOf({ directorsAdvances: [{ ...ADVANCE, balanceAtEnd: 900 }] }).errors).toEqual([
      "directorsAdvances[0].balanceAtEnd must equal balanceAtStart plus advanced less repaid",
    ]);
    expect(accountsOf({ directorsAdvances: [{ ...ADVANCE, terms: "" }] }).errors).toEqual([
      "directorsAdvances[0].terms is required: state the interest rate and the main conditions",
    ]);
  });
});
