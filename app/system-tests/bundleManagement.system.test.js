// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect, beforeAll, afterAll, beforeEach, test } from "vitest";
import { buildEventWithToken, makeIdToken } from "@app/test-helpers/eventBuilders.js";
import { ingestHandler as bundlePostHandler } from "@app/functions/account/bundlePost.js";
import { parseResponseBody } from "@app/test-helpers/mockHelpers.js";
import { ingestHandler as bundleGetHandler } from "@app/functions/account/bundleGet.js";

// We mirror the dynalite setup used by dynamoDbBundleStore.system.test.js
let stopDynalite;
/** @typedef {typeof import("../services/bundleManagement.js")} BundleManagement */
/** @type {BundleManagement} */
let bm;

// Dynamo db repository imported here
let bundleRepository;

const tableName = "bundles-system-test-bm";

function base64UrlEncode(obj) {
  const json = JSON.stringify(obj);
  return Buffer.from(json).toString("base64").replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function makeJWT(sub = "user-123", extra = {}) {
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

function buildEvent(token, authorizerContext = null, urlPath = null, body = {}) {
  const event = {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: JSON.stringify(body),
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

  // Minimal AWS SDK env for local usage with endpoint override
  process.env.AWS_REGION = process.env.AWS_REGION || "us-east-1";
  process.env.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || "dummy";
  process.env.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || "dummy";

  process.env.AWS_ENDPOINT_URL = endpoint;
  process.env.AWS_ENDPOINT_URL_DYNAMODB = endpoint;

  process.env.BUNDLE_DYNAMODB_TABLE_NAME = tableName;

  // Set salt for hashing user subs (required by subHasher.js)
  process.env.USER_SUB_HASH_SALT = '{"current":"v1","versions":{"v1":"test-salt-for-system-tests"}}';

  // Initialize the salt before importing modules that use hashSub
  const { initializeSalt } = await import("../services/subHasher.js");
  await initializeSalt();

  await ensureBundleTableExists(tableName, endpoint);

  // Import after env configured
  bm = await import("../services/bundleManagement.js");
  bundleRepository = await import("../data/dynamoDbBundleRepository.js");
});

afterAll(async () => {
  try {
    await stopDynalite?.();
  } catch {
    // ignore
  }
});

beforeEach(() => {
  // Default: no mock mode for tests unless explicitly enabled in a test
  delete process.env.TEST_BUNDLE_MOCK;
});

describe("System: bundleManagement with local dynalite", () => {
  it("getUserBundles should return [] initially (Dynamo mode)", async () => {
    const userId = "bm-sys-empty";
    const bundles = await bundleRepository.getUserBundles(userId);
    expect(Array.isArray(bundles)).toBe(true);
    expect(bundles.length).toBe(0);
  });

  it("updateUserBundles should add new bundles and getUserBundles should retrieve them (Dynamo mode)", async () => {
    const userId = "bm-sys-add";
    const expiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const bundlesToSet = [
      { bundleId: "day-guest", expiry },
      { bundleId: "test", expiry },
    ];

    await bm.updateUserBundles(userId, bundlesToSet);

    const after = await bundleRepository.getUserBundles(userId);
    const ids = after.map((b) => b.bundleId);
    expect(new Set(ids)).toEqual(new Set(["day-guest", "test"]));
  });

  it("updateUserBundles should remove bundles not present in next update (Dynamo mode)", async () => {
    const userId = "bm-sys-remove";
    const expiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    await bm.updateUserBundles(userId, [
      { bundleId: "day-guest", expiry },
      { bundleId: "test", expiry },
    ]);

    await bm.updateUserBundles(userId, [{ bundleId: "day-guest", expiry }]);

    const after = await bundleRepository.getUserBundles(userId);
    const ids = after.map((b) => b.bundleId);
    expect(ids).toContain("day-guest");
    expect(ids).not.toContain("test");
  });

  it("enforceBundles should pass when no non-automatic bundles are required (unknown path)", async () => {
    const sub = "bm-auth-user";
    const token = makeJWT(sub);
    const authorizer = { sub, "cognito:username": "u" };
    const event = buildEvent(token, authorizer, "/unknown/path");

    // Should not throw even if user has no bundles, because required = []
    await bm.enforceBundles(event);
  });

  it("enforceBundles should fail without a required bundle for HMRC paths, then pass after grant (Dynamo mode)", async () => {
    const sub = "bm-enforce-user";
    const token = makeJWT(sub);
    const authorizer = { sub, "cognito:username": sub };
    const hmrcPath = "/api/v1/hmrc/vat/return";
    const event = buildEvent(token, authorizer, hmrcPath);

    await expect(bm.enforceBundles(event)).rejects.toThrow();

    // Grant a qualifying bundle and try again
    const expiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await bm.updateUserBundles(sub, [{ bundleId: "day-guest", expiry }]);

    await bm.enforceBundles(event); // should not throw now
  });
});
