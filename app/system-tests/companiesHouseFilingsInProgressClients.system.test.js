// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/system-tests/companiesHouseFilingsInProgressClients.system.test.js
// A practice's Companies House filings in progress, listed against a local Dynalite table: its own
// filing under its own list, and each client's pending or rejected filing under that client; and the
// receipts route over the same tables, which answers a client's list only to the practice that owns it.

import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { buildHmrcEvent } from "@app/test-helpers/eventBuilders.js";

const tableName = "companies-house-filings-in-progress-clients-system-test";
let stopDynalite;
let putAsyncRequest;
let listFilingsInProgress;
let receiptsRoute;
let ownClientId;
let anotherPracticesClientId;

function signedInAs(sub, clientId) {
  const part = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return buildHmrcEvent({
    headers: { Authorization: `Bearer ${part({ alg: "none", typ: "JWT" })}.${part({ sub })}.` },
    queryStringParameters: clientId ? { clientId } : {},
  });
}

beforeAll(async () => {
  const { ensureAsyncRequestsTableExists, ensureReceiptsTableExists, ensurePracticeClientsTableExists } =
    await import("../bin/dynamodb.js");
  const { default: dynalite } = await import("dynalite");

  const host = "127.0.0.1";
  const server = dynalite({ createTableMs: 0 });
  const address = await new Promise((resolve, reject) => {
    server.listen(0, host, (err) => (err ? reject(err) : resolve(server.address())));
  });
  stopDynalite = () => server.close();
  const endpoint = `http://${host}:${address.port}`;

  process.env.AWS_REGION = process.env.AWS_REGION || "us-east-1";
  process.env.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || "dummy";
  process.env.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || "dummy";
  process.env.AWS_ENDPOINT_URL = endpoint;
  process.env.AWS_ENDPOINT_URL_DYNAMODB = endpoint;
  process.env.COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME = tableName;
  process.env.USER_SUB_HASH_SALT = '{"current":"v1","versions":{"v1":"test-salt-for-system-tests"}}';

  const { initializeSalt } = await import("../services/subHasher.js");
  await initializeSalt();
  await ensureAsyncRequestsTableExists(tableName, endpoint);
  process.env.RECEIPTS_DYNAMODB_TABLE_NAME = `${tableName}-receipts`;
  process.env.PRACTICE_CLIENTS_DYNAMODB_TABLE_NAME = `${tableName}-clients`;
  await ensureReceiptsTableExists(process.env.RECEIPTS_DYNAMODB_TABLE_NAME, endpoint);
  await ensurePracticeClientsTableExists(process.env.PRACTICE_CLIENTS_DYNAMODB_TABLE_NAME, endpoint);

  ({ putAsyncRequest } = await import("../data/dynamoDbAsyncRequestRepository.js"));
  ({ listFilingsInProgress } = await import("../data/dynamoDbCompaniesHouseFilingStateRepository.js"));

  const retention = { days: 1 };
  await putAsyncRequest("practice-sub", "PRC001", "pending", { kind: "accounts" }, tableName, retention);
  await putAsyncRequest("practice-sub", "PRC002", "pending", { kind: "accounts", clientId: "client-1" }, tableName, retention);
  await putAsyncRequest(
    "practice-sub",
    "PRC003",
    "failed",
    { kind: "confirmation-statement", statusCode: "REJECT", rejections: [{ rejectCode: "1", description: "No" }], clientId: "client-2" },
    tableName,
    retention,
  );
  await putAsyncRequest("another-sub", "PRC004", "pending", { kind: "accounts" }, tableName, retention);

  const { createClient } = await import("../data/dynamoDbPracticeClientRepository.js");
  const { putReceipt } = await import("../data/dynamoDbReceiptRepository.js");
  ({ ingestHandler: receiptsRoute } = await import("../functions/hmrc/hmrcReceiptGet.js"));
  ({ clientId: ownClientId } = await createClient("practice-sub", { displayName: "Bright Tiles Ltd" }));
  ({ clientId: anotherPracticesClientId } = await createClient("another-sub", { displayName: "North Wharf Ltd" }));
  await putAsyncRequest("practice-sub", "PRC005", "pending", { kind: "accounts", clientId: ownClientId }, tableName, retention);
  await putAsyncRequest("another-sub", "PRC006", "pending", { kind: "accounts", clientId: anotherPracticesClientId }, tableName, retention);
  await putReceipt("practice-sub", "2026-11-01T10:00:00.000Z-OWN", { kind: "accounts" }, "customer");
  await putReceipt("practice-sub", "2026-11-02T10:00:00.000Z-CLIENT", { kind: "accounts" }, "customer", ownClientId);
});

afterAll(() => stopDynalite?.());

const numbersOf = (filings) => filings.map((filing) => filing.submissionNumber);

describe("a practice's Companies House filings in progress against DynamoDB", () => {
  test("the practice's own list holds only the filing made for no client", async () => {
    expect(numbersOf(await listFilingsInProgress("practice-sub"))).toEqual(["PRC001"]);
  });

  test("each client's list holds that client's pending or rejected filing", async () => {
    expect(numbersOf(await listFilingsInProgress("practice-sub", "client-1"))).toEqual(["PRC002"]);
    expect(await listFilingsInProgress("practice-sub", "client-2")).toEqual([
      {
        submissionNumber: "PRC003",
        kind: "confirmation-statement",
        status: "rejected",
        submittedAt: expect.any(String),
        rejections: [{ rejectCode: "1", description: "No" }],
        clientId: "client-2",
      },
    ]);
  });

  test("a client id holds none of another user's filings", async () => {
    expect(await listFilingsInProgress("another-sub", "client-1")).toEqual([]);
    expect(numbersOf(await listFilingsInProgress("another-sub"))).toEqual(["PRC004"]);
  });
});

describe("the receipts route for a practice against DynamoDB", () => {
  const listed = async (sub, clientId) => {
    const response = await receiptsRoute(signedInAs(sub, clientId));
    const body = JSON.parse(response.body);
    return {
      status: response.statusCode,
      filings: numbersOf(body.filingsInProgress ?? []),
      receipts: (body.receipts ?? []).map((receipt) => receipt.receiptId),
    };
  };

  test("the practice's own list holds no client's filing or receipt", async () => {
    expect(await listed("practice-sub")).toEqual({ status: 200, filings: ["PRC001"], receipts: ["2026-11-01T10:00:00.000Z-OWN"] });
  });

  test("the list for the practice's client holds only that client's filing and receipt", async () => {
    expect(await listed("practice-sub", ownClientId)).toEqual({
      status: 200,
      filings: ["PRC005"],
      receipts: ["2026-11-02T10:00:00.000Z-CLIENT"],
    });
  });

  test("another practice's client id is refused, with no filing and no receipt in the answer", async () => {
    for (const [sub, clientId] of [
      ["practice-sub", anotherPracticesClientId],
      ["another-sub", ownClientId],
      ["practice-sub", "client-1"],
    ]) {
      const response = await receiptsRoute(signedInAs(sub, clientId));
      expect(response.statusCode).toBe(403);
      expect(response.headers["Content-Type"]).toBe("application/json");
      expect(response.body).not.toMatch(/PRC0|OWN|CLIENT/);
    }
  });
});
