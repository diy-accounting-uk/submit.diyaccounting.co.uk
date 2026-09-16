// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/ensure-cognito-test-user.test.js

import { describe, test, expect, vi, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";

import {
  InitiateAuthCommand,
  RespondToAuthChallengeCommand,
  AssociateSoftwareTokenCommand,
  VerifySoftwareTokenCommand,
  AdminSetUserMFAPreferenceCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { GetSecretValueCommand, PutSecretValueCommand, CreateSecretCommand } from "@aws-sdk/client-secrets-manager";

import {
  writeGithubOutputCredentials,
  laneSlug,
  totpSecretName,
  getStoredTotpSecret,
  storeTotpSecret,
  rotateTestUserMfa,
} from "../../../scripts/ensure-cognito-test-user.js";

// otpauth generates a real code from whatever secret it's handed, so these tests use a fixed,
// validly-encoded base32 secret and let the real TOTP algorithm run — asserting the exact
// 6-digit code would just re-implement otpauth in the test.
const A_STORED_SECRET = "JBSWY3DPEHPK3PXP";

function fakeClient() {
  return { send: vi.fn() };
}

describe("writeGithubOutputCredentials", () => {
  let outputPath;

  afterEach(() => {
    vi.restoreAllMocks();
    if (outputPath && fs.existsSync(outputPath)) fs.rmSync(outputPath);
    outputPath = undefined;
  });

  // GitHub does not mask a step's outputs by default: a caller that reads these values back
  // into an env: block (video-capture.yml, probe-test.yml, deploy-app.yml) prints them
  // unmasked wherever the block's values reach the log, unless the runner has already been
  // told to mask them.
  test("masks the password and TOTP secret before writing them to GITHUB_OUTPUT", () => {
    outputPath = path.join(os.tmpdir(), `ensure-cognito-test-user-${crypto.randomUUID()}.env`);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    writeGithubOutputCredentials("synthetic-lane@test.diyaccounting.co.uk", "TestPassword123#", "ABCDEFGHIJ", outputPath);

    expect(logSpy).toHaveBeenCalledWith("::add-mask::TestPassword123#");
    expect(logSpy).toHaveBeenCalledWith("::add-mask::ABCDEFGHIJ");

    const written = fs.readFileSync(outputPath, "utf8");
    expect(written).toContain("test-auth-username=synthetic-lane@test.diyaccounting.co.uk");
    expect(written).toContain("test-auth-password=TestPassword123#");
    expect(written).toContain("test-auth-totp-secret=ABCDEFGHIJ");
  });

  test("does nothing when no GITHUB_OUTPUT path is given", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const appendSpy = vi.spyOn(fs, "appendFileSync");

    writeGithubOutputCredentials("synthetic-lane@test.diyaccounting.co.uk", "TestPassword123#", "ABCDEFGHIJ", "");

    expect(logSpy).not.toHaveBeenCalled();
    expect(appendSpy).not.toHaveBeenCalled();
  });
});

describe("totpSecretName", () => {
  test("names the secret after the environment and the slugged lane, matching put-secret-with-rotation-tag.sh's convention", () => {
    expect(totpSecretName("ci", "submitVatBehaviour")).toBe("ci/submit/test/submit-vat-behaviour/totp-secret");
    expect(totpSecretName("prod", "passGeneration")).toBe("prod/submit/test/pass-generation/totp-secret");
  });

  test("matches the slug durableTestUserEmail already uses for the lane's username", () => {
    expect(laneSlug("videoCapture")).toBe("video-capture");
  });
});

describe("getStoredTotpSecret / storeTotpSecret", () => {
  afterEach(() => vi.restoreAllMocks());

  test("returns the secret string when it exists", async () => {
    const client = fakeClient();
    client.send.mockResolvedValueOnce({ SecretString: A_STORED_SECRET });

    const result = await getStoredTotpSecret(client, "ci/submit/test/submit-vat-behaviour/totp-secret");

    expect(result).toBe(A_STORED_SECRET);
    expect(client.send).toHaveBeenCalledWith(expect.any(GetSecretValueCommand));
  });

  test("returns undefined when the secret does not exist yet", async () => {
    const client = fakeClient();
    const notFound = new Error("not found");
    notFound.name = "ResourceNotFoundException";
    client.send.mockRejectedValueOnce(notFound);

    const result = await getStoredTotpSecret(client, "ci/submit/test/submit-vat-behaviour/totp-secret");

    expect(result).toBeUndefined();
  });

  test("propagates a non-not-found error from a get", async () => {
    const client = fakeClient();
    client.send.mockRejectedValueOnce(new Error("access denied"));

    await expect(getStoredTotpSecret(client, "ci/submit/test/submit-vat-behaviour/totp-secret")).rejects.toThrow("access denied");
  });

  test("updates an existing secret with PutSecretValue", async () => {
    const client = fakeClient();
    client.send.mockResolvedValueOnce({});

    await storeTotpSecret(client, "ci/submit/test/submit-vat-behaviour/totp-secret", A_STORED_SECRET);

    expect(client.send).toHaveBeenCalledTimes(1);
    expect(client.send).toHaveBeenCalledWith(expect.any(PutSecretValueCommand));
  });

  test("creates the secret when PutSecretValue reports it does not exist yet", async () => {
    const client = fakeClient();
    const notFound = new Error("not found");
    notFound.name = "ResourceNotFoundException";
    client.send.mockRejectedValueOnce(notFound);
    client.send.mockResolvedValueOnce({});

    await storeTotpSecret(client, "ci/submit/test/submit-vat-behaviour/totp-secret", A_STORED_SECRET);

    expect(client.send).toHaveBeenCalledTimes(2);
    expect(client.send.mock.calls[1][0]).toBeInstanceOf(CreateSecretCommand);
  });
});

describe("rotateTestUserMfa", () => {
  const baseArgs = {
    userPoolId: "eu-west-2_test",
    userPoolClientId: "client123",
    testEmail: "synthetic-submit-vat-behaviour@test.diyaccounting.co.uk",
    testPassword: "TestPassword123#",
    secretName: "ci/submit/test/submit-vat-behaviour/totp-secret",
  };

  afterEach(() => vi.restoreAllMocks());

  test("no MFA challenge: enrols a first device from the access token and stores its secret", async () => {
    const cognito = fakeClient();
    const secrets = fakeClient();

    cognito.send.mockImplementation(async (command) => {
      if (command instanceof InitiateAuthCommand) {
        return { AuthenticationResult: { AccessToken: "access-token-1" } };
      }
      if (command instanceof AssociateSoftwareTokenCommand) {
        expect(command.input.AccessToken).toBe("access-token-1");
        return { SecretCode: A_STORED_SECRET };
      }
      if (command instanceof VerifySoftwareTokenCommand) {
        return { Status: "SUCCESS" };
      }
      if (command instanceof AdminSetUserMFAPreferenceCommand) {
        return {};
      }
      throw new Error(`Unexpected Cognito command: ${command.constructor.name}`);
    });
    secrets.send.mockResolvedValue({});

    const result = await rotateTestUserMfa(cognito, secrets, baseArgs);

    expect(result).toEqual({ totpSecret: A_STORED_SECRET });
    expect(secrets.send).toHaveBeenCalledWith(expect.any(PutSecretValueCommand));
  });

  test("MFA_SETUP challenge: enrols the device as part of answering the challenge", async () => {
    const cognito = fakeClient();
    const secrets = fakeClient();

    cognito.send.mockImplementation(async (command) => {
      if (command instanceof InitiateAuthCommand) {
        return { ChallengeName: "MFA_SETUP", Session: "session-1" };
      }
      if (command instanceof AssociateSoftwareTokenCommand) {
        expect(command.input.Session).toBe("session-1");
        return { SecretCode: A_STORED_SECRET, Session: "session-2" };
      }
      if (command instanceof VerifySoftwareTokenCommand) {
        expect(command.input.Session).toBe("session-2");
        return { Status: "SUCCESS", Session: "session-3" };
      }
      if (command instanceof RespondToAuthChallengeCommand) {
        expect(command.input.ChallengeName).toBe("MFA_SETUP");
        expect(command.input.Session).toBe("session-3");
        return { AuthenticationResult: { AccessToken: "access-token-2" } };
      }
      if (command instanceof AdminSetUserMFAPreferenceCommand) {
        return {};
      }
      throw new Error(`Unexpected Cognito command: ${command.constructor.name}`);
    });
    secrets.send.mockResolvedValue({});

    const result = await rotateTestUserMfa(cognito, secrets, baseArgs);

    expect(result).toEqual({ totpSecret: A_STORED_SECRET });
    // MFA_SETUP already enrolled the device that answered the challenge: no second enrolment.
    const associateCalls = cognito.send.mock.calls.filter(([command]) => command instanceof AssociateSoftwareTokenCommand);
    expect(associateCalls).toHaveLength(1);
  });

  test("SOFTWARE_TOKEN_MFA challenge with a stored secret: answers it, then rotates to a fresh device", async () => {
    const cognito = fakeClient();
    const secrets = fakeClient();
    const freshSecret = "KRSXG5CTMVRXEZLU";

    cognito.send.mockImplementation(async (command) => {
      if (command instanceof InitiateAuthCommand) {
        return { ChallengeName: "SOFTWARE_TOKEN_MFA", Session: "session-1" };
      }
      if (command instanceof RespondToAuthChallengeCommand) {
        expect(command.input.ChallengeName).toBe("SOFTWARE_TOKEN_MFA");
        expect(command.input.ChallengeResponses.SOFTWARE_TOKEN_MFA_CODE).toMatch(/^\d{6}$/);
        return { AuthenticationResult: { AccessToken: "access-token-3" } };
      }
      if (command instanceof AssociateSoftwareTokenCommand) {
        expect(command.input.AccessToken).toBe("access-token-3");
        return { SecretCode: freshSecret };
      }
      if (command instanceof VerifySoftwareTokenCommand) {
        return { Status: "SUCCESS" };
      }
      if (command instanceof AdminSetUserMFAPreferenceCommand) {
        return {};
      }
      throw new Error(`Unexpected Cognito command: ${command.constructor.name}`);
    });
    secrets.send.mockImplementation(async (command) => {
      if (command instanceof GetSecretValueCommand) return { SecretString: A_STORED_SECRET };
      return {};
    });

    const result = await rotateTestUserMfa(cognito, secrets, baseArgs);

    expect(result).toEqual({ totpSecret: freshSecret });
    expect(secrets.send).toHaveBeenCalledWith(expect.any(PutSecretValueCommand));
  });

  test("SOFTWARE_TOKEN_MFA challenge with no stored secret: reports needsRecreate instead of guessing a code", async () => {
    const cognito = fakeClient();
    const secrets = fakeClient();

    cognito.send.mockResolvedValueOnce({ ChallengeName: "SOFTWARE_TOKEN_MFA", Session: "session-1" });
    const notFound = new Error("not found");
    notFound.name = "ResourceNotFoundException";
    secrets.send.mockRejectedValueOnce(notFound);

    const result = await rotateTestUserMfa(cognito, secrets, baseArgs);

    expect(result).toEqual({ needsRecreate: true });
    // Never guesses a code and never falls back to any other Cognito call.
    expect(cognito.send).toHaveBeenCalledTimes(1);
  });

  test("throws when the pool answers with tokens neither directly nor via a recognised challenge", async () => {
    const cognito = fakeClient();
    const secrets = fakeClient();
    cognito.send.mockResolvedValueOnce({ ChallengeName: "NEW_PASSWORD_REQUIRED", Session: "session-1" });

    await expect(rotateTestUserMfa(cognito, secrets, baseArgs)).rejects.toThrow(/NEW_PASSWORD_REQUIRED/);
  });
});
