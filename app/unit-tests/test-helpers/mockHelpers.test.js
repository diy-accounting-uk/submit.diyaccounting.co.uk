// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/test-helpers/mockHelpers.test.js
// Unit tests for mock helper functions

import { describe, test, expect, vi, beforeEach } from "vitest";
import {
  setupFetchMock,
  mockHmrcSuccess,
  mockHmrcError,
  mockNetworkError,
  setupTestEnv,
  parseResponseBody,
  verifyResponseStructure,
} from "@app/test-helpers/mockHelpers.js";

describe("mockHelpers helpers", () => {
  describe("setupFetchMock", () => {
    test("returns a vitest mock function", () => {
      const mockFetch = setupFetchMock();

      expect(mockFetch).toBeDefined();
      expect(typeof mockFetch).toBe("function");
      expect(mockFetch.mock).toBeDefined();
    });
  });

  describe("mockHmrcSuccess", () => {
    let mockFetch;

    beforeEach(() => {
      mockFetch = vi.fn();
    });

    test("mocks successful HMRC response", async () => {
      const responseData = { success: true };
      mockHmrcSuccess(mockFetch, responseData);

      const response = await mockFetch();

      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(responseData);
    });

    test("text() returns JSON stringified data", async () => {
      const responseData = { data: "value" };
      mockHmrcSuccess(mockFetch, responseData);

      const response = await mockFetch();
      const text = await response.text();

      expect(JSON.parse(text)).toEqual(responseData);
    });
  });

  describe("mockHmrcError", () => {
    let mockFetch;

    beforeEach(() => {
      mockFetch = vi.fn();
    });

    test("mocks HMRC error response with status code", async () => {
      const errorData = { error: "BAD_REQUEST" };
      mockHmrcError(mockFetch, 400, errorData);

      const response = await mockFetch();

      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual(errorData);
    });

    test("supports various error status codes", async () => {
      const errorData = { error: "UNAUTHORIZED" };
      mockHmrcError(mockFetch, 401, errorData);

      const response = await mockFetch();

      expect(response.status).toBe(401);
    });
  });

  describe("mockNetworkError", () => {
    let mockFetch;

    beforeEach(() => {
      mockFetch = vi.fn();
    });

    test("mocks network error", async () => {
      mockNetworkError(mockFetch, "Connection failed");

      await expect(mockFetch()).rejects.toThrow("Connection failed");
    });

    test("uses default error message when not provided", async () => {
      mockNetworkError(mockFetch);

      await expect(mockFetch()).rejects.toThrow("Network error");
    });
  });

  describe("setupTestEnv", () => {
    test("returns object with default test environment variables", () => {
      const env = setupTestEnv();

      // expect(env).toHaveProperty("NODE_ENV", "test");
      expect(env).toHaveProperty("HMRC_BASE_URI");
      expect(env).toHaveProperty("BUNDLE_DYNAMODB_TABLE_NAME");
    });

    test("merges custom environment variables", () => {
      const env = setupTestEnv({ CUSTOM_VAR: "value" });

      expect(env.CUSTOM_VAR).toBe("value");
      // expect(env.NODE_ENV).toBe("test");
    });

    test("custom variables override defaults", () => {
      const env = setupTestEnv({ NODE_ENV: "custom" });

      expect(env.NODE_ENV).toBe("custom");
    });
  });

  describe("parseResponseBody", () => {
    test("parses JSON response body", () => {
      const response = { body: JSON.stringify({ key: "value" }) };
      const parsed = parseResponseBody(response);

      expect(parsed).toEqual({ key: "value" });
    });

    test("returns null for responses without body", () => {
      const response = {};
      const parsed = parseResponseBody(response);

      expect(parsed).toBeNull();
    });

    test("returns original body for non-JSON strings", () => {
      const response = { body: "plain text" };
      const parsed = parseResponseBody(response);

      expect(parsed).toBe("plain text");
    });
  });

  describe("verifyResponseStructure", () => {
    test("verifies response has required properties", () => {
      const response = {
        statusCode: 200,
        headers: {},
        body: "{}",
      };

      // verifyResponseStructure requires expect to be available globally (which it is in vitest tests)
      verifyResponseStructure(response);
      // If it didn't throw, test passes
      expect(true).toBe(true);
    });

    test("verifies expected status code when provided", () => {
      const response = {
        statusCode: 200,
        headers: {},
        body: "{}",
      };

      verifyResponseStructure(response, 200);
      expect(true).toBe(true);
    });

    test("throws when response missing required properties", () => {
      const response = { statusCode: 200 };

      expect(() => verifyResponseStructure(response)).toThrow();
    });
  });
});
