// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/lib/dataMasking.test.js

import { describe, test, expect } from "vitest";
import { isSensitiveField, maskSensitiveData, maskHttpData } from "@app/lib/dataMasking.js";

describe("lib/dataMasking", () => {
  describe("isSensitiveField", () => {
    test("identifies exact sensitive field names (case-insensitive)", () => {
      expect(isSensitiveField("Authorization")).toBe(true);
      expect(isSensitiveField("authorization")).toBe(true);
      expect(isSensitiveField("AUTHORIZATION")).toBe(true);
      expect(isSensitiveField("access_token")).toBe(true);
      expect(isSensitiveField("ACCESS_TOKEN")).toBe(true);
      expect(isSensitiveField("refresh_token")).toBe(true);
      expect(isSensitiveField("hmrcTestPassword")).toBe(true);
      expect(isSensitiveField("hmrctestpassword")).toBe(true);
      expect(isSensitiveField("password")).toBe(true);
      expect(isSensitiveField("client_secret")).toBe(true);
    });

    test("identifies fields matching sensitive patterns", () => {
      expect(isSensitiveField("userPassword")).toBe(true);
      expect(isSensitiveField("apiToken")).toBe(true);
      expect(isSensitiveField("clientSecret")).toBe(true);
      expect(isSensitiveField("refreshToken")).toBe(true);
    });

    test("does not identify allowlisted non-sensitive fields", () => {
      expect(isSensitiveField("periodKey")).toBe(false);
      expect(isSensitiveField("tokenInfo")).toBe(false);
      expect(isSensitiveField("hasAccessToken")).toBe(false);
      expect(isSensitiveField("accessTokenLength")).toBe(false);
      expect(isSensitiveField("accessTokenPrefix")).toBe(false);
    });

    test("does not identify non-sensitive fields", () => {
      expect(isSensitiveField("username")).toBe(false);
      expect(isSensitiveField("email")).toBe(false);
      expect(isSensitiveField("statusCode")).toBe(false);
      expect(isSensitiveField("duration")).toBe(false);
      expect(isSensitiveField("url")).toBe(false);
    });

    test("handles edge cases gracefully", () => {
      expect(isSensitiveField(null)).toBe(false);
      expect(isSensitiveField(undefined)).toBe(false);
      expect(isSensitiveField("")).toBe(false);
      expect(isSensitiveField(123)).toBe(false);
    });
  });

  describe("maskSensitiveData", () => {
    test("masks sensitive fields in flat objects", () => {
      const input = {
        username: "testuser",
        password: "secret123",
        access_token: "abc123token",
        statusCode: 200,
      };

      const result = maskSensitiveData(input);

      expect(result.username).toBe("testuser");
      expect(result.password).toBe("***MASKED***");
      expect(result.access_token).toBe("***MASKED***");
      expect(result.statusCode).toBe(200);
    });

    test("masks Authorization header", () => {
      const input = {
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer abc123token",
          "Accept": "application/vnd.hmrc.1.0+json",
        },
      };

      const result = maskSensitiveData(input);

      expect(result.headers["Content-Type"]).toBe("application/json");
      expect(result.headers["Authorization"]).toBe("***MASKED***");
      expect(result.headers["Accept"]).toBe("application/vnd.hmrc.1.0+json");
    });

    test("masks nested sensitive fields", () => {
      const input = {
        testData: {
          hmrcTestUsername: "869172854733",
          hmrcTestPassword: "password123",
          hmrcTestVatNumber: "123456789",
        },
        headers: {
          "Accept": "application/vnd.hmrc.1.0+json",
          "Authorization": "Bearer token123",
          "Gov-Client-Public-IP": "88.97.27.180",
        },
        body: {
          access_token: "token123",
          refresh_token: "refresh123",
          expires_in: 14400,
        },
      };

      const result = maskSensitiveData(input);

      // Check testData
      expect(result.testData.hmrcTestUsername).toBe("869172854733");
      expect(result.testData.hmrcTestPassword).toBe("***MASKED***");
      expect(result.testData.hmrcTestVatNumber).toBe("123456789");

      // Check headers
      expect(result.headers.Accept).toBe("application/vnd.hmrc.1.0+json");
      expect(result.headers.Authorization).toBe("***MASKED***");
      expect(result.headers["Gov-Client-Public-IP"]).toBe("88.97.27.180");

      // Check body
      expect(result.body.access_token).toBe("***MASKED***");
      expect(result.body.refresh_token).toBe("***MASKED***");
      expect(result.body.expires_in).toBe(14400);
    });

    test("masks fields in arrays", () => {
      const input = {
        users: [
          { username: "user1", password: "pass1" },
          { username: "user2", password: "pass2" },
        ],
      };

      const result = maskSensitiveData(input);

      expect(result.users[0].username).toBe("user1");
      expect(result.users[0].password).toBe("***MASKED***");
      expect(result.users[1].username).toBe("user2");
      expect(result.users[1].password).toBe("***MASKED***");
    });

    test("does not mutate original data", () => {
      const input = {
        username: "testuser",
        password: "secret123",
        access_token: "abc123token",
      };

      const originalPassword = input.password;
      const originalToken = input.access_token;

      maskSensitiveData(input);

      expect(input.password).toBe(originalPassword);
      expect(input.access_token).toBe(originalToken);
    });

    test("preserves non-sensitive fields exactly", () => {
      const input = {
        periodKey: "24A1",
        tokenInfo: { hasAccessToken: true, accessTokenLength: 200 },
        statusCode: 201,
        url: "https://api.example.com",
      };

      const result = maskSensitiveData(input);

      expect(result.periodKey).toBe("24A1");
      expect(result.tokenInfo.hasAccessToken).toBe(true);
      expect(result.tokenInfo.accessTokenLength).toBe(200);
      expect(result.statusCode).toBe(201);
      expect(result.url).toBe("https://api.example.com");
    });

    test("handles null and undefined values", () => {
      const input = {
        password: null,
        access_token: undefined,
        refresh_token: "",
        username: "test",
      };

      const result = maskSensitiveData(input);

      expect(result.password).toBe(null);
      expect(result.access_token).toBe(undefined);
      expect(result.refresh_token).toBe("");
      expect(result.username).toBe("test");
    });

    test("handles primitives", () => {
      expect(maskSensitiveData(null)).toBe(null);
      expect(maskSensitiveData(undefined)).toBe(undefined);
      expect(maskSensitiveData(123)).toBe(123);
      expect(maskSensitiveData("string")).toBe("string");
      expect(maskSensitiveData(true)).toBe(true);
    });

    test("handles arrays of primitives", () => {
      const input = [1, 2, 3, "test", true];
      const result = maskSensitiveData(input);
      expect(result).toEqual([1, 2, 3, "test", true]);
    });

    test("handles deeply nested structures", () => {
      const input = {
        level1: {
          level2: {
            level3: {
              password: "secret",
              data: "safe",
            },
          },
        },
      };

      const result = maskSensitiveData(input);

      expect(result.level1.level2.level3.password).toBe("***MASKED***");
      expect(result.level1.level2.level3.data).toBe("safe");
    });

    test("handles example structure from problem statement", () => {
      // This is the exact structure mentioned in the problem statement
      const input = {
        testData: {
          hmrcTestUsername: "869172854733",
          hmrcTestPassword: "actualPassword",
        },
        httpRequest: {
          headers: {
            "Accept": "application/vnd.hmrc.1.0+json",
            "Authorization": "Bearer actualToken",
            "Gov-Client-Public-IP": "88.97.27.180",
          },
        },
        httpResponse: {
          body: {
            access_token: "actualAccessToken",
            refresh_token: "actualRefreshToken",
            expires_in: 14400,
          },
        },
      };

      const result = maskSensitiveData(input);

      // Verify expected masking per problem statement
      expect(result.testData.hmrcTestUsername).toBe("869172854733");
      expect(result.testData.hmrcTestPassword).toBe("***MASKED***");

      expect(result.httpRequest.headers.Accept).toBe("application/vnd.hmrc.1.0+json");
      expect(result.httpRequest.headers.Authorization).toBe("***MASKED***");
      expect(result.httpRequest.headers["Gov-Client-Public-IP"]).toBe("88.97.27.180");

      expect(result.httpResponse.body.access_token).toBe("***MASKED***");
      expect(result.httpResponse.body.refresh_token).toBe("***MASKED***");
      expect(result.httpResponse.body.expires_in).toBe(14400);
    });

    test("handles circular references gracefully", () => {
      const input = { a: 1 };
      input.self = input; // Create circular reference

      const result = maskSensitiveData(input);

      expect(result.a).toBe(1);
      expect(result.self).toBe("[Circular Reference]");
    });
  });

  describe("maskHttpData", () => {
    test("masks HTTP request data", () => {
      const httpRequest = {
        method: "POST",
        headers: {
          "Authorization": "Bearer token123",
          "Content-Type": "application/json",
        },
        body: {
          client_secret: "secret123",
          grant_type: "authorization_code",
        },
      };

      const result = maskHttpData(httpRequest);

      expect(result.method).toBe("POST");
      expect(result.headers.Authorization).toBe("***MASKED***");
      expect(result.headers["Content-Type"]).toBe("application/json");
      expect(result.body.client_secret).toBe("***MASKED***");
      expect(result.body.grant_type).toBe("authorization_code");
    });

    test("masks HTTP response data", () => {
      const httpResponse = {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
        },
        body: {
          access_token: "token123",
          refresh_token: "refresh123",
          expires_in: 14400,
          token_type: "Bearer",
        },
      };

      const result = maskHttpData(httpResponse);

      expect(result.statusCode).toBe(200);
      expect(result.headers["Content-Type"]).toBe("application/json");
      expect(result.body.access_token).toBe("***MASKED***");
      expect(result.body.refresh_token).toBe("***MASKED***");
      expect(result.body.expires_in).toBe(14400);
      expect(result.body.token_type).toBe("Bearer");
    });

    test("handles null/undefined input", () => {
      expect(maskHttpData(null)).toBe(null);
      expect(maskHttpData(undefined)).toBe(undefined);
    });
  });
});
