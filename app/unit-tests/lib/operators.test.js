// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

const mockSecretsSend = vi.fn();
vi.mock("@aws-sdk/client-secrets-manager", () => ({
  SecretsManagerClient: class {
    send(...args) {
      return mockSecretsSend(...args);
    }
  },
  GetSecretValueCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
}));

import { _clearOperatorsCache, isOperatorEmail, loadOperators } from "../../lib/operators.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

describe("operators.js", () => {
  const originalOperatorEmails = process.env.OPERATOR_EMAILS;
  const originalEnvironmentName = process.env.ENVIRONMENT_NAME;

  beforeEach(() => {
    _clearOperatorsCache();
    mockSecretsSend.mockReset();
  });

  afterEach(() => {
    process.env.OPERATOR_EMAILS = originalOperatorEmails;
    process.env.ENVIRONMENT_NAME = originalEnvironmentName;
    _clearOperatorsCache();
  });

  describe("OPERATOR_EMAILS environment override", () => {
    it("loads emails from OPERATOR_EMAILS, trimmed, lowercased, blank entries dropped", async () => {
      process.env.OPERATOR_EMAILS = " AntonyCCartwright@gmail.com ,, second@example.com ,";

      expect(await loadOperators()).toEqual(["antonyccartwright@gmail.com", "second@example.com"]);
      expect(mockSecretsSend).not.toHaveBeenCalled();
    });

    it("isOperatorEmail matches a listed email case-insensitively", async () => {
      process.env.OPERATOR_EMAILS = "antonyccartwright@gmail.com";

      expect(await isOperatorEmail("antonyccartwright@gmail.com")).toBe(true);
      expect(await isOperatorEmail("AntonyCCartwright@Gmail.com")).toBe(true);
      expect(await isOperatorEmail("  antonyccartwright@gmail.com  ")).toBe(true);
    });

    it("isOperatorEmail refuses an email not on the list", async () => {
      process.env.OPERATOR_EMAILS = "antonyccartwright@gmail.com";

      expect(await isOperatorEmail("someone-else@example.com")).toBe(false);
    });

    it("isOperatorEmail refuses an empty or missing email", async () => {
      process.env.OPERATOR_EMAILS = "antonyccartwright@gmail.com";

      expect(await isOperatorEmail("")).toBe(false);
      expect(await isOperatorEmail(undefined)).toBe(false);
    });

    it("caches the resolved list: a change to OPERATOR_EMAILS after the first read is not picked up until the cache is cleared", async () => {
      process.env.OPERATOR_EMAILS = "first@example.com";

      expect(await loadOperators()).toEqual(["first@example.com"]);

      process.env.OPERATOR_EMAILS = "second@example.com";
      expect(await loadOperators()).toEqual(["first@example.com"]);

      _clearOperatorsCache();
      expect(await loadOperators()).toEqual(["second@example.com"]);
    });
  });

  describe("Secrets Manager source", () => {
    beforeEach(() => {
      delete process.env.OPERATOR_EMAILS;
    });

    it("fetches the secret named after ENVIRONMENT_NAME and parses it the same way", async () => {
      process.env.ENVIRONMENT_NAME = "ci";
      mockSecretsSend.mockResolvedValue({ SecretString: "one@example.com, Two@Example.com" });

      expect(await loadOperators()).toEqual(["one@example.com", "two@example.com"]);
      expect(mockSecretsSend).toHaveBeenCalledTimes(1);
      const command = mockSecretsSend.mock.calls[0][0];
      expect(command.input).toEqual({ SecretId: "ci/submit/operator-emails" });
    });

    it("throws when ENVIRONMENT_NAME is not set", async () => {
      delete process.env.ENVIRONMENT_NAME;

      await expect(loadOperators()).rejects.toThrow(/ENVIRONMENT_NAME/);
    });

    it("throws when the secret has no SecretString", async () => {
      process.env.ENVIRONMENT_NAME = "ci";
      mockSecretsSend.mockResolvedValue({});

      await expect(loadOperators()).rejects.toThrow(/SecretString/);
    });

    it("throws when the Secrets Manager call fails", async () => {
      process.env.ENVIRONMENT_NAME = "ci";
      mockSecretsSend.mockRejectedValue(new Error("AccessDeniedException"));

      await expect(loadOperators()).rejects.toThrow(/AccessDeniedException/);
    });
  });

  it("_clearOperatorsCache refuses to run outside the test environment", () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    expect(() => _clearOperatorsCache()).toThrow(/test environment/);

    process.env.NODE_ENV = originalNodeEnv;
  });
});
