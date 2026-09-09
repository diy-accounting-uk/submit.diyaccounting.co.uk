// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";

/** @typedef {typeof import("../services/bundleManagement.js")} BundleManagement */
/** @type {BundleManagement} */
let bm;
/** @type {typeof import("../services/subHasher.js").hashSub} */
let hashSub;
let stopDynalite;
const bundlesTableName = "bundles-system-test-bm-journeys";

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
  const hashedSubValue = hashSub(userId);
  const doc = makeDocClient();
  const resp = await doc.send(
    new QueryCommand({
      TableName: bundlesTableName,
      KeyConditionExpression: "hashedSub = :h",
      ExpressionAttributeValues: { ":h": hashedSubValue },
    }),
  );
  return resp.Items || [];
}

function base64UrlEncode(obj) {
  const json = JSON.stringify(obj);
  return Buffer.from(json).toString("base64").replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function makeJWT(sub = "user-journey", extra = {}) {
  const header = { alg: "none", typ: "JWT" };
  const payload = {
    sub,
    email: `${sub}@example.com`,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...extra,
  };
  return `${base64UrlEncode(header)}.${base64UrlEncode(payload)}.`;
}

function buildEvent(token, authorizerContext = null, urlPath = null) {
  const event = {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  };

  if (authorizerContext) {
    event.requestContext = {
      authorizer: {
        lambda: authorizerContext,
      },
    };
  }

  if (urlPath) {
    event.requestContext = event.requestContext || {};
    event.requestContext.http = event.requestContext.http || {};
    event.requestContext.http.path = urlPath;
  }

  return event;
}

beforeAll(async () => {
  const { ensureBundleTableExists } = await import("../bin/dynamodb.js");
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
  process.env.BUNDLE_DYNAMODB_TABLE_NAME = bundlesTableName;

  // Set salt for hashing user subs (required by subHasher.js)
  process.env.USER_SUB_HASH_SALT = '{"current":"v1","versions":{"v1":"test-salt-for-system-tests"}}';

  // Initialize the salt before importing modules that use hashSub
  const subHasher = await import("../services/subHasher.js");
  await subHasher.initializeSalt();
  hashSub = subHasher.hashSub;

  await ensureBundleTableExists(bundlesTableName, endpoint);

  bm = await import("../services/bundleManagement.js");
});

afterAll(async () => {
  try {
    await stopDynalite?.();
  } catch {}
});

describe("System journeys: bundleManagement", () => {
  it("journey: enforcement fail → add bundle → succeed → remove bundle → fail (Dynamo mode)", async () => {
    delete process.env.TEST_BUNDLE_MOCK; // ensure we go via Dynamo
    const sub = "bm-journey-enforce";
    const token = makeJWT(sub);
    const authorizer = { sub, "cognito:username": "journey" };
    const hmrcPath = "/api/v1/hmrc/vat/return";
    const event = buildEvent(token, authorizer, hmrcPath);

    // 1) Fail due to missing bundle
    await expect(bm.enforceBundles(event)).rejects.toThrow();

    // 2) Add qualifying bundle and succeed
    const expiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await bm.updateUserBundles(sub, [{ bundleId: "day-guest", expiry }]);
    // Verify persisted in DynamoDB directly
    const itemsAfterAdd = await queryBundlesForUser(sub);
    expect(itemsAfterAdd.find((it) => it.bundleId === "day-guest")).toBeTruthy();
    await bm.enforceBundles(event); // should pass now

    // 3) Remove bundle and fail again
    await bm.updateUserBundles(sub, []);
    // Verify removal persisted
    const itemsAfterRemove = await queryBundlesForUser(sub);
    expect(itemsAfterRemove.find((it) => it.bundleId === "day-guest")).toBeUndefined();
    await expect(bm.enforceBundles(event)).rejects.toThrow();
  });
});
