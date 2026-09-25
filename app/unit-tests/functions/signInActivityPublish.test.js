// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

const mockEventBridgeSend = vi.fn().mockResolvedValue({});
vi.mock("@aws-sdk/client-eventbridge", () => ({
  EventBridgeClient: class {
    send(...args) {
      return mockEventBridgeSend(...args);
    }
  },
  PutEventsCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
}));

const mockSsmSend = vi.fn();
vi.mock("@aws-sdk/client-ssm", () => ({
  SSMClient: class {
    send(...args) {
      return mockSsmSend(...args);
    }
  },
  GetParameterCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
}));

const mockGetSignInSession = vi.fn();
const mockPutSignInSession = vi.fn().mockResolvedValue(undefined);
vi.mock("@app/data/dynamoDbSecurityStateRepository.js", () => ({
  getSignInSession: (...args) => mockGetSignInSession(...args),
  putSignInSession: (...args) => mockPutSignInSession(...args),
}));

const { handler, classifySignInEvent, extractProvider, SESSION_RESUME_THRESHOLD_MS } =
  await import("@app/functions/auth/signInActivityPublish.js");
const { hashSub } = await import("@app/services/subHasher.js");

function ssmParam(value) {
  return { Parameter: { Value: value } };
}

describe("signInActivityPublish", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    mockEventBridgeSend.mockClear();
    mockSsmSend.mockReset();
    mockGetSignInSession.mockReset();
    mockPutSignInSession.mockClear();
    process.env = {
      ...originalEnv,
      ACTIVITY_BUS_NAME: "test-bus",
      ENVIRONMENT_NAME: "ci",
      USER_SUB_HASH_SALT: '{"current":"v1","versions":{"v1":"test-salt-for-unit-tests"}}',
    };
    mockSsmSend.mockImplementation((command) => {
      if (command.input.Name === "/submit/ci/submit-app-client-id") return Promise.resolve(ssmParam("submit-client-id"));
      if (command.input.Name === "/submit/ci/spreadsheets-diya-gl-app-client-id") return Promise.resolve(ssmParam("books-client-id"));
      if (command.input.Name === "/submit/ci/mcp-app-client-id") return Promise.resolve(ssmParam("mcp-client-id"));
      return Promise.reject(new Error("unexpected parameter"));
    });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("extractProvider", () => {
    test("reads the provider from a stringified identities claim", () => {
      expect(extractProvider(JSON.stringify([{ providerName: "Google" }]))).toBe("Google");
    });

    test("reads the provider from an identities array", () => {
      expect(extractProvider([{ providerName: "Google" }])).toBe("Google");
    });

    test("returns empty string for a native Cognito user with no identities", () => {
      expect(extractProvider(undefined)).toBe("");
    });

    test("returns empty string for malformed identities", () => {
      expect(extractProvider("not-json")).toBe("");
    });
  });

  describe("classifySignInEvent", () => {
    test("HostedAuth is a fresh sign-in", () => {
      const result = classifySignInEvent("TokenGeneration_HostedAuth", null, 1700000000000);
      expect(result.event).toBe("login");
      expect(result.sessionKind).toBe("sign-in");
    });

    test("direct API authentication is a fresh sign-in", () => {
      expect(classifySignInEvent("TokenGeneration_Authentication", null, 1700000000000).event).toBe("login");
    });

    test("the first password challenge is a fresh sign-in", () => {
      expect(classifySignInEvent("TokenGeneration_NewPasswordChallenge", null, 1700000000000).event).toBe("login");
    });

    test("device auth is a fresh sign-in", () => {
      expect(classifySignInEvent("TokenGeneration_AuthenticateDevice", null, 1700000000000).event).toBe("login");
    });

    test("a refresh with no prior session resumes", () => {
      const result = classifySignInEvent("TokenGeneration_RefreshTokens", null, 1700000000000);
      expect(result.event).toBe("session-resumed");
      expect(result.sessionKind).toBe("resumed");
    });

    test("a refresh just past the resume threshold resumes the session", () => {
      const now = 1700000000000;
      const prior = { lastIssuedAt: now - SESSION_RESUME_THRESHOLD_MS - 1, sessionId: "old", sessionStartedAt: now - 1000000 };
      const result = classifySignInEvent("TokenGeneration_RefreshTokens", prior, now);
      expect(result.event).toBe("session-resumed");
      expect(result.sessionId).not.toBe("old");
    });

    test("a refresh just inside the resume threshold continues the session", () => {
      const now = 1700000000000;
      const prior = { lastIssuedAt: now - SESSION_RESUME_THRESHOLD_MS + 1, sessionId: "old", sessionStartedAt: now - 1000000 };
      const result = classifySignInEvent("TokenGeneration_RefreshTokens", prior, now);
      expect(result.event).toBe("token-refresh");
      expect(result.sessionKind).toBe("continued");
      expect(result.sessionId).toBe("old");
      expect(result.sessionStartedAt).toBe(now - 1000000);
    });
  });

  describe("handler", () => {
    test("publishes login for a fresh sign-in on the submit client", async () => {
      mockGetSignInSession.mockResolvedValue(null);

      await handler({
        triggerSource: "TokenGeneration_HostedAuth",
        clientId: "submit-client-id",
        sub: "sub-1",
        email: "customer@example.com",
      });

      expect(mockEventBridgeSend).toHaveBeenCalledTimes(1);
      const detail = JSON.parse(mockEventBridgeSend.mock.calls[0][0].input.Entries[0].Detail);
      expect(detail.event).toBe("login");
      expect(detail.appClient).toBe("submit");
      expect(detail.hashedSub).toBe(hashSub("sub-1"));
      expect(detail.sessionKind).toBe("sign-in");
      expect(detail.triggerSource).toBe("TokenGeneration_HostedAuth");
      expect(mockPutSignInSession).toHaveBeenCalledWith(
        hashSub("sub-1"),
        "submit",
        expect.objectContaining({ sessionId: detail.sessionId }),
      );
    });

    test("publishes login for a fresh sign-in on the books client", async () => {
      mockGetSignInSession.mockResolvedValue(null);

      await handler({
        triggerSource: "TokenGeneration_HostedAuth",
        clientId: "books-client-id",
        sub: "sub-2",
        email: "customer@example.com",
      });

      const detail = JSON.parse(mockEventBridgeSend.mock.calls[0][0].input.Entries[0].Detail);
      expect(detail.appClient).toBe("books");
    });

    test("publishes login for a fresh sign-in on the mcp client", async () => {
      mockGetSignInSession.mockResolvedValue(null);

      await handler({
        triggerSource: "TokenGeneration_HostedAuth",
        clientId: "mcp-client-id",
        sub: "sub-3",
        email: "customer@example.com",
      });

      const detail = JSON.parse(mockEventBridgeSend.mock.calls[0][0].input.Entries[0].Detail);
      expect(detail.appClient).toBe("mcp");
    });

    test("publishes session-resumed for a refresh after the session lapsed", async () => {
      mockGetSignInSession.mockResolvedValue({ lastIssuedAt: 0, sessionId: "old-session", sessionStartedAt: 0 });

      await handler({
        triggerSource: "TokenGeneration_RefreshTokens",
        clientId: "submit-client-id",
        sub: "sub-4",
        email: "customer@example.com",
      });

      const detail = JSON.parse(mockEventBridgeSend.mock.calls[0][0].input.Entries[0].Detail);
      expect(detail.event).toBe("session-resumed");
      expect(detail.sessionKind).toBe("resumed");
      expect(detail.sessionId).not.toBe("old-session");
    });

    test("publishes token-refresh for a refresh inside the live session", async () => {
      const now = Date.now();
      mockGetSignInSession.mockResolvedValue({ lastIssuedAt: now - 1000, sessionId: "live-session", sessionStartedAt: now - 100000 });

      await handler({
        triggerSource: "TokenGeneration_RefreshTokens",
        clientId: "submit-client-id",
        sub: "sub-5",
        email: "customer@example.com",
      });

      const detail = JSON.parse(mockEventBridgeSend.mock.calls[0][0].input.Entries[0].Detail);
      expect(detail.event).toBe("token-refresh");
      expect(detail.sessionKind).toBe("continued");
      expect(detail.sessionId).toBe("live-session");
    });

    test("classifies a synthetic test-lane email as test-user", async () => {
      mockGetSignInSession.mockResolvedValue(null);

      await handler({
        triggerSource: "TokenGeneration_HostedAuth",
        clientId: "submit-client-id",
        sub: "sub-6",
        email: "synthetic-local@test.diyaccounting.co.uk",
      });

      const detail = JSON.parse(mockEventBridgeSend.mock.calls[0][0].input.Entries[0].Detail);
      expect(detail.actor).toBe("test-user");
    });

    test("classifies a probe email as probe", async () => {
      mockGetSignInSession.mockResolvedValue(null);

      await handler({
        triggerSource: "TokenGeneration_HostedAuth",
        clientId: "submit-client-id",
        sub: "sub-7",
        email: "probe-vat@example.com",
      });

      const detail = JSON.parse(mockEventBridgeSend.mock.calls[0][0].input.Entries[0].Detail);
      expect(detail.actor).toBe("probe");
    });

    test("classifies a missing email as system", async () => {
      mockGetSignInSession.mockResolvedValue(null);

      await handler({ triggerSource: "TokenGeneration_Authentication", clientId: "submit-client-id", sub: "sub-8" });

      const detail = JSON.parse(mockEventBridgeSend.mock.calls[0][0].input.Entries[0].Detail);
      expect(detail.actor).toBe("system");
    });

    test("carries the identity provider when the user is federated", async () => {
      mockGetSignInSession.mockResolvedValue(null);

      await handler({
        triggerSource: "TokenGeneration_HostedAuth",
        clientId: "submit-client-id",
        sub: "sub-9",
        email: "customer@gmail.com",
        identities: JSON.stringify([{ providerName: "Google" }]),
      });

      const detail = JSON.parse(mockEventBridgeSend.mock.calls[0][0].input.Entries[0].Detail);
      expect(detail.provider).toBe("Google");
    });

    test("omits the provider for a native Cognito user", async () => {
      mockGetSignInSession.mockResolvedValue(null);

      await handler({
        triggerSource: "TokenGeneration_HostedAuth",
        clientId: "submit-client-id",
        sub: "sub-10",
        email: "customer@example.com",
      });

      const detail = JSON.parse(mockEventBridgeSend.mock.calls[0][0].input.Entries[0].Detail);
      expect(detail.provider).toBeUndefined();
    });
  });
});
