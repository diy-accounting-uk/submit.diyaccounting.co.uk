// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/lib/dataMasking.test.js

import { describe, test, expect } from "vitest";
import {
  isSensitiveField,
  maskSensitiveData,
  maskHttpData,
  maskIntegrationRaw,
  integrationPathTemplate,
  govTalkSummary,
} from "@app/lib/dataMasking.js";

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

  describe("maskHttpData keepFields", () => {
    test("keeps a named field in clear and masks the rest", () => {
      const result = maskHttpData(
        { body: { code: "INVALID_REQUEST", access_token: "token123", errors: [{ code: "FORMAT_VRN" }] } },
        { keepFields: ["code"] },
      );

      expect(result.body.code).toBe("INVALID_REQUEST");
      expect(result.body.errors[0].code).toBe("FORMAT_VRN");
      expect(result.body.access_token).toBe("***MASKED***");
    });

    test("masks code when no field is kept", () => {
      expect(maskHttpData({ body: { code: "abc" } }).body.code).toBe("***MASKED***");
    });
  });

  describe("integrationPathTemplate", () => {
    test.each([
      ["/organisations/vat/123456789/returns", "/organisations/vat/{vrn}/returns"],
      ["/individuals/business/AA123456A/2024-25/obligations", "/individuals/business/{nino}/2024-25/obligations"],
      [
        "/individuals/business/self-employment/AA123456A/XAIS12345678901/period/2024-04-06_2024-07-05",
        "/individuals/business/self-employment/{nino}/{id}/period/{id}",
      ],
      ["/individuals/calculations/f2fb30e5-4ab6-4a29-b3c1-c7264259ff1c", "/individuals/calculations/{id}"],
      ["/v1/customers/cus_Abc123", "/v1/customers/{id}"],
      ["/company/01234567/filing-history", "/company/{id}/filing-history"],
      ["/oauth/token", "/oauth/token"],
    ])("reduces %s", (path, template) => {
      expect(integrationPathTemplate(path)).toBe(template);
    });
  });

  describe("govTalkSummary", () => {
    test("reads the class, the transaction id and the first error number", () => {
      const xml =
        "<GovTalkMessage><Header><MessageDetails><Class>HMRC-CT-CT600</Class><TransactionID>ABC123</TransactionID></MessageDetails></Header>" +
        "<GovTalkDetails><GovTalkErrors><Error><RaisedBy>Department</RaisedBy><Number>3001</Number><Type>fatal</Type></Error></GovTalkErrors></GovTalkDetails></GovTalkMessage>";

      expect(govTalkSummary(xml)).toEqual({ messageClass: "HMRC-CT-CT600", transactionId: "ABC123", errorNumber: "3001" });
    });

    test("reads no error number from a message with no error", () => {
      expect(govTalkSummary("<Number>12</Number>").errorNumber).toBeUndefined();
    });
  });

  describe("maskIntegrationRaw", () => {
    const VRN = "193054661";
    const NINO = "AA123456A";
    const UTR = "1234567890";
    const EMAIL = "person@example.com";
    const IP = "203.0.113.7";
    const STRIPE_CUSTOMER = "cus_Abc123XYZ";
    const SECRET_VALUES = [VRN, NINO, UTR, EMAIL, IP, STRIPE_CUSTOMER];

    function expectNoSecretValue(raw) {
      const stored = JSON.stringify(raw);
      for (const value of SECRET_VALUES) expect(stored).not.toContain(value);
    }

    const call = { method: "POST", host: "api.example", api: "POST /organisations/vat/{vrn}/returns" };

    test("keeps header names, and values only for the allowlisted headers", () => {
      const raw = maskIntegrationRaw({
        ...call,
        status: 201,
        requestHeaders: {
          "Accept": "application/vnd.hmrc.1.0+json",
          "Authorization": "Bearer token123",
          "Gov-Client-Connection-Method": "WEB_APP_VIA_SERVER",
          "Gov-Client-Public-IP": IP,
          "Gov-Client-User-IDs": `cognito=${EMAIL}`,
          "x-request-id": undefined,
        },
        responseHeaders: new Headers({ "x-correlationid": "abc", "Content-Type": "application/json" }),
      });

      expect(raw.requestHeaderNames).toEqual([
        "Accept",
        "Authorization",
        "Gov-Client-Connection-Method",
        "Gov-Client-Public-IP",
        "Gov-Client-User-IDs",
      ]);
      expect(raw.requestHeaderValues).toEqual({
        "Accept": "application/vnd.hmrc.1.0+json",
        "Gov-Client-Connection-Method": "WEB_APP_VIA_SERVER",
      });
      expect(raw.responseHeaderNames).toEqual(expect.arrayContaining(["x-correlationid", "content-type"]));
      expectNoSecretValue(raw);
      expect(JSON.stringify(raw)).not.toContain("token123");
    });

    test("reduces a JSON body to field names and value types", () => {
      const raw = maskIntegrationRaw({
        ...call,
        status: 200,
        requestBody: JSON.stringify({
          vatDueSales: 12.5,
          finalised: true,
          vrn: VRN,
          nino: NINO,
          utr: UTR,
          email: EMAIL,
          nested: { ip: IP },
        }),
        responseBody: JSON.stringify({
          obligations: [{ periodKey: "18A1", customer: STRIPE_CUSTOMER }, { periodKey: "18A2" }],
          none: null,
        }),
      });

      expect(raw.requestBody).toEqual({
        vatDueSales: "number",
        finalised: "boolean",
        vrn: "string",
        nino: "string",
        utr: "string",
        email: "string",
        nested: { ip: "string" },
      });
      expect(raw.responseBody).toEqual({ obligations: [{ periodKey: "string", customer: "string" }], none: "null" });
      expectNoSecretValue(raw);
    });

    test("removes an identifier used as a field name", () => {
      const raw = maskIntegrationRaw({ ...call, responseBody: { [VRN]: 1, [EMAIL]: 2 } });

      expect(raw.responseBody).toEqual({ "{id}": "number" });
    });

    test("keeps parameter names only from a form body", () => {
      const raw = maskIntegrationRaw({
        ...call,
        requestHeaders: { "Content-Type": "application/x-www-form-urlencoded" },
        requestBody: `grant_type=authorization_code&code=abc123&client_secret=s3cret&customer=${STRIPE_CUSTOMER}`,
      });

      expect(raw.requestBody).toEqual({ grant_type: "string", code: "string", client_secret: "string", customer: "string" });
      expect(JSON.stringify(raw)).not.toContain("s3cret");
    });

    test("keeps the message class, transaction id and error number of a GovTalk envelope, and nothing else", () => {
      const envelope =
        `<?xml version="1.0"?><GovTalkMessage><Header><MessageDetails><Class>HMRC-CT-CT600</Class><TransactionID>TX123</TransactionID></MessageDetails>` +
        `<SenderDetails><IDAuthentication><SenderID>gateway-user</SenderID><Authentication><Value>gateway-password</Value></Authentication></IDAuthentication></SenderDetails></Header>` +
        `<GovTalkDetails><Keys><Key Type="UTR">${UTR}</Key></Keys></GovTalkDetails><Body><Accounts>turnover 1000</Accounts><Email>${EMAIL}</Email></Body></GovTalkMessage>`;
      const reply = `<GovTalkMessage><Header><MessageDetails><Class>HMRC-CT-CT600</Class></MessageDetails></Header><GovTalkDetails><GovTalkErrors><Error><Number>1046</Number><Text>Bad ${UTR}</Text></Error></GovTalkErrors></GovTalkDetails></GovTalkMessage>`;

      const raw = maskIntegrationRaw({ ...call, status: 200, requestBody: envelope, responseBody: reply });

      expect(raw.requestBody).toEqual({ format: "xml", messageClass: "HMRC-CT-CT600", transactionId: "TX123", errorNumber: undefined });
      expect(raw.responseBody.errorNumber).toBe("1046");
      expectNoSecretValue(raw);
      for (const value of ["gateway-user", "gateway-password", "turnover", "<"]) expect(JSON.stringify(raw)).not.toContain(value);
    });

    test("keeps the error codes and messages of a failed call, with identifiers removed", () => {
      const raw = maskIntegrationRaw({
        ...call,
        status: 400,
        responseBody: JSON.stringify({
          code: "INVALID_REQUEST",
          message: `VRN ${VRN} for ${EMAIL} from ${IP} and ${NINO} refused`,
          errors: [{ code: "VRN_INVALID", message: `Bad UTR ${UTR}`, path: "/vrn" }],
        }),
      });

      expect(raw.code).toBe("INVALID_REQUEST");
      expect(raw.message).toBe("VRN {id} for {id} from {id} and {id} refused");
      expect(raw.errors).toEqual([{ code: "VRN_INVALID", message: "Bad UTR {id}" }]);
      expectNoSecretValue(raw);
    });

    test("reads a Stripe error from under the error field", () => {
      const raw = maskIntegrationRaw({
        ...call,
        status: 404,
        responseBody: { error: { code: "resource_missing", message: `No such customer: '${STRIPE_CUSTOMER}'` } },
      });

      expect(raw.code).toBe("resource_missing");
      expect(raw.message).toBe("No such customer: '{id}'");
    });

    test("keeps no error text below status 400", () => {
      const raw = maskIntegrationRaw({ ...call, status: 200, responseBody: { code: "VALID_HEADERS", message: "ok" } });

      expect(raw.code).toBeUndefined();
      expect(raw.message).toBeUndefined();
      expect(raw.responseBody).toEqual({ code: "string", message: "string" });
    });

    test("limits the record to 32 KB and marks it truncated", () => {
      const wide = Object.fromEntries(
        Array.from({ length: 5000 }, (_, index) => [`field${"x".repeat(10)}${String.fromCharCode(97 + (index % 26))}${index}`, 1]),
      );

      const raw = maskIntegrationRaw({ ...call, status: 200, responseBody: wide });

      expect(raw.truncated).toBe(true);
      expect(raw.responseBody).toBeUndefined();
      expect(raw.api).toBe(call.api);
      expect(Buffer.byteLength(JSON.stringify(raw))).toBeLessThanOrEqual(32 * 1024);
    });
  });
});
