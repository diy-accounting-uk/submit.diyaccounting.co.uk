// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the AWS SDK before importing the handler
const mockSend = vi.fn();
vi.mock("@aws-sdk/client-cognito-identity-provider", () => ({
  CognitoIdentityProviderClient: vi.fn(function () {
    return { send: mockSend };
  }),
  AdminGetUserCommand: vi.fn(function (params) {
    return { input: params };
  }),
}));

const mockLambdaSend = vi.fn().mockResolvedValue({});
vi.mock("@aws-sdk/client-lambda", () => ({
  LambdaClient: vi.fn(function () {
    return { send: mockLambdaSend };
  }),
  InvokeCommand: vi.fn(function (params) {
    return { input: params };
  }),
}));

const { handler } = await import("@app/functions/auth/preTokenGeneration/index.js");

function buildEvent(triggerSource = "TokenGeneration_HostedAuth") {
  return {
    version: "1",
    triggerSource,
    region: "eu-west-2",
    userPoolId: "eu-west-2_test",
    userName: "test-user-sub",
    callerContext: { clientId: "test-client-id" },
    request: {
      userAttributes: {
        sub: "test-user-sub",
        email: "test@test.diyaccounting.co.uk",
      },
      groupConfiguration: {},
    },
    response: {},
  };
}

describe("preTokenGeneration", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    mockSend.mockReset();
    mockLambdaSend.mockReset();
    mockLambdaSend.mockResolvedValue({});
    process.env = { ...originalEnv, SIGN_IN_ACTIVITY_FUNCTION_NAME: "test-sign-in-activity-publish" };
  });

  it("should add custom:mfa_method=TOTP when user has SOFTWARE_TOKEN_MFA configured", async () => {
    mockSend.mockResolvedValue({ PreferredMfaSetting: "SOFTWARE_TOKEN_MFA" });
    const event = buildEvent();

    const result = await handler(event);

    expect(result.response.claimsOverrideDetails.claimsToAddOrOverride).toEqual({
      "custom:mfa_method": "TOTP",
    });
  });

  it("should not add claims when user has no MFA configured", async () => {
    mockSend.mockResolvedValue({ PreferredMfaSetting: undefined });
    const event = buildEvent();

    const result = await handler(event);

    expect(result.response).toEqual({});
  });

  it("should not add claims when MFA setting is SMS (not TOTP)", async () => {
    mockSend.mockResolvedValue({ PreferredMfaSetting: "SMS_MFA" });
    const event = buildEvent();

    const result = await handler(event);

    expect(result.response).toEqual({});
  });

  it("should add claim on token refresh if user has MFA configured", async () => {
    mockSend.mockResolvedValue({ PreferredMfaSetting: "SOFTWARE_TOKEN_MFA" });
    const event = buildEvent("TokenGeneration_RefreshTokens");

    const result = await handler(event);

    expect(result.response.claimsOverrideDetails.claimsToAddOrOverride).toEqual({
      "custom:mfa_method": "TOTP",
    });
  });

  it("should not fail if AdminGetUser throws", async () => {
    mockSend.mockRejectedValue(new Error("Access denied"));
    const event = buildEvent();

    const result = await handler(event);

    expect(result.response).toEqual({});
  });

  it("should call AdminGetUser with correct UserPoolId and Username", async () => {
    mockSend.mockResolvedValue({ PreferredMfaSetting: undefined });
    const event = buildEvent();

    await handler(event);

    expect(mockSend).toHaveBeenCalledOnce();
    const command = mockSend.mock.calls[0][0];
    expect(command.input).toEqual({
      UserPoolId: "eu-west-2_test",
      Username: "test-user-sub",
    });
  });

  describe("signInActivityPublish invoke", () => {
    it("invokes the sign-in activity function asynchronously with the trigger's identity", async () => {
      mockSend.mockResolvedValue({ PreferredMfaSetting: undefined });
      const event = buildEvent("TokenGeneration_RefreshTokens");

      await handler(event);

      expect(mockLambdaSend).toHaveBeenCalledOnce();
      const command = mockLambdaSend.mock.calls[0][0];
      expect(command.input.FunctionName).toBe("test-sign-in-activity-publish");
      expect(command.input.InvocationType).toBe("Event");
      const payload = JSON.parse(Buffer.from(command.input.Payload).toString("utf-8"));
      expect(payload).toEqual({
        triggerSource: "TokenGeneration_RefreshTokens",
        clientId: "test-client-id",
        userName: "test-user-sub",
        sub: "test-user-sub",
        email: "test@test.diyaccounting.co.uk",
        identities: undefined,
      });
    });

    it("still returns the event when the invoke rejects", async () => {
      mockSend.mockResolvedValue({ PreferredMfaSetting: undefined });
      mockLambdaSend.mockRejectedValue(new Error("Lambda unavailable"));
      const event = buildEvent();

      const result = await handler(event);

      expect(result).toBe(event);
    });

    it("skips the invoke when SIGN_IN_ACTIVITY_FUNCTION_NAME is unset", async () => {
      delete process.env.SIGN_IN_ACTIVITY_FUNCTION_NAME;
      mockSend.mockResolvedValue({ PreferredMfaSetting: undefined });
      const event = buildEvent();

      await handler(event);

      expect(mockLambdaSend).not.toHaveBeenCalled();
    });
  });
});
