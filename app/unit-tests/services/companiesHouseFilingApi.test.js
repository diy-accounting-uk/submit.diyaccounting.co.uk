// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/services/companiesHouseFilingApi.test.js
import { describe, test, beforeEach, expect, vi } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { setupTestEnv, setupFetchMock } from "@app/test-helpers/mockHelpers.js";
import { BundleAuthorizationError, BundleEntitlementError } from "@app/services/bundleManagement.js";

// Captures the secret ARN requested so tests can assert Secrets Manager was consulted
const mockSecretsManagerSend = vi.fn().mockResolvedValue({ SecretString: "secrets-manager-ch-client-secret" });
vi.mock("@aws-sdk/client-secrets-manager", () => ({
  SecretsManagerClient: class {
    send(...args) {
      return mockSecretsManagerSend(...args);
    }
  },
  GetSecretValueCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
}));

const {
  getFilingBaseUrl,
  getIdentityBaseUrl,
  resolveClientSecret,
  extractCompaniesHouseAccessTokenFromLambdaEvent,
  companiesHouseFilingRequest,
  httpResponseFromFilingResponse,
  http403ForbiddenFromBundleEnforcement,
} = await import("@app/services/companiesHouseFilingApi.js");

dotenvConfigIfNotBlank({ path: ".env.test" });

let mockFetch;

describe("companiesHouseFilingApi", () => {
  beforeEach(() => {
    Object.assign(process.env, setupTestEnv());
    mockFetch = setupFetchMock();
    mockSecretsManagerSend.mockClear();
    mockSecretsManagerSend.mockResolvedValue({ SecretString: "secrets-manager-ch-client-secret" });
    delete process.env.COMPANIES_HOUSE_CLIENT_SECRET;
    delete process.env.COMPANIES_HOUSE_CLIENT_SECRET_ARN;
  });

  describe("getFilingBaseUrl", () => {
    test("returns the configured base URL", () => {
      process.env.COMPANIES_HOUSE_FILING_BASE_URI = "https://api-sandbox.company-information.service.gov.uk";
      expect(getFilingBaseUrl()).toBe("https://api-sandbox.company-information.service.gov.uk");
    });

    test("throws when the environment variable is blank", () => {
      process.env.COMPANIES_HOUSE_FILING_BASE_URI = "";
      expect(() => getFilingBaseUrl()).toThrow("Missing required environment variable COMPANIES_HOUSE_FILING_BASE_URI");
    });
  });

  describe("getIdentityBaseUrl", () => {
    test("returns the configured base URL", () => {
      process.env.COMPANIES_HOUSE_IDENTITY_BASE_URI = "https://identity-sandbox.company-information.service.gov.uk";
      expect(getIdentityBaseUrl()).toBe("https://identity-sandbox.company-information.service.gov.uk");
    });

    test("throws when the environment variable is blank", () => {
      process.env.COMPANIES_HOUSE_IDENTITY_BASE_URI = "";
      expect(() => getIdentityBaseUrl()).toThrow("Missing required environment variable COMPANIES_HOUSE_IDENTITY_BASE_URI");
    });
  });

  describe("resolveClientSecret", () => {
    // Runs first: resolveClientSecret caches the secret in module scope across calls, the same
    // way companiesHouseApi.js's resolveApiKey does, so once a later test resolves a real secret
    // this "nothing configured" case can no longer be observed within the same module instance.
    test("throws when neither the secret nor its ARN are configured", async () => {
      await expect(resolveClientSecret()).rejects.toThrow(
        "Missing required environment variable COMPANIES_HOUSE_CLIENT_SECRET or COMPANIES_HOUSE_CLIENT_SECRET_ARN",
      );
    });

    test("prefers the environment variable secret over the Secrets Manager ARN", async () => {
      process.env.COMPANIES_HOUSE_CLIENT_SECRET = "env-client-secret";
      process.env.COMPANIES_HOUSE_CLIENT_SECRET_ARN = "arn:aws:secretsmanager:eu-west-2:123456789012:secret:test/companies-house/client_secret";

      const secret = await resolveClientSecret();

      expect(secret).toBe("env-client-secret");
      expect(mockSecretsManagerSend).not.toHaveBeenCalled();
    });

    test("reads the client secret from Secrets Manager when only the ARN is set", async () => {
      process.env.COMPANIES_HOUSE_CLIENT_SECRET_ARN = "arn:aws:secretsmanager:eu-west-2:123456789012:secret:test/companies-house/client_secret";

      const secret = await resolveClientSecret();

      expect(secret).toBe("secrets-manager-ch-client-secret");
      expect(mockSecretsManagerSend).toHaveBeenCalled();
    });
  });

  describe("extractCompaniesHouseAccessTokenFromLambdaEvent", () => {
    test("reads the bearer token from the Authorization header", () => {
      const event = { headers: { Authorization: "Bearer a-companies-house-access-token" } };
      expect(extractCompaniesHouseAccessTokenFromLambdaEvent(event)).toBe("a-companies-house-access-token");
    });

    test("returns null when there is no Authorization header", () => {
      expect(extractCompaniesHouseAccessTokenFromLambdaEvent({ headers: {} })).toBeNull();
    });
  });

  describe("companiesHouseFilingRequest", () => {
    test("sends the bearer token and no body on a GET", async () => {
      process.env.COMPANIES_HOUSE_FILING_BASE_URI = "https://api-sandbox.company-information.service.gov.uk";
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ status: "open" }),
        headers: { forEach: () => {} },
      });

      const result = await companiesHouseFilingRequest("GET", "/transactions/tx-1", { accessToken: "user-token" });

      expect(result.status).toBe(200);
      const [requestedUrl, requestInit] = mockFetch.mock.calls[0];
      expect(requestedUrl).toBe("https://api-sandbox.company-information.service.gov.uk/transactions/tx-1");
      expect(requestInit.method).toBe("GET");
      expect(requestInit.headers.Authorization).toBe("Bearer user-token");
      expect(requestInit.body).toBeUndefined();
    });

    test("sends a JSON body on a POST", async () => {
      process.env.COMPANIES_HOUSE_FILING_BASE_URI = "https://api-sandbox.company-information.service.gov.uk";
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () => Promise.resolve({ id: "tx-1" }),
        headers: { forEach: () => {} },
      });

      await companiesHouseFilingRequest("POST", "/transactions", {
        accessToken: "user-token",
        body: { company_number: "06846849" },
      });

      const [, requestInit] = mockFetch.mock.calls[0];
      expect(requestInit.headers["Content-Type"]).toBe("application/json");
      expect(JSON.parse(requestInit.body)).toEqual({ company_number: "06846849" });
    });
  });

  describe("httpResponseFromFilingResponse", () => {
    test("maps a 401 to our 401 with the COMPANIES_HOUSE_UNAUTHORIZED code", () => {
      const response = httpResponseFromFilingResponse({}, { status: 401, data: { errors: [] } });
      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.code).toBe("COMPANIES_HOUSE_UNAUTHORIZED");
    });

    test("maps a 429 to our 429 with Retry-After", () => {
      const response = httpResponseFromFilingResponse({}, { status: 429, data: {}, headers: { "retry-after": "120" } });
      expect(response.statusCode).toBe(429);
      expect(response.headers["Retry-After"]).toBe("120");
    });

    test("maps any other status to a 500 carrying the upstream status and body", () => {
      const response = httpResponseFromFilingResponse({}, { status: 418, data: { errors: [{ error: "teapot" }] } });
      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.companiesHouseResponseCode).toBe(418);
      expect(body.responseBody).toEqual({ errors: [{ error: "teapot" }] });
    });
  });

  describe("http403ForbiddenFromBundleEnforcement", () => {
    test("maps a BundleAuthorizationError to 401", () => {
      const error = new BundleAuthorizationError("Missing Authorization Bearer token", { code: "MISSING_AUTH_TOKEN" });
      const response = http403ForbiddenFromBundleEnforcement(error, {});
      expect(response.statusCode).toBe(401);
    });

    test("maps a BundleEntitlementError to 403", () => {
      const error = new BundleEntitlementError("Forbidden: Activity requires default bundle", { code: "BUNDLE_FORBIDDEN" });
      const response = http403ForbiddenFromBundleEnforcement(error, {});
      expect(response.statusCode).toBe(403);
    });

    test("maps any other error to 500", () => {
      const response = http403ForbiddenFromBundleEnforcement(new Error("unexpected"), {});
      expect(response.statusCode).toBe(500);
    });
  });
});
