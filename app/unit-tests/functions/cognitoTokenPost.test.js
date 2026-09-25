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

const { ingestHandler } = await import("@app/functions/auth/cognitoTokenPost.js");

function buildTokenRequestEvent({ grantType = "authorization_code", code = "auth-code-abc" } = {}) {
  const form = new URLSearchParams({ grant_type: grantType, code });
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
