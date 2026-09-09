// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/system-tests/hmrcVatObligationJourney.system.test.js

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { dotenvConfigIfNotBlank } from "../lib/env.js";
import { getBundle } from "./helpers/catalogueValues.js";
import { ingestHandler as hmrcTokenPostHandler } from "../functions/hmrc/hmrcTokenPost.js";
import { ingestHandler as hmrcVatObligationGetHandler } from "../functions/hmrc/hmrcVatObligationGet.js";
import { ingestHandler as hmrcVatReturnPostHandler } from "../functions/hmrc/hmrcVatReturnPost.js";
import { ingestHandler as hmrcVatReturnGetHandler } from "../functions/hmrc/hmrcVatReturnGet.js";
import { buildLambdaEvent, buildGovClientHeaders } from "../test-helpers/eventBuilders.js";
import { setupTestEnv, parseResponseBody } from "../test-helpers/mockHelpers.js";
import { startHmrcMockServer } from "../test-helpers/primableMockServer.js";
import { exportDynamoDBDataForUsers } from "../test-helpers/dynamodbExporter.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

let stopDynalite;
let bm;
let hmrcMock;

describe("System Journey: HMRC VAT Obligation-Based Flow", () => {
  const testUserSub = "test-obligation-journey-user";

  beforeAll(async () => {
    const { ensureBundleTableExists, ensureHmrcApiRequestsTableExists, ensureReceiptsTableExists, ensureAsyncRequestsTableExists } =
      await import("../bin/dynamodb.js");
    const { default: dynalite } = await import("dynalite");

    const host = "127.0.0.1";
    const bundleTableName = "test-bundle-table";
    const hmrcApiRequestsTableName = "test-hmrc-requests-table";
    const receiptsTableName = "test-receipts-table";

    const server = dynalite({ createTableMs: 0 });
    const address = await new Promise((resolve, reject) => {
      server.listen(0, host, (err) => (err ? reject(err) : resolve(server.address())));
    });
    stopDynalite = async () => {
      try {
        server.close();
      } catch {}
    };
    const endpoint = `http://${host}:${address.port}`;

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

    // Start HMRC mock server and point base URIs at it
    hmrcMock = await startHmrcMockServer();
  });

  afterAll(async () => {
    // Export DynamoDB data for all users used in this test suite
    const userSubs = ["test-obligation-journey-user"];
    await exportDynamoDBDataForUsers(userSubs, "hmrcVatObligationJourney.system.test.js");

    try {
      await stopDynalite?.();
    } catch {}
    try {
      await hmrcMock?.stop?.();
    } catch {}
  });

  beforeEach(async () => {
    vi.resetAllMocks();
    Object.assign(
      process.env,
      setupTestEnv({
        //NODE_ENV: "stubbed",
        HMRC_CLIENT_SECRET: "test-client-secret",
        HMRC_SANDBOX_CLIENT_SECRET: "test-sandbox-client-secret",
      }),
    );

    // Ensure HMRC base URIs target the mock server for all tests in this suite
    process.env.HMRC_BASE_URI = hmrcMock.baseUrl;
    process.env.HMRC_SANDBOX_BASE_URI = hmrcMock.baseUrl;

    // Prime HMRC endpoints used by this suite
    // 1) POST VAT return submission
    hmrcMock.prime(
      ({ method, path }) => method === "POST" && /\/organisations\/vat\/[0-9]{9}\/returns$/.test(path),
      ({ rawBody, url }) => {
        let body;
        try {
          body = JSON.parse(rawBody || "{}");
        } catch {
          body = {};
        }
        const periodKey = body?.periodKey || "25A1";
        const now = new Date().toISOString();
        return {
          status: 200,
          body: {
            formBundleNumber: `FBN-${periodKey}-0001`,
            processingDate: now,
          },
        };
      },
    );

    // 2) GET VAT obligations
    hmrcMock.prime(
      ({ method, path }) => method === "GET" && /\/organisations\/vat\/[0-9]{9}\/obligations$/.test(path),
      () => {
        let data = { obligations: [] };
        try {
          data = JSON.parse(process.env.TEST_VAT_OBLIGATIONS || "{}");
        } catch {}
        return { status: 200, body: data };
      },
    );

    // 3) GET VAT return by periodKey
    hmrcMock.prime(
      ({ method, path }) => method === "GET" && /\/organisations\/vat\/[0-9]{9}\/returns\/.+/.test(path),
      () => {
        let data = {};
        try {
          data = JSON.parse(process.env.TEST_VAT_RETURN || "{}");
        } catch {}
        return { status: 200, body: data };
      },
    );

    // Grant test bundle for user
    const expiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await bm.updateUserBundles(testUserSub, [
      { bundleId: "day-guest", expiry, tokensGranted: getBundle("day-guest").tokensGranted, tokensConsumed: 0 },
    ]);
  });

  it("should complete obligation-based journey: Auth → Token → Obligations → Submit → Get VAT", async () => {
    // Step 1: Get HMRC authorization URL - performed client side
    // Step 2: Exchange authorization code for access token
    const tokenEvent = buildLambdaEvent({
      method: "POST",
      path: "/api/v1/hmrc/token",
      body: { code: "obligation-auth-code" },
    });

    const tokenResponse = await hmrcTokenPostHandler(tokenEvent);
    // With the primed mock HMRC server, token exchange should succeed
    expect(tokenResponse.statusCode).toBe(200);
    const tokenBody = parseResponseBody(tokenResponse);
    const hmrcAccessToken = tokenBody?.accessToken || tokenBody?.hmrcAccessToken || "mock-token";

    // Step 3: Get VAT obligations to see what needs to be submitted
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
        {
          start: "2024-10-01",
          end: "2024-12-31",
          due: "2025-02-07",
          status: "F",
          periodKey: "24A4",
          received: "2025-02-05",
        },
      ],
    });

    const obligationEvent = buildLambdaEvent({
      method: "GET",
      path: "/api/v1/hmrc/vat/obligation",
      queryStringParameters: {
        vrn: "123456789",
        from: "2024-01-01",
        to: "2025-12-31",
      },
      headers: {
        ...buildGovClientHeaders(),
        "authorization": `Bearer ${hmrcAccessToken}`,
        "x-wait-time-ms": "30000",
        "x-initial-request": "true",
      },
      authorizer: {
        authorizer: {
          lambda: {
            "sub": testUserSub,
            "cognito:username": "obligationuser",
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

    // Find an open obligation to submit
    const openObligation = obligationBody.obligations.find((o) => o.status === "O");
    expect(openObligation).toBeDefined();
    const periodStartToSubmit = openObligation.start;
    const periodEndToSubmit = openObligation.end;
    const periodKeyToSubmit = openObligation.periodKey;

    // Step 4: Submit VAT return for the open obligation using period dates
    const submitEvent = buildLambdaEvent({
      method: "POST",
      path: "/api/v1/hmrc/vat/return",
      body: {
        vatNumber: "123456789",
        periodStart: periodStartToSubmit,
        periodEnd: periodEndToSubmit,
        vatDue: 2750.0,
        accessToken: hmrcAccessToken,
      },
      headers: {
        ...buildGovClientHeaders(),
      },
      authorizer: {
        authorizer: {
          lambda: {
            "sub": testUserSub,
            "cognito:username": "obligationuser",
          },
        },
      },
    });

    const submitResponse = await hmrcVatReturnPostHandler(submitEvent);
    expect(submitResponse.statusCode).toBe(200);

    const submitBody = parseResponseBody(submitResponse);
    expect(submitBody).toHaveProperty("receipt");
    expect(submitBody.receipt).toHaveProperty("formBundleNumber");
    expect(submitBody.receipt).toHaveProperty("processingDate");

    // Step 5: Retrieve the submitted VAT return to verify
    // After submission, the obligation should now be fulfilled - update the stub
    process.env.TEST_VAT_OBLIGATIONS = JSON.stringify({
      source: "stub",
      obligations: [
        {
          start: periodStartToSubmit,
          end: periodEndToSubmit,
          due: "2025-05-07",
          status: "F",
          periodKey: periodKeyToSubmit,
          received: new Date().toISOString().split("T")[0],
        },
      ],
    });
    process.env.TEST_VAT_RETURN = JSON.stringify({
      source: "stub",
      periodKey: periodKeyToSubmit,
      vatDueSales: 2750.0,
      vatDueAcquisitions: 0.0,
      totalVatDue: 2750.0,
      vatReclaimedCurrPeriod: 0.0,
      netVatDue: 2750.0,
      totalValueSalesExVAT: 15000,
      totalValuePurchasesExVAT: 500,
      totalValueGoodsSuppliedExVAT: 0,
      totalAcquisitionsExVAT: 0,
      finalised: true,
    });

    const getReturnEvent = buildLambdaEvent({
      method: "GET",
      path: `/api/v1/hmrc/vat/return`,
      queryStringParameters: {
        vrn: "123456789",
        periodStart: periodStartToSubmit,
        periodEnd: periodEndToSubmit,
      },
      headers: {
        ...buildGovClientHeaders(),
        "authorization": `Bearer ${hmrcAccessToken}`,
        "x-wait-time-ms": "30000",
        "x-initial-request": "true",
      },
      authorizer: {
        authorizer: {
          lambda: {
            "sub": testUserSub,
            "cognito:username": "obligationuser",
          },
        },
      },
    });

    const getReturnResponse = await hmrcVatReturnGetHandler(getReturnEvent);
    expect(getReturnResponse.statusCode).toBe(200);

    const getReturnBody = parseResponseBody(getReturnResponse);
    expect(getReturnBody).toHaveProperty("periodKey", periodKeyToSubmit);
    expect(getReturnBody).toHaveProperty("finalised", true);
    expect(getReturnBody).toHaveProperty("totalVatDue");

    // Verify the journey completed successfully
    expect(getReturnBody.periodKey).toBe(periodKeyToSubmit);
  });

  it("should handle multiple obligations with different statuses", async () => {
    // Get auth URL and token (abbreviated)
    const hmrcAccessToken = "mock-token-multiple-obligations";

    // Get obligations with mixed statuses
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
        {
          start: "2024-10-01",
          end: "2024-12-31",
          due: "2025-02-07",
          status: "F",
          periodKey: "24A4",
          received: "2025-02-05",
        },
        {
          start: "2024-07-01",
          end: "2024-09-30",
          due: "2024-11-07",
          status: "F",
          periodKey: "24A3",
          received: "2024-11-01",
        },
      ],
    });

    const obligationEvent = buildLambdaEvent({
      method: "GET",
      path: "/api/v1/hmrc/vat/obligation",
      queryStringParameters: {
        vrn: "987654321",
      },
      headers: {
        ...buildGovClientHeaders(),
        "authorization": `Bearer ${hmrcAccessToken}`,
        "x-wait-time-ms": "30000",
        "x-initial-request": "true",
      },
      authorizer: {
        authorizer: {
          lambda: {
            "sub": testUserSub,
            "cognito:username": "multiuser",
          },
        },
      },
    });

    const obligationResponse = await hmrcVatObligationGetHandler(obligationEvent);
    expect(obligationResponse.statusCode).toBe(200);

    const obligationBody = parseResponseBody(obligationResponse);
    expect(obligationBody.obligations.length).toBe(3);

    // Verify we have both open and fulfilled obligations
    const openObligations = obligationBody.obligations.filter((o) => o.status === "O");
    const fulfilledObligations = obligationBody.obligations.filter((o) => o.status === "F");
    expect(openObligations.length).toBe(1);
    expect(fulfilledObligations.length).toBe(2);
  }, 60_000);

  it("should filter obligations by status parameter", async () => {
    const hmrcAccessToken = "mock-token-filtered";

    // Set up obligations
    process.env.TEST_VAT_OBLIGATIONS = JSON.stringify({
      source: "stub",
      obligations: [
        {
          start: "2024-10-01",
          end: "2024-12-31",
          due: "2025-02-07",
          status: "F",
          periodKey: "24A4",
          received: "2025-02-05",
        },
      ],
    });

    const obligationEvent = buildLambdaEvent({
      method: "GET",
      path: "/api/v1/hmrc/vat/obligation",
      queryStringParameters: {
        vrn: "123456789",
        status: "F",
      },
      headers: {
        ...buildGovClientHeaders(),
        "authorization": `Bearer ${hmrcAccessToken}`,
        "x-wait-time-ms": "30000",
        "x-initial-request": "true",
      },
      authorizer: {
        authorizer: {
          lambda: {
            "sub": testUserSub,
            "cognito:username": "filteruser",
          },
        },
      },
    });

    const obligationResponse = await hmrcVatObligationGetHandler(obligationEvent);
    expect(obligationResponse.statusCode).toBe(200);

    const obligationBody = parseResponseBody(obligationResponse);
    expect(obligationBody.obligations).toBeDefined();

    // All obligations should have fulfilled status
    obligationBody.obligations.forEach((obligation) => {
      expect(obligation.status).toBe("F");
    });
  }, 60_000);
});
