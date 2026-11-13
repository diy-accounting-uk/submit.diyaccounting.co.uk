// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Secret } from "otpauth";

const send = vi.hoisted(() => vi.fn());
vi.mock("@aws-sdk/client-cognito-identity-provider", () => ({
  CognitoIdentityProviderClient: class {
    send = send;
  },
  AdminInitiateAuthCommand: class {
    constructor(input) {
      this.kind = "initiate";
      this.input = input;
    }
  },
  AdminRespondToAuthChallengeCommand: class {
    constructor(input) {
      this.kind = "respond";
      this.input = input;
    }
  },
}));

const mockReadSecret = vi.fn();
vi.mock("@app/lib/cachedSecret.js", () => ({ readSecret: (...args) => mockReadSecret(...args) }));

const { signInReviewer } = await import("@app/lib/mcpReviewerSignIn.js");
const { totpCode } = await import("@app/lib/totp.js");

const SEED = Secret.fromUTF8("12345678901234567890").base32;
const VIEWER = {
  ipAddress: "198.51.100.7",
  serverName: "submit.diyaccounting.co.uk",
  serverPath: "/mcp/oauth/reviewer",
  userAgent: "reviewer-browser",
};
const TOKENS = { AccessToken: "a", RefreshToken: "r", ExpiresIn: 3600 };
const NOW = Date.UTC(2026, 10, 13, 9, 0, 10);
const ENV_KEYS = ["MCP_USER_POOL_ID", "MCP_UPSTREAM_CLIENT_ID", "MCP_REVIEWER_USERNAME", "MCP_REVIEWER_TOTP_SECRET_NAME"];
const savedEnv = {};

const challenge = { ChallengeName: "SOFTWARE_TOKEN_MFA", Session: "session-1" };
const refusal = (name, message) => Object.assign(new Error(message), { name });

function codesSent() {
  return send.mock.calls
    .filter(([command]) => command.kind === "respond")
    .map(([command]) => command.input.ChallengeResponses.SOFTWARE_TOKEN_MFA_CODE);
}

beforeEach(() => {
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
  process.env.MCP_USER_POOL_ID = "eu-west-2_pool";
  process.env.MCP_UPSTREAM_CLIENT_ID = "mcp-client";
  process.env.MCP_REVIEWER_USERNAME = "mcp-reviewer@test.diyaccounting.co.uk";
  process.env.MCP_REVIEWER_TOTP_SECRET_NAME = "ci/submit/mcp/reviewer-totp-seed";
  send.mockReset();
  mockReadSecret.mockReset().mockResolvedValue(SEED);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

describe("signInReviewer", () => {
  it("starts the admin password flow for the configured user with the viewer's context, then answers the code", async () => {
    send.mockResolvedValueOnce(challenge).mockResolvedValueOnce({ AuthenticationResult: TOKENS });
    const trace = {};
    const tokens = await signInReviewer({ viewer: VIEWER, password: "pw", trace });
    expect(tokens).toEqual(TOKENS);
    const [initiate, respond] = send.mock.calls.map(([command]) => command);
    expect(initiate.input).toMatchObject({
      UserPoolId: "eu-west-2_pool",
      ClientId: "mcp-client",
      AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
      AuthParameters: { USERNAME: "mcp-reviewer@test.diyaccounting.co.uk", PASSWORD: "pw" },
      ContextData: {
        IpAddress: "198.51.100.7",
        ServerName: "submit.diyaccounting.co.uk",
        ServerPath: "/mcp/oauth/reviewer",
        HttpHeaders: [{ headerName: "User-Agent", headerValue: "reviewer-browser" }],
      },
    });
    expect(respond.input).toMatchObject({
      ChallengeName: "SOFTWARE_TOKEN_MFA",
      Session: "session-1",
      ChallengeResponses: { USERNAME: "mcp-reviewer@test.diyaccounting.co.uk", SOFTWARE_TOKEN_MFA_CODE: totpCode(SEED, { now: NOW }) },
    });
    expect(trace).toEqual({ challengeName: "SOFTWARE_TOKEN_MFA", totpRetry: "none" });
  });

  it("retries once with the next window's code when Cognito refuses the code as used", async () => {
    send
      .mockResolvedValueOnce(challenge)
      .mockRejectedValueOnce(refusal("NotAuthorizedException", "Code has already been used"))
      .mockResolvedValueOnce(challenge)
      .mockResolvedValueOnce({ AuthenticationResult: TOKENS });
    const trace = {};
    expect(await signInReviewer({ viewer: VIEWER, password: "pw", trace })).toEqual(TOKENS);
    expect(codesSent()).toEqual([totpCode(SEED, { now: NOW }), totpCode(SEED, { now: NOW, stepOffset: 1 })]);
    expect(trace.totpRetry).toBe("next_window");
  });

  it("retries once after a fresh read of the seed when the code does not match", async () => {
    const rolledSeed = Secret.fromUTF8("abcdefghijklmnopqrst").base32;
    mockReadSecret.mockResolvedValueOnce(SEED).mockResolvedValueOnce(rolledSeed);
    send
      .mockResolvedValueOnce(challenge)
      .mockRejectedValueOnce(refusal("CodeMismatchException", "Invalid code received for user"))
      .mockResolvedValueOnce(challenge)
      .mockResolvedValueOnce({ AuthenticationResult: TOKENS });
    const trace = {};
    expect(await signInReviewer({ viewer: VIEWER, password: "pw", trace })).toEqual(TOKENS);
    expect(mockReadSecret).toHaveBeenLastCalledWith("ci/submit/mcp/reviewer-totp-seed", { forceRefresh: true });
    expect(codesSent()).toEqual([totpCode(SEED, { now: NOW }), totpCode(rolledSeed, { now: NOW })]);
    expect(trace.totpRetry).toBe("fresh_seed");
  });

  it("retries at most once", async () => {
    send
      .mockResolvedValueOnce(challenge)
      .mockRejectedValueOnce(refusal("CodeMismatchException", "Invalid code received for user"))
      .mockResolvedValueOnce(challenge)
      .mockRejectedValueOnce(refusal("CodeMismatchException", "Invalid code received for user"));
    await expect(signInReviewer({ viewer: VIEWER, password: "pw", trace: {} })).rejects.toThrow("Invalid code");
    expect(send).toHaveBeenCalledTimes(4);
  });

  it("throws on any other challenge without answering it", async () => {
    send.mockResolvedValueOnce({ ChallengeName: "NEW_PASSWORD_REQUIRED", Session: "s" });
    const trace = {};
    await expect(signInReviewer({ viewer: VIEWER, password: "pw", trace })).rejects.toMatchObject({ name: "UnexpectedChallenge" });
    expect(trace.challengeName).toBe("NEW_PASSWORD_REQUIRED");
    expect(send).toHaveBeenCalledOnce();
  });

  it("throws a refusal of the password flow without a retry", async () => {
    send.mockRejectedValueOnce(refusal("NotAuthorizedException", "Incorrect username or password."));
    await expect(signInReviewer({ viewer: VIEWER, password: "pw", trace: {} })).rejects.toMatchObject({ name: "NotAuthorizedException" });
    expect(send).toHaveBeenCalledOnce();
  });
});
