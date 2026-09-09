// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/system-tests/hmrcVatScenarios.system.test.js

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { dotenvConfigIfNotBlank } from "../lib/env.js";
import { ingestHandler as hmrcVatReturnGetHandler } from "../functions/hmrc/hmrcVatReturnGet.js";
import { ingestHandler as hmrcVatReturnPostHandler } from "../functions/hmrc/hmrcVatReturnPost.js";
import { ingestHandler as hmrcVatObligationGetHandler } from "../functions/hmrc/hmrcVatObligationGet.js";
import * as hmrcHelper from "../services/hmrcApi.js";
import { buildLambdaEvent, buildGovClientHeaders } from "../test-helpers/eventBuilders.js";
import { setupTestEnv, parseResponseBody } from "../test-helpers/mockHelpers.js";
import { exportDynamoDBDataForUsers } from "../test-helpers/dynamodbExporter.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

/** @typedef {typeof import("../services/bundleManagement.js")} BundleManagement */
/** @type {BundleManagement} */
let bm;
let stopDynalite;
const bundlesTableName = "test-bundle-table";
const receiptsTableName = "test-receipts-table";

describe("System: HMRC VAT Scenarios with Test Parameters", () => {
  beforeAll(async () => {
    const { ensureBundleTableExists, ensureHmrcApiRequestsTableExists, ensureReceiptsTableExists, ensureAsyncRequestsTableExists } =
      await import("../bin/dynamodb.js");
    const { default: dynalite } = await import("dynalite");

    const host = "127.0.0.1";
    const bundleTableName = "test-bundle-table";
    const hmrcApiRequestsTableName = "test-hmrc-requests-table";
    const receiptsTableName = "test-receipts-table";

    const server = dynalite({ createTableMs: 0 });
    const actualPort = await new Promise((resolve, reject) => {
      server.listen(0, host, (err) => (err ? reject(err) : resolve(server.address().port)));
    });
    stopDynalite = async () => {
      try {
        server.close();
      } catch {}
    };
    const endpoint = `http://${host}:${actualPort}`;

    process.env.AWS_REGION = process.env.AWS_REGION || "us-east-1";
    process.env.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || "dummy";
    process.env.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || "dummy";
    process.env.AWS_ENDPOINT_URL = endpoint;
    process.env.AWS_ENDPOINT_URL_DYNAMODB = endpoint;
    const asyncReturnPostTable = "test-hmrc-vat-return-post-async-requests-table";
    const asyncReturnGetTable = "test-hmrc-vat-return-get-async-requests-table";
    const asyncObligationGetTable = "test-hmrc-vat-obligation-get-async-requests-table";
    process.env.BUNDLE_DYNAMODB_TABLE_NAME = bundleTableName;
    process.env.HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME = hmrcApiRequestsTableName;
    process.env.RECEIPTS_DYNAMODB_TABLE_NAME = receiptsTableName;
    process.env.HMRC_VAT_RETURN_POST_ASYNC_REQUESTS_TABLE_NAME = asyncReturnPostTable;
    process.env.HMRC_VAT_RETURN_GET_ASYNC_REQUESTS_TABLE_NAME = asyncReturnGetTable;
    process.env.HMRC_VAT_OBLIGATION_GET_ASYNC_REQUESTS_TABLE_NAME = asyncObligationGetTable;

    // Initialize the salt for hashing user subs (already set in .env.test)
    const { initializeSalt } = await import("../services/subHasher.js");
    await initializeSalt();

    await ensureBundleTableExists(bundleTableName, endpoint);
    await ensureHmrcApiRequestsTableExists(hmrcApiRequestsTableName, endpoint);
    await ensureReceiptsTableExists(receiptsTableName, endpoint);
    await ensureAsyncRequestsTableExists(asyncReturnPostTable, endpoint);
    await ensureAsyncRequestsTableExists(asyncReturnGetTable, endpoint);
    await ensureAsyncRequestsTableExists(asyncObligationGetTable, endpoint);

    bm = await import("../services/bundleManagement.js");
  });

  afterAll(async () => {
    // Export DynamoDB data for all users used in this test suite
    const userSubs = ["test-user"];
    await exportDynamoDBDataForUsers(userSubs, "hmrcVatScenarios.system.test.js");

    try {
      await stopDynalite?.();
    } catch {}
  });

  beforeEach(async () => {
    vi.resetAllMocks();
    Object.assign(process.env, setupTestEnv());

    // Grant test bundle for all tests
    const testUserSub = "test-user";
    const expiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await bm.updateUserBundles(testUserSub, [{ bundleId: "day-guest", expiry }]);

    // Traditional mocking for HMRC HTTP to avoid real network and drive scenarios
    vi.spyOn(hmrcHelper, "hmrcHttpGet").mockImplementation(
      async (endpoint, _token, _govClientHeaders, _testScenario, _hmrcAccount, queryParams = {}) => {
        if (String(endpoint).includes("/obligations")) {
          let data;
          try {
            data = JSON.parse(process.env.TEST_VAT_OBLIGATIONS || "{}");
          } catch {
            data = undefined;
          }
          if (!data || !data.obligations) {
            data = {
              source: "mock",
              obligations: [
                {
                  start: queryParams?.from || "2024-01-01",
                  end: queryParams?.to || "2024-03-31",
                  due: "2024-05-07",
                  status: queryParams?.status || "O",
                  periodKey: "24A1",
                  received: queryParams?.status === "F" ? "2024-05-06" : undefined,
                },
              ],
            };
          }
          return { ok: true, status: 200, data };
        }

        if (String(endpoint).includes("/returns/")) {
          let data;
          try {
            data = JSON.parse(process.env.TEST_VAT_RETURN || "{}");
          } catch {
            data = undefined;
          }
          if (!data || !data.periodKey) {
            const match = String(endpoint).match(/returns\/([^/?]+)/);
            const periodKey = match ? match[1] : "24A1";
            data = { source: "mock", periodKey, vatDueSales: 1000, totalVatDue: 1000, finalised: true };
          }
          return { ok: true, status: 200, data };
        }

        return { ok: true, status: 200, data: {} };
      },
    );
  });

  it("should retrieve VAT obligations with QUARTERLY_NONE_MET scenario", async () => {
    // Set up stub data for obligations
    process.env.TEST_VAT_OBLIGATIONS = JSON.stringify({
      source: "stub",
      obligations: [
        {
          start: "2024-01-01",
          end: "2024-03-31",
          due: "2024-05-07",
          status: "O",
          periodKey: "24A1",
        },
        {
          start: "2024-04-01",
          end: "2024-06-30",
          due: "2024-08-07",
          status: "O",
          periodKey: "24A2",
        },
      ],
    });

    const obligationEvent = buildLambdaEvent({
      method: "GET",
      path: "/api/v1/hmrc/vat/obligation",
      queryStringParameters: {
        "vrn": "123456789",
        "from": "2024-01-01",
        "to": "2024-12-31",
        "Gov-Test-Scenario": "QUARTERLY_NONE_MET",
      },
      headers: {
        ...buildGovClientHeaders(),
        "authorization": "Bearer test-hmrc-access-token",
        "x-wait-time-ms": "30000",
        "x-initial-request": "true",
      },
      authorizer: {
        authorizer: {
          lambda: {
            "sub": "test-user",
            "cognito:username": "testuser",
          },
        },
      },
    });

    const obligationResponse = await hmrcVatObligationGetHandler(obligationEvent);
    expect(obligationResponse.statusCode).toBe(200);

    const obligationBody = parseResponseBody(obligationResponse);
    expect(obligationBody).toHaveProperty("obligations");
    expect(Array.isArray(obligationBody.obligations)).toBe(true);
    expect(obligationBody.obligations.length).toBeGreaterThan(0);
    expect(obligationBody.obligations[0]).toHaveProperty("periodKey");
  });

  it("should retrieve VAT return with QUARTERLY_ONE_MET scenario", async () => {
    // Set up stub data for fulfilled obligations (needed for periodKey resolution)
    process.env.TEST_VAT_OBLIGATIONS = JSON.stringify({
      source: "stub",
      obligations: [
        {
          start: "2024-01-01",
          end: "2024-03-31",
          due: "2024-05-07",
          status: "F",
          periodKey: "24A1",
        },
      ],
    });
    // Set up stub data for VAT return
    process.env.TEST_VAT_RETURN = JSON.stringify({
      source: "stub",
      periodKey: "24A1",
      vatDueSales: 1500.75,
      vatDueAcquisitions: 0.0,
      totalVatDue: 1500.75,
      vatReclaimedCurrPeriod: 100.5,
      netVatDue: 1400.25,
      totalValueSalesExVAT: 10000,
      totalValuePurchasesExVAT: 1000,
      totalValueGoodsSuppliedExVAT: 0,
      totalAcquisitionsExVAT: 0,
      finalised: true,
    });

    const returnEvent = buildLambdaEvent({
      method: "GET",
      path: "/api/v1/hmrc/vat/return",
      queryStringParameters: {
        "vrn": "123456789",
        "periodStart": "2024-01-01",
        "periodEnd": "2024-03-31",
        "Gov-Test-Scenario": "QUARTERLY_ONE_MET",
      },
      headers: {
        ...buildGovClientHeaders(),
        "authorization": "Bearer test-hmrc-access-token",
        "x-wait-time-ms": "30000",
        "x-initial-request": "true",
      },
      authorizer: {
        authorizer: {
          lambda: {
            "sub": "test-user",
            "cognito:username": "testuser",
          },
        },
      },
    });

    const returnResponse = await hmrcVatReturnGetHandler(returnEvent);
    expect(returnResponse.statusCode).toBe(200);

    const returnBody = parseResponseBody(returnResponse);
    expect(returnBody).toHaveProperty("periodKey", "24A1");
    expect(returnBody).toHaveProperty("vatDueSales");
    expect(returnBody).toHaveProperty("totalVatDue");
    expect(returnBody).toHaveProperty("finalised", true);
  });

  it("should retrieve obligations with default date range when dates not provided", async () => {
    // Set up stub data
    process.env.TEST_VAT_OBLIGATIONS = JSON.stringify({
      source: "stub",
      obligations: [
        {
          start: "2025-01-01",
          end: "2025-03-31",
          due: "2025-05-07",
          status: "O",
          periodKey: "25A1",
        },
      ],
    });

    const obligationEvent = buildLambdaEvent({
      method: "GET",
      path: "/api/v1/hmrc/vat/obligation",
      queryStringParameters: {
        vrn: "123456789",
      },
      headers: {
        ...buildGovClientHeaders(),
        "authorization": "Bearer test-hmrc-access-token",
        "x-wait-time-ms": "30000",
        "x-initial-request": "true",
      },
      authorizer: {
        authorizer: {
          lambda: {
            "sub": "test-user",
            "cognito:username": "testuser",
          },
        },
      },
    });

    // Add test bundle

    const obligationResponse = await hmrcVatObligationGetHandler(obligationEvent);
    expect(obligationResponse.statusCode).toBe(200);

    const obligationBody = parseResponseBody(obligationResponse);
    expect(obligationBody).toHaveProperty("obligations");
    expect(Array.isArray(obligationBody.obligations)).toBe(true);
  }, 60_000);

  it("should handle different test scenarios without Gov-Test-Scenario header", async () => {
    // Set up stub data for fulfilled obligations (needed for periodKey resolution)
    process.env.TEST_VAT_OBLIGATIONS = JSON.stringify({
      source: "stub",
      obligations: [
        {
          start: "2024-04-01",
          end: "2024-06-30",
          due: "2024-08-07",
          status: "F",
          periodKey: "24B1",
        },
      ],
    });
    // Set up stub data for VAT return
    process.env.TEST_VAT_RETURN = JSON.stringify({
      source: "stub",
      periodKey: "24B1",
      vatDueSales: 500.0,
      totalVatDue: 500.0,
      finalised: true,
    });

    const returnEvent = buildLambdaEvent({
      method: "GET",
      path: "/api/v1/hmrc/vat/return",
      queryStringParameters: {
        vrn: "987654321",
        periodStart: "2024-04-01",
        periodEnd: "2024-06-30",
      },
      headers: {
        ...buildGovClientHeaders(),
        "authorization": "Bearer test-hmrc-access-token",
        "x-wait-time-ms": "30000",
        "x-initial-request": "true",
      },
      authorizer: {
        authorizer: {
          lambda: {
            "sub": "test-user",
            "cognito:username": "testuser",
          },
        },
      },
    });

    const returnResponse = await hmrcVatReturnGetHandler(returnEvent);
    expect(returnResponse.statusCode).toBe(200);

    const returnBody = parseResponseBody(returnResponse);
    expect(returnBody).toHaveProperty("periodKey", "24B1");
  }, 60_000);

  it("should retrieve fulfilled obligations with status filter", async () => {
    // Set up stub data with fulfilled obligations
    process.env.TEST_VAT_OBLIGATIONS = JSON.stringify({
      source: "stub",
      obligations: [
        {
          start: "2024-01-01",
          end: "2024-03-31",
          due: "2024-05-07",
          status: "F",
          periodKey: "24A1",
          received: "2024-05-05",
        },
      ],
    });

    const obligationEvent = buildLambdaEvent({
      method: "GET",
      path: "/api/v1/hmrc/vat/obligation",
      queryStringParameters: {
        vrn: "123456789",
        from: "2024-01-01",
        to: "2024-12-31",
        status: "F",
      },
      headers: {
        ...buildGovClientHeaders(),
        "authorization": "Bearer test-hmrc-access-token",
        "x-wait-time-ms": "30000",
        "x-initial-request": "true",
      },
      authorizer: {
        authorizer: {
          lambda: {
            "sub": "test-user",
            "cognito:username": "testuser",
          },
        },
      },
    });

    const obligationResponse = await hmrcVatObligationGetHandler(obligationEvent);
    expect(obligationResponse.statusCode).toBe(200);

    const obligationBody = parseResponseBody(obligationResponse);
    expect(obligationBody).toHaveProperty("obligations");
    expect(obligationBody.obligations[0]).toHaveProperty("status", "F");
  }, 60_000);
});
