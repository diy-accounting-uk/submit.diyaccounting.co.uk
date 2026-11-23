// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/services/hmrcApi.test.js
import { describe, it, expect, vi, beforeEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import {
  buildHmrcHeaders,
  http403ForbiddenFromBundleEnforcement,
  HMRC_INGEST_REQUEST_TIMEOUT_MS,
  HmrcTimeoutError,
} from "@app/services/hmrcApi.js";
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

  it("buildHmrcHeaders defaults to the v1.0 Accept header when no version is given", async () => {
    const { buildHmrcHeaders } = await import("@app/services/hmrcApi.js");
    const headers = buildHmrcHeaders("at-123");
    expect(headers.Accept).toBe("application/vnd.hmrc.1.0+json");
  });

  it("buildHmrcHeaders builds the Accept header from an explicit apiVersion", async () => {
    const { buildHmrcHeaders } = await import("@app/services/hmrcApi.js");
    const headers = buildHmrcHeaders("at-123", { "Gov-Client-Device-ID": "dev" }, undefined, undefined, undefined, undefined, "2.0");
    expect(headers.Accept).toBe("application/vnd.hmrc.2.0+json");
    expect(headers.Authorization).toBe("Bearer at-123");
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
      "synthetic",
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

  it("keeps the HMRC request bound under the 28 s ingest Lambda timeout", () => {
    expect(HMRC_INGEST_REQUEST_TIMEOUT_MS).toBeLessThan(28000);
  });

  it("hmrcHttpGet throws HmrcTimeoutError when the request is aborted", async () => {
    const { hmrcHttpGet } = await import("@app/services/hmrcApi.js");
    const abort = Object.assign(new Error("This operation was aborted"), { name: "AbortError" });
    const mockFetch = vi.fn().mockRejectedValueOnce(abort);
    vi.stubGlobal("fetch", mockFetch);
    await expect(hmrcHttpGet("/test/endpoint", {}, {}, undefined, "synthetic", {}, "user-sub-1")).rejects.toBeInstanceOf(HmrcTimeoutError);
    expect(mockFetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it("hmrcHttpPost throws HmrcTimeoutError when the request is aborted", async () => {
    const { hmrcHttpPost } = await import("@app/services/hmrcApi.js");
    const abort = Object.assign(new Error("This operation was aborted"), { name: "AbortError" });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(abort));
    await expect(hmrcHttpPost("https://test-api.service.hmrc.gov.uk/x", {}, {}, {}, "user-sub-1")).rejects.toBeInstanceOf(HmrcTimeoutError);
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
    const { getFraudPreventionHeadersFeedback } = await import("@app/services/hmrcFraudPreventionFeedback.js");
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
    const { getFraudPreventionHeadersFeedback } = await import("@app/services/hmrcFraudPreventionFeedback.js");
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

  describe("http403ForbiddenFromHmrcResponse", () => {
    it("returns a real 403, not a 400, when HMRC rejects the request as forbidden", async () => {
      const { http403ForbiddenFromHmrcResponse } = await import("@app/services/hmrcApi.js");
      const hmrcResponse = {
        status: 403,
        data: { code: "NOT_SUBSCRIBED", message: "The application is not subscribed to the API" },
      };

      const response = http403ForbiddenFromHmrcResponse("access-token-123", hmrcResponse, {});

      expect(response.statusCode).toBe(403);
    });

    it("carries HMRC's own explanation in the response body's responseBody field", async () => {
      const { http403ForbiddenFromHmrcResponse } = await import("@app/services/hmrcApi.js");
      const hmrcResponse = {
        status: 403,
        data: { code: "NOT_SUBSCRIBED", message: "The application is not subscribed to the API" },
      };

      const response = http403ForbiddenFromHmrcResponse("access-token-123", hmrcResponse, {});

      const body = JSON.parse(response.body);
      expect(body.responseBody).toEqual(hmrcResponse.data);
      expect(body.responseBody.message).toBe("The application is not subscribed to the API");
    });
  });

  describe("http404NotFoundFromHmrcResponse", () => {
    it("returns a real 404, not a 400, when HMRC reports the resource as not found", async () => {
      const { http404NotFoundFromHmrcResponse } = await import("@app/services/hmrcApi.js");
      const hmrcResponse = {
        status: 404,
        data: { code: "MATCHING_RESOURCE_NOT_FOUND", message: "The requested resource could not be found" },
      };

      const response = http404NotFoundFromHmrcResponse(undefined, hmrcResponse, {});

      expect(response.statusCode).toBe(404);
    });

    it("carries HMRC's own explanation in the response body's responseBody field", async () => {
      const { http404NotFoundFromHmrcResponse } = await import("@app/services/hmrcApi.js");
      const hmrcResponse = {
        status: 404,
        data: { code: "MATCHING_RESOURCE_NOT_FOUND", message: "The requested resource could not be found" },
      };

      const response = http404NotFoundFromHmrcResponse(undefined, hmrcResponse, {});

      const body = JSON.parse(response.body);
      expect(body.responseBody).toEqual(hmrcResponse.data);
      expect(body.responseBody.message).toBe("The requested resource could not be found");
    });
  });

  describe("http400BadRequestFromHmrcResponse", () => {
    it("still returns a real 400 when HMRC's response status is 400", async () => {
      const { http400BadRequestFromHmrcResponse } = await import("@app/services/hmrcApi.js");
      const hmrcResponse = { status: 400, data: { code: "INVALID_VRN", message: "Bad VRN" } };

      const response = http400BadRequestFromHmrcResponse(undefined, hmrcResponse, {});

      expect(response.statusCode).toBe(400);
    });

    it("forwards HMRC's own message and paths for an error code with no curated mapping", async () => {
      const { http400BadRequestFromHmrcResponse } = await import("@app/services/hmrcApi.js");
      const hmrcResponse = {
        status: 400,
        data: {
          code: "RULE_INCORRECT_OR_EMPTY_BODY_SUBMITTED",
          message: "An empty or non-matching body was submitted",
          paths: ["/periodDisallowableExpenses"],
        },
      };

      const response = http400BadRequestFromHmrcResponse(undefined, hmrcResponse, {});

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.message).toBe("An empty or non-matching body was submitted: /periodDisallowableExpenses");
    });

    it("uses the curated user message when the error code is mapped", async () => {
      const { http400BadRequestFromHmrcResponse } = await import("@app/services/hmrcApi.js");
      const hmrcResponse = { status: 400, data: { code: "INVALID_VRN", message: "Bad VRN" } };

      const response = http400BadRequestFromHmrcResponse(
        undefined,
        hmrcResponse,
        {},
        {
          userMessage: "The VAT registration number is not valid",
          actionAdvice: "Please check the VAT registration number and try again",
        },
      );

      const body = JSON.parse(response.body);
      expect(body.message).toBe("The VAT registration number is not valid");
    });

    it("falls back to a generic message when HMRC's response carries no message", async () => {
      const { http400BadRequestFromHmrcResponse } = await import("@app/services/hmrcApi.js");
      const hmrcResponse = { status: 400, data: { code: "UNKNOWN" } };

      const response = http400BadRequestFromHmrcResponse(undefined, hmrcResponse, {});

      const body = JSON.parse(response.body);
      expect(body.message).toBe("HMRC rejected the request");
    });
  });
});

describe("the HMRC request lines", () => {
  it("log the answer's top-level field names and its status, and audit the answer whole", async () => {
    const { hmrcHttpGet, buildHmrcHeaders } = await import("@app/services/hmrcApi.js");
    const { putHmrcApiRequest } = await import("@app/data/dynamoDbHmrcApiRequestRepository.js");
    const answer = { obligations: [{ periodKey: "26A1", start: "2026-01-01", end: "2026-03-31", status: "O" }], vatDue: 4321.55 };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(answer),
        headers: { forEach: (fn) => fn("application/json", "content-type") },
      }),
    );
    const lines = [];
    const write = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => lines.push(String(chunk)) > 0);
    try {
      const govClientHeaders = { "Gov-Client-Device-ID": "dev" };
      await hmrcHttpGet(
        "/organisations/vat/176493528/obligations",
        buildHmrcHeaders("token-123", govClientHeaders, "SCENARIO", "r1", null, "c1"),
        govClientHeaders,
        "SCENARIO",
        "synthetic",
        {},
        "user-sub-1",
      );
    } finally {
      write.mockRestore();
    }
    const responseLine = lines
      .join("")
      .split("\n")
      .filter(Boolean)
      .map((text) => JSON.parse(text))
      .find((entry) => String(entry.message).startsWith("Response from GET"));

    expect(responseLine).toMatchObject({ status: 200, responseFields: ["obligations", "vatDue"] });
    expect(responseLine).not.toHaveProperty("hmrcResponseBody");
    for (const value of ["26A1", "4321.55", "2026-03-31"]) expect(JSON.stringify(responseLine)).not.toContain(value);
    expect(putHmrcApiRequest).toHaveBeenCalledWith(
      "user-sub-1",
      expect.objectContaining({ httpResponse: expect.objectContaining({ body: answer }) }),
    );
  });

  it("name the VAT number in the path in place of its value", async () => {
    const { hmrcHttpGet, buildHmrcHeaders } = await import("@app/services/hmrcApi.js");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ obligations: [] }),
        headers: { forEach: (fn) => fn("application/json", "content-type") },
      }),
    );
    const lines = [];
    const write = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => lines.push(String(chunk)) > 0);
    try {
      const govClientHeaders = { "Gov-Client-Device-ID": "dev" };
      await hmrcHttpGet(
        "/organisations/vat/176493528/obligations",
        buildHmrcHeaders("token-123", govClientHeaders, "SCENARIO", "r1", null, "c1"),
        govClientHeaders,
        "SCENARIO",
        "synthetic",
        {},
        "user-sub-1",
      );
    } finally {
      write.mockRestore();
    }
    const logged = lines.join("");

    expect(logged).toContain("/organisations/vat/{vrn}/obligations");
    expect(logged).not.toContain("[VRN]/obligations");
    expect(logged).not.toContain("176493528");
  });

  it("log each query parameter's name and never its value", async () => {
    const { hmrcHttpGet, buildHmrcHeaders } = await import("@app/services/hmrcApi.js");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ obligations: [] }),
        headers: { forEach: (fn) => fn("application/json", "content-type") },
      }),
    );
    const lines = [];
    const write = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => lines.push(String(chunk)) > 0);
    try {
      const govClientHeaders = { "Gov-Client-Device-ID": "dev" };
      await hmrcHttpGet(
        "/organisations/vat/obligations",
        buildHmrcHeaders("token-123", govClientHeaders, "SCENARIO", "r1", null, "c1"),
        govClientHeaders,
        "SCENARIO",
        "synthetic",
        { from: "2025-04-06", to: "2026-04-05", status: "O" },
        "user-sub-1",
      );
    } finally {
      write.mockRestore();
    }
    const logged = lines.join("");

    expect(logged).toContain("/organisations/vat/obligations?from={from}&to={to}&status={status}");
    for (const value of ["2025-04-06", "2026-04-05", "status=O"]) expect(logged).not.toContain(value);
  });
});

describe("the lines of a failed HMRC answer", () => {
  it.each(["http400BadRequestFromHmrcResponse", "http404NotFoundFromHmrcResponse", "http500ServerErrorFromHmrcResponse"])(
    "%s logs the route's pattern and the query's names, never a value",
    async (name) => {
      const hmrcApi = await import("@app/services/hmrcApi.js");
      const { context } = await import("@app/lib/logger.js");
      const request = new URL("https://submit.example/api/v1/hmrc/vat/return/2026A1?vrn=176540158&periodKey=26A1&from=2026-01-01");
      const lines = [];
      const write = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => lines.push(String(chunk)) > 0);
      try {
        context.run(new Map([["loggedPath", "/api/v1/hmrc/vat/return/{periodKey}"]]), () =>
          hmrcApi[name](request, { status: 400, data: { code: "X" } }, {}),
        );
      } finally {
        write.mockRestore();
      }
      const logged = lines.join("");

      expect(logged).toContain("https://submit.example/api/v1/hmrc/vat/return/{periodKey}?vrn={vrn}&periodKey={periodKey}&from={from}");
      for (const value of ["176540158", "26A1", "2026-01-01", "2026A1"]) expect(logged).not.toContain(value);
    },
  );
});

describe("the HMRC error lines", () => {
  const errorAnswer = {
    code: "RULE_INCORRECT_OR_EMPTY_BODY_SUBMITTED",
    message: "An empty or non-matching body was submitted",
    paths: ["/periodIncome/turnover"],
    errors: [
      { code: "FORMAT_VALUE", message: "The value 12345.678 for turnover is not valid", path: "/periodIncome/turnover" },
      { code: "FORMAT_NINO", message: "The provided NINO is invalid", path: "/nino" },
    ],
  };

  it("hold HMRC's code and the code and field path of each error, and none of HMRC's message", async () => {
    const { loggedHmrcErrorOf } = await import("@app/services/hmrcApi.js");

    expect(loggedHmrcErrorOf(errorAnswer)).toEqual({
      code: "RULE_INCORRECT_OR_EMPTY_BODY_SUBMITTED",
      paths: ["/periodIncome/turnover", "/nino"],
      errors: [
        { code: "FORMAT_VALUE", path: "/periodIncome/turnover" },
        { code: "FORMAT_NINO", path: "/nino" },
      ],
      messageOmitted: true,
    });
    expect(loggedHmrcErrorOf({ code: "INVALID_REQUEST", message: "Reference 'X1234' was not found" })).toEqual({
      code: "INVALID_REQUEST",
      paths: [],
      errors: [],
      messageOmitted: true,
    });
    expect(loggedHmrcErrorOf(undefined)).toEqual({ paths: [], errors: [] });
  });

  it("leave out a message that repeats a submitted name in letters alone", async () => {
    const { loggedHmrcErrorOf } = await import("@app/services/hmrcApi.js");
    const answer = {
      code: "RULE_BUSINESS_NAME_MISMATCH",
      message: "The trading name Jane Smith Plumbing does not match the business",
      errors: [{ code: "RULE_BUSINESS_NAME_MISMATCH", message: "Jane Smith Plumbing is not the registered name", path: "/tradingName" }],
    };

    const logged = JSON.stringify(loggedHmrcErrorOf(answer));

    expect(logged).not.toContain("Jane Smith");
    expect(logged).toContain("RULE_BUSINESS_NAME_MISMATCH");
    expect(logged).toContain("/tradingName");
  });

  it.each([
    ["http400BadRequestFromHmrcResponse", 400],
    ["http404NotFoundFromHmrcResponse", 404],
    ["http500ServerErrorFromHmrcResponse", 500],
    ["http403ForbiddenFromHmrcResponse", 403],
  ])("%s logs the error's codes and paths and none of its values, and answers the caller with HMRC's answer", async (name, status) => {
    const hmrcApi = await import("@app/services/hmrcApi.js");
    const answer = { ...errorAnswer, message: "The value 98765 was refused" };
    const lines = [];
    const write = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => lines.push(String(chunk)) > 0);
    let response;
    try {
      const first = name === "http403ForbiddenFromHmrcResponse" ? "token-123" : new URL("https://submit.example/api/v1/hmrc/itsa/period");
      response = hmrcApi[name](first, { status, data: answer }, {});
    } finally {
      write.mockRestore();
    }
    const logged = lines.join("");

    expect(logged).toContain("FORMAT_VALUE");
    expect(logged).toContain("/periodIncome/turnover");
    for (const value of ["98765", "12345.678"]) expect(logged).not.toContain(value);
    expect(JSON.stringify(JSON.parse(response.body))).toContain("FORMAT_VALUE");
  });
});
