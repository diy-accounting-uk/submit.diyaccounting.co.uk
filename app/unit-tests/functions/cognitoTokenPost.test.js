// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSend = vi.fn().mockResolvedValue({});
vi.mock("@aws-sdk/client-eventbridge", () => ({
  EventBridgeClient: class {
    send(...args) {
      return mockSend(...args);
    }
  },
  PutEventsCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
}));

const mockBuildTokenExchangeResponse = vi.fn();
vi.mock("@app/lib/httpResponseHelper.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    buildTokenExchangeResponse: (...args) => mockBuildTokenExchangeResponse(...args),
  };
});

const { extractUserInfoFromResponse, ingestHandler } = await import("@app/functions/auth/cognitoTokenPost.js");
const { hashSub } = await import("@app/services/subHasher.js");

/**
 * Build a minimal JWT with the given payload (no signature verification needed).
 */
function buildMockJwt(payload) {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.mock-signature`;
}

function buildTokenRequestEvent({ grantType = "authorization_code", code = "auth-code-abc" } = {}) {
  const form = new URLSearchParams({ grant_type: grantType, code });
  return {
    body: Buffer.from(form.toString()).toString("base64"),
    headers: {},
    requestContext: {},
  };
}

describe("cognitoTokenPost", () => {
  describe("extractUserInfoFromResponse", () => {
    it("should extract email, provider and sub from a Google federated ID token", () => {
      const idToken = buildMockJwt({
        email: "customer@gmail.com",
        sub: "google-sub-123",
        identities: JSON.stringify([{ providerName: "Google", providerType: "Google", userId: "123", primary: true }]),
      });

      const result = extractUserInfoFromResponse({
        statusCode: 200,
        body: JSON.stringify({ idToken }),
      });

      expect(result).toEqual({ email: "customer@gmail.com", provider: "Google", sub: "google-sub-123" });
    });

    it("should extract email and sub without provider for native Cognito users", () => {
      const idToken = buildMockJwt({
        email: "test-abc@test.diyaccounting.co.uk",
        sub: "abc-123",
      });

      const result = extractUserInfoFromResponse({
        statusCode: 200,
        body: JSON.stringify({ idToken }),
      });

      expect(result).toEqual({ email: "test-abc@test.diyaccounting.co.uk", provider: "", sub: "abc-123" });
    });

    it("should return empty strings when statusCode is not 200", () => {
      const result = extractUserInfoFromResponse({
        statusCode: 500,
        body: JSON.stringify({ error: "Token exchange failed" }),
      });

      expect(result).toEqual({ email: "", provider: "", sub: "" });
    });

    it("should return empty strings when no idToken in response", () => {
      const result = extractUserInfoFromResponse({
        statusCode: 200,
        body: JSON.stringify({ accessToken: "abc" }),
      });

      expect(result).toEqual({ email: "", provider: "", sub: "" });
    });

    it("should return empty strings for non-JWT idToken (graceful fallback)", () => {
      const result = extractUserInfoFromResponse({
        statusCode: 200,
        body: JSON.stringify({ idToken: "not-a-jwt" }),
      });

      expect(result).toEqual({ email: "", provider: "", sub: "" });
    });

    it("should handle identities as an array (not stringified)", () => {
      const idToken = buildMockJwt({
        email: "user@example.com",
        sub: "user-sub-456",
        identities: [{ providerName: "Google", providerType: "Google" }],
      });

      const result = extractUserInfoFromResponse({
        statusCode: 200,
        body: JSON.stringify({ idToken }),
      });

      expect(result).toEqual({ email: "user@example.com", provider: "Google", sub: "user-sub-456" });
    });

    it("should handle empty identities array", () => {
      const idToken = buildMockJwt({
        email: "user@example.com",
        sub: "user-sub-789",
        identities: "[]",
      });

      const result = extractUserInfoFromResponse({
        statusCode: 200,
        body: JSON.stringify({ idToken }),
      });

      expect(result).toEqual({ email: "user@example.com", provider: "", sub: "user-sub-789" });
    });

    it("should handle malformed body JSON gracefully", () => {
      const result = extractUserInfoFromResponse({
        statusCode: 200,
        body: "not-json",
      });

      expect(result).toEqual({ email: "", provider: "", sub: "" });
    });
  });

  describe("ingestHandler activity event", () => {
    beforeEach(() => {
      mockSend.mockClear();
      mockBuildTokenExchangeResponse.mockReset();
    });

    it("publishes the login event with the hashed sub, never the raw sub", async () => {
      const idToken = buildMockJwt({ email: "customer@example.com", sub: "cognito-sub-xyz" });
      mockBuildTokenExchangeResponse.mockResolvedValue({
        statusCode: 200,
        body: JSON.stringify({ idToken, accessToken: "at", refreshToken: "rt" }),
      });

      await ingestHandler(buildTokenRequestEvent());

      expect(mockSend).toHaveBeenCalledTimes(1);
      const entry = mockSend.mock.calls[0][0].input.Entries[0];
      const rawDetail = entry.Detail;
      expect(rawDetail).not.toContain("cognito-sub-xyz");
      const detail = JSON.parse(rawDetail);
      expect(detail.event).toBe("login");
      expect(detail.hashedSub).toBe(hashSub("cognito-sub-xyz"));
    });

    it("omits the hashed sub when the ID token carries no subject", async () => {
      const idToken = buildMockJwt({ email: "customer@example.com" });
      mockBuildTokenExchangeResponse.mockResolvedValue({
        statusCode: 200,
        body: JSON.stringify({ idToken, accessToken: "at", refreshToken: "rt" }),
      });

      await ingestHandler(buildTokenRequestEvent());

      const detail = JSON.parse(mockSend.mock.calls[0][0].input.Entries[0].Detail);
      expect(detail.hashedSub).toBeUndefined();
    });
  });
});
