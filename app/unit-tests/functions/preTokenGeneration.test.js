// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

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

const { handler } = await import("@app/functions/auth/preTokenGeneration/index.js");

function buildEvent(triggerSource = "TokenGeneration_HostedAuth") {
  return {
    version: "1",
    triggerSource,
    region: "eu-west-2",
    userPoolId: "eu-west-2_test",
    userName: "test-user-sub",
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
  beforeEach(() => {
    mockSend.mockReset();
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
});
