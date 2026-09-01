// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/unit-tests/functions/customAuthorizer.test.js
import { describe, it, expect, vi, beforeEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

// Mock aws-jwt-verify CognitoJwtVerifier
const mockVerify = vi.fn();
vi.mock("aws-jwt-verify", () => {
  return {
    CognitoJwtVerifier: {
      create: vi.fn().mockReturnValue({ verify: mockVerify }),
    },
  };
});

// Mock the security-state repository (issue #10 mid-session country check)
const mockGetSessionGeo = vi.fn();
const mockPutSessionGeo = vi.fn();
vi.mock("@app/data/dynamoDbSecurityStateRepository.js", () => ({
  getSessionGeo: (...args) => mockGetSessionGeo(...args),
  putSessionGeo: (...args) => mockPutSessionGeo(...args),
}));

// Mock the Cognito admin client used to force a global sign-out on a country change
const mockCognitoSend = vi.fn();
vi.mock("@aws-sdk/client-cognito-identity-provider", () => {
  class CognitoIdentityProviderClient {
    send(cmd) {
      return mockCognitoSend(cmd);
    }
  }
  class AdminUserGlobalSignOutCommand {
    constructor(input) {
      this.input = input;
    }
  }
  return { CognitoIdentityProviderClient, AdminUserGlobalSignOutCommand };
});

// Spy on publishActivityEvent directly -- it's what customAuthorizer.js calls both for the
// generic "auth-denied" event and the country-change-specific one.
const mockPublishActivityEvent = vi.fn();
vi.mock("@app/lib/activityAlert.js", () => ({
  publishActivityEvent: (...args) => mockPublishActivityEvent(...args),
}));

function makeEvent(headers = {}, arn = "arn:aws:execute-api:eu-west-2:123456789012:abc123/prod/GET/resource") {
  return {
    routeArn: arn,
    headers,
    requestContext: {},
  };
}

describe("functions/auth/customAuthorizer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(process.env, {
      COGNITO_USER_POOL_ID: "pool-123",
      COGNITO_USER_POOL_CLIENT_ID: "client-123",
    });
    delete process.env.SECURITY_STATE_DYNAMODB_TABLE_NAME;
    mockGetSessionGeo.mockResolvedValue(null);
    mockPutSessionGeo.mockResolvedValue(undefined);
    mockCognitoSend.mockResolvedValue({});
  });

  it("denies when X-Authorization header is missing", async () => {
    const { ingestHandler } = await import("@app/functions/auth/customAuthorizer.js");
    const res = await ingestHandler(makeEvent({}));
    expect(res.policyDocument.Statement[0].Effect).toBe("Deny");
  });

  it("denies when X-Authorization is not 'Bearer <token>'", async () => {
    const { ingestHandler } = await import("@app/functions/auth/customAuthorizer.js");
    const res = await ingestHandler(makeEvent({ "X-Authorization": "token" }));
    expect(res.policyDocument.Statement[0].Effect).toBe("Deny");
  });

  it("allows when verifier succeeds and returns payload", async () => {
    const { ingestHandler } = await import("@app/functions/auth/customAuthorizer.js");
    mockVerify.mockResolvedValueOnce({ sub: "user-sub", username: "user", scope: "read" });
    const res = await ingestHandler(makeEvent({ "x-authorization": "Bearer token-abc" }));
    expect(res.policyDocument.Statement[0].Effect).toBe("Allow");
    expect(res.principalId).toBe("user-sub");
    expect(res.context.sub).toBe("user-sub");
  });

  it("denies when verifier throws (invalid token)", async () => {
    const { ingestHandler } = await import("@app/functions/auth/customAuthorizer.js");
    mockVerify.mockRejectedValueOnce(new Error("invalid"));
    const res = await ingestHandler(makeEvent({ "x-authorization": "Bearer bad" }));
    expect(res.policyDocument.Statement[0].Effect).toBe("Deny");
  });

  // ==========================================================================
  // Mid-session country change (issue #10 acceptance criterion 4)
  // ==========================================================================

  describe("evaluateCountryChange (pure decision)", () => {
    it("allows and writes nothing when there is no country header", async () => {
      const { evaluateCountryChange } = await import("@app/functions/auth/customAuthorizer.js");
      const result = evaluateCountryChange({ countryHeader: null, storedItem: null, tokenIat: 1000 });
      expect(result).toEqual({ decision: "allow" });
    });

    it("stores the country and allows on a first request", async () => {
      const { evaluateCountryChange } = await import("@app/functions/auth/customAuthorizer.js");
      const result = evaluateCountryChange({ countryHeader: "GB", storedItem: null, tokenIat: 1000 });
      expect(result.decision).toBe("allow");
      expect(result.write).toEqual({ country: "GB" });
    });

    it("allows and issues no write when the country matches", async () => {
      const { evaluateCountryChange } = await import("@app/functions/auth/customAuthorizer.js");
      const result = evaluateCountryChange({ countryHeader: "GB", storedItem: { country: "GB" }, tokenIat: 1000 });
      expect(result).toEqual({ decision: "allow" });
    });

    it("denies, sets revokedAt and the new country, and signals a sign-out and event on a country change", async () => {
      const { evaluateCountryChange } = await import("@app/functions/auth/customAuthorizer.js");
      const result = evaluateCountryChange({
        countryHeader: "FR",
        storedItem: { country: "GB" },
        tokenIat: 1000,
        nowEpochSeconds: 5000,
      });
      expect(result).toEqual({
        decision: "deny",
        reason: "country-changed",
        write: { country: "FR", revokedAt: 5000 },
        globalSignOut: true,
        activityEvent: true,
      });
    });

    it("denies with session-revoked when the token iat predates the revocation", async () => {
      const { evaluateCountryChange } = await import("@app/functions/auth/customAuthorizer.js");
      const result = evaluateCountryChange({
        countryHeader: "FR",
        storedItem: { country: "FR", revokedAt: 5000 },
        tokenIat: 4000,
      });
      expect(result).toEqual({ decision: "deny", reason: "session-revoked" });
    });

    it("allows and reflects the recorded country when the token iat is after the revocation", async () => {
      const { evaluateCountryChange } = await import("@app/functions/auth/customAuthorizer.js");
      // A country-change deny already wrote the new country alongside revokedAt (see the test
      // above), so a fresh login's token -- iat after that revocation -- lands here and matches.
      const result = evaluateCountryChange({
        countryHeader: "FR",
        storedItem: { country: "FR", revokedAt: 5000 },
        tokenIat: 6000,
      });
      expect(result).toEqual({ decision: "allow" });
    });
  });

  describe("mid-session country change (ingestHandler integration)", () => {
    beforeEach(() => {
      process.env.SECURITY_STATE_DYNAMODB_TABLE_NAME = "test-security-state";
    });

    it("skips the check entirely and allows when there is no country header", async () => {
      const { ingestHandler } = await import("@app/functions/auth/customAuthorizer.js");
      mockVerify.mockResolvedValueOnce({ sub: "user-sub", iat: 1000 });

      const res = await ingestHandler(makeEvent({ "x-authorization": "Bearer token-abc" }));

      expect(res.policyDocument.Statement[0].Effect).toBe("Allow");
      expect(mockGetSessionGeo).not.toHaveBeenCalled();
    });

    it("denies, revokes via AdminUserGlobalSignOut once, and publishes one auth-country-change event on a country change", async () => {
      const { ingestHandler } = await import("@app/functions/auth/customAuthorizer.js");
      mockVerify.mockResolvedValueOnce({ sub: "user-sub-raw", username: "user", iat: 1000 });
      mockGetSessionGeo.mockResolvedValueOnce({ country: "GB" });

      const res = await ingestHandler(
        makeEvent({ "x-authorization": "Bearer token-abc", "cloudfront-viewer-country": "FR" }),
      );

      expect(res.policyDocument.Statement[0].Effect).toBe("Deny");
      expect(mockPutSessionGeo).toHaveBeenCalledTimes(1);
      expect(mockPutSessionGeo).toHaveBeenCalledWith(expect.any(String), {
        country: "FR",
        revokedAt: expect.any(Number),
      });

      expect(mockCognitoSend).toHaveBeenCalledTimes(1);
      const signOutCommand = mockCognitoSend.mock.calls[0][0];
      expect(signOutCommand.input).toEqual({ UserPoolId: "pool-123", Username: "user" });

      const countryChangeCalls = mockPublishActivityEvent.mock.calls.filter((call) => call[0].event === "auth-country-change");
      expect(countryChangeCalls.length).toBe(1);
    });

    it("denies with no write, no sign-out and no new event when the token predates the revocation", async () => {
      const { ingestHandler } = await import("@app/functions/auth/customAuthorizer.js");
      mockVerify.mockResolvedValueOnce({ sub: "user-sub", username: "user", iat: 1000 });
      mockGetSessionGeo.mockResolvedValueOnce({ country: "FR", revokedAt: 5000 });

      const res = await ingestHandler(
        makeEvent({ "x-authorization": "Bearer token-abc", "cloudfront-viewer-country": "FR" }),
      );

      expect(res.policyDocument.Statement[0].Effect).toBe("Deny");
      expect(mockPutSessionGeo).not.toHaveBeenCalled();
      expect(mockCognitoSend).not.toHaveBeenCalled();
      const countryChangeCalls = mockPublishActivityEvent.mock.calls.filter((call) => call[0].event === "auth-country-change");
      expect(countryChangeCalls.length).toBe(0);
    });

    it("the raw sub never reaches the stored item or the published event's detail", async () => {
      const { ingestHandler } = await import("@app/functions/auth/customAuthorizer.js");
      const rawSub = "raw-user-sub-value";
      mockVerify.mockResolvedValueOnce({ sub: rawSub, username: "user", iat: 1000 });
      mockGetSessionGeo.mockResolvedValueOnce({ country: "GB" });

      await ingestHandler(makeEvent({ "x-authorization": "Bearer token-abc", "cloudfront-viewer-country": "FR" }));

      const hashedSubArg = mockGetSessionGeo.mock.calls[0][0];
      expect(hashedSubArg).not.toBe(rawSub);

      const putArgs = mockPutSessionGeo.mock.calls[0];
      expect(putArgs[0]).not.toBe(rawSub);
      expect(JSON.stringify(putArgs[1])).not.toContain(rawSub);

      const countryChangeEvent = mockPublishActivityEvent.mock.calls.find((call) => call[0].event === "auth-country-change")[0];
      expect(JSON.stringify(countryChangeEvent.detail)).not.toContain(rawSub);
      // userSub carries the raw sub through to activityAlert.js's own hashing, same as every
      // other publishActivityEvent caller -- it must not also be duplicated into detail.
      expect(countryChangeEvent.userSub).toBe(rawSub);
    });
  });
});
