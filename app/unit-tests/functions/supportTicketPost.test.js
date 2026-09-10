// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/supportTicketPost.test.js

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

const mockIncrementRateCounter = vi.fn();
vi.mock("@app/data/dynamoDbSecurityStateRepository.js", () => ({
  incrementRateCounter: (...args) => mockIncrementRateCounter(...args),
}));

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

import {
  fenceText,
  buildIssueBody,
  hashClientIp,
  checkSupportTicketRateLimit,
  ingestHandler,
  SUPPORT_TICKET_RATE_LIMIT_PER_MINUTE,
} from "@app/functions/support/supportTicketPost.js";

function requestEvent(body, headers = {}) {
  return {
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
    requestContext: { http: { method: "POST" } },
  };
}

describe("supportTicketPost", () => {
  describe("fenceText", () => {
    test("wraps plain text in a triple-backtick fence", () => {
      expect(fenceText("hello")).toBe("```\nhello\n```");
    });

    test("uses a longer fence when the text already contains a backtick run", () => {
      const withFence = fenceText("here is ```some code``` inline");
      expect(withFence.startsWith("````\n")).toBe(true);
      expect(withFence.endsWith("\n````")).toBe(true);
    });

    test("treats a missing value as an empty string rather than throwing", () => {
      expect(fenceText(undefined)).toBe("```\n\n```");
    });
  });

  describe("buildIssueBody", () => {
    const body = buildIssueBody({
      subject: "Can't connect to HMRC",
      description: "It keeps failing at step 2",
      category: "connection",
      requestId: "req-123",
      timestamp: "2026-09-10T12:00:00.000Z",
    });

    test("quotes the subject and message in fenced blocks rather than its own prose", () => {
      expect(body).toContain("```\nCan't connect to HMRC\n```");
      expect(body).toContain("```\nIt keeps failing at step 2\n```");
    });

    test("states plainly that the ticket came through the public form with no verified sender", () => {
      expect(body).toMatch(/public support form/i);
      expect(body).toContain("**Claims to be from:** not given");
    });

    test("carries the category, request id and timestamp", () => {
      expect(body).toContain("**Category:** connection");
      expect(body).toContain("**Request ID:** req-123");
      expect(body).toContain("**Submitted:** 2026-09-10T12:00:00.000Z");
    });
  });

  describe("hashClientIp", () => {
    test("is deterministic for the same address", () => {
      expect(hashClientIp("203.0.113.5")).toBe(hashClientIp("203.0.113.5"));
    });

    test("differs between addresses", () => {
      expect(hashClientIp("203.0.113.5")).not.toBe(hashClientIp("203.0.113.6"));
    });

    test("never returns the raw address", () => {
      expect(hashClientIp("203.0.113.5")).not.toContain("203.0.113.5");
    });
  });

  describe("checkSupportTicketRateLimit", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      vi.clearAllMocks();
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    test("is a no-op when the security state table isn't configured", async () => {
      delete process.env.SECURITY_STATE_DYNAMODB_TABLE_NAME;

      const result = await checkSupportTicketRateLimit("203.0.113.5");

      expect(result).toEqual({ limited: false });
      expect(mockIncrementRateCounter).not.toHaveBeenCalled();
    });

    test("allows a caller at or under the per-minute threshold", async () => {
      process.env.SECURITY_STATE_DYNAMODB_TABLE_NAME = "test-security-state";
      mockIncrementRateCounter.mockResolvedValue(SUPPORT_TICKET_RATE_LIMIT_PER_MINUTE);

      const result = await checkSupportTicketRateLimit("203.0.113.5");

      expect(result.limited).toBe(false);
      expect(mockIncrementRateCounter).toHaveBeenCalledWith(
        expect.objectContaining({ namespace: "supportticket", identifier: hashClientIp("203.0.113.5") }),
      );
    });

    test("blocks a caller once the per-minute threshold is passed", async () => {
      process.env.SECURITY_STATE_DYNAMODB_TABLE_NAME = "test-security-state";
      mockIncrementRateCounter.mockResolvedValue(SUPPORT_TICKET_RATE_LIMIT_PER_MINUTE + 1);

      const result = await checkSupportTicketRateLimit("203.0.113.5");

      expect(result.limited).toBe(true);
    });

    test("fails open when the counter write errors", async () => {
      process.env.SECURITY_STATE_DYNAMODB_TABLE_NAME = "test-security-state";
      mockIncrementRateCounter.mockRejectedValue(new Error("DynamoDB unavailable"));

      const result = await checkSupportTicketRateLimit("203.0.113.5");

      expect(result).toEqual({ limited: false });
    });
  });

  describe("ingestHandler", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      vi.clearAllMocks();
      process.env = { ...originalEnv };
      process.env.GITHUB_TOKEN_SECRET_ARN = "arn:aws:secretsmanager:eu-west-2:111111111111:secret:test/github/token";
      process.env.GITHUB_REPO = "diy-accounting-uk/submit.diyaccounting.co.uk";
      process.env.SECURITY_STATE_DYNAMODB_TABLE_NAME = "test-security-state";
      mockSecretsSend.mockResolvedValue({ SecretString: "gh-token" });
      mockIncrementRateCounter.mockResolvedValue(1);
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    test("returns 429 without calling GitHub once the rate limit is exceeded", async () => {
      mockIncrementRateCounter.mockResolvedValue(SUPPORT_TICKET_RATE_LIMIT_PER_MINUTE + 1);
      global.fetch = vi.fn();

      const response = await ingestHandler(
        requestEvent(
          { subject: "s", description: "d", category: "other" },
          { "x-forwarded-for": "203.0.113.5" },
        ),
      );

      expect(response.statusCode).toBe(429);
      expect(response.headers["Retry-After"]).toBe("60");
      expect(global.fetch).not.toHaveBeenCalled();
    });

    test("files the ticket and quotes the submitter's words when under the rate limit", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ number: 7, html_url: "https://github.com/x/y/issues/7" }),
      });

      const response = await ingestHandler(
        requestEvent(
          { subject: "Can't log in", description: "It just spins", category: "connection" },
          { "x-forwarded-for": "203.0.113.5" },
        ),
      );

      expect(response.statusCode).toBe(200);
      const [, options] = global.fetch.mock.calls[0];
      const sentBody = JSON.parse(options.body);
      expect(sentBody.title).toBe("[Support] Can't log in");
      expect(sentBody.body).toContain("```\nCan't log in\n```");
      expect(sentBody.body).toContain("```\nIt just spins\n```");
      expect(sentBody.body).toContain("not given");
    });

    test("carries the shared automation disclosure so the issue does not read as a person's words", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ number: 8, html_url: "https://github.com/x/y/issues/8" }),
      });

      await ingestHandler(
        requestEvent(
          { subject: "Can't log in", description: "It just spins", category: "connection" },
          { "x-forwarded-for": "203.0.113.5" },
        ),
      );

      const [, options] = global.fetch.mock.calls[0];
      expect(JSON.parse(options.body).body).toContain("Raised automatically by an automated pipeline.");
    });

    test("still enforces the existing size caps alongside the rate limit", async () => {
      global.fetch = vi.fn();

      const response = await ingestHandler(
        requestEvent(
          { subject: "s".repeat(101), description: "d", category: "other" },
          { "x-forwarded-for": "203.0.113.5" },
        ),
      );

      expect(response.statusCode).toBe(400);
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });
});
