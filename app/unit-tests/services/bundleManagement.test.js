// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

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

    test("should throw BundleEntitlementError for a gated activity's path when the environment is not listed", async () => {
      process.env.ENVIRONMENT_NAME = "prod";
      const token = makeJWT("user-env-restricted");
      const authorizerContext = {
        "sub": "user-env-restricted",
        "cognito:username": "test",
        "email": "test@test.submit.diyaccunting.co.uk",
        "scope": "read write",
      };
      const event = buildEvent(token, authorizerContext, "/api/v1/hmrc/itsa/business-details");

      getUserBundles.mockResolvedValue([{ bundleId: "resident-itsa", expiry: new Date().toISOString() }]);

      await expect(enforceBundles(event)).rejects.toMatchObject({
        name: "BundleEntitlementError",
        details: { code: "ACTIVITY_ENVIRONMENT_RESTRICTED", activityId: "self-employed" },
      });
    });

    test("should pass a gated activity's path when the environment is listed", async () => {
      process.env.ENVIRONMENT_NAME = "ci";
      const token = makeJWT("user-env-allowed");
      const authorizerContext = {
        "sub": "user-env-allowed",
        "cognito:username": "test",
        "email": "test@test.submit.diyaccunting.co.uk",
        "scope": "read write",
      };
      const event = buildEvent(token, authorizerContext, "/api/v1/hmrc/vat/liability");

      getUserBundles.mockResolvedValue([{ bundleId: "day-guest", expiry: new Date().toISOString() }]);

      // Should not throw
      await enforceBundles(event);
    });

    test("should not restrict a path whose matching activities carry no environments field", async () => {
      process.env.ENVIRONMENT_NAME = "prod";
      const token = makeJWT("user-unrestricted-activity");
      const authorizerContext = {
        "sub": "user-unrestricted-activity",
        "cognito:username": "test",
        "email": "test@test.submit.diyaccunting.co.uk",
        "scope": "read write",
      };
      const event = buildEvent(token, authorizerContext, "/api/v1/hmrc/vat/return");

      getUserBundles.mockResolvedValue([{ bundleId: "day-guest", expiry: new Date().toISOString() }]);

      // Should not throw for environment reasons (submit-vat and view-vat-return carry no environments field)
      await enforceBundles(event);
    });

    // B117: the catalogue has no entry-per-endpoint check anywhere else, so this is the only
    // place that proves enforceBundles() actually refuses a caller with no ITSA bundle for
    // every submitting ITSA activity (quarterly updates, annual submissions, losses and claims,
    // tax liability adjustments, final declaration) - not just that the catalogue parses.
    describe("ITSA submitting activities refuse an ungated caller", () => {
      const submittingItsaPaths = [
        "/api/v1/hmrc/itsa/self-employment/period",
        "/api/v1/hmrc/itsa/uk-property/period",
        "/api/v1/hmrc/itsa/self-employment/annual",
        "/api/v1/hmrc/itsa/uk-property/annual",
        "/api/v1/hmrc/itsa/losses-and-claims",
        "/api/v1/hmrc/itsa/tax-liability-adjustments",
        "/api/v1/hmrc/itsa/bsas/self-employment/adjust",
        "/api/v1/hmrc/itsa/bsas/uk-property/adjust",
        "/api/v1/hmrc/itsa/final-declaration",
      ];

      test.each(submittingItsaPaths)("refuses %s for a caller with no resident-itsa/resident-pro bundle", async (urlPath) => {
        process.env.ENVIRONMENT_NAME = "ci";
        const token = makeJWT("user-without-itsa-bundle");
        const authorizerContext = {
          "sub": "user-without-itsa-bundle",
          "cognito:username": "test",
          "email": "test@test.submit.diyaccunting.co.uk",
          "scope": "read write",
        };
        const event = buildEvent(token, authorizerContext, urlPath);

        // A bundle that grants nothing ITSA-related must not open the ITSA surface.
        getUserBundles.mockResolvedValue([{ bundleId: "resident-vat", expiry: new Date().toISOString() }]);

        await expect(enforceBundles(event)).rejects.toMatchObject({
          name: "BundleEntitlementError",
          details: { code: "BUNDLE_FORBIDDEN" },
        });
      });

      test.each(submittingItsaPaths)("allows %s for a caller with the resident-itsa bundle", async (urlPath) => {
        process.env.ENVIRONMENT_NAME = "ci";
        const token = makeJWT("user-with-itsa-bundle");
        const authorizerContext = {
          "sub": "user-with-itsa-bundle",
          "cognito:username": "test",
          "email": "test@test.submit.diyaccunting.co.uk",
          "scope": "read write",
        };
        const event = buildEvent(token, authorizerContext, urlPath);

        getUserBundles.mockResolvedValue([{ bundleId: "resident-itsa", expiry: new Date().toISOString() }]);

        // Should not throw
        await enforceBundles(event);
      });

      test("refuses an ITSA read path for a caller with no resident-itsa/resident-pro bundle too - free means no token, not no bundle", async () => {
        process.env.ENVIRONMENT_NAME = "ci";
        const token = makeJWT("user-without-itsa-bundle-read");
        const authorizerContext = {
          "sub": "user-without-itsa-bundle-read",
          "cognito:username": "test",
          "email": "test@test.submit.diyaccunting.co.uk",
          "scope": "read write",
        };
        const event = buildEvent(token, authorizerContext, "/api/v1/hmrc/itsa/business/details");

        getUserBundles.mockResolvedValue([]);

        await expect(enforceBundles(event)).rejects.toMatchObject({
          name: "BundleEntitlementError",
          details: { code: "BUNDLE_FORBIDDEN" },
        });
      });
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
