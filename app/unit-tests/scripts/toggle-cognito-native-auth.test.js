// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/toggle-cognito-native-auth.test.js

import { describe, test, expect, vi } from "vitest";

import { parseArgs, updateClient } from "../../../scripts/toggle-cognito-native-auth.js";

describe("parseArgs", () => {
  test("reads the action and environment with the default client", () => {
    const opts = parseArgs(["enable", "ci"]);
    expect(opts).toEqual({ action: "enable", environmentName: "ci", client: "both" });
  });

  test("defaults the environment to ci when omitted", () => {
    const opts = parseArgs(["disable"]);
    expect(opts.environmentName).toBe("ci");
  });

  test("reads --client diya-gl", () => {
    const opts = parseArgs(["enable", "prod", "--client", "diya-gl"]);
    expect(opts.client).toBe("diya-gl");
  });

  test("normalises --client books to diya-gl", () => {
    const opts = parseArgs(["enable", "prod", "--client", "books"]);
    expect(opts.client).toBe("diya-gl");
  });

  test("leaves --client app and --client both unchanged", () => {
    expect(parseArgs(["enable", "ci", "--client", "app"]).client).toBe("app");
    expect(parseArgs(["enable", "ci", "--client", "both"]).client).toBe("both");
  });
});

// probe-test.yml runs several suites in parallel and every one of them calls this script
// against the same shared UserPoolClient, so Cognito's serialised UpdateUserPoolClient calls
// reject the losing caller with ConcurrentModificationException. This is the race behind the
// prod-env-github-probe-failed alarm on 2026-09-10: the losing suite's step failed outright,
// leaving its test credentials unset and the behaviour test crashing on a null username.
describe("updateClient concurrent-update retry", () => {
  function baseClientConfig(providers) {
    return {
      ClientName: "test-client",
      RefreshTokenValidity: 30,
      AccessTokenValidity: 60,
      IdTokenValidity: 60,
      TokenValidityUnits: {},
      ReadAttributes: [],
      WriteAttributes: [],
      ExplicitAuthFlows: [],
      SupportedIdentityProviders: providers,
      CallbackURLs: [],
      LogoutURLs: [],
      AllowedOAuthFlows: [],
      AllowedOAuthScopes: [],
      AllowedOAuthFlowsUserPoolClient: true,
      PreventUserExistenceErrors: "ENABLED",
      EnableTokenRevocation: true,
      EnablePropagateAdditionalUserContextData: false,
    };
  }

  function concurrentModificationError() {
    const error = new Error("Only one request to update this User Pool Client can be processed at a time.");
    error.name = "ConcurrentModificationException";
    return error;
  }

  test("retries after a concurrent-modification error and succeeds on the next attempt", async () => {
    vi.useFakeTimers();
    try {
      let call = 0;
      const send = vi.fn(async () => {
        call++;
        if (call === 1) return { UserPoolClient: baseClientConfig([]) }; // describe, attempt 1
        if (call === 2) throw concurrentModificationError(); // update, attempt 1 loses the race
        if (call === 3) return { UserPoolClient: baseClientConfig([]) }; // describe, attempt 2
        if (call === 4) return {}; // update, attempt 2 wins
        throw new Error(`unexpected call ${call}`);
      });

      const resultPromise = updateClient({ send }, "pool-id", "client-id", "TestClient", "enable");
      await vi.runAllTimersAsync();
      await expect(resultPromise).resolves.toBeUndefined();
      expect(send).toHaveBeenCalledTimes(4);
    } finally {
      vi.useRealTimers();
    }
  });

  test("gives up after repeated concurrent-modification errors", async () => {
    vi.useFakeTimers();
    try {
      const error = concurrentModificationError();
      let call = 0;
      const send = vi.fn(async () => {
        call++;
        if (call % 2 === 1) return { UserPoolClient: baseClientConfig([]) }; // describe
        throw error; // update always loses
      });

      const resultPromise = updateClient({ send }, "pool-id", "client-id", "TestClient", "enable");
      const assertion = expect(resultPromise).rejects.toBe(error);
      await vi.runAllTimersAsync();
      await assertion;
      // 5 attempts, each a describe + a failing update
      expect(send).toHaveBeenCalledTimes(10);
    } finally {
      vi.useRealTimers();
    }
  });

  test("does not retry on an unrelated update failure", async () => {
    const error = new Error("Access denied");
    let call = 0;
    const send = vi.fn(async () => {
      call++;
      if (call === 1) return { UserPoolClient: baseClientConfig([]) };
      throw error;
    });

    await expect(updateClient({ send }, "pool-id", "client-id", "TestClient", "enable")).rejects.toBe(error);
    expect(send).toHaveBeenCalledTimes(2);
  });

  test("is a no-op when the desired provider state is already in place", async () => {
    const send = vi.fn(async () => ({ UserPoolClient: baseClientConfig(["COGNITO"]) }));

    await updateClient({ send }, "pool-id", "client-id", "TestClient", "enable");
    expect(send).toHaveBeenCalledTimes(1);
  });
});
