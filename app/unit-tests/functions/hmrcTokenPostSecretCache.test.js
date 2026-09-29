// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/hmrcTokenPostSecretCache.test.js

import { describe, test, beforeEach, expect, vi } from "vitest";

const mockSecretsSend = vi.fn();
vi.mock("@aws-sdk/client-secrets-manager", () => ({
  SecretsManagerClient: class {
    send(command) {
      return mockSecretsSend(command);
    }
  },
  GetSecretValueCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
}));

const { prepareTokenExchangeRequest } = await import("@app/functions/hmrc/hmrcTokenPost.js");

describe("HMRC client secret cache", () => {
  beforeEach(() => {
    mockSecretsSend.mockReset();
    mockSecretsSend.mockImplementation(async (command) => ({
      SecretString: command.input.SecretId === "arn:live" ? "live-secret" : "sandbox-secret",
    }));
    delete process.env.HMRC_CLIENT_SECRET;
    delete process.env.HMRC_SANDBOX_CLIENT_SECRET;
    process.env.HMRC_CLIENT_SECRET_ARN = "arn:live";
    process.env.HMRC_SANDBOX_CLIENT_SECRET_ARN = "arn:sandbox";
    process.env.HMRC_BASE_URI = "https://live.example";
    process.env.HMRC_SANDBOX_BASE_URI = "https://sandbox.example";
    process.env.HMRC_CLIENT_ID = "live-client";
    process.env.HMRC_SANDBOX_CLIENT_ID = "sandbox-client";
    process.env.DIY_SUBMIT_BASE_URL = "https://submit.example/";
  });

  test("a sandbox exchange never leaves its secret behind for a live exchange", async () => {
    const sandbox = await prepareTokenExchangeRequest("code-1", "synthetic");
    const live = await prepareTokenExchangeRequest("code-2", "live");

    expect(sandbox.body.client_secret).toBe("sandbox-secret");
    expect(live.body.client_secret).toBe("live-secret");
  });

  test("a live exchange never leaves its secret behind for a sandbox exchange", async () => {
    const live = await prepareTokenExchangeRequest("code-1", "live");
    const sandbox = await prepareTokenExchangeRequest("code-2", "synthetic");

    expect(live.body.client_secret).toBe("live-secret");
    expect(sandbox.body.client_secret).toBe("sandbox-secret");
  });
});
