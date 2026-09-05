// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/unit-tests/bundleEnforcement.test.js

import { beforeEach, describe, expect, test, vi } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
// Import real functions from bundleManagement
import { BundleAuthorizationError, BundleEntitlementError, enforceBundles } from "@app/services/bundleManagement.js";
import { getUserBundles } from "@app/data/dynamoDbBundleRepository.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

// Mock the DynamoDB bundle store at the module boundary used by bundleManagement
vi.mock("@app/data/dynamoDbBundleRepository.js", () => ({
  getUserBundles: vi.fn(),
  putBundle: vi.fn(),
  deleteBundle: vi.fn(),
  deleteAllBundles: vi.fn(),
  isDynamoDbEnabled: vi.fn(() => true),
}));

// Import the mocked functions for assertions in tests that go via Dynamo
//import * as dynamoDbBundleStore from "@app/data/dynamoDbBundleRepository.js";
//import { getUserBundles } from "@app/data/dynamoDbBundleRepository.js";

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

describe("bundleEnforcement.js", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      DIY_SUBMIT_ENFORCE_BUNDLES: "true",
      HMRC_BASE_URI: "https://test-api.service.hmrc.gov.uk",
      // Ensure we do NOT use mock bundle store for enforceBundles tests by default
      TEST_BUNDLE_MOCK: "false",
    };
  });

  describe("enforceBundles", () => {
    test("should throw BundleAuthorizationError when no authorization token", async () => {
      const event = buildEvent(null);

      await expect(enforceBundles(event)).rejects.toThrow(BundleAuthorizationError);
      await expect(enforceBundles(event)).rejects.toThrow("Missing Authorization Bearer token");
    });

    test("should throw BundleEntitlementError when JWT is invalid", async () => {
      const event = buildEvent("invalid-token");

      await expect(enforceBundles(event)).rejects.toThrow(BundleAuthorizationError);
    });

    test("should allow synthetic access with test bundle", async () => {
      process.env.HMRC_BASE_URI = "https://test-api.service.hmrc.gov.uk";
      const token = makeJWT("user-with-test-bundle");
      const authorizerContext = {
        "sub": "user-with-test-bundle",
        "cognito:username": "test",
        "email": "test@test.submit.diyaccunting.co.uk",
        "scope": "read write",
      };
      const event = buildEvent(token, authorizerContext);

      // Dynamo returns objects; enforceBundles maps to bundleId
      getUserBundles.mockResolvedValue([{ bundleId: "day-guest", expiry: new Date().toISOString() }]);

      // Should not throw
      await enforceBundles(event);

      expect(getUserBundles).toHaveBeenCalledWith("user-with-test-bundle");
    });

    test("should allow synthetic access with test bundle with expiry", async () => {
      process.env.HMRC_BASE_URI = "https://test-api.service.hmrc.gov.uk";
      const token = makeJWT("user-with-test-bundle-expiry");
      const authorizerContext = {
        "sub": "user-with-test-bundle-expiry",
        "cognito:username": "test",
        "email": "test@test.submit.diyaccunting.co.uk",
        "scope": "read write",
      };
      const event = buildEvent(token, authorizerContext);

      getUserBundles.mockResolvedValue([{ bundleId: "day-guest", expiry: new Date().toISOString() }]);

      // Should not throw
      await enforceBundles(event);

      expect(getUserBundles).toHaveBeenCalledWith("user-with-test-bundle-expiry");
    });

    test("should deny vat return access without test or guest bundle", async () => {
      process.env.HMRC_BASE_URI = "https://test-api.service.hmrc.gov.uk";
      const token = makeJWT("user-without-bundle");
      const authorizerContext = {
        "sub": "user-without-bundle",
        "cognito:username": "test",
        "email": "test@test.submit.diyaccunting.co.uk",
        "scope": "read write",
      };
      const hmrcVatReturnGetUrlPath = "/api/v1/hmrc/vat/return";
      const event = buildEvent(token, authorizerContext, hmrcVatReturnGetUrlPath);

      getUserBundles.mockResolvedValue([]);

      await expect(enforceBundles(event)).rejects.toThrow(BundleEntitlementError);
    });

    test("should allow production access with guest bundle", async () => {
      process.env.HMRC_BASE_URI = "https://api.service.hmrc.gov.uk";
      const token = makeJWT("user-with-prod-bundle");
      const authorizerContext = {
        "sub": "user-with-prod-bundle",
        "cognito:username": "test",
        "email": "test@test.submit.diyaccunting.co.uk",
        "scope": "read write",
      };
      const event = buildEvent(token, authorizerContext);

      getUserBundles.mockResolvedValue([{ bundleId: "guest", expiry: new Date().toISOString() }]);

      // Should not throw
      await enforceBundles(event);

      expect(getUserBundles).toHaveBeenCalledWith("user-with-prod-bundle");
    });

    test("should allow production access with business bundle", async () => {
      process.env.HMRC_BASE_URI = "https://api.service.hmrc.gov.uk";
      const token = makeJWT("user-with-legacy-bundle");
      const authorizerContext = {
        "sub": "user-with-legacy-bundle",
        "cognito:username": "test",
        "email": "test@test.submit.diyaccunting.co.uk",
        "scope": "read write",
      };
      const event = buildEvent(token, authorizerContext);

      getUserBundles.mockResolvedValue([{ bundleId: "business", expiry: new Date().toISOString() }]);

      // Should not throw
      await enforceBundles(event);

      expect(getUserBundles).toHaveBeenCalledWith("user-with-legacy-bundle");
    });

    test("should allow production access with guest bundle with expiry", async () => {
      process.env.HMRC_BASE_URI = "https://api.service.hmrc.gov.uk";
      const token = makeJWT("user-with-prod-bundle-expiry");
      const authorizerContext = {
        "sub": "user-with-prod-bundle-expiry",
        "cognito:username": "test",
        "email": "test@test.submit.diyaccunting.co.uk",
        "scope": "read write",
      };
      const event = buildEvent(token, authorizerContext);

      getUserBundles.mockResolvedValue([{ bundleId: "guest", expiry: new Date().toISOString() }]);

      // Should not throw
      await enforceBundles(event);

      expect(getUserBundles).toHaveBeenCalledWith("user-with-prod-bundle-expiry");
    });

    test("should extract user info from authorizer context", async () => {
      process.env.HMRC_BASE_URI = "https://test-api.service.hmrc.gov.uk";
      const authorizerContext = {
        sub: "user-from-authorizer",
        username: "testuser",
      };
      const event = buildEvent(null, authorizerContext);

      getUserBundles.mockResolvedValue([{ bundleId: "day-guest", expiry: new Date().toISOString() }]);

      // Should not throw
      await enforceBundles(event);

      expect(getUserBundles).toHaveBeenCalledWith("user-from-authorizer");
    });
  });
});
