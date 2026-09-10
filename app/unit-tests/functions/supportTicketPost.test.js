// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";

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

import { ingestHandler } from "@app/functions/support/supportTicketPost.js";

describe("supportTicketPost", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.GITHUB_TOKEN_SECRET_ARN = "arn:aws:secretsmanager:eu-west-2:123456789:secret:github-token";
    process.env.GITHUB_REPO = "diy-accounting-uk/submit.diyaccounting.co.uk";
    mockSecretsSend.mockReset();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  describe("ingestHandler", () => {
    test("creates GitHub issue with automation disclosure footer", async () => {
      mockSecretsSend.mockResolvedValue({ SecretString: "gh-token" });
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ number: 42, html_url: "https://github.com/x/y/issues/42" }),
      });

      await ingestHandler({
        requestContext: { http: { method: "POST" } },
        headers: { "x-forwarded-for": "192.168.1.1" },
        body: JSON.stringify({
          subject: "Test subject",
          description: "Test description",
          category: "submission",
        }),
      });

      expect(global.fetch).toHaveBeenCalled();
      const [url, options] = global.fetch.mock.calls[global.fetch.mock.calls.length - 1];
      const body = JSON.parse(options.body);
      expect(body.body).toContain("Raised automatically by an automated pipeline.");
    });

    test("issue body includes disclosure footer when created", async () => {
      mockSecretsSend.mockResolvedValue({ SecretString: "gh-token" });
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ number: 99, html_url: "https://github.com/x/y/issues/99" }),
      });

      await ingestHandler({
        requestContext: { http: { method: "POST" } },
        headers: { "x-forwarded-for": "1.2.3.4" },
        body: JSON.stringify({
          subject: "Bug report",
          description: "Something is broken",
          category: "other",
        }),
      });

      const callArgs = global.fetch.mock.calls.find((call) => call[0].includes("/issues"));
      if (callArgs) {
        const body = JSON.parse(callArgs[1].body);
        expect(body.body).toContain("---");
        expect(body.body).toContain("automated pipeline");
      }
    });
  });
});
