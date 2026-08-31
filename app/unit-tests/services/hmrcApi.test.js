// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/unit-tests/services/hmrcApi.test.js
import { describe, it, expect, vi, beforeEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { buildHmrcHeaders, http403ForbiddenFromBundleEnforcement } from "@app/services/hmrcApi.js";
import { BundleAuthorizationError, BundleEntitlementError } from "@app/services/bundleManagement.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

// Mock audit write to DynamoDB to avoid AWS SDK dependency
vi.mock("@app/data/dynamoDbHmrcApiRequestRepository.js", () => ({
  putHmrcApiRequest: vi.fn().mockResolvedValue(undefined),
}));

describe("services/hmrcApi", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Set base URLs so getHmrcBaseUrl is stable
    process.env.HMRC_BASE_URI = "https://api.service.hmrc.gov.uk";
    process.env.HMRC_SANDBOX_BASE_URI = "https://test-api.service.hmrc.gov.uk";
  });

  it("buildHmrcHeaders maps auth, accept, and Gov-Test-Scenario when provided", async () => {
    const { buildHmrcHeaders } = await import("@app/services/hmrcApi.js");
    const headers = buildHmrcHeaders("at-123", { "Gov-Client-Device-ID": "dev" }, "SOME_SCENARIO");
    expect(headers.Authorization).toBe("Bearer at-123");
    expect(headers.Accept).toBe("application/vnd.hmrc.1.0+json");
    expect(headers["Gov-Test-Scenario"]).toBe("SOME_SCENARIO");
    expect(headers["Gov-Client-Device-ID"]).toBe("dev");
  });

  it("validateHmrcAccessToken throws on short or missing token", async () => {
    const { validateHmrcAccessToken, UnauthorizedTokenError } = await import("@app/services/hmrcApi.js");

    // Force unauthorized branch
    process.env.TEST_FORCE_UNAUTHORIZED_TOKEN = "true";
    expect(() => validateHmrcAccessToken("anything")).toThrow(UnauthorizedTokenError);
    delete process.env.TEST_FORCE_UNAUTHORIZED_TOKEN;

    // Invalid token path
    expect(() => validateHmrcAccessToken("x")).toThrowError(/Invalid access token/);
  });

  it("hmrcHttpGet builds URL with cleaned query params and returns structured data", async () => {
    const { hmrcHttpGet } = await import("@app/services/hmrcApi.js");
    const auditForUserSub = "user-sub-1";
    const requestId = "req-123";
    const traceparent = "traceparent-123";
    const correlationId = "correlation-123";

    // Mock fetch
    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ok: true, items: [1] }),
      headers: { forEach: (fn) => fn("application/json", "content-type") },
    });

    const govClientHeaders = { "Gov-Client-Device-ID": "dev" };
    const hmrcRequestHeaders = buildHmrcHeaders("token-123", govClientHeaders, "SCENARIO", requestId, traceparent, correlationId);
    const res = await hmrcHttpGet(
      "/test/endpoint",
      hmrcRequestHeaders,
      govClientHeaders,
      "SCENARIO",
      "sandbox",
      { a: "1", b: "", c: null, d: undefined },
      auditForUserSub,
    );

    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
    expect(res.data).toEqual({ ok: true, items: [1] });
    // Ensure fetch was called with a URL containing only a=1
    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toMatch(/test-api\.service\.hmrc\.gov\.uk/);
    expect(calledUrl).toMatch(/\/test\/endpoint\?a=1$/);
    // Ensure Gov-Test-Scenario propagates
    const calledInit = mockFetch.mock.calls[0][1];
    expect(calledInit.headers["Gov-Test-Scenario"]).toBe("SCENARIO");
  });

  it("validateFraudPreventionHeaders calls HMRC validation endpoint with correct headers", async () => {
    const { validateFraudPreventionHeaders } = await import("@app/services/hmrcApi.js");
    const auditForUserSub = "user-sub-1";

    // Mock fetch
    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          specVersion: "3.1",
          code: "VALID_HEADERS",
          message: "All headers appear to be valid",
        }),
    });

    const govClientHeaders = {
      "Gov-Client-Device-ID": "test-device-id",
      "Gov-Client-Connection-Method": "DESKTOP_APP_DIRECT",
    };

    const result = await validateFraudPreventionHeaders("token-123", govClientHeaders, auditForUserSub);

    expect(result.isValid).toBe(true);
    expect(result.response.code).toBe("VALID_HEADERS");
    expect(result.status).toBe(200);

    // Verify fetch was called with correct URL and headers
    expect(mockFetch).toHaveBeenCalledWith(
      "https://test-api.service.hmrc.gov.uk/test/fraud-prevention-headers/validate",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          "Accept": "application/vnd.hmrc.1.0+json",
          "Authorization": "Bearer token-123",
          "Gov-Client-Device-ID": "test-device-id",
          "Gov-Client-Connection-Method": "DESKTOP_APP_DIRECT",
        }),
      }),
    );
  });

  it("validateFraudPreventionHeaders handles invalid headers response", async () => {
    const { validateFraudPreventionHeaders } = await import("@app/services/hmrcApi.js");
    const auditForUserSub = "user-sub-1";

    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          specVersion: "3.1",
          code: "INVALID_HEADERS",
          message: "At least 1 header is invalid",
          errors: [
            {
              code: "INVALID_HEADER",
              message: "Invalid header value",
              headers: ["Gov-Client-Timezone"],
            },
          ],
        }),
    });

    const result = await validateFraudPreventionHeaders("token-123", {}, auditForUserSub);

    expect(result.isValid).toBe(false);
    expect(result.response.code).toBe("INVALID_HEADERS");
    expect(result.response.errors).toHaveLength(1);
  });

  it("validateFraudPreventionHeaders handles fetch errors gracefully", async () => {
    const { validateFraudPreventionHeaders } = await import("@app/services/hmrcApi.js");
    const auditForUserSub = "user-sub-1";

    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const result = await validateFraudPreventionHeaders("token-123", {}, auditForUserSub);

    expect(result.isValid).toBe(false);
    expect(result.error).toBe("Network error");
  });

  it("getFraudPreventionHeadersFeedback calls HMRC feedback endpoint with correct parameters", async () => {
    const { getFraudPreventionHeadersFeedback } = await import("@app/services/hmrcApi.js");
    const auditForUserSub = "user-sub-1";

    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          results: [
            {
              timestamp: "2023-01-01T12:00:00Z",
              code: "VALID_HEADERS",
              message: "All headers valid",
            },
          ],
        }),
    });

    const result = await getFraudPreventionHeadersFeedback("vat-mtd", "token-123", auditForUserSub);

    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.feedback.results).toHaveLength(1);

    // Verify fetch was called with correct URL
    expect(mockFetch).toHaveBeenCalledWith(
      "https://test-api.service.hmrc.gov.uk/test/fraud-prevention-headers/vat-mtd/validation-feedback",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Accept: "application/vnd.hmrc.1.0+json",
          Authorization: "Bearer token-123",
        }),
      }),
    );
  });

  it("getFraudPreventionHeadersFeedback handles errors gracefully", async () => {
    const { getFraudPreventionHeadersFeedback } = await import("@app/services/hmrcApi.js");
    const auditForUserSub = "user-sub-1";

    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const result = await getFraudPreventionHeadersFeedback("vat-mtd", "token-123", auditForUserSub);

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Network error");
  });

  describe("http403ForbiddenFromBundleEnforcement", () => {
    it("returns a 401 JSON response for a missing authorization token", () => {
      const error = new BundleAuthorizationError("Missing Authorization Bearer token", { code: "MISSING_AUTH_TOKEN" });

      const response = http403ForbiddenFromBundleEnforcement(error, undefined);

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.message).toBe("Missing Authorization Bearer token");
      expect(body.code).toBe("MISSING_AUTH_TOKEN");
    });

    it("returns a 401 JSON response for an invalid authorization token", () => {
      const error = new BundleAuthorizationError("Invalid Authorization token", { code: "INVALID_AUTH_TOKEN" });

      const response = http403ForbiddenFromBundleEnforcement(error, undefined);

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.message).toBe("Invalid Authorization token");
      expect(body.code).toBe("INVALID_AUTH_TOKEN");
    });

    it("returns a 403 JSON response for a bundle entitlement error", () => {
      const error = new BundleEntitlementError("Forbidden: Activity requires vat-mtd bundle", { code: "BUNDLE_FORBIDDEN" });

      const response = http403ForbiddenFromBundleEnforcement(error, undefined);

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.message).toBe("Forbidden - missing or insufficient bundle entitlement");
      expect(body.code).toBe("BUNDLE_FORBIDDEN");
    });

    it("returns a 500 JSON response for an unexpected error", () => {
      const error = new Error("Something exploded");

      const response = http403ForbiddenFromBundleEnforcement(error, undefined);

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.message).toBe("Authorization failure while checking entitlements");
      expect(body.detail).toBe("Something exploded");
    });
  });
});
