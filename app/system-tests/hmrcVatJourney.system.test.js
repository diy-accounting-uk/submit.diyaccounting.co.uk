// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/system-tests/hmrcVatJourney.system.test.js

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { dotenvConfigIfNotBlank } from "../lib/env.js";
import { getBundle } from "./helpers/catalogueValues.js";

/** @type {typeof import("../services/subHasher.js").hashSub} */
let hashSub;
import { ingestHandler as hmrcTokenPostHandler } from "../functions/hmrc/hmrcTokenPost.js";
import { ingestHandler as hmrcVatReturnPostHandler } from "../functions/hmrc/hmrcVatReturnPost.js";
import { ingestHandler as hmrcReceiptGetHandler } from "../functions/hmrc/hmrcReceiptGet.js";
import { buildLambdaEvent, buildGovClientHeaders, makeIdToken } from "../test-helpers/eventBuilders.js";
import { setupTestEnv, parseResponseBody } from "../test-helpers/mockHelpers.js";
import { ensureReceiptsTableExists } from "@app/bin/dynamodb.js";
import { startHmrcMockServer } from "../test-helpers/primableMockServer.js";
import { exportDynamoDBDataForUsers } from "../test-helpers/dynamodbExporter.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

let stopDynalite;
let hmrcMock;
let importedBundleManagement;
const bundlesTableName = "system-test-vat-journey-bundles";
const hmrcReqsTableName = "system-test-vat-journey-requests";
const receiptsTableName = "system-test-vat-journey-receipts";

function makeDocClient() {
  const endpoint = process.env.AWS_ENDPOINT_URL_DYNAMODB || process.env.AWS_ENDPOINT_URL;
  const client = new DynamoDBClient({
    region: process.env.AWS_REGION || "us-east-1",
    ...(endpoint ? { endpoint } : {}),
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || "dummy",
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "dummy",
    },
  });
  return DynamoDBDocumentClient.from(client);
}

async function queryBundlesForUser(userId) {
  const hashedSub = hashSub(userId);
  const doc = makeDocClient();
  const resp = await doc.send(
    new QueryCommand({
      TableName: bundlesTableName,
      KeyConditionExpression: "hashedSub = :h",
      ExpressionAttributeValues: { ":h": hashedSub },
    }),
  );
  return resp.Items || [];
}

async function scanHmrcRequestsByHashedSub(userId) {
  const hashedSub = hashSub(userId);
  const doc = makeDocClient();
  const resp = await doc.send(
    new ScanCommand({
      TableName: hmrcReqsTableName,
      FilterExpression: "hashedSub = :h",
      ExpressionAttributeValues: { ":h": hashedSub },
    }),
  );
  return resp.Items || [];
}

async function scanAllHmrcRequests() {
  const doc = makeDocClient();
  const resp = await doc.send(new ScanCommand({ TableName: hmrcReqsTableName }));
  return resp.Items || [];
}

async function waitFor(predicate, { timeoutMs = 5000, intervalMs = 200 } = {}) {
  const start = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const result = await predicate();
    if (result) return result;
    if (Date.now() - start > timeoutMs) return result;
    // small delay
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

describe("System Journey: HMRC VAT Submission End-to-End", () => {
  const testUserSub = "test-vat-journey-user";
  const testToken = makeIdToken(testUserSub);

  beforeAll(async () => {
    const { ensureBundleTableExists, ensureHmrcApiRequestsTableExists, ensureAsyncRequestsTableExists } =
      await import("../bin/dynamodb.js");
    const { default: dynalite } = await import("dynalite");

    const host = "127.0.0.1";
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
    process.env.BUNDLE_DYNAMODB_TABLE_NAME = bundlesTableName;
    process.env.HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME = hmrcReqsTableName;
    process.env.RECEIPTS_DYNAMODB_TABLE_NAME = receiptsTableName;
    process.env.HMRC_VAT_RETURN_POST_ASYNC_REQUESTS_TABLE_NAME = asyncReturnPostTable;

    // Initialize the salt for hashing user subs (already set in .env.test)
    const subHasher = await import("../services/subHasher.js");
    await subHasher.initializeSalt();
    hashSub = subHasher.hashSub;

    await ensureBundleTableExists(bundlesTableName, endpoint);
    await ensureHmrcApiRequestsTableExists(hmrcReqsTableName, endpoint);
    await ensureReceiptsTableExists(receiptsTableName, endpoint);
    await ensureAsyncRequestsTableExists(asyncReturnPostTable, endpoint);
    await ensureAsyncRequestsTableExists(asyncReturnGetTable, endpoint);
    await ensureAsyncRequestsTableExists(asyncObligationGetTable, endpoint);

    importedBundleManagement = await import("../services/bundleManagement.js");

    // Start HMRC mock server
    hmrcMock = await startHmrcMockServer();
  });

  afterAll(async () => {
    // Export DynamoDB data for all users used in this test suite
    const userSubs = ["test-vat-journey-user"];
    await exportDynamoDBDataForUsers(userSubs, "hmrcVatJourney.system.test.js");

    try {
      await stopDynalite?.();
    } catch {}
    try {
      await hmrcMock?.stop?.();
    } catch {}
  });

  beforeEach(async () => {
    vi.resetAllMocks();
    // Ensure we are not in mock bundle mode for this journey test and that
    // our DynamoDB table env vars are preserved across setupTestEnv
    Object.assign(
      process.env,
      setupTestEnv({
        //NODE_ENV: "stubbed",
        HMRC_CLIENT_SECRET: "test-client-secret",
        HMRC_SANDBOX_CLIENT_SECRET: "test-sandbox-client-secret",
        TEST_BUNDLE_MOCK: "false",
        BUNDLE_DYNAMODB_TABLE_NAME: bundlesTableName,
        HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME: hmrcReqsTableName,
        RECEIPTS_DYNAMODB_TABLE_NAME: receiptsTableName,
      }),
    );

    // Ensure HMRC base URIs target the mock server for all tests in this suite
    process.env.HMRC_BASE_URI = hmrcMock.baseUrl;
    process.env.HMRC_SANDBOX_BASE_URI = hmrcMock.baseUrl;

    // Prime HMRC endpoints used by this suite
    // 1) POST VAT return submission
    hmrcMock.prime(
      ({ method, path }) => method === "POST" && /\/organisations\/vat\/[0-9]{9}\/returns$/.test(path),
      ({ rawBody }) => {
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

    // 2) GET VAT obligations - needed for periodKey resolution during submission
    hmrcMock.prime(
      ({ method, path }) => method === "GET" && /\/organisations\/vat\/[0-9]{9}\/obligations$/.test(path),
      () => {
        return {
          status: 200,
          body: {
            obligations: [
              {
                start: "2017-04-01",
                end: "2017-06-30",
                due: "2017-08-07",
                status: "O",
                periodKey: "18A2",
              },
            ],
          },
        };
      },
    );

    // Grant test bundle for user
    const expiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await importedBundleManagement.updateUserBundles(testUserSub, [
      { bundleId: "day-guest", expiry, tokensGranted: getBundle("day-guest").tokensGranted, tokensConsumed: 0 },
    ]);
  });

  it("should complete full VAT submission journey: Auth → Token → Submit → PostReceipt → GetReceipt", async () => {
    // Step 1: Get HMRC authorization URL - performed client side
    // Step 2: Exchange authorization code for access token
    const tokenEvent = buildLambdaEvent({
      method: "POST",
      path: "/api/v1/hmrc/token",
      body: { code: "auth-code-from-callback" },
    });

    const tokenResponse = await hmrcTokenPostHandler(tokenEvent);
    // With the primed mock HMRC server, token exchange should succeed
    expect(tokenResponse.statusCode).toBe(200);
    const tokenBody = parseResponseBody(tokenResponse);
    const hmrcAccessToken = tokenBody?.accessToken || tokenBody?.hmrcAccessToken || "mock-token";

    // Step 3: Submit VAT return to HMRC
    // Use period dates matching the simulator's default open obligation (18A2)
    const submitEvent = buildLambdaEvent({
      method: "POST",
      path: "/api/v1/hmrc/vat/return",
      body: {
        vatNumber: "123456789",
        periodStart: "2017-04-01",
        periodEnd: "2017-06-30",
        vatDue: 1500.5,
        accessToken: hmrcAccessToken,
      },
      headers: {
        ...buildGovClientHeaders(),
      },
      authorizer: {
        authorizer: {
          lambda: {
            "sub": testUserSub,
            "cognito:username": "vatuser",
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
    expect(submitBody).toHaveProperty("receiptId");

    const formBundleNumber = submitBody.receipt.formBundleNumber;
    const receiptId = submitBody.receiptId;

    const receiptGetEvent = buildLambdaEvent({
      method: "GET",
      path: `/api/v1/hmrc/receipt/${receiptId}.json`,
      pathParameters: { name: `${receiptId}.json` },
      headers: { Authorization: `Bearer ${testToken}` },
      authorizer: {
        authorizer: {
          lambda: {
            "sub": testUserSub,
            "cognito:username": "vatuser",
          },
        },
      },
    });

    const receiptGetResponse = await hmrcReceiptGetHandler(receiptGetEvent);
    expect(receiptGetResponse.statusCode).toBe(200);

    const receiptGetBody = parseResponseBody(receiptGetResponse);
    expect(receiptGetBody).toHaveProperty("formBundleNumber", formBundleNumber);
    expect(receiptGetBody).toHaveProperty("processingDate");

    // Verify the complete journey response coherence
    expect(receiptGetBody).toEqual(submitBody.receipt);

    // Final journey assertions against DynamoDB persistence
    // 1) Bundles should be persisted for the user
    const bundles = await waitFor(
      async () => {
        const items = await queryBundlesForUser(testUserSub);
        return items && items.find((b) => b.bundleId === "day-guest") ? items : null;
      },
      { timeoutMs: 15000, intervalMs: 250 },
    );
    expect(Array.isArray(bundles)).toBe(true);
    expect(bundles.find((b) => b.bundleId === "day-guest")).toBeTruthy();

    // 2) HMRC API request logs should be present
    // Token exchange may be logged with an unknown UUID user when userSub not provided
    // so scan the whole table and look for an oauth/token POST entry
    const hmrcLogs = await waitFor(
      async () => {
        const all = await scanAllHmrcRequests();
        return all && all.length > 0 ? all : null;
      },
      { timeoutMs: 15000, intervalMs: 250 },
    );
    expect(Array.isArray(hmrcLogs)).toBe(true);
    expect(hmrcLogs.length).toBeGreaterThan(0);
    const tokenLogs = hmrcLogs.filter((i) => typeof i.url === "string" && i.url.includes("/oauth/token"));
    expect(tokenLogs.length).toBeGreaterThan(0);
    // basic shape checks
    const one = tokenLogs[0];
    expect(one).toHaveProperty("method");
    expect(one.method).toBe("POST");
    expect(one).toHaveProperty("createdAt");
  }, 30000);

  // it("should handle synthetic environment in complete journey", async () => {
  //   // Step 1: Get synthetic authorization URL - performed client side
  //   // Step 2: Exchange code in synthetic
  //   const tokenEvent = buildLambdaEvent({
  //     method: "POST",
  //     path: "/api/v1/hmrc/token",
  //     body: { code: "synthetic-auth-code" },
  //     headers: { hmrcaccount: "synthetic" },
  //   });
  //
  //   const tokenResponse = await hmrcTokenPostHandler(tokenEvent);
  //   expect(tokenResponse.statusCode).toBe(200);
  //   const syntheticTokenBody = parseResponseBody(tokenResponse);
  //   const syntheticAccessToken = syntheticTokenBody?.accessToken || syntheticTokenBody?.hmrcAccessToken || "mock-synthetic-token";
  //
  //   // Step 3: Submit VAT return in synthetic
  //   const submitEvent = buildLambdaEvent({
  //     method: "POST",
  //     path: "/api/v1/hmrc/vat/return",
  //     body: {
  //       vatNumber: "987654321",
  //       periodKey: "25B1",
  //       vatDue: 750.25,
  //       accessToken: syntheticAccessToken,
  //     },
  //     headers: {
  //       ...buildGovClientHeaders(),
  //       hmrcaccount: "synthetic",
  //     },
  //     authorizer: {
  //       authorizer: {
  //         lambda: {
  //           jwt: {
  //             claims: {
  //               "sub": testUserSub,
  //               "cognito:username": "syntheticuser",
  //             },
  //           },
  //         },
  //       },
  //     },
  //   });
  //
  //   const submitResponse = await hmrcVatReturnPostHandler(submitEvent);
  //   expect(submitResponse.statusCode).toBe(200);
  //
  //   const submitBody = parseResponseBody(submitResponse);
  //   expect(submitBody).toHaveProperty("receipt");
  //   expect(submitBody.receipt).toHaveProperty("formBundleNumber");
  // }, 30000);
});
