// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// System tests for bundle capacity (cap) enforcement and per-user uniqueness.
//
// The cap field on a catalogue bundle is a GLOBAL limit on the total number of
// active (non-expired) allocations of that bundle across all users.
//
// Hard-wired rules:
// - Each user can hold at most one of each bundle type
// - Renewal refreshes the existing allocation's expiry (not a new record)
//
// Global cap enforcement uses an atomic counter table with
// ConditionExpression: if_not_exists(activeCount, :zero) < :cap

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ingestHandler as bundlePostHandler } from "@app/functions/account/bundlePost.js";
import { ingestHandler as bundleGetHandler } from "@app/functions/account/bundleGet.js";
import { getBundle } from "./helpers/catalogueValues.js";

let stopDynalite;
let bundleRepository;

const tableName = "bundles-system-test-capacity";
const capacityTableName = "bundle-capacity-system-test";

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

function buildPostEvent(token, body = {}) {
  return {
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    requestContext: {
      http: { method: "POST", path: "/api/v1/bundle" },
    },
  };
}

function buildGetEvent(token) {
  return {
    headers: { Authorization: `Bearer ${token}` },
    requestContext: {
      http: { method: "GET", path: "/api/v1/bundle" },
    },
  };
}

beforeAll(async () => {
  const { ensureBundleTableExists, ensureCapacityTableExists } = await import("../bin/dynamodb.js");
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
  process.env.BUNDLE_DYNAMODB_TABLE_NAME = tableName;
  process.env.BUNDLE_CAPACITY_DYNAMODB_TABLE_NAME = capacityTableName;
  process.env.USER_SUB_HASH_SALT = '{"current":"v1","versions":{"v1":"test-salt-for-capacity-tests"}}';

  const { initializeSalt } = await import("../services/subHasher.js");
  await initializeSalt();

  await ensureBundleTableExists(tableName, endpoint);
  await ensureCapacityTableExists(capacityTableName, endpoint);

  bundleRepository = await import("../data/dynamoDbBundleRepository.js");
});

afterAll(async () => {
  try {
    await stopDynalite?.();
  } catch {}
});

describe("System: bundle capacity and per-user uniqueness", () => {
  describe("per-user uniqueness (hard-wired rule)", () => {
    it("should grant a bundle to a new user", async () => {
      const token = makeJWT("cap-unique-user-1");
      const event = buildPostEvent(token, { bundleId: "invited-guest", qualifiers: {} });
      const res = await bundlePostHandler(event);
      const body = JSON.parse(res.body);
      expect(res.statusCode).toBe(201);
      expect(body.status).toBe("granted");
    });

    it("should re-grant when same user requests same bundle again", async () => {
      const token = makeJWT("cap-unique-user-2");
      const event = buildPostEvent(token, { bundleId: "invited-guest", qualifiers: {} });

      // First request - granted
      const res1 = await bundlePostHandler(event);
      expect(JSON.parse(res1.body).status).toBe("granted");

      // Second request - existing bundle deleted and re-granted with fresh tokens
      const res2 = await bundlePostHandler(event);
      const body2 = JSON.parse(res2.body);
      expect(res2.statusCode).toBe(201);
      expect(body2.status).toBe("granted");
      expect(body2.granted).toBe(true);
    });

    it("should allow same user to have different bundle types", async () => {
      const token = makeJWT("cap-unique-user-3");

      const res1 = await bundlePostHandler(buildPostEvent(token, { bundleId: "invited-guest", qualifiers: {} }));
      expect(JSON.parse(res1.body).status).toBe("granted");

      const res2 = await bundlePostHandler(buildPostEvent(token, { bundleId: "resident-guest", qualifiers: {} }));
      expect(JSON.parse(res2.body).status).toBe("granted");

      // Verify user has both bundles
      const getRes = await bundleGetHandler(buildGetEvent(token));
      const bundles = JSON.parse(getRes.body).bundles;
      const bundleIds = bundles.map((b) => b.bundleId);
      expect(bundleIds).toContain("invited-guest");
      expect(bundleIds).toContain("resident-guest");
    });
  });

  describe("global cap enforcement via atomic counter", () => {
    it("should reject allocation when cap is reached (day-guest)", async () => {
      const dayGuestCap = getBundle("day-guest").cap;
      expect(dayGuestCap).toBeGreaterThan(0);

      const { putCounter } = await import("../data/dynamoDbCapacityRepository.js");
      await putCounter("day-guest", dayGuestCap);

      const token = makeJWT("cap-fresh-user");
      const event = buildPostEvent(token, { bundleId: "day-guest", qualifiers: {} });
      const res = await bundlePostHandler(event);
      const body = JSON.parse(res.body);
      expect(res.statusCode).toBe(403);
      expect(body.status).toBe("cap_reached");
    });

    it("should grant bundle when no cap is defined", async () => {
      // invited-guest has no cap field — uncapped bundles are always grantable
      const token = makeJWT("cap-no-cap-user");
      const event = buildPostEvent(token, { bundleId: "invited-guest", qualifiers: {} });
      const res = await bundlePostHandler(event);
      const body = JSON.parse(res.body);
      expect(res.statusCode).toBe(201);
      expect(body.status).toBe("granted");
    });

    it("should reject all users when cap is fully consumed", async () => {
      const dayGuestCap = getBundle("day-guest").cap;

      const { putCounter } = await import("../data/dynamoDbCapacityRepository.js");
      await putCounter("day-guest", dayGuestCap);

      const token1 = makeJWT("cap-user-full-1");
      const res1 = await bundlePostHandler(buildPostEvent(token1, { bundleId: "day-guest", qualifiers: {} }));
      const body1 = JSON.parse(res1.body);
      expect(res1.statusCode).toBe(403);
      expect(body1.status).toBe("cap_reached");

      // A second user also rejected
      const token2 = makeJWT("cap-user-full-2");
      const res2 = await bundlePostHandler(buildPostEvent(token2, { bundleId: "day-guest", qualifiers: {} }));
      const body2 = JSON.parse(res2.body);
      expect(res2.statusCode).toBe(403);
      expect(body2.status).toBe("cap_reached");
    });
  });

  describe("bundleGet availability", () => {
    it("should return bundleCapacityAvailable in GET response", async () => {
      const token = makeJWT("cap-get-user");
      const getRes = await bundleGetHandler(buildGetEvent(token));
      expect(getRes.statusCode).toBe(200);
      const body = JSON.parse(getRes.body);
      expect(body.bundles).toBeDefined();

      // All bundles should have bundleCapacityAvailable field
      for (const bundle of body.bundles) {
        expect(bundle).toHaveProperty("bundleCapacityAvailable");
      }
    });

    it("should report tokensRemaining in GET response", async () => {
      const token = makeJWT("cap-tokens-user");
      const getRes = await bundleGetHandler(buildGetEvent(token));
      expect(getRes.statusCode).toBe(200);
      const body = JSON.parse(getRes.body);
      expect(body).toHaveProperty("tokensRemaining");
      expect(typeof body.tokensRemaining).toBe("number");
    });
  });

  describe("multiple users allocating same bundle", () => {
    it("should allow different users to each get the same uncapped bundle type", async () => {
      // invited-guest has no cap — multiple users can each allocate it
      const users = ["cap-multi-user-a", "cap-multi-user-b", "cap-multi-user-c"];
      for (const userId of users) {
        const token = makeJWT(userId);
        const event = buildPostEvent(token, { bundleId: "invited-guest", qualifiers: {} });
        const res = await bundlePostHandler(event);
        const body = JSON.parse(res.body);
        expect(res.statusCode).toBe(201);
        expect(body.status).toBe("granted");
      }

      // Verify each user independently has the bundle
      for (const userId of users) {
        const bundles = await bundleRepository.getUserBundles(userId);
        const testBundle = bundles.find((b) => b.bundleId === "invited-guest");
        expect(testBundle).toBeDefined();
      }
    });
  });

  describe("reconciliation Lambda", () => {
    it("should reconcile counter to correct active allocation count", async () => {
      const { putCounter, getCounter } = await import("../data/dynamoDbCapacityRepository.js");
      const { handler: reconcileHandler } = await import("../functions/account/bundleCapacityReconcile.js");

      // Set counter to an incorrect value
      await putCounter("day-guest", 999);

      // Run reconciliation
      await reconcileHandler({});

      // Counter should now reflect actual active allocations (not 999)
      const counter = await getCounter("day-guest");
      expect(counter).toBeDefined();
      expect(counter.activeCount).toBeLessThan(999);
    });
  });
});
