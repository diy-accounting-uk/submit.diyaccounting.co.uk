// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// System tests for pass creation, validation, and redemption.
//
// Uses dynalite for DynamoDB and exercises the actual Lambda handlers:
// - passAdminPost (create a pass)
// - passGet (check pass validity)
// - passPost (redeem a pass, which grants a bundle)
// - bundleGet (verify the granted bundle appears)

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ingestHandler as passAdminPostHandler } from "@app/functions/account/passAdminPost.js";
import { ingestHandler as passGetHandler } from "@app/functions/account/passGet.js";
import { ingestHandler as passPostHandler } from "@app/functions/account/passPost.js";
import { ingestHandler as bundleGetHandler } from "@app/functions/account/bundleGet.js";

let stopDynalite;

const passesTableName = "passes-system-test-redemption";
const bundleTableName = "bundles-system-test-redemption";
const capacityTableName = "capacity-system-test-redemption";

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

function buildAdminPostEvent(body = {}) {
  return {
    headers: {},
    body: JSON.stringify(body),
    requestContext: {
      http: { method: "POST", path: "/api/v1/pass/admin" },
    },
  };
}

function buildGetEvent(code) {
  return {
    headers: {},
    queryStringParameters: { code },
    rawQueryString: `code=${code}`,
    requestContext: {
      http: { method: "GET", path: "/api/v1/pass" },
    },
  };
}

function buildRedeemEvent(token, code) {
  return {
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ code }),
    requestContext: {
      http: { method: "POST", path: "/api/v1/pass" },
    },
  };
}

function buildBundleGetEvent(token) {
  return {
    headers: { Authorization: `Bearer ${token}` },
    requestContext: {
      http: { method: "GET", path: "/api/v1/bundle" },
    },
  };
}

beforeAll(async () => {
  const { ensureBundleTableExists, ensureCapacityTableExists, ensurePassesTableExists } = await import("../bin/dynamodb.js");
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
  process.env.PASSES_DYNAMODB_TABLE_NAME = passesTableName;
  process.env.BUNDLE_DYNAMODB_TABLE_NAME = bundleTableName;
  process.env.BUNDLE_CAPACITY_DYNAMODB_TABLE_NAME = capacityTableName;
  process.env.USER_SUB_HASH_SALT = '{"current":"v1","versions":{"v1":"test-salt-for-pass-tests"}}';

  const { initializeSalt } = await import("../services/subHasher.js");
  await initializeSalt();

  const { _setTestEmailHashSecret } = await import("../lib/emailHash.js");
  _setTestEmailHashSecret("test-email-hash-secret-for-pass-system-tests", "test-v1");

  await ensurePassesTableExists(passesTableName, endpoint);
  await ensureBundleTableExists(bundleTableName, endpoint);
  await ensureCapacityTableExists(capacityTableName, endpoint);
});

afterAll(async () => {
  try {
    await stopDynalite?.();
  } catch {}
});

describe("System: pass creation and redemption", () => {
  let createdPassCode;

  describe("admin pass creation", () => {
    it("should create a pass via admin API", async () => {
      const event = buildAdminPostEvent({
        passTypeId: "day-guest-test-pass",
        bundleId: "day-guest",
        validityPeriod: "P7D",
        maxUses: 3,
        createdBy: "system-test",
      });

      const res = await passAdminPostHandler(event);
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      expect(body.code).toBeTruthy();
      expect(body.bundleId).toBe("day-guest");
      expect(body.passTypeId).toBe("day-guest-test-pass");
      expect(body.maxUses).toBe(3);

      createdPassCode = body.code;
    });

    it("should reject creation with missing required fields", async () => {
      const event = buildAdminPostEvent({ passTypeId: "day-guest-test-pass" });
      const res = await passAdminPostHandler(event);
      expect(res.statusCode).toBe(400);
    });
  });

  describe("pass validation (GET)", () => {
    it("should report pass as valid", async () => {
      const event = buildGetEvent(createdPassCode);
      const res = await passGetHandler(event);
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      expect(body.valid).toBe(true);
      expect(body.bundleId).toBe("day-guest");
      expect(body.usesRemaining).toBe(3);
    });

    it("should report not_found for nonexistent pass", async () => {
      const event = buildGetEvent("nonexistent-pass-code");
      const res = await passGetHandler(event);
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      expect(body.valid).toBe(false);
      expect(body.reason).toBe("not_found");
    });

    it("should return 400 when code is missing", async () => {
      const event = {
        headers: {},
        queryStringParameters: {},
        rawQueryString: "",
        requestContext: { http: { method: "GET", path: "/api/v1/pass" } },
      };
      const res = await passGetHandler(event);
      expect(res.statusCode).toBe(400);
    });
  });

  describe("pass redemption (POST /api/v1/pass)", () => {
    it("should redeem pass and grant bundle", async () => {
      const token = makeJWT("pass-user-1");
      const event = buildRedeemEvent(token, createdPassCode);
      const res = await passPostHandler(event);
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      expect(body.redeemed).toBe(true);
      expect(body.bundleId).toBe("day-guest");
      expect(body.grantStatus).toBe("granted");
    });

    it("should verify bundle appears in user bundles after redemption", async () => {
      const token = makeJWT("pass-user-1");
      const event = buildBundleGetEvent(token);
      const res = await bundleGetHandler(event);
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      const allocatedBundles = body.bundles.filter((b) => b.allocated);
      const testBundle = allocatedBundles.find((b) => b.bundleId === "day-guest");
      expect(testBundle).toBeTruthy();
    });

    it("should allow second redemption (use 2 of 3)", async () => {
      const token = makeJWT("pass-user-2");
      const event = buildRedeemEvent(token, createdPassCode);
      const res = await passPostHandler(event);
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      expect(body.redeemed).toBe(true);
    });

    it("should allow third redemption (use 3 of 3)", async () => {
      const token = makeJWT("pass-user-3");
      const event = buildRedeemEvent(token, createdPassCode);
      const res = await passPostHandler(event);
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      expect(body.redeemed).toBe(true);
    });

    it("should report pass as exhausted after all uses consumed", async () => {
      // Verify via GET that the pass is now exhausted
      const getRes = await passGetHandler(buildGetEvent(createdPassCode));
      const getBody = JSON.parse(getRes.body);

      expect(getBody.valid).toBe(false);
      expect(getBody.reason).toBe("exhausted");
    });

    it("should fail to redeem exhausted pass", async () => {
      const token = makeJWT("pass-user-4");
      const event = buildRedeemEvent(token, createdPassCode);
      const res = await passPostHandler(event);
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      expect(body.redeemed).toBe(false);
      expect(body.reason).toBe("exhausted");
    });

    it("should fail to redeem nonexistent pass", async () => {
      const token = makeJWT("pass-user-5");
      const event = buildRedeemEvent(token, "totally-fake-pass");
      const res = await passPostHandler(event);
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      expect(body.redeemed).toBe(false);
      expect(body.reason).toBe("not_found");
    });

    it("should require authentication", async () => {
      const event = {
        headers: {},
        body: JSON.stringify({ code: createdPassCode }),
        requestContext: { http: { method: "POST", path: "/api/v1/pass" } },
      };
      const res = await passPostHandler(event);
      expect(res.statusCode).toBe(401);
    });
  });

  describe("test pass with synthetic qualifier", () => {
    let testPassCode;

    it("should create a test pass with testPass: true", async () => {
      const event = buildAdminPostEvent({
        passTypeId: "day-guest-test-pass",
        bundleId: "day-guest",
        testPass: true,
        validityPeriod: "P30D",
        maxUses: 10,
        createdBy: "system-test",
      });

      const res = await passAdminPostHandler(event);
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      expect(body.testPass).toBe(true);
      expect(body.bundleId).toBe("day-guest");
      testPassCode = body.code;
    });

    it("should redeem test pass and store synthetic qualifier on bundle", async () => {
      const token = makeJWT("test-pass-user-1");
      const event = buildRedeemEvent(token, testPassCode);
      const res = await passPostHandler(event);
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      expect(body.redeemed).toBe(true);
      expect(body.bundleId).toBe("day-guest");
    });

    it("should show synthetic qualifier on bundle via GET", async () => {
      const token = makeJWT("test-pass-user-1");
      const event = buildBundleGetEvent(token);
      const res = await bundleGetHandler(event);
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      const dayGuest = body.bundles.find((b) => b.bundleId === "day-guest" && b.allocated);
      expect(dayGuest).toBeTruthy();
      expect(dayGuest.qualifiers).toEqual({ synthetic: true });
    });
  });

  describe("expired pass", () => {
    let expiredPassCode;

    it("should create a pass that is already expired", async () => {
      const event = buildAdminPostEvent({
        passTypeId: "day-guest-test-pass",
        bundleId: "day-guest",
        validFrom: "2020-01-01T00:00:00.000Z",
        validUntil: "2020-01-02T00:00:00.000Z",
        maxUses: 1,
        createdBy: "system-test",
      });

      const res = await passAdminPostHandler(event);
      const body = JSON.parse(res.body);
      expect(res.statusCode).toBe(200);
      expiredPassCode = body.code;
    });

    it("should report expired pass via GET", async () => {
      const event = buildGetEvent(expiredPassCode);
      const res = await passGetHandler(event);
      const body = JSON.parse(res.body);

      expect(body.valid).toBe(false);
      expect(body.reason).toBe("expired");
    });

    it("should fail to redeem expired pass", async () => {
      const token = makeJWT("pass-user-expired");
      const event = buildRedeemEvent(token, expiredPassCode);
      const res = await passPostHandler(event);
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      expect(body.redeemed).toBe(false);
      expect(body.reason).toBe("expired");
    });
  });
});
