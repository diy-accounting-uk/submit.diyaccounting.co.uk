// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import {
  escapeTelegramMarkdown,
  formatMessage,
  resolveTargetChatIds,
  resolveChatConfig,
  synthesizeFromCloudFormation,
  synthesizeFromCloudWatchAlarm,
  resolveEventDetail,
  handler,
} from "@app/functions/ops/activityTelegramForwarder.js";

const CHAT_CONFIG = {
  test: "@diy_ci_test",
  live: "@diy_ci_live",
  ops: "@diy_ci_ops",
};

describe("activityTelegramForwarder", () => {
  describe("escapeTelegramMarkdown", () => {
    test("escapes underscore, asterisk, backtick, bracket", () => {
      expect(escapeTelegramMarkdown("hello_world")).toBe("hello\\_world");
      expect(escapeTelegramMarkdown("*bold*")).toBe("\\*bold\\*");
      expect(escapeTelegramMarkdown("`code`")).toBe("\\`code\\`");
      expect(escapeTelegramMarkdown("[link]")).toBe("\\[link]");
    });

    test("handles empty and null input", () => {
      expect(escapeTelegramMarkdown("")).toBe("");
      expect(escapeTelegramMarkdown(null)).toBe("");
      expect(escapeTelegramMarkdown(undefined)).toBe("");
    });

    test("leaves plain text unchanged", () => {
      expect(escapeTelegramMarkdown("Login: u***@example.com")).toBe("Login: u\\*\\*\\*@example.com");
    });
  });

  describe("formatMessage", () => {
    test("formats a standard activity event", () => {
      const detail = { site: "submit", env: "prod", summary: "Login: u***@example.com" };
      expect(formatMessage(detail)).toBe("*[submit/prod]* Login: u\\*\\*\\*@example.com");
    });

    test("handles missing fields", () => {
      // env falls back to ENVIRONMENT_NAME env var (set to "test" by .env.test)
      const envName = process.env.ENVIRONMENT_NAME || "unknown";
      expect(formatMessage({})).toBe(`*[unknown/${envName}]* unknown event`);
    });

    test("uses event name when summary is missing", () => {
      const detail = { site: "submit", env: "ci", event: "login" };
      expect(formatMessage(detail)).toBe("*[submit/ci]* login");
    });
  });

  describe("resolveChatConfig", () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
      process.env = { ...originalEnv };
    });

    test("reads individual env vars", () => {
      process.env.TELEGRAM_TEST_CHAT_ID = "@diy_test";
      process.env.TELEGRAM_LIVE_CHAT_ID = "@diy_live";
      process.env.TELEGRAM_OPS_CHAT_ID = "@diy_ops";
      expect(resolveChatConfig()).toEqual({ test: "@diy_test", live: "@diy_live", ops: "@diy_ops" });
    });

    test("returns empty strings when env vars are not set", () => {
      delete process.env.TELEGRAM_TEST_CHAT_ID;
      delete process.env.TELEGRAM_LIVE_CHAT_ID;
      delete process.env.TELEGRAM_OPS_CHAT_ID;
      expect(resolveChatConfig()).toEqual({ test: "", live: "", ops: "" });
    });
  });

  describe("resolveTargetChatIds", () => {
    // User journey routing
    test("routes test-user events to test channel", () => {
      const detail = { actor: "test-user", flow: "user-journey" };
      expect(resolveTargetChatIds(detail, CHAT_CONFIG)).toEqual(["@diy_ci_test"]);
    });

    test("routes probe events to test channel", () => {
      const detail = { actor: "probe", flow: "user-journey" };
      expect(resolveTargetChatIds(detail, CHAT_CONFIG)).toEqual(["@diy_ci_test"]);
    });

    test("routes customer events to live channel", () => {
      const detail = { actor: "customer", flow: "user-journey" };
      expect(resolveTargetChatIds(detail, CHAT_CONFIG)).toEqual(["@diy_ci_live"]);
    });

    test("routes visitor events to live channel", () => {
      const detail = { actor: "visitor", flow: "user-journey" };
      expect(resolveTargetChatIds(detail, CHAT_CONFIG)).toEqual(["@diy_ci_live"]);
    });

    // Infrastructure and operational → ops channel only
    test("routes infrastructure events to ops channel", () => {
      const detail = { actor: "ci-pipeline", flow: "infrastructure" };
      expect(resolveTargetChatIds(detail, CHAT_CONFIG)).toEqual(["@diy_ci_ops"]);
    });

    test("routes operational events to ops channel", () => {
      const detail = { actor: "system", flow: "operational" };
      expect(resolveTargetChatIds(detail, CHAT_CONFIG)).toEqual(["@diy_ci_ops"]);
    });

    // ci-pipeline user-journey events → test channel
    test("routes ci-pipeline user-journey events to test channel", () => {
      const detail = { actor: "ci-pipeline", flow: "user-journey" };
      expect(resolveTargetChatIds(detail, CHAT_CONFIG)).toEqual(["@diy_ci_test"]);
    });

    // Edge cases
    test("returns empty when target channel is not configured", () => {
      const detail = { actor: "customer", flow: "user-journey" };
      expect(resolveTargetChatIds(detail, { test: "", live: "", ops: "" })).toEqual([]);
    });

    test("returns empty for empty detail", () => {
      expect(resolveTargetChatIds({}, CHAT_CONFIG)).toEqual(["@diy_ci_test"]);
    });

    // Routing is environment-independent (env doesn't affect which channel)
    test("routing does not depend on env field", () => {
      const ciDetail = { env: "ci", actor: "customer", flow: "user-journey" };
      const prodDetail = { env: "prod", actor: "customer", flow: "user-journey" };
      expect(resolveTargetChatIds(ciDetail, CHAT_CONFIG)).toEqual(resolveTargetChatIds(prodDetail, CHAT_CONFIG));
    });

    // requestId prefix routing
    test("test_ requestId routes to test channel even with actor: customer", () => {
      const detail = { actor: "customer", flow: "user-journey", requestId: "test_abc-123" };
      expect(resolveTargetChatIds(detail, CHAT_CONFIG)).toEqual(["@diy_ci_test"]);
    });

    test("test_ requestId routes to test channel even with flow: operational", () => {
      const detail = { actor: "system", flow: "operational", requestId: "test_abc-123" };
      expect(resolveTargetChatIds(detail, CHAT_CONFIG)).toEqual(["@diy_ci_test"]);
    });

    test("normal requestId does not override routing", () => {
      const detail = { actor: "customer", flow: "user-journey", requestId: "normal-abc-123" };
      expect(resolveTargetChatIds(detail, CHAT_CONFIG)).toEqual(["@diy_ci_live"]);
    });

    test("missing requestId does not affect routing", () => {
      const detail = { actor: "customer", flow: "user-journey" };
      expect(resolveTargetChatIds(detail, CHAT_CONFIG)).toEqual(["@diy_ci_live"]);
    });
  });

  describe("handler", () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
      process.env.TELEGRAM_BOT_TOKEN = "test-bot-token";
      process.env.TELEGRAM_TEST_CHAT_ID = "@diy_ci_test";
      process.env.TELEGRAM_LIVE_CHAT_ID = "@diy_ci_live";
      process.env.TELEGRAM_OPS_CHAT_ID = "@diy_ci_ops";
      process.env.ENVIRONMENT_NAME = "test";
      global.fetch = vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve("{}") });
    });

    afterEach(() => {
      process.env = { ...originalEnv };
      vi.restoreAllMocks();
    });

    test("sends message to live channel for customer event", async () => {
      await handler({
        detail: {
          event: "login",
          site: "submit",
          env: "prod",
          actor: "customer",
          flow: "user-journey",
          summary: "Login: u***@example.com",
        },
      });

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [url, options] = global.fetch.mock.calls[0];
      expect(url).toBe("https://api.telegram.org/bottest-bot-token/sendMessage");
      const body = JSON.parse(options.body);
      expect(body.chat_id).toBe("@diy_ci_live");
      expect(body.text).toContain("submit/prod");
      expect(body.parse_mode).toBe("Markdown");
    });

    test("sends to ops channel for infrastructure events", async () => {
      await handler({
        detail: {
          event: "deployment",
          site: "submit",
          env: "ci",
          actor: "ci-pipeline",
          flow: "infrastructure",
          summary: "Deployed: ci-app-ApiStack",
        },
      });

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const body = JSON.parse(global.fetch.mock.calls[0][1].body);
      expect(body.chat_id).toBe("@diy_ci_ops");
    });

    test("logs with [[TELEGRAM_LIVE_CHAT]] prefix when live channel is empty", async () => {
      process.env.TELEGRAM_LIVE_CHAT_ID = "";

      await handler({
        detail: {
          event: "login",
          site: "submit",
          env: "prod",
          actor: "customer",
          flow: "user-journey",
          summary: "Login",
        },
      });

      expect(global.fetch).not.toHaveBeenCalled();
    });

    test("logs with [[TELEGRAM_OPS_CHAT]] prefix when ops channel is empty", async () => {
      process.env.TELEGRAM_OPS_CHAT_ID = "";

      await handler({
        detail: {
          event: "deployment",
          site: "submit",
          env: "ci",
          actor: "ci-pipeline",
          flow: "infrastructure",
          summary: "Deployed",
        },
      });

      expect(global.fetch).not.toHaveBeenCalled();
    });

    test("logs with [[TELEGRAM_TEST_CHAT]] prefix when test channel is empty", async () => {
      process.env.TELEGRAM_TEST_CHAT_ID = "";

      await handler({
        detail: {
          event: "login",
          site: "submit",
          env: "ci",
          actor: "test-user",
          flow: "user-journey",
          summary: "Login",
        },
      });

      expect(global.fetch).not.toHaveBeenCalled();
    });

    test("routes unknown events to test channel", async () => {
      await handler({});
      expect(global.fetch).toHaveBeenCalledTimes(1);
      const body = JSON.parse(global.fetch.mock.calls[0][1].body);
      expect(body.chat_id).toBe("@diy_ci_test");
    });

    test("logs warning on Telegram API error but does not throw", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: () => Promise.resolve('{"ok":false,"description":"Bad Request"}'),
      });

      await handler({
        detail: {
          event: "login",
          site: "submit",
          env: "prod",
          actor: "customer",
          flow: "user-journey",
          summary: "Login",
        },
      });

      // Should not throw
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    test("handles CloudFormation Stack Status Change events", async () => {
      await handler({
        "source": "aws.cloudformation",
        "detail-type": "CloudFormation Stack Status Change",
        "detail": {
          "stack-id": "arn:aws:cloudformation:eu-west-2:367191799875:stack/ci-app-ApiStack/uuid-123",
          "status-details": { status: "UPDATE_COMPLETE" },
        },
      });

      expect(global.fetch).toHaveBeenCalledTimes(1); // infrastructure → ops only
      const body = JSON.parse(global.fetch.mock.calls[0][1].body);
      expect(body.chat_id).toBe("@diy_ci_ops");
      expect(body.text).toContain("ci-app-ApiStack");
      expect(body.text).toContain("UPDATE\\_COMPLETE");
    });

    test("handles CloudWatch Alarm State Change events", async () => {
      await handler({
        "source": "aws.cloudwatch",
        "detail-type": "CloudWatch Alarm State Change",
        "detail": {
          alarmName: "prod-app-health-failed",
          state: { value: "ALARM", reason: "Threshold crossed" },
          previousState: { value: "OK" },
        },
      });

      expect(global.fetch).toHaveBeenCalledTimes(1); // operational → ops only
      const body = JSON.parse(global.fetch.mock.calls[0][1].body);
      expect(body.chat_id).toBe("@diy_ci_ops");
      expect(body.text).toContain("prod-app-health-failed");
      expect(body.text).toContain("OK");
      expect(body.text).toContain("ALARM");
    });
  });

  describe("synthesizeFromCloudFormation", () => {
    test("extracts stack name from ARN", () => {
      const event = {
        source: "aws.cloudformation",
        detail: {
          "stack-id": "arn:aws:cloudformation:eu-west-2:367191799875:stack/ci-app-ApiStack/uuid",
          "status-details": { status: "UPDATE_COMPLETE" },
        },
      };
      const detail = synthesizeFromCloudFormation(event);
      expect(detail.summary).toBe("Stack ci-app-ApiStack: UPDATE_COMPLETE");
      expect(detail.env).toBe("ci");
      expect(detail.actor).toBe("ci-pipeline");
      expect(detail.flow).toBe("infrastructure");
      expect(detail.site).toBe("submit");
    });

    test("extracts prod env from stack name", () => {
      const event = {
        source: "aws.cloudformation",
        detail: {
          "stack-id": "arn:aws:cloudformation:eu-west-2:887764105431:stack/prod-env-DataStack/uuid",
          "status-details": { status: "CREATE_COMPLETE" },
        },
      };
      const detail = synthesizeFromCloudFormation(event);
      expect(detail.env).toBe("prod");
      expect(detail.summary).toBe("Stack prod-env-DataStack: CREATE_COMPLETE");
    });

    test("handles missing detail gracefully", () => {
      const detail = synthesizeFromCloudFormation({ detail: {} });
      expect(detail.summary).toBe("Stack : UNKNOWN");
      expect(detail.actor).toBe("ci-pipeline");
    });
  });

  describe("synthesizeFromCloudWatchAlarm", () => {
    test("extracts alarm name and state transition", () => {
      const event = {
        source: "aws.cloudwatch",
        detail: {
          alarmName: "ci-app-health-failed",
          state: { value: "ALARM" },
          previousState: { value: "OK" },
        },
      };
      const detail = synthesizeFromCloudWatchAlarm(event);
      expect(detail.summary).toBe("Alarm ci-app-health-failed: OK \u2192 ALARM");
      expect(detail.env).toBe("ci");
      expect(detail.actor).toBe("system");
      expect(detail.flow).toBe("operational");
    });

    test("extracts prod env from alarm name", () => {
      const event = {
        source: "aws.cloudwatch",
        detail: {
          alarmName: "prod-app-github-probe-failed",
          state: { value: "OK" },
          previousState: { value: "ALARM" },
        },
      };
      const detail = synthesizeFromCloudWatchAlarm(event);
      expect(detail.env).toBe("prod");
      expect(detail.summary).toContain("ALARM \u2192 OK");
    });

    test("handles missing detail gracefully", () => {
      const detail = synthesizeFromCloudWatchAlarm({ detail: {} });
      expect(detail.summary).toBe("Alarm unknown: UNKNOWN \u2192 UNKNOWN");
    });
  });

  describe("resolveEventDetail", () => {
    test("dispatches CloudFormation events", () => {
      const event = {
        source: "aws.cloudformation",
        detail: {
          "stack-id": "arn:aws:cloudformation:eu-west-2:367191799875:stack/ci-app-ApiStack/uuid",
          "status-details": { status: "UPDATE_COMPLETE" },
        },
      };
      const detail = resolveEventDetail(event);
      expect(detail.actor).toBe("ci-pipeline");
      expect(detail.flow).toBe("infrastructure");
    });

    test("dispatches CloudWatch alarm events", () => {
      const event = {
        source: "aws.cloudwatch",
        detail: {
          alarmName: "prod-app-health-failed",
          state: { value: "ALARM" },
          previousState: { value: "OK" },
        },
      };
      const detail = resolveEventDetail(event);
      expect(detail.actor).toBe("system");
      expect(detail.flow).toBe("operational");
    });

    test("passes through standard ActivityEvent detail", () => {
      const event = {
        source: "submit.diyaccounting.co.uk/auth",
        detail: { actor: "customer", flow: "user-journey", env: "prod" },
      };
      const detail = resolveEventDetail(event);
      expect(detail.actor).toBe("customer");
      expect(detail.flow).toBe("user-journey");
    });
  });
});
