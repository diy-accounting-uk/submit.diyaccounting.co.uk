// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

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

const { ingestHandler, exchangeCodeForToken } = await import("@app/functions/auth/cognitoTokenPost.js");

function buildTokenRequestEvent({ grantType = "authorization_code", code = "auth-code-abc", codeVerifier = "verifier-abc" } = {}) {
  const form = new URLSearchParams({ grant_type: grantType, code });
  if (codeVerifier) form.set("code_verifier", codeVerifier);
  return {
    body: Buffer.from(form.toString()).toString("base64"),
    headers: {},
    requestContext: {},
  };
}

describe("cognitoTokenPost", () => {
  describe("ingestHandler", () => {
    beforeEach(() => {
      mockSend.mockClear();
      mockBuildTokenExchangeResponse.mockReset();
    });

    it("publishes no activity event: sign-in and refresh events come from the Pre Token Generation trigger instead", async () => {
      mockBuildTokenExchangeResponse.mockResolvedValue({
        statusCode: 200,
        body: JSON.stringify({ idToken: "header.body.sig", accessToken: "at", refreshToken: "rt" }),
      });

      await ingestHandler(buildTokenRequestEvent());

      expect(mockSend).not.toHaveBeenCalled();
    });

    it("sends the code_verifier to the Cognito token endpoint with the code", async () => {
      mockBuildTokenExchangeResponse.mockResolvedValue({ statusCode: 200, body: "{}" });

      await ingestHandler(buildTokenRequestEvent({ code: "c1", codeVerifier: "v1" }));

      const [, url, body] = mockBuildTokenExchangeResponse.mock.calls[0];
      expect(url).toMatch(/\/oauth2\/token$/);
      expect(body).toMatchObject({ grant_type: "authorization_code", code: "c1", code_verifier: "v1" });
    });

    it("rejects an authorization_code exchange without a code_verifier", async () => {
      const result = await ingestHandler(buildTokenRequestEvent({ codeVerifier: "" }));

      expect(result.statusCode).toBe(400);
      expect(result.body).toMatch(/Missing code_verifier/);
      expect(mockBuildTokenExchangeResponse).not.toHaveBeenCalled();
    });

    it("exchangeCodeForToken puts the verifier in the request body", async () => {
      const { body } = await exchangeCodeForToken("code-1", "verifier-1");

      expect(body.code_verifier).toBe("verifier-1");
    });

    it("returns the token exchange response unchanged", async () => {
      const tokenResponse = {
        statusCode: 200,
        body: JSON.stringify({ idToken: "header.body.sig", accessToken: "at", refreshToken: "rt" }),
      };
      mockBuildTokenExchangeResponse.mockResolvedValue(tokenResponse);

      const result = await ingestHandler(buildTokenRequestEvent());

      expect(result).toBe(tokenResponse);
    });
  });
});
