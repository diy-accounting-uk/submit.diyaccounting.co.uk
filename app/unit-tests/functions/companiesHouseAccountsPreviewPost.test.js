// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/companiesHouseAccountsPreviewPost.test.js
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

import { ingestHandler as companiesHouseAccountsPreviewPostHandler } from "@app/functions/companies-house/companiesHouseAccountsPreviewPost.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

function buildAccountsBody(overrides = {}) {
  return {
    companyNumber: "00000001",
    companyName: "SIMULATOR EXAMPLE COMPANY LIMITED",
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
    path: "/api/v1/companies-house/accounts/preview",
    body,
    headers: { Authorization: "Bearer test-cognito-token", ...headers },
  };
  if (authorizer !== undefined) options.authorizer = authorizer;
  return buildLambdaEvent(options);
}

describe("companiesHouseAccountsPreviewPost ingestHandler", () => {
  beforeEach(() => {
    Object.assign(
      process.env,
      setupTestEnv({
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
  });

  test("returns the generated iXBRL and never touches the gateway", async () => {
    const response = await companiesHouseAccountsPreviewPostHandler(buildEvent());
    expect(response.statusCode).toBe(200);
    const body = parseResponseBody(response);
    expect(body.ixbrl).toContain("fake ixbrl");
    expect(mockBuildMicroEntityAccounts).toHaveBeenCalledTimes(1);
  });

  test("passes the balance sheet through to the generator without a company authentication code", async () => {
    await companiesHouseAccountsPreviewPostHandler(buildEvent());
    const [input] = mockBuildMicroEntityAccounts.mock.calls[0];
    expect(input.companyNumber).toBe("00000001");
    expect(input.balanceSheet.current.fixedAssets).toBe(1000);
    expect(input.companyAuthCode).toBeUndefined();
  });

  test("rejects an invalid company number with 400", async () => {
    const response = await companiesHouseAccountsPreviewPostHandler(buildEvent({ body: buildAccountsBody({ companyNumber: "bad" }) }));
    expect(response.statusCode).toBe(400);
    expect(mockBuildMicroEntityAccounts).not.toHaveBeenCalled();
  });

  test("rejects a balance sheet where capital and reserves does not equal net assets", async () => {
    const body = buildAccountsBody();
    body.balanceSheet.currentYear.capitalAndReserves = 9999;
    const response = await companiesHouseAccountsPreviewPostHandler(buildEvent({ body }));
    expect(response.statusCode).toBe(400);
    const responseBody = parseResponseBody(response);
    expect(responseBody.message).toContain("net assets");
  });

  test("rejects when a required statement is not accepted", async () => {
    const body = buildAccountsBody();
    body.statementsAccepted.microEntityProvisions = false;
    const response = await companiesHouseAccountsPreviewPostHandler(buildEvent({ body }));
    expect(response.statusCode).toBe(400);
    const responseBody = parseResponseBody(response);
    expect(responseBody.message).toContain("microEntityProvisions");
  });

  describe("dormant filings", () => {
    test("passes the dormant flag, trading status, share class and nominal value to the generator", async () => {
      const response = await companiesHouseAccountsPreviewPostHandler(buildEvent({ body: buildDormantBody() }));
      expect(response.statusCode).toBe(200);
      const [input] = mockBuildMicroEntityAccounts.mock.calls[0];
      expect(input).toMatchObject({
        dormant: true,
        dormantTradingStatus: "noLongerTrading",
        shareClass: "ordinaryShares",
        nominalValue: 1,
      });
    });

    test("leaves the dormant fields off a filing that does not tick dormant", async () => {
      await companiesHouseAccountsPreviewPostHandler(buildEvent());
      const [input] = mockBuildMicroEntityAccounts.mock.calls[0];
      expect(input.dormant).toBeUndefined();
      expect(input.shareClass).toBeUndefined();
    });

    test("rejects a dormant filing whose profit and loss account moved in the period", async () => {
      const body = buildDormantBody();
      body.balanceSheet.currentYear.profitAndLossAccount += 50;
      body.balanceSheet.currentYear.capitalAndReserves += 50;
      body.balanceSheet.currentYear.currentAssets += 50;
      const response = await companiesHouseAccountsPreviewPostHandler(buildEvent({ body }));
      expect(response.statusCode).toBe(400);
      expect(parseResponseBody(response).message).toContain("dormant company cannot report a profit or loss");
      expect(mockBuildMicroEntityAccounts).not.toHaveBeenCalled();
    });

    test("rejects a dormant filing with no share class, trading status or nominal value", async () => {
      const response = await companiesHouseAccountsPreviewPostHandler(
        buildEvent({ body: buildDormantBody({ shareClass: undefined, dormantTradingStatus: undefined, nominalValue: undefined }) }),
      );
      expect(response.statusCode).toBe(400);
      const message = parseResponseBody(response).message;
      expect(message).toContain("shareClass");
      expect(message).toContain("dormantTradingStatus");
      expect(message).toContain("nominalValue");
    });

    test("rejects a nominal value that does not divide the called up share capital into whole shares", async () => {
      const response = await companiesHouseAccountsPreviewPostHandler(buildEvent({ body: buildDormantBody({ nominalValue: 30 }) }));
      expect(response.statusCode).toBe(400);
      expect(parseResponseBody(response).message).toContain("whole number of shares");
    });
  });

  describe("small company filings", () => {
    test("returns the small company iXBRL without the micro-entity builder or a company authentication code", async () => {
      const body = buildSmallCompanyBody();
      delete body.companyAuthCode;
      const response = await companiesHouseAccountsPreviewPostHandler(buildEvent({ body }));
      expect(response.statusCode).toBe(200);
      const ixbrl = parseResponseBody(response).ixbrl;
      expect(ixbrl).toContain('name="core:ProfitLoss"');
      expect(ixbrl).toContain("Software consultancy");
      expect(mockBuildMicroEntityAccounts).not.toHaveBeenCalled();
    });

    test("filleted previews carry the section 444(5A) statement and no profit and loss account", async () => {
      const response = await companiesHouseAccountsPreviewPostHandler(buildEvent({ body: buildSmallCompanyBody({}, { filleted: true }) }));
      const ixbrl = parseResponseBody(response).ixbrl;
      expect(ixbrl).toContain("section 444(5A)");
      expect(ixbrl).not.toContain('name="core:ProfitLoss"');
    });

    test("rejects figures that do not hold together", async () => {
      const body = buildSmallCompanyBody();
      body.smallCompany.profitAndLoss.currentYear.grossProfit = 1;
      const response = await companiesHouseAccountsPreviewPostHandler(buildEvent({ body }));
      expect(response.statusCode).toBe(400);
      expect(parseResponseBody(response).message).toContain("grossProfit must equal turnover less costOfSales");
    });
  });

  test("returns 401 when the Cognito bearer token is missing", async () => {
    const response = await companiesHouseAccountsPreviewPostHandler(buildEvent({ authorizer: {} }));
    expect(response.statusCode).toBe(401);
    expect(mockBuildMicroEntityAccounts).not.toHaveBeenCalled();
  });

  test("returns 403 when the environment does not list the matched activity", async () => {
    process.env.ENVIRONMENT_NAME = "not-a-listed-environment";
    const response = await companiesHouseAccountsPreviewPostHandler(buildEvent());
    expect(response.statusCode).toBe(403);
    expect(mockBuildMicroEntityAccounts).not.toHaveBeenCalled();
  });

  test("returns 200 with an empty object for a HEAD request", async () => {
    const response = await companiesHouseAccountsPreviewPostHandler(buildEvent({ method: "HEAD" }));
    expect(response.statusCode).toBe(200);
    expect(parseResponseBody(response)).toEqual({});
  });
});
