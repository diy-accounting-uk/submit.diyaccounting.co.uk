// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/web/test-report-web-test-local.test.js

import { describe, test, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("web/public/tests/test-report-web-test-local.json", () => {
  test("should have all sensitive fields masked", () => {
    // Load the test report file
    const filePath = path.join(process.cwd(), "web/public/tests/test-report-web-test-local.json");
    const fileContent = fs.readFileSync(filePath, "utf-8");
    const testReport = JSON.parse(fileContent);

    // Convert to string for easier searching
    const jsonString = JSON.stringify(testReport);

    // Check that no unmasked Authorization headers with actual tokens exist
    // Should not find "Bearer" followed by actual token (non-masked pattern)
    const bearerTokenPattern = /"Authorization":\s*"Bearer\s+[a-f0-9]{32}"/gi;
    const bearerMatches = jsonString.match(bearerTokenPattern);
    if (bearerMatches) {
      console.error("Found unmasked Authorization Bearer tokens:", bearerMatches);
    }
    expect(bearerMatches).toBeNull();

    // Check that no unmasked access_token exists
    const accessTokenPattern = /"access_token":\s*"[a-f0-9]{32}"/gi;
    const accessTokenMatches = jsonString.match(accessTokenPattern);
    if (accessTokenMatches) {
      console.error("Found unmasked access_token:", accessTokenMatches);
    }
    expect(accessTokenMatches).toBeNull();

    // Check that no unmasked refresh_token exists
    const refreshTokenPattern = /"refresh_token":\s*"[a-f0-9]{32}"/gi;
    const refreshTokenMatches = jsonString.match(refreshTokenPattern);
    if (refreshTokenMatches) {
      console.error("Found unmasked refresh_token:", refreshTokenMatches);
    }
    expect(refreshTokenMatches).toBeNull();

    // Check that no unmasked client_secret exists in URL-encoded body
    const clientSecretPattern = /client_secret=[a-f0-9-]{36}/gi;
    const clientSecretMatches = jsonString.match(clientSecretPattern);
    if (clientSecretMatches) {
      console.error("Found unmasked client_secret in request body:", clientSecretMatches);
    }
    expect(clientSecretMatches).toBeNull();

    // Verify that hmrcApiRequests array exists
    expect(testReport.hmrcApiRequests).toBeDefined();

    // Skip detailed checks if no HMRC API requests were captured (e.g., test failed early)
    if (testReport.hmrcApiRequests.length === 0) {
      console.log("⚠️ No HMRC API requests in report - skipping detailed masking checks");
      return;
    }

    // Verify that masked values ARE present (positive check)
    expect(jsonString).toContain("***MASKED***");

    // Verify specific masked fields in testData (if testData exists)
    if (testReport.testContext?.testData?.hmrcTestPassword) {
      expect(testReport.testContext.testData.hmrcTestPassword).toBe("***MASKED***");
    }

    // Check each HMRC API request for properly masked fields
    testReport.hmrcApiRequests.forEach((request, index) => {
      // Check Authorization headers are masked
      if (request.httpRequest?.headers?.Authorization) {
        expect(request.httpRequest.headers.Authorization, `Request ${index}: Authorization header should be masked`).toBe("***MASKED***");
      }

      // Check access_token in response body is masked
      if (request.httpResponse?.body?.access_token) {
        expect(request.httpResponse.body.access_token, `Request ${index}: access_token in response should be masked`).toBe("***MASKED***");
      }

      // Check refresh_token in response body is masked
      if (request.httpResponse?.body?.refresh_token) {
        expect(request.httpResponse.body.refresh_token, `Request ${index}: refresh_token in response should be masked`).toBe(
          "***MASKED***",
        );
      }

      // Check client_secret in request body is masked
      if (request.httpRequest?.body && typeof request.httpRequest.body === "string") {
        const bodyContainsClientSecret = request.httpRequest.body.includes("client_secret=");
        if (bodyContainsClientSecret) {
          expect(request.httpRequest.body, `Request ${index}: client_secret in request body should be masked`).toContain(
            "client_secret=***MASKED***",
          );
          expect(request.httpRequest.body, `Request ${index}: client_secret should not contain actual UUID`).not.toMatch(
            /client_secret=[a-f0-9-]{36}/,
          );
        }

        // Check authorization code in request body is masked
        const bodyContainsCode = request.httpRequest.body.includes("code=");
        if (bodyContainsCode) {
          expect(request.httpRequest.body, `Request ${index}: authorization code in request body should be masked`).toContain(
            "code=***MASKED***",
          );
          expect(request.httpRequest.body, `Request ${index}: authorization code should not contain actual 32-char hex value`).not.toMatch(
            /code=[a-f0-9]{32}/,
          );
        }
      }
    });

    console.log(`✅ All ${testReport.hmrcApiRequests.length} HMRC API requests have properly masked sensitive fields`);
  });

  test("should not contain any unmasked sensitive credentials", () => {
    // Load the test report file
    const filePath = path.join(process.cwd(), "web/public/tests/test-report-web-test-local.json");
    const fileContent = fs.readFileSync(filePath, "utf-8");
    const testReport = JSON.parse(fileContent);

    // These are the specific sensitive patterns we must NOT find in the report
    // They represent actual tokens/secrets that should have been masked
    const forbiddenPatterns = [
      {
        name: "Unmasked client_secret in URL-encoded body",
        pattern: /client_secret=[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi,
        description: "Found client_secret with UUID value in request body - should be masked",
      },
      {
        name: "Unmasked authorization code in URL-encoded body",
        pattern: /[&?]code=[a-f0-9]{32}/gi,
        description: "Found authorization code with 32-char hex value in request body - should be masked",
      },
      {
        name: "Unmasked Bearer token in Authorization header",
        pattern: /"Authorization":\s*"Bearer\s+[a-f0-9]{32}"/gi,
        description: "Found Bearer token in Authorization header - should be masked",
      },
      {
        name: "Unmasked access_token with 32-hex value",
        pattern: /"access_token":\s*"[a-f0-9]{32}"/gi,
        description: "Found access_token with 32-char hex value - should be masked",
      },
      {
        name: "Unmasked refresh_token with 32-hex value",
        pattern: /"refresh_token":\s*"[a-f0-9]{32}"/gi,
        description: "Found refresh_token with 32-char hex value - should be masked",
      },
    ];

    let foundIssues = false;
    forbiddenPatterns.forEach(({ name, pattern, description }) => {
      const matches = fileContent.match(pattern);
      if (matches) {
        console.error(`❌ ${description}`);
        console.error(`   Pattern: ${name}`);
        console.error(`   Matches:`, matches.slice(0, 3));
        foundIssues = true;
      }
    });

    if (foundIssues) {
      throw new Error("Found unmasked sensitive credentials in test report - see errors above");
    }

    console.log("✅ No unmasked sensitive credentials detected in test report");
  });
});
