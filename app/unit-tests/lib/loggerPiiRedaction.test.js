// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/lib/loggerPiiRedaction.test.js
// Tests for PII redaction in the logger

import { describe, test, expect } from "vitest";
import { sanitiseString, sanitiseData, createSafeLogger, containsSensitiveData } from "@app/lib/logger.js";

describe("lib/logger PII redaction", () => {
  describe("sanitiseString", () => {
    test("redacts VRN patterns (9 digits)", () => {
      expect(sanitiseString("VRN: 123456789")).toBe("VRN: [VRN]");
      expect(sanitiseString("vatNumber=GB123456789")).toBe("vatNumber=[VRN]");
      expect(sanitiseString("vrn GB987654321 is valid")).toBe("vrn [VRN] is valid");
    });

    test("redacts UTR patterns (10 digits)", () => {
      expect(sanitiseString("UTR: 1234567890")).toBe("UTR: [UTR]");
      expect(sanitiseString("utr=9876543210")).toBe("utr=[UTR]");
    });

    test("redacts NINO patterns", () => {
      expect(sanitiseString("NINO: AB123456C")).toBe("NINO: [NINO]");
      expect(sanitiseString("nino=CD654321D")).toBe("nino=[NINO]");
      expect(sanitiseString("NI number is XY999999A")).toBe("NI number is [NINO]");
    });

    test("redacts EORI patterns", () => {
      expect(sanitiseString("EORI: GB123456789012")).toBe("EORI: [EORI]");
      expect(sanitiseString("eori=XI123456789012345")).toBe("eori=[EORI]");
    });

    test("redacts email addresses", () => {
      expect(sanitiseString("email: user@example.com")).toBe("email: [EMAIL]");
      expect(sanitiseString("contact test.user+tag@domain.co.uk please")).toBe("contact [EMAIL] please");
    });

    test("redacts Bearer tokens in strings", () => {
      // SECRET pattern catches Authorization: [TOKEN] after TOKEN redacts the Bearer value
      expect(sanitiseString("Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig")).toBe("[SECRET]");
      expect(sanitiseString("bearer abc123def456")).toBe("[TOKEN]");
    });

    test("handles multiple PII patterns in same string", () => {
      const input = "User AB123456C with email test@example.com has VRN 123456789";
      const expected = "User [NINO] with email [EMAIL] has VRN [VRN]";
      expect(sanitiseString(input)).toBe(expected);
    });

    test("returns non-string values unchanged", () => {
      expect(sanitiseString(123)).toBe(123);
      expect(sanitiseString(null)).toBe(null);
      expect(sanitiseString(undefined)).toBe(undefined);
      expect(sanitiseString(true)).toBe(true);
    });

    test("preserves non-PII strings", () => {
      expect(sanitiseString("Hello world")).toBe("Hello world");
      expect(sanitiseString("Status: 200 OK")).toBe("Status: 200 OK");
      expect(sanitiseString("periodKey=24A1")).toBe("periodKey=24A1");
    });
  });

  describe("sanitiseData", () => {
    test("sanitises strings in flat objects", () => {
      const input = {
        message: "User AB123456C logged in",
        status: 200,
        success: true,
      };

      const result = sanitiseData(input);

      expect(result.message).toBe("User [NINO] logged in");
      expect(result.status).toBe(200);
      expect(result.success).toBe(true);
    });

    test("sanitises nested objects", () => {
      const input = {
        user: {
          email: "test@example.com",
          nino: "AB123456C",
        },
        request: {
          headers: {
            authorization: "Bearer eyJtoken.payload.sig",
          },
        },
      };

      const result = sanitiseData(input);

      expect(result.user.email).toBe("[EMAIL]");
      expect(result.user.nino).toBe("[NINO]");
      expect(result.request.headers.authorization).toBe("[TOKEN]");
    });

    test("sanitises arrays", () => {
      const input = {
        emails: ["user1@example.com", "user2@example.com"],
        ids: ["AB123456C", "CD654321D"],
      };

      const result = sanitiseData(input);

      expect(result.emails).toEqual(["[EMAIL]", "[EMAIL]"]);
      expect(result.ids).toEqual(["[NINO]", "[NINO]"]);
    });

    test("handles null, undefined, and primitives", () => {
      expect(sanitiseData(null)).toBe(null);
      expect(sanitiseData(undefined)).toBe(undefined);
      expect(sanitiseData(123)).toBe(123);
      expect(sanitiseData(true)).toBe(true);
    });

    test("handles circular references", () => {
      const input = { a: 1 };
      input.self = input;

      const result = sanitiseData(input);

      expect(result.a).toBe(1);
      expect(result.self).toBe("[Circular]");
    });

    test("does not mutate original data", () => {
      const input = {
        email: "test@example.com",
        nested: {
          nino: "AB123456C",
        },
      };

      const originalEmail = input.email;
      const originalNino = input.nested.nino;

      sanitiseData(input);

      expect(input.email).toBe(originalEmail);
      expect(input.nested.nino).toBe(originalNino);
    });
  });

  describe("createSafeLogger", () => {
    test("creates logger with safe methods", () => {
      // Mock a minimal Pino-like logger
      const logs = [];
      const mockLogger = {
        info: (obj, msg) => logs.push({ level: "info", obj, msg }),
        warn: (obj, msg) => logs.push({ level: "warn", obj, msg }),
        error: (obj, msg) => logs.push({ level: "error", obj, msg }),
        debug: (obj, msg) => logs.push({ level: "debug", obj, msg }),
        trace: (obj, msg) => logs.push({ level: "trace", obj, msg }),
      };

      const safeLog = createSafeLogger(mockLogger);

      safeLog.safeInfo({ email: "user@test.com" }, "User AB123456C logged in");

      expect(logs).toHaveLength(1);
      expect(logs[0].obj.email).toBe("[EMAIL]");
      expect(logs[0].msg).toBe("User [NINO] logged in");
    });

    test("exposes raw logger", () => {
      const mockLogger = { info: () => {} };
      const safeLog = createSafeLogger(mockLogger);

      expect(safeLog.raw).toBe(mockLogger);
    });
  });

  describe("SECRET key=value redaction", () => {
    test("redacts client_secret=value patterns", () => {
      expect(sanitiseString("client_secret=abc123-def456")).toBe("[SECRET]");
      expect(sanitiseString("CLIENT_SECRET=my-secret-value")).toBe("[SECRET]");
      expect(sanitiseString("clientSecret=some-uuid-here")).toBe("[SECRET]");
    });

    test("redacts client_secret in query strings", () => {
      expect(sanitiseString("grant_type=authorization_code&client_secret=abc123&redirect_uri=http://localhost")).toBe(
        "grant_type=authorization_code&[SECRET]&redirect_uri=http://localhost",
      );
    });

    test("redacts api_key and apiKey patterns", () => {
      expect(sanitiseString("api_key=sk-123456789")).toBe("[SECRET]");
      expect(sanitiseString("API_KEY=prod-key-value")).toBe("[SECRET]");
      expect(sanitiseString("apiKey=test-key")).toBe("[SECRET]");
    });

    test("redacts password patterns", () => {
      expect(sanitiseString("password=MyP@ssw0rd!")).toBe("[SECRET]");
      expect(sanitiseString("PASSWORD=hunter2")).toBe("[SECRET]");
    });

    test("redacts access_token and refresh_token patterns", () => {
      expect(sanitiseString("access_token=eyJhbGciOiJSUzI1NiJ9")).toBe("[SECRET]");
      expect(sanitiseString("refresh_token=dGhpcyBpcyBhIHRva2Vu")).toBe("[SECRET]");
      expect(sanitiseString("accessToken=some-token")).toBe("[SECRET]");
    });

    test("redacts authorization header values", () => {
      expect(sanitiseString("authorization=Bearer eyJtoken")).toBe("[SECRET]");
      expect(sanitiseString("Authorization: Bearer eyJtoken")).toBe("[SECRET]");
    });

    test("redacts hmrcAccessToken patterns", () => {
      expect(sanitiseString("hmrcAccessToken=abc-123-def")).toBe("[SECRET]");
    });

    test("redacts client.secret (dot notation)", () => {
      expect(sanitiseString("client.secret=my-secret")).toBe("[SECRET]");
    });

    test("preserves non-secret key=value pairs", () => {
      expect(sanitiseString("periodKey=24A1")).toBe("periodKey=24A1");
      expect(sanitiseString("grant_type=authorization_code")).toBe("grant_type=authorization_code");
      expect(sanitiseString("redirect_uri=http://localhost:3000")).toBe("redirect_uri=http://localhost:3000");
    });
  });

  describe("containsSensitiveData", () => {
    test("detects client_secret in strings", () => {
      expect(containsSensitiveData("client_secret=abc123")).toBe(true);
      expect(containsSensitiveData("CLIENT_SECRET=value")).toBe(true);
      expect(containsSensitiveData("clientSecret=value")).toBe(true);
    });

    test("detects other sensitive patterns", () => {
      expect(containsSensitiveData("password=hunter2")).toBe(true);
      expect(containsSensitiveData("access_token=eyJ")).toBe(true);
      expect(containsSensitiveData("api_key=sk-123")).toBe(true);
    });

    test("returns false for non-sensitive strings", () => {
      expect(containsSensitiveData("Hello world")).toBe(false);
      expect(containsSensitiveData("periodKey=24A1")).toBe(false);
      expect(containsSensitiveData("status=200")).toBe(false);
    });

    test("returns false for non-string values", () => {
      expect(containsSensitiveData(123)).toBe(false);
      expect(containsSensitiveData(null)).toBe(false);
      expect(containsSensitiveData(undefined)).toBe(false);
    });
  });

  describe("VRN pattern edge cases", () => {
    test("does not match 8 or fewer digits", () => {
      expect(sanitiseString("code 12345678")).toBe("code 12345678");
    });

    test("matches exactly 9 digits with GB prefix", () => {
      expect(sanitiseString("GB123456789")).toBe("[VRN]");
    });
  });

  describe("UTR pattern edge cases", () => {
    test("matches exactly 10 digits as UTR", () => {
      // 9 digits matches VRN pattern, not UTR
      expect(sanitiseString("ref 123456789")).toBe("ref [VRN]");
      // 10 digits is a valid UTR
      expect(sanitiseString("ref 1234567890")).toBe("ref [UTR]");
      // 11 digits does not match UTR pattern (boundary check)
      expect(sanitiseString("ref 12345678901")).toBe("ref 12345678901");
    });
  });

  describe("NINO pattern edge cases", () => {
    test("only matches valid suffix letters (A, B, C, D)", () => {
      expect(sanitiseString("AB123456A")).toBe("[NINO]");
      expect(sanitiseString("AB123456B")).toBe("[NINO]");
      expect(sanitiseString("AB123456C")).toBe("[NINO]");
      expect(sanitiseString("AB123456D")).toBe("[NINO]");
      // E is not a valid suffix
      expect(sanitiseString("AB123456E")).toBe("AB123456E");
    });
  });
});
