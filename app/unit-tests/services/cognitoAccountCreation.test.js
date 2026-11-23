// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/services/cognitoAccountCreation.test.js

import { describe, test, expect, vi, beforeEach } from "vitest";

const mockSend = vi.fn();
vi.mock("@aws-sdk/client-cognito-identity-provider", () => ({
  CognitoIdentityProviderClient: class {
    send(...args) {
      return mockSend(...args);
    }
  },
  AdminGetUserCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
}));

const { accountCreatedAt } = await import("@app/services/cognitoAccountCreation.js");

describe("accountCreatedAt", () => {
  beforeEach(() => {
    mockSend.mockReset();
    process.env.COGNITO_USER_POOL_ID = "pool-1";
  });

  test("reads the user by its name from the pool and answers its creation time", async () => {
    mockSend.mockResolvedValue({ UserCreateDate: new Date("2025-03-01T12:00:00.000Z") });
    expect(await accountCreatedAt("Google_123")).toEqual(new Date("2025-03-01T12:00:00.000Z"));
    expect(mockSend.mock.calls[0][0].input).toEqual({ UserPoolId: "pool-1", Username: "Google_123" });
  });

  test("answers no time and makes no call where there is no user pool", async () => {
    process.env.COGNITO_USER_POOL_ID = "";
    expect(await accountCreatedAt("someone")).toBeUndefined();
    expect(mockSend).not.toHaveBeenCalled();
  });

  test("passes a failed read on to the caller", async () => {
    mockSend.mockRejectedValue(new Error("TooManyRequestsException"));
    await expect(accountCreatedAt("someone")).rejects.toThrow("TooManyRequestsException");
  });
});
