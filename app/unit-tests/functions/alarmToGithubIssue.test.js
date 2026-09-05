// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

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
  resolveAlarmDetail,
  buildAlarmConsoleLink,
  buildIssueTitle,
  buildIssueBody,
  buildCommentBody,
  findOpenIssueByAlarmFamily,
  createGitHubIssue,
  commentOnGitHubIssue,
  handler,
} from "@app/functions/ops/alarmToGithubIssue.js";
import { alarmFamilyKey } from "@app/lib/alarmName.js";

const ALARM_EVENT = {
  source: "aws.cloudwatch",
  "detail-type": "CloudWatch Alarm State Change",
  region: "eu-west-2",
  resources: ["arn:aws:cloudwatch:eu-west-2:367191799875:alarm:ci-app-health-failed"],
  detail: {
    alarmName: "ci-app-health-failed",
    state: { value: "ALARM", reason: "Threshold crossed", timestamp: "2026-08-31T12:00:00.000+0000" },
    previousState: { value: "OK" },
  },
};

function deploymentAlarmEvent(alarmName, stateValue = "ALARM", previousStateValue = "OK") {
  return {
    source: "aws.cloudwatch",
    "detail-type": "CloudWatch Alarm State Change",
    region: "eu-west-2",
    resources: [`arn:aws:cloudwatch:eu-west-2:367191799875:alarm:${alarmName}`],
    detail: {
      alarmName,
      state: { value: stateValue, reason: "Threshold crossed", timestamp: "2026-08-31T12:00:00.000+0000" },
      previousState: { value: previousStateValue },
    },
  };
}

describe("alarmToGithubIssue", () => {
  describe("resolveAlarmDetail", () => {
    test("extracts alarm name, states, reason, and timestamp", () => {
      const detail = resolveAlarmDetail(ALARM_EVENT);
      expect(detail.alarmName).toBe("ci-app-health-failed");
      expect(detail.state).toBe("ALARM");
      expect(detail.previousState).toBe("OK");
      expect(detail.reason).toBe("Threshold crossed");
      expect(detail.timestamp).toBe("2026-08-31T12:00:00.000+0000");
      expect(detail.region).toBe("eu-west-2");
      expect(detail.alarmArn).toBe("arn:aws:cloudwatch:eu-west-2:367191799875:alarm:ci-app-health-failed");
    });

    test("handles missing detail gracefully", () => {
      const detail = resolveAlarmDetail({});
      expect(detail.alarmName).toBe("unknown");
      expect(detail.state).toBe("UNKNOWN");
      expect(detail.previousState).toBe("UNKNOWN");
      expect(detail.reason).toBe("");
    });

    test("falls back to event time when state timestamp is absent", () => {
      const detail = resolveAlarmDetail({ time: "2026-08-31T13:00:00Z", detail: { alarmName: "x", state: { value: "OK" } } });
      expect(detail.timestamp).toBe("2026-08-31T13:00:00Z");
    });
  });

  describe("buildAlarmConsoleLink", () => {
    test("builds a region-scoped CloudWatch alarm console URL", () => {
      const link = buildAlarmConsoleLink("eu-west-2", "ci-app-health-failed");
      expect(link).toBe(
        "https://eu-west-2.console.aws.amazon.com/cloudwatch/home?region=eu-west-2#alarmsV2:alarm/ci-app-health-failed",
      );
    });

    test("encodes special characters in the alarm name", () => {
      const link = buildAlarmConsoleLink("eu-west-2", "ci alarm/with special");
      expect(link).toContain(encodeURIComponent("ci alarm/with special"));
    });
  });

  describe("buildIssueTitle", () => {
    test("prefixes the alarm name with [ALARM]", () => {
      expect(buildIssueTitle("ci-app-health-failed")).toBe("[ALARM] ci-app-health-failed");
    });

    test("prefixes a family key the same way", () => {
      expect(buildIssueTitle(alarmFamilyKey("prod-a0f41c7-app-api-5xx"))).toBe("[ALARM] prod-app-api-5xx");
    });
  });

  describe("alarmFamilyKey via buildIssueTitle", () => {
    test("a deployment-scoped name maps to the family title", () => {
      expect(buildIssueTitle(alarmFamilyKey("ci-claudeboa-app-hmrc-stack-health"))).toBe(
        "[ALARM] ci-app-hmrc-stack-health",
      );
    });

    test("an env-scoped name is unchanged", () => {
      expect(buildIssueTitle(alarmFamilyKey("prod-env-salt-secret-unexpected-read"))).toBe(
        "[ALARM] prod-env-salt-secret-unexpected-read",
      );
    });
  });

  describe("buildIssueBody / buildCommentBody", () => {
    test("issue body includes state transition, reason, timestamp, and console link", () => {
      const body = buildIssueBody({
        alarmName: "ci-app-health-failed",
        state: "ALARM",
        previousState: "OK",
        reason: "Threshold crossed",
        timestamp: "2026-08-31T12:00:00Z",
        consoleLink: "https://example.com/alarm",
      });
      expect(body).toContain("ci-app-health-failed");
      expect(body).toContain("OK → ALARM");
      expect(body).toContain("Threshold crossed");
      expect(body).toContain("2026-08-31T12:00:00Z");
      expect(body).toContain("https://example.com/alarm");
    });

    test("issue body falls back when reason is missing", () => {
      const body = buildIssueBody({
        alarmName: "x",
        state: "ALARM",
        previousState: "OK",
        reason: "",
        timestamp: "t",
        consoleLink: "l",
      });
      expect(body).toContain("not provided");
    });

    test("comment body reports the new transition and names the exact alarm", () => {
      const body = buildCommentBody({
        alarmName: "prod-9050bb5-app-cognito-token-post-health",
        state: "ALARM",
        previousState: "OK",
        reason: "Still failing",
        timestamp: "2026-08-31T12:05:00Z",
        consoleLink: "https://example.com/alarm",
      });
      expect(body).toContain("OK → ALARM");
      expect(body).toContain("Still failing");
      expect(body).toContain("https://example.com/alarm");
      expect(body).toContain("prod-9050bb5-app-cognito-token-post-health");
    });
  });

  describe("findOpenIssueByAlarmFamily", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    test("returns the matching open issue by exact family title", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            items: [
              { number: 42, title: "[ALARM] ci-app-health-failed" },
              { number: 7, title: "[ALARM] some-other-alarm" },
            ],
          }),
      });

      const issue = await findOpenIssueByAlarmFamily(
        "gh-token",
        "diy-accounting-uk/submit.diyaccounting.co.uk",
        "ci-app-health-failed",
      );
      expect(issue.number).toBe(42);
      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [url, options] = global.fetch.mock.calls[0];
      expect(url).toContain("https://api.github.com/search/issues?q=");
      expect(options.headers.Authorization).toBe("Bearer gh-token");
    });

    test("returns null when no open issue matches", async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ items: [] }) });
      const issue = await findOpenIssueByAlarmFamily(
        "gh-token",
        "diy-accounting-uk/submit.diyaccounting.co.uk",
        "ci-app-health-failed",
      );
      expect(issue).toBeNull();
    });

    test("throws on a non-ok search response", async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 403, text: () => Promise.resolve("rate limited") });
      await expect(
        findOpenIssueByAlarmFamily("gh-token", "diy-accounting-uk/submit.diyaccounting.co.uk", "ci-app-health-failed"),
      ).rejects.toThrow("GitHub search API error: 403");
    });
  });

  describe("createGitHubIssue", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    test("posts title, body, and labels to the issues endpoint", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ number: 99, html_url: "https://github.com/x/y/issues/99" }),
      });

      const issue = await createGitHubIssue("gh-token", "diy-accounting-uk/submit.diyaccounting.co.uk", {
        title: "[ALARM] x",
        body: "body text",
        labels: ["alarm", "ops"],
      });

      expect(issue.number).toBe(99);
      const [url, options] = global.fetch.mock.calls[0];
      expect(url).toBe("https://api.github.com/repos/diy-accounting-uk/submit.diyaccounting.co.uk/issues");
      expect(options.method).toBe("POST");
      const body = JSON.parse(options.body);
      expect(body).toEqual({ title: "[ALARM] x", body: "body text", labels: ["alarm", "ops"] });
    });

    test("throws on a non-ok create response", async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 422, text: () => Promise.resolve("validation failed") });
      await expect(
        createGitHubIssue("gh-token", "diy-accounting-uk/submit.diyaccounting.co.uk", { title: "t", body: "b", labels: [] }),
      ).rejects.toThrow("GitHub API error creating issue: 422");
    });
  });

  describe("commentOnGitHubIssue", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    test("posts a comment to the issue's comments endpoint", async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ id: 1 }) });

      await commentOnGitHubIssue("gh-token", "diy-accounting-uk/submit.diyaccounting.co.uk", 42, "comment text");

      const [url, options] = global.fetch.mock.calls[0];
      expect(url).toBe("https://api.github.com/repos/diy-accounting-uk/submit.diyaccounting.co.uk/issues/42/comments");
      expect(JSON.parse(options.body)).toEqual({ body: "comment text" });
    });

    test("throws on a non-ok comment response", async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404, text: () => Promise.resolve("not found") });
      await expect(
        commentOnGitHubIssue("gh-token", "diy-accounting-uk/submit.diyaccounting.co.uk", 42, "comment text"),
      ).rejects.toThrow("GitHub API error commenting on issue: 404");
    });
  });

  describe("handler", () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
      process.env.GITHUB_REPO = "diy-accounting-uk/submit.diyaccounting.co.uk";
      process.env.OPS_GITHUB_TOKEN_SECRET_ARN = "arn:aws:secretsmanager:eu-west-2:367191799875:secret:ci/submit/github/token";
      mockSecretsSend.mockReset();
    });

    afterEach(() => {
      process.env = { ...originalEnv };
      vi.restoreAllMocks();
    });

    test("throws when OPS_GITHUB_TOKEN_SECRET_ARN is not set", async () => {
      delete process.env.OPS_GITHUB_TOKEN_SECRET_ARN;
      await expect(handler(ALARM_EVENT)).rejects.toThrow("OPS_GITHUB_TOKEN_SECRET_ARN environment variable is required");
    });

    test("skips issue creation when the alarm state is not ALARM", async () => {
      global.fetch = vi.fn();
      await handler({
        source: "aws.cloudwatch",
        detail: { alarmName: "ci-app-health-failed", state: { value: "OK" }, previousState: { value: "ALARM" } },
      });
      expect(global.fetch).not.toHaveBeenCalled();
      expect(mockSecretsSend).not.toHaveBeenCalled();
    });

    test("throws when GITHUB_REPO is not set", async () => {
      delete process.env.GITHUB_REPO;
      await expect(handler(ALARM_EVENT)).rejects.toThrow("GITHUB_REPO environment variable is required");
    });

    test("creates a new issue when no open issue exists for the alarm", async () => {
      mockSecretsSend.mockResolvedValue({ SecretString: "gh-token-abc" });
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ items: [] }) })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ number: 101, html_url: "https://github.com/diy-accounting-uk/submit.diyaccounting.co.uk/issues/101" }),
        });

      await handler(ALARM_EVENT);

      expect(global.fetch).toHaveBeenCalledTimes(2);
      const [searchUrl] = global.fetch.mock.calls[0];
      expect(searchUrl).toContain("search/issues");
      const [createUrl, createOptions] = global.fetch.mock.calls[1];
      expect(createUrl).toBe("https://api.github.com/repos/diy-accounting-uk/submit.diyaccounting.co.uk/issues");
      const createBody = JSON.parse(createOptions.body);
      expect(createBody.title).toBe("[ALARM] ci-app-health-failed");
      expect(createBody.body).toContain("OK → ALARM");
    });

    test("comments on the existing open issue instead of creating a duplicate", async () => {
      mockSecretsSend.mockResolvedValue({ SecretString: "gh-token-abc" });
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ items: [{ number: 55, title: "[ALARM] ci-app-health-failed" }] }),
        })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ id: 1 }) });

      await handler(ALARM_EVENT);

      expect(global.fetch).toHaveBeenCalledTimes(2);
      const [commentUrl, commentOptions] = global.fetch.mock.calls[1];
      expect(commentUrl).toBe("https://api.github.com/repos/diy-accounting-uk/submit.diyaccounting.co.uk/issues/55/comments");
      expect(JSON.parse(commentOptions.body).body).toContain("OK → ALARM");
    });

    test("creates an issue titled with the family key for a deployment-scoped alarm", async () => {
      mockSecretsSend.mockResolvedValue({ SecretString: "gh-token-abc" });
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ items: [] }) })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ number: 101, html_url: "https://github.com/x/y/issues/101" }),
        });

      await handler(deploymentAlarmEvent("prod-a0f41c7-app-api-5xx"));

      const [searchUrl] = global.fetch.mock.calls[0];
      expect(searchUrl).toContain(encodeURIComponent("[ALARM] prod-app-api-5xx"));
      const [, createOptions] = global.fetch.mock.calls[1];
      const createBody = JSON.parse(createOptions.body);
      expect(createBody.title).toBe("[ALARM] prod-app-api-5xx");
      expect(createBody.body).toContain("prod-a0f41c7-app-api-5xx");
    });

    test("a second deployment's alarm in the same family comments on the first deployment's open issue", async () => {
      mockSecretsSend.mockResolvedValue({ SecretString: "gh-token-abc" });
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ items: [{ number: 200, title: "[ALARM] prod-app-api-5xx" }] }),
        })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ id: 1 }) });

      await handler(deploymentAlarmEvent("prod-9050bb5-app-api-5xx"));

      expect(global.fetch).toHaveBeenCalledTimes(2);
      const [commentUrl, commentOptions] = global.fetch.mock.calls[1];
      expect(commentUrl).toBe("https://api.github.com/repos/diy-accounting-uk/submit.diyaccounting.co.uk/issues/200/comments");
      const commentBody = JSON.parse(commentOptions.body).body;
      expect(commentBody).toContain("prod-9050bb5-app-api-5xx");
    });

    test("an OK from one deployment never closes or comments on the family issue another deployment opened", async () => {
      global.fetch = vi.fn();

      await handler(deploymentAlarmEvent("prod-9050bb5-app-api-5xx", "OK", "ALARM"));

      expect(global.fetch).not.toHaveBeenCalled();
      expect(mockSecretsSend).not.toHaveBeenCalled();
    });
  });
});
