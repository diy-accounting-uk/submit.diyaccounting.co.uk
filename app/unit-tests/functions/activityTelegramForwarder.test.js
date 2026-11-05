// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

const mockSsmSend = vi.fn();
vi.mock("@aws-sdk/client-ssm", () => ({
  SSMClient: class {
    send(...args) {
      return mockSsmSend(...args);
    }
  },
  GetParameterCommand: class GetParameterCommand {
    constructor(input) {
      this.input = input;
    }
  },
}));

import {
  escapeTelegramMarkdown,
  formatMessage,
  resolveTargetChatIds,
  resolveRoute,
  resolveChatConfig,
  synthesizeFromCloudFormation,
  synthesizeFromCloudWatchAlarm,
  synthesizeFromSns,
  resolveEventDetail,
  handler,
} from "@app/functions/ops/activityTelegramForwarder.js";

const mockEventBridgeSend = vi.fn();
vi.mock("@aws-sdk/client-eventbridge", () => ({
  EventBridgeClient: class {
    send(...args) {
      return mockEventBridgeSend(...args);
    }
  },
  PutEventsCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
}));

import { publishActivityFailureEvent } from "@app/lib/activityAlert.js";

async function publishedDetail(publish) {
  process.env.ACTIVITY_BUS_NAME = "test-bus";
  mockEventBridgeSend.mockReset().mockResolvedValue({});
  await publish();
  return JSON.parse(mockEventBridgeSend.mock.calls[0][0].input.Entries[0].Detail);
}

const CHAT_CONFIG = {
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

    test("escapes a literal backslash so it cannot unescape the following character", () => {
      expect(escapeTelegramMarkdown("\\*bold*")).toBe("\\\\\\*bold\\*");
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
      process.env.TELEGRAM_LIVE_CHAT_ID = "@diy_live";
      process.env.TELEGRAM_OPS_CHAT_ID = "@diy_ops";
      expect(resolveChatConfig()).toEqual({ live: "@diy_live", ops: "@diy_ops" });
    });

    test("returns empty strings when env vars are not set", () => {
      delete process.env.TELEGRAM_LIVE_CHAT_ID;
      delete process.env.TELEGRAM_OPS_CHAT_ID;
      expect(resolveChatConfig()).toEqual({ live: "", ops: "" });
    });
  });

  describe("resolveTargetChatIds", () => {
    const LIVE = ["@diy_ci_live"];
    const OPS = ["@diy_ci_ops"];
    const customer = (event, extra = {}) => ({ event, actor: "customer", flow: "user-journey", ...extra });

    describe("live chat, customer events in the set", () => {
      test.each(["subscription-activated", "pass-redeemed", "support-ticket", "vat-return-submitted"])(
        "sends %s from a customer",
        (event) => {
          expect(resolveTargetChatIds(customer(event), CHAT_CONFIG)).toEqual(LIVE);
        },
      );

      test.each(["subscription-activated", "pass-redeemed", "support-ticket", "vat-return-submitted"])(
        "refuses %s from a test-user, probe, operator, system, synthetic or visitor",
        (event) => {
          for (const actor of ["test-user", "probe", "operator", "system", "synthetic", "visitor"]) {
            expect(resolveTargetChatIds({ event, actor, flow: "user-journey" }, CHAT_CONFIG)).toEqual([]);
          }
        },
      );

      test("refuses a customer event outside the set", () => {
        for (const event of [
          "login",
          "activity-started",
          "vat-obligations-queried",
          "consent-answered",
          "bundle-granted",
          "pass-generated",
          "subscription-renewed",
          "logout",
          "session-resumed",
          "hmrc-token-exchange-failed",
        ]) {
          expect(resolveTargetChatIds(customer(event), CHAT_CONFIG)).toEqual([]);
        }
      });

      test("refuses an event with no actor", () => {
        expect(resolveTargetChatIds({}, CHAT_CONFIG)).toEqual([]);
      });

      test("refuses a customer event whose requestId carries the test_ prefix", () => {
        expect(resolveTargetChatIds(customer("pass-redeemed", { requestId: "test_abc-123" }), CHAT_CONFIG)).toEqual([]);
      });

      test("does not depend on the env field", () => {
        const ci = customer("pass-redeemed", { env: "ci" });
        const prod = customer("pass-redeemed", { env: "prod" });
        expect(resolveTargetChatIds(ci, CHAT_CONFIG)).toEqual(resolveTargetChatIds(prod, CHAT_CONFIG));
      });

      test("returns empty when the live chat is not configured", () => {
        expect(resolveTargetChatIds(customer("pass-redeemed"), { live: "", ops: "@diy_ci_ops" })).toEqual([]);
      });
    });

    describe("failure mark", () => {
      test("sends any customer event with outcome failure to live", () => {
        expect(resolveTargetChatIds(customer("vat-return-failed", { outcome: "failure", failure: "hmrc-rejected" }), CHAT_CONFIG)).toEqual(
          LIVE,
        );
        expect(resolveTargetChatIds(customer("payment-failed", { outcome: "failure" }), CHAT_CONFIG)).toEqual(LIVE);
      });

      test("refuses a failure from a test-user, probe, operator or visitor", () => {
        for (const actor of ["test-user", "probe", "operator", "visitor", "system"]) {
          expect(
            resolveTargetChatIds({ event: "vat-return-failed", actor, flow: "user-journey", outcome: "failure" }, CHAT_CONFIG),
          ).toEqual([]);
        }
      });

      test("refuses a customer event whose outcome is not failure", () => {
        expect(resolveTargetChatIds(customer("vat-return-failed", { outcome: "success" }), CHAT_CONFIG)).toEqual([]);
      });

      test("refuses a failure whose requestId carries the test_ prefix", () => {
        expect(resolveTargetChatIds(customer("vat-return-failed", { outcome: "failure", requestId: "test_x" }), CHAT_CONFIG)).toEqual([]);
      });
    });

    describe("ops chat", () => {
      test("sends alarm state changes and cost alerts", () => {
        expect(resolveTargetChatIds({ event: "alarm-state-change", actor: "system", flow: "operational" }, CHAT_CONFIG)).toEqual(OPS);
        expect(resolveTargetChatIds({ event: "cost-alert", actor: "system", flow: "operational" }, CHAT_CONFIG)).toEqual(OPS);
      });

      test.each(["CREATE_FAILED", "UPDATE_FAILED", "DELETE_FAILED", "UPDATE_ROLLBACK_COMPLETE"])(
        "sends a stack change with status %s",
        (stackStatus) => {
          expect(
            resolveTargetChatIds({ event: "stack-status-change", stackStatus, actor: "ci-pipeline", flow: "infrastructure" }, CHAT_CONFIG),
          ).toEqual(OPS);
        },
      );

      test.each(["CREATE_COMPLETE", "UPDATE_COMPLETE", "DELETE_COMPLETE", "ROLLBACK_COMPLETE", "UPDATE_IN_PROGRESS", "UNKNOWN"])(
        "refuses a stack change with status %s",
        (stackStatus) => {
          expect(
            resolveTargetChatIds({ event: "stack-status-change", stackStatus, actor: "ci-pipeline", flow: "infrastructure" }, CHAT_CONFIG),
          ).toEqual([]);
        },
      );

      test("refuses other operational and infrastructure events", () => {
        for (const event of ["capacity-reconciled", "scan-detected", "scan-404-detected", "deployment"]) {
          expect(resolveTargetChatIds({ event, actor: "system", flow: "operational" }, CHAT_CONFIG)).toEqual([]);
          expect(resolveTargetChatIds({ event, actor: "ci-pipeline", flow: "infrastructure" }, CHAT_CONFIG)).toEqual([]);
        }
      });

      test("returns empty when the ops chat is not configured", () => {
        expect(resolveTargetChatIds({ event: "alarm-state-change" }, { live: "@diy_ci_live", ops: "" })).toEqual([]);
      });
    });

    test("resolveRoute names the chat for an allowed event and null otherwise", () => {
      expect(resolveRoute({ event: "cost-alert" })).toBe("ops");
      expect(resolveRoute(customer("support-ticket"))).toBe("live");
      expect(resolveRoute(customer("login"))).toBeNull();
    });
  });

  describe("handler", () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
      process.env.TELEGRAM_BOT_TOKEN = "test-bot-token";
      process.env.TELEGRAM_LIVE_CHAT_ID = "@diy_ci_live";
      process.env.TELEGRAM_OPS_CHAT_ID = "@diy_ci_ops";
      process.env.ENVIRONMENT_NAME = "test";
      global.fetch = vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve("{}") });
      mockSsmSend.mockReset();
      mockSsmSend.mockRejectedValue(Object.assign(new Error("Parameter not found"), { name: "ParameterNotFound" }));
    });

    afterEach(() => {
      process.env = { ...originalEnv };
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    test("sends message to live channel for customer event", async () => {
      await handler({
        detail: {
          event: "pass-redeemed",
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

    test("sends to ops channel for a cost alert", async () => {
      await handler({
        detail: {
          event: "cost-alert",
          site: "submit",
          env: "ci",
          actor: "system",
          flow: "operational",
          summary: "Budget: ci over 85%",
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
          event: "pass-redeemed",
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
          event: "cost-alert",
          site: "submit",
          env: "ci",
          actor: "system",
          flow: "operational",
          summary: "Budget",
        },
      });

      expect(global.fetch).not.toHaveBeenCalled();
    });

    test("sends nothing for a test-user event", async () => {
      await handler({
        detail: { event: "pass-redeemed", site: "submit", env: "ci", actor: "test-user", flow: "user-journey", summary: "Pass redeemed" },
      });

      expect(global.fetch).not.toHaveBeenCalled();
    });

    test("sends nothing for an event outside the set", async () => {
      await handler({ detail: { event: "login", actor: "customer", flow: "user-journey", summary: "Login" } });
      await handler({});

      expect(global.fetch).not.toHaveBeenCalled();
    });

    test("sends a customer failure published by publishActivityFailureEvent, read in its real shape", async () => {
      const detail = await publishedDetail(() =>
        publishActivityFailureEvent({
          event: "vat-return-failed",
          summary: "VAT return rejected by HMRC",
          failure: "hmrc-rejected",
          actor: "customer",
          detail: { hmrcStatus: 400 },
        }),
      );
      expect(detail.outcome).toBe("failure");

      await handler({ "source": "diy.submit", "detail-type": "ActivityEvent", detail });

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(JSON.parse(global.fetch.mock.calls[0][1].body).chat_id).toBe("@diy_ci_live");
    });

    test("sends nothing for a failure published by a test-user or operator", async () => {
      for (const actor of ["test-user", "operator"]) {
        const detail = await publishedDetail(() =>
          publishActivityFailureEvent({ event: "vat-return-failed", summary: "Rejected", failure: "hmrc-rejected", actor }),
        );
        await handler({ "source": "diy.submit", "detail-type": "ActivityEvent", detail });
      }

      expect(global.fetch).not.toHaveBeenCalled();
    });

    test("logs warning on Telegram API error but does not throw", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: () => Promise.resolve('{"ok":false,"description":"Bad Request"}'),
      });

      await handler({
        detail: {
          event: "pass-redeemed",
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

    test("retries once after a 429 with a retry_after inside the cap, and succeeds", async () => {
      vi.useFakeTimers();
      const tooManyRequests = {
        ok: false,
        status: 429,
        text: () =>
          Promise.resolve('{"ok":false,"error_code":429,"description":"Too Many Requests: retry after 2","parameters":{"retry_after":2}}'),
      };
      const succeeds = { ok: true, status: 200, text: () => Promise.resolve("{}") };
      global.fetch = vi.fn().mockResolvedValueOnce(tooManyRequests).mockResolvedValueOnce(succeeds);

      const handlerPromise = handler({
        detail: {
          event: "pass-redeemed",
          site: "submit",
          env: "prod",
          actor: "customer",
          flow: "user-journey",
          summary: "Login",
        },
      });

      await vi.advanceTimersByTimeAsync(2000);
      await handlerPromise;

      expect(global.fetch).toHaveBeenCalledTimes(2);
      const [firstUrl] = global.fetch.mock.calls[0];
      const [secondUrl] = global.fetch.mock.calls[1];
      expect(secondUrl).toBe(firstUrl);
    });

    test("does not retry a second 429, and still warns without throwing", async () => {
      vi.useFakeTimers();
      const tooManyRequests = (retryAfter) => ({
        ok: false,
        status: 429,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              ok: false,
              error_code: 429,
              description: `Too Many Requests: retry after ${retryAfter}`,
              parameters: { retry_after: retryAfter },
            }),
          ),
      });
      global.fetch = vi.fn().mockResolvedValueOnce(tooManyRequests(2)).mockResolvedValueOnce(tooManyRequests(2));

      const handlerPromise = handler({
        detail: {
          event: "pass-redeemed",
          site: "submit",
          env: "prod",
          actor: "customer",
          flow: "user-journey",
          summary: "Login",
        },
      });

      await vi.advanceTimersByTimeAsync(2000);
      await handlerPromise;

      // One retry, no more: two fetch calls total, not three.
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    test("does not retry a 429 whose retry_after exceeds the cap", async () => {
      const tooManyRequests = {
        ok: false,
        status: 429,
        text: () =>
          Promise.resolve('{"ok":false,"error_code":429,"description":"Too Many Requests: retry after 5","parameters":{"retry_after":5}}'),
      };
      global.fetch = vi.fn().mockResolvedValue(tooManyRequests);

      await handler({
        detail: {
          event: "pass-redeemed",
          site: "submit",
          env: "prod",
          actor: "customer",
          flow: "user-journey",
          summary: "Login",
        },
      });

      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    test("aborts a Telegram request that runs past the per-attempt timeout, so the invocation does not hang until the Lambda's own timeout", async () => {
      vi.useFakeTimers();
      global.fetch = vi.fn().mockImplementation((url, options) => {
        return new Promise((resolve, reject) => {
          options.signal.addEventListener("abort", () => {
            const error = new Error("This operation was aborted");
            error.name = "AbortError";
            reject(error);
          });
        });
      });

      const handlerPromise = handler({
        detail: {
          event: "pass-redeemed",
          site: "submit",
          env: "prod",
          actor: "customer",
          flow: "user-journey",
          summary: "Login",
        },
      });

      await vi.advanceTimersByTimeAsync(4000);
      await handlerPromise;

      // The abort turns into a rejected send, caught by Promise.allSettled — the invocation
      // returns instead of running to the Lambda's own 10s timeout.
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    test("handles CloudFormation Stack Status Change events", async () => {
      await handler({
        "source": "aws.cloudformation",
        "detail-type": "CloudFormation Stack Status Change",
        "detail": {
          "stack-id": "arn:aws:cloudformation:eu-west-2:367191799875:stack/ci-app-ApiStack/uuid-123",
          "status-details": { status: "UPDATE_ROLLBACK_COMPLETE" },
        },
      });

      expect(global.fetch).toHaveBeenCalledTimes(1); // infrastructure → ops only
      const body = JSON.parse(global.fetch.mock.calls[0][1].body);
      expect(body.chat_id).toBe("@diy_ci_ops");
      expect(body.text).toContain("ci-app-ApiStack");
      expect(body.text).toContain("UPDATE\\_ROLLBACK\\_COMPLETE");
    });

    test("sends nothing for a successful CloudFormation stack change", async () => {
      await handler({
        "source": "aws.cloudformation",
        "detail-type": "CloudFormation Stack Status Change",
        "detail": {
          "stack-id": "arn:aws:cloudformation:eu-west-2:367191799875:stack/ci-app-ApiStack/uuid-123",
          "status-details": { status: "UPDATE_COMPLETE" },
        },
      });

      expect(global.fetch).not.toHaveBeenCalled();
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

    test("sends no Telegram message for a silenced deployment's alarm event", async () => {
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      mockSsmSend.mockImplementation((command) => {
        if (command.input?.Name === "/submit/prod/alarm-silence/a0f41c7") {
          return Promise.resolve({
            Parameter: { Value: JSON.stringify({ firstSilencedAt: new Date().toISOString(), expiresAt }) },
          });
        }
        return Promise.reject(Object.assign(new Error("Parameter not found"), { name: "ParameterNotFound" }));
      });

      await handler({
        "source": "aws.cloudwatch",
        "detail-type": "CloudWatch Alarm State Change",
        "detail": {
          alarmName: "prod-a0f41c7-app-api-5xx",
          state: { value: "ALARM", reason: "Threshold crossed" },
          previousState: { value: "OK" },
        },
      });

      expect(global.fetch).not.toHaveBeenCalled();
    });

    test("still sends other event types when a deployment's alarms are silenced", async () => {
      mockSsmSend.mockResolvedValue({
        Parameter: {
          Value: JSON.stringify({
            firstSilencedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          }),
        },
      });

      await handler({
        detail: {
          event: "pass-redeemed",
          site: "submit",
          env: "prod",
          actor: "customer",
          flow: "user-journey",
          summary: "Login",
        },
      });

      expect(global.fetch).toHaveBeenCalledTimes(1);
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
      expect(detail.stackStatus).toBe("UPDATE_COMPLETE");
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

  describe("synthesizeFromSns", () => {
    test("keeps the subject and the message's first line", () => {
      const detail = synthesizeFromSns({
        Subject: "AWS Budget Notification",
        Message: "ci budget has exceeded 85% of the budgeted amount.\nMore detail follows.",
      });
      expect(detail.summary).toBe("AWS Budget Notification: ci budget has exceeded 85% of the budgeted amount.");
      expect(detail.actor).toBe("system");
      expect(detail.flow).toBe("operational");
      expect(detail.event).toBe("cost-alert");
    });

    test("falls back to a default subject when none is given", () => {
      const detail = synthesizeFromSns({ Message: "anomaly detected" });
      expect(detail.summary).toBe("Cost alert: anomaly detected");
    });
  });

  describe("resolveEventDetail", () => {
    test("dispatches SNS-wrapped notifications", () => {
      const event = {
        Records: [{ Sns: { Subject: "Cost anomaly detected", Message: "impact $45.89" } }],
      };
      const detail = resolveEventDetail(event);
      expect(detail.flow).toBe("operational");
      expect(detail.summary).toBe("Cost anomaly detected: impact $45.89");
    });

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
