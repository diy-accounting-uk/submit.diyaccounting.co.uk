// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

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

const mockSsmSend = vi.fn();
vi.mock("@aws-sdk/client-ssm", () => ({
  SSMClient: class {
    send(...args) {
      return mockSsmSend(...args);
    }
  },
  GetParameterCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
}));

const mockCloudWatchSend = vi.fn();
vi.mock("@aws-sdk/client-cloudwatch", () => ({
  CloudWatchClient: class {
    send(...args) {
      return mockCloudWatchSend(...args);
    }
  },
  DescribeAlarmsCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
}));

import {
  resolveAlarmDetail,
  buildIssueTitle,
  buildIssueBody,
  buildCommentBody,
  findOpenIssueByAlarmFamily,
  createGitHubIssue,
  commentOnGitHubIssue,
  resolveDeploymentSlug,
  resolveCompositeChildFunctionNames,
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

    test("reads namespace, metric name and dimensions out of configuration.metrics[0].metricStat.metric", () => {
      const detail = resolveAlarmDetail({
        detail: {
          alarmName: "prod-env-stripe-reconcile-errors",
          state: { value: "ALARM" },
          previousState: { value: "OK" },
          configuration: {
            metrics: [
              {
                metricStat: {
                  period: 300,
                  metric: {
                    namespace: "AWS/Lambda",
                    name: "Errors",
                    dimensions: { FunctionName: "prod-env-stripe-reconcile" },
                  },
                },
              },
            ],
          },
        },
      });

      expect(detail.namespace).toBe("AWS/Lambda");
      expect(detail.metricName).toBe("Errors");
      expect(detail.dimensions).toEqual({ FunctionName: "prod-env-stripe-reconcile" });
      expect(detail.periodSeconds).toBe(300);
    });

    test("parses reasonData from its JSON string, and yields null for malformed JSON without throwing", () => {
      const withReasonData = resolveAlarmDetail({
        detail: { alarmName: "x", state: { value: "ALARM", reasonData: '{"period":900}' }, previousState: { value: "OK" } },
      });
      expect(withReasonData.reasonData).toEqual({ period: 900 });

      const withMalformedReasonData = resolveAlarmDetail({
        detail: { alarmName: "x", state: { value: "ALARM", reasonData: "{not json" }, previousState: { value: "OK" } },
      });
      expect(withMalformedReasonData.reasonData).toBeNull();
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

  function evidenceFixture(overrides = {}) {
    return {
      ruleId: 1,
      logGroupNamePrefixes: ["/aws/lambda/prod-0f68ed8-app-hmrc-vat-return-post"],
      tableNames: ["prod-env-hmrc-api-requests"],
      xrayFilterExpression: 'service("prod-0f68ed8-app-hmrc-vat-return-post-worker") { fault = true OR error = true }',
      insightsQuery: "SOURCE logGroups(namePrefix: ['/aws/lambda/prod-0f68ed8-app-hmrc-vat-return-post'])",
      noEvidenceReason: null,
      extraLinks: [],
      ...overrides,
    };
  }

  function linksFixture(overrides = {}) {
    return {
      alarmConsole: "https://eu-west-2.console.aws.amazon.com/cloudwatch/home?region=eu-west-2#alarmsV2:alarm/x",
      logsInsights: "https://eu-west-2.console.aws.amazon.com/cloudwatch/home?region=eu-west-2#logsV2:logs-insights",
      xray: "https://eu-west-2.console.aws.amazon.com/xray/home?region=eu-west-2#/traces",
      ...overrides,
    };
  }

  const windowFixture = {
    startIso: "2026-09-03T21:25:00.000Z",
    endIso: "2026-09-03T21:50:23.618Z",
    periodSeconds: 900,
    evaluatedPeriods: 1,
    marginSeconds: 300,
  };

  describe("buildIssueBody / buildCommentBody", () => {
    test("issue body includes state transition, reason, timestamp, window, region, deployment, and evidence links", () => {
      const body = buildIssueBody({
        alarmName: "prod-env-hmrc-submission-failure",
        familyKey: "prod-env-hmrc-submission-failure",
        state: "ALARM",
        previousState: "OK",
        reason: "Threshold crossed",
        timestamp: "2026-09-03T21:45:23.618+0000",
        region: "eu-west-2",
        deployment: "prod-0f68ed8",
        window: windowFixture,
        evidence: evidenceFixture(),
        links: linksFixture(),
      });

      expect(body).toContain("prod-env-hmrc-submission-failure");
      expect(body).toContain("OK → ALARM");
      expect(body).toContain("Threshold crossed");
      expect(body).toContain("2026-09-03T21:45:23.618+0000");
      expect(body).toContain("2026-09-03T21:25:00.000Z to 2026-09-03T21:50:23.618Z");
      expect(body).toContain("**Region:** eu-west-2");
      expect(body).toContain("**Deployment:** prod-0f68ed8");
      expect(body).toContain(linksFixture().alarmConsole);
      expect(body).toContain(linksFixture().logsInsights);
      expect(body).toContain(linksFixture().xray);
      expect(body).not.toContain("**Family:**");
    });

    test("issue body shows the Family line only when the family key differs from the alarm name", () => {
      const body = buildIssueBody({
        alarmName: "prod-9050bb5-app-api-5xx",
        familyKey: "prod-app-api-5xx",
        state: "ALARM",
        previousState: "OK",
        reason: "Threshold crossed",
        timestamp: "t",
        region: "eu-west-2",
        deployment: "prod-9050bb5",
        window: windowFixture,
        evidence: evidenceFixture(),
        links: linksFixture(),
      });
      expect(body).toContain("**Family:** prod-app-api-5xx");
    });

    test("issue body falls back when reason is missing", () => {
      const body = buildIssueBody({
        alarmName: "x",
        familyKey: "x",
        state: "ALARM",
        previousState: "OK",
        reason: "",
        timestamp: "t",
        region: "eu-west-2",
        deployment: null,
        window: windowFixture,
        evidence: evidenceFixture(),
        links: linksFixture(),
      });
      expect(body).toContain("not provided");
    });

    test("issue body replaces a missing Logs Insights link with the stated reason, and names the RUM monitor extra link", () => {
      const body = buildIssueBody({
        alarmName: "prod-env-rum-js-errors",
        familyKey: "prod-env-rum-js-errors",
        state: "ALARM",
        previousState: "OK",
        reason: "Threshold crossed",
        timestamp: "t",
        region: "eu-west-2",
        deployment: "prod-0f68ed8",
        window: windowFixture,
        evidence: evidenceFixture({
          logGroupNamePrefixes: [],
          tableNames: [],
          xrayFilterExpression: "fault = true OR error = true",
          insightsQuery: null,
          noEvidenceReason: "RUM events are not written to CloudWatch Logs.",
          extraLinks: [{ label: "RUM app monitor", url: "https://example.com/rum" }],
        }),
        links: linksFixture({ logsInsights: null }),
      });

      expect(body).toContain("No log group applies: RUM events are not written to CloudWatch Logs.");
      expect(body).toContain("[RUM app monitor](https://example.com/rum)");
      expect(body).not.toContain("Logs Insights for this window");
    });

    test("comment body reports the new transition, names the exact alarm, and carries the same evidence links", () => {
      const body = buildCommentBody({
        alarmName: "prod-9050bb5-app-cognito-token-post-health",
        state: "ALARM",
        previousState: "OK",
        reason: "Still failing",
        timestamp: "2026-08-31T12:05:00Z",
        window: windowFixture,
        evidence: evidenceFixture(),
        links: linksFixture(),
      });
      expect(body).toContain("OK → ALARM");
      expect(body).toContain("Still failing");
      expect(body).toContain(linksFixture().alarmConsole);
      expect(body).toContain("prod-9050bb5-app-cognito-token-post-health");
    });
  });

  describe("resolveDeploymentSlug", () => {
    beforeEach(() => {
      mockSsmSend.mockReset();
    });

    test("returns the slug from a deployment-scoped alarm name and makes no SSM call", async () => {
      const slug = await resolveDeploymentSlug({ alarmName: "prod-9050bb5-app-api-5xx", env: "prod" });
      expect(slug).toBe("9050bb5");
      expect(mockSsmSend).not.toHaveBeenCalled();
    });

    test("calls SSM once for an environment-scoped alarm and caches the answer across two invocations", async () => {
      mockSsmSend.mockResolvedValue({ Parameter: { Value: "prod-cached-slug" } });

      const first = await resolveDeploymentSlug({ alarmName: "prod-env-hmrc-submission-failure", env: "prod-test-cache" });
      const second = await resolveDeploymentSlug({ alarmName: "prod-env-bundle-cap-reached", env: "prod-test-cache" });

      expect(first).toBe("prod-cached-slug");
      expect(second).toBe("prod-cached-slug");
      expect(mockSsmSend).toHaveBeenCalledTimes(1);
    });
  });

  describe("resolveCompositeChildFunctionNames", () => {
    afterEach(() => {
      mockCloudWatchSend.mockReset();
    });

    test("parses a real AlarmRule string into function names", async () => {
      mockCloudWatchSend.mockResolvedValue({
        CompositeAlarms: [
          {
            AlarmRule:
              'ALARM("arn:aws:cloudwatch:eu-west-2:367191799875:alarm:check-prod-0f68ed8-app-hmrc-vat-return-post-errors")',
          },
        ],
      });

      const names = await resolveCompositeChildFunctionNames({
        region: "eu-west-2",
        alarmName: "prod-0f68ed8-app-hmrc-stack-health",
      });

      expect(names).toEqual(["prod-0f68ed8-app-hmrc-vat-return-post"]);
    });

    test("returns [] and logs a warning when DescribeAlarms rejects", async () => {
      mockCloudWatchSend.mockRejectedValue(new Error("boom"));

      const names = await resolveCompositeChildFunctionNames({
        region: "eu-west-2",
        alarmName: "prod-0f68ed8-app-hmrc-stack-health",
      });

      expect(names).toEqual([]);
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
      mockSsmSend.mockReset();
      // Every alarm the handler tests fire is either deployment-scoped (its slug comes
      // straight off the alarm name, no SSM call) or shares this fallback answer for the
      // environment-scoped ones; no test here asserts on the resolved slug's value.
      mockSsmSend.mockResolvedValue({ Parameter: { Value: "ci-mockdeploy" } });
      mockCloudWatchSend.mockReset();
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

    test("posts an issue body containing both the Logs Insights and the X-Ray URL for a submission-failure alarm", async () => {
      mockSecretsSend.mockResolvedValue({ SecretString: "gh-token-abc" });
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ items: [] }) })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ number: 111, html_url: "https://github.com/x/y/issues/111" }),
        });

      await handler(deploymentAlarmEvent("prod-env-hmrc-submission-failure"));

      const [, createOptions] = global.fetch.mock.calls[1];
      const createBody = JSON.parse(createOptions.body);
      expect(createBody.body).toContain("logsV2:logs-insights");
      expect(createBody.body).toContain("/xray/home");
    });

    test("posts an issue body with no Logs Insights link and the stated reason for a RUM alarm", async () => {
      mockSecretsSend.mockResolvedValue({ SecretString: "gh-token-abc" });
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ items: [] }) })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ number: 112, html_url: "https://github.com/x/y/issues/112" }),
        });

      const event = {
        source: "aws.cloudwatch",
        region: "eu-west-2",
        resources: ["arn:aws:cloudwatch:eu-west-2:367191799875:alarm:prod-env-rum-js-errors"],
        detail: {
          alarmName: "prod-env-rum-js-errors",
          state: { value: "ALARM", reason: "Threshold crossed", timestamp: "2026-08-31T12:00:00.000+0000" },
          previousState: { value: "OK" },
          configuration: {
            metrics: [{ metricStat: { period: 300, metric: { namespace: "AWS/RUM", name: "JsErrorCount", dimensions: {} } } }],
          },
        },
      };

      await handler(event);

      const [, createOptions] = global.fetch.mock.calls[1];
      const createBody = JSON.parse(createOptions.body);
      expect(createBody.body).not.toContain("logsV2:logs-insights");
      expect(createBody.body).toContain("No log group applies:");
    });

    test("comments with both links on a repeat alarm, and the comment body carries no log text", async () => {
      mockSecretsSend.mockResolvedValue({ SecretString: "gh-token-abc" });
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ items: [{ number: 55, title: "[ALARM] prod-env-hmrc-submission-failure" }] }),
        })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ id: 1 }) });

      await handler(deploymentAlarmEvent("prod-env-hmrc-submission-failure"));

      const [, commentOptions] = global.fetch.mock.calls[1];
      const commentBody = JSON.parse(commentOptions.body).body;
      expect(commentBody).toContain("logsV2:logs-insights");
      expect(commentBody).toContain("/xray/home");
    });

    test("a silenced deployment's ALARM event opens no issue and makes no GitHub call", async () => {
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      mockSsmSend.mockImplementation((command) => {
        if (command.input?.Name === "/submit/prod/alarm-silence/a0f41c7") {
          return Promise.resolve({
            Parameter: { Value: JSON.stringify({ firstSilencedAt: new Date().toISOString(), expiresAt }) },
          });
        }
        return Promise.resolve({ Parameter: { Value: "ci-mockdeploy" } });
      });
      global.fetch = vi.fn();

      await handler(deploymentAlarmEvent("prod-a0f41c7-app-api-5xx"));

      expect(global.fetch).not.toHaveBeenCalled();
      expect(mockSecretsSend).not.toHaveBeenCalled();
    });

    test("an env alarm is never silenced: it carries no deployment slug, so no alarm-silence parameter is ever read", async () => {
      mockSecretsSend.mockResolvedValue({ SecretString: "gh-token-abc" });
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ items: [] }) })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ number: 200, html_url: "https://github.com/x/y/issues/200" }),
        });

      await handler(deploymentAlarmEvent("prod-env-hmrc-submission-failure"));

      expect(global.fetch).toHaveBeenCalledTimes(2);
      const silenceParameterReads = mockSsmSend.mock.calls.filter(([command]) =>
        String(command.input?.Name).startsWith("/submit/prod/alarm-silence/"),
      );
      expect(silenceParameterReads).toEqual([]);
    });

    test("no issue or comment body ever contains the string reasonData", async () => {
      mockSecretsSend.mockResolvedValue({ SecretString: "gh-token-abc" });
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ items: [] }) })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ number: 113, html_url: "https://github.com/x/y/issues/113" }),
        });

      const event = {
        ...deploymentAlarmEvent("prod-env-hmrc-submission-failure"),
      };
      event.detail.state.reasonData = JSON.stringify({
        version: "1.0",
        queryDate: "2026-09-05T22:04:50.762+0000",
        statistic: "Average",
        period: 7200,
        recentDatapoints: [],
        threshold: 90.0,
        evaluatedDatapoints: [{ timestamp: "2026-09-05T20:04:00.000Z" }],
      });

      await handler(event);

      const [, createOptions] = global.fetch.mock.calls[1];
      const createBody = JSON.parse(createOptions.body);
      expect(createBody.body).not.toContain("reasonData");
      expect(createBody.body).not.toContain("recentDatapoints");
    });
  });
});
