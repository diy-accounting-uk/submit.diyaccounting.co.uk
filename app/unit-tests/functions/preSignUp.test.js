// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSend = vi.fn();
vi.mock("@aws-sdk/client-cognito-identity-provider", () => ({
  CognitoIdentityProviderClient: vi.fn(function () {
    return { send: mockSend };
  }),
  ListUsersCommand: vi.fn(function (params) {
    return { name: "ListUsers", input: params };
  }),
  AdminLinkProviderForUserCommand: vi.fn(function (params) {
    return { name: "AdminLinkProviderForUser", input: params };
  }),
}));

const { handler, parseFederatedUserName, isTrustedEmail, destinationFor } = await import("@app/functions/auth/preSignUp/index.js");

function buildEvent({ userName = "Microsoft_ms-id-1", userAttributes = { email: "person@example.com" }, triggerSource } = {}) {
  return {
    version: "1",
    triggerSource: triggerSource || "PreSignUp_ExternalProvider",
    region: "eu-west-2",
    userPoolId: "eu-west-2_test",
    userName,
    callerContext: { clientId: "test-client-id" },
    request: { userAttributes },
    response: { autoConfirmUser: false, autoVerifyEmail: false, autoVerifyPhone: false },
  };
}

const googleCreatedUser = {
  Username: "Google_1234",
  Attributes: [
    { Name: "email", Value: "person@example.com" },
    { Name: "identities", Value: JSON.stringify([{ userId: "1234", providerName: "Google", providerType: "Google", primary: true }]) },
  ],
};

function commandsSent(name) {
  return mockSend.mock.calls.map(([command]) => command).filter((command) => command.name === name);
}

describe("preSignUp", () => {
  beforeEach(() => {
    mockSend.mockReset();
  });

  it("links the new identity to the one existing profile that Google created, named by Google's user id", async () => {
    mockSend.mockResolvedValueOnce({ Users: [googleCreatedUser] }).mockResolvedValueOnce({});

    const result = await handler(buildEvent());

    expect(commandsSent("ListUsers")[0].input).toEqual({ UserPoolId: "eu-west-2_test", Filter: 'email = "person@example.com"', Limit: 2 });
    expect(commandsSent("AdminLinkProviderForUser")[0].input).toEqual({
      UserPoolId: "eu-west-2_test",
      DestinationUser: { ProviderName: "Google", ProviderAttributeName: "Cognito_Subject", ProviderAttributeValue: "1234" },
      SourceUser: { ProviderName: "Microsoft", ProviderAttributeName: "Cognito_Subject", ProviderAttributeValue: "ms-id-1" },
    });
    expect(result.response.autoVerifyEmail).toBe(true);
  });

  it("links the new identity to a native profile named by its username under Cognito", async () => {
    mockSend
      .mockResolvedValueOnce({ Users: [{ Username: "native-user", Attributes: [{ Name: "email", Value: "person@example.com" }] }] })
      .mockResolvedValueOnce({});

    await handler(buildEvent());

    expect(commandsSent("AdminLinkProviderForUser")[0].input.DestinationUser).toEqual({
      ProviderName: "Cognito",
      ProviderAttributeValue: "native-user",
    });
  });

  it("names a native profile with linked identities, or an underscore username, by its username", () => {
    const linked = [{ Name: "identities", Value: JSON.stringify([{ userId: "9", providerName: "Google" }]) }];
    expect(destinationFor({ Username: "native-user", Attributes: linked })).toEqual({
      ProviderName: "Cognito",
      ProviderAttributeValue: "native-user",
    });
    expect(destinationFor({ Username: "first_last", Attributes: [] })).toEqual({
      ProviderName: "Cognito",
      ProviderAttributeValue: "first_last",
    });
    expect(destinationFor({ Username: "Google_1234", Attributes: [{ Name: "identities", Value: "not json" }] })).toEqual({
      ProviderName: "Cognito",
      ProviderAttributeValue: "Google_1234",
    });
  });

  it("does not link when no profile has the email", async () => {
    mockSend.mockResolvedValueOnce({ Users: [] });

    const result = await handler(buildEvent());

    expect(commandsSent("ListUsers")).toHaveLength(1);
    expect(commandsSent("AdminLinkProviderForUser")).toHaveLength(0);
    expect(result.response.autoVerifyEmail).toBe(true);
  });

  it("does not link when two profiles have the email", async () => {
    mockSend.mockResolvedValueOnce({ Users: [{ Username: "Google_1" }, { Username: "native-user" }] });

    const result = await handler(buildEvent());

    expect(commandsSent("AdminLinkProviderForUser")).toHaveLength(0);
    expect(result.response.autoVerifyEmail).toBe(true);
  });

  it("links a Google identity whose email is verified", async () => {
    mockSend.mockResolvedValueOnce({ Users: [{ Username: "Microsoft_ms-1" }] }).mockResolvedValueOnce({});

    const result = await handler(
      buildEvent({ userName: "Google_998877", userAttributes: { email: "person@example.com", email_verified: "true" } }),
    );

    expect(commandsSent("AdminLinkProviderForUser")[0].input.SourceUser).toEqual({
      ProviderName: "Google",
      ProviderAttributeName: "Cognito_Subject",
      ProviderAttributeValue: "998877",
    });
    expect(result.response.autoVerifyEmail).toBe(true);
  });

  it("neither looks up nor verifies a Google identity whose email is not verified", async () => {
    for (const userAttributes of [{ email: "person@example.com", email_verified: "false" }, { email: "person@example.com" }]) {
      const result = await handler(buildEvent({ userName: "Google_998877", userAttributes }));
      expect(result.response.autoVerifyEmail).toBe(false);
    }
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("links an Apple identity that gives its real address", async () => {
    mockSend.mockResolvedValueOnce({ Users: [{ Username: "Google_1234" }] }).mockResolvedValueOnce({});

    const result = await handler(
      buildEvent({ userName: "SignInWithApple_000123.abc.0456", userAttributes: { email: "person@icloud.com" } }),
    );

    expect(commandsSent("AdminLinkProviderForUser")[0].input.SourceUser).toEqual({
      ProviderName: "SignInWithApple",
      ProviderAttributeName: "Cognito_Subject",
      ProviderAttributeValue: "000123.abc.0456",
    });
    expect(result.response.autoVerifyEmail).toBe(true);
  });

  it("neither looks up nor verifies an Apple relay address", async () => {
    const result = await handler(
      buildEvent({ userName: "SignInWithApple_000123.abc.0456", userAttributes: { email: "x7y8z9@privaterelay.appleid.com" } }),
    );

    expect(mockSend).not.toHaveBeenCalled();
    expect(result.response.autoVerifyEmail).toBe(false);
  });

  it("ignores a provider it does not know and a sign-up without an email", async () => {
    await handler(buildEvent({ userName: "Facebook_1", userAttributes: { email: "person@example.com" } }));
    await handler(buildEvent({ userAttributes: {} }));

    expect(mockSend).not.toHaveBeenCalled();
  });

  it("does nothing for a native sign-up", async () => {
    const result = await handler(buildEvent({ triggerSource: "PreSignUp_SignUp", userName: "native-user" }));

    expect(mockSend).not.toHaveBeenCalled();
    expect(result.response.autoVerifyEmail).toBe(false);
  });

  it("does not put an email with a quote into the filter", async () => {
    await handler(buildEvent({ userAttributes: { email: 'a"b@example.com' } }));

    expect(mockSend).not.toHaveBeenCalled();
  });

  it("returns the event when the link call fails, so the sign-in goes on", async () => {
    mockSend.mockResolvedValueOnce({ Users: [{ Username: "Google_1234" }] }).mockRejectedValueOnce(new Error("Throttled"));

    const result = await handler(buildEvent());

    expect(result.userName).toBe("Microsoft_ms-id-1");
    expect(result.response.autoVerifyEmail).toBe(true);
  });

  it("splits a federated userName at the first underscore", () => {
    expect(parseFederatedUserName("Google_1_2")).toEqual({ providerName: "Google", providerUserId: "1_2" });
    expect(parseFederatedUserName("nounderscore")).toBeNull();
    expect(parseFederatedUserName("Google_")).toBeNull();
  });

  it("trusts a Microsoft address and an Apple real address, not a relay one", () => {
    expect(isTrustedEmail("Microsoft", { email: "a@outlook.com" })).toBe(true);
    expect(isTrustedEmail("SignInWithApple", { email: "a@icloud.com" })).toBe(true);
    expect(isTrustedEmail("SignInWithApple", { email: "A@PrivateRelay.AppleID.com" })).toBe(false);
  });
});
