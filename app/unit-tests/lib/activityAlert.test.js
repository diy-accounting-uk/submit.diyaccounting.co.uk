// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/unit-tests/lib/activityAlert.test.js

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

const mockSend = vi.fn().mockResolvedValue({});
vi.mock("@aws-sdk/client-eventbridge", () => ({
  EventBridgeClient: class {
    send(...args) {
      return mockSend(...args);
    }
  },
  PutEventsCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
}));

import {
  classifyActor,
  classifyFlow,
  maskEmail,
  maskVrn,
  publishActivityEvent,
  publishActivityFailureEvent,
  resolveActivityBusRegion,
  resolveActorClass,
} from "@app/lib/activityAlert.js";
import { context } from "@app/lib/logger.js";
import { initializeSalt, hashSub } from "@app/services/subHasher.js";

describe("lib/activityAlert", () => {
  describe("classifyActor", () => {
    test("returns 'customer' for normal email addresses", () => {
      expect(classifyActor("user@example.com")).toBe("customer");
      expect(classifyActor("alice@gmail.com")).toBe("customer");
    });

    test("returns 'test-user' for @test.diyaccounting.co.uk emails", () => {
      expect(classifyActor("test-123@test.diyaccounting.co.uk")).toBe("test-user");
    });

    test("returns 'test-user' for cognito-native auth method", () => {
      expect(classifyActor("user@example.com", "cognito-native")).toBe("test-user");
    });

    test("returns 'synthetic' for synthetic email patterns", () => {
      expect(classifyActor("synthetic-abc@example.com")).toBe("synthetic");
      expect(classifyActor("user+synthetic@example.com")).toBe("synthetic");
    });

    test("returns 'system' when email is not provided", () => {
      expect(classifyActor(null)).toBe("system");
      expect(classifyActor(undefined)).toBe("system");
      expect(classifyActor("")).toBe("system");
    });

    test("test-user domain takes priority over synthetic prefix", () => {
      expect(classifyActor("synthetic-abc@test.diyaccounting.co.uk")).toBe("test-user");
    });
  });

  describe("classifyFlow", () => {
    test("returns 'user-journey' by default", () => {
      expect(classifyFlow()).toBe("user-journey");
      expect(classifyFlow(null)).toBe("user-journey");
      expect(classifyFlow("browser")).toBe("user-journey");
    });

    test("returns 'ci-pipeline' for CI-related sources", () => {
      expect(classifyFlow("ci-test")).toBe("ci-pipeline");
      expect(classifyFlow("github-actions")).toBe("ci-pipeline");
      expect(classifyFlow("pipeline-deploy")).toBe("ci-pipeline");
    });

    test("returns 'infrastructure' for infrastructure sources", () => {
      expect(classifyFlow("cloudformation-event")).toBe("infrastructure");
      expect(classifyFlow("deploy-hook")).toBe("infrastructure");
    });

    test("returns 'operational' for operational sources", () => {
      expect(classifyFlow("schedule-rule")).toBe("operational");
      expect(classifyFlow("cron-job")).toBe("operational");
      expect(classifyFlow("reconcile-task")).toBe("operational");
    });
  });

  describe("maskEmail", () => {
    test("masks email correctly", () => {
      expect(maskEmail("user@example.com")).toBe("u***@example.com");
      expect(maskEmail("alice@gmail.com")).toBe("a***@gmail.com");
    });

    test("handles edge cases", () => {
      expect(maskEmail(null)).toBe("***");
      expect(maskEmail(undefined)).toBe("***");
      expect(maskEmail("")).toBe("***");
      expect(maskEmail("nodomain")).toBe("***");
      expect(maskEmail("@domain.com")).toBe("***");
    });
  });

  describe("maskVrn", () => {
    test("masks VRN correctly", () => {
      expect(maskVrn("123456789")).toBe("***6789");
      expect(maskVrn("GB123456789")).toBe("***6789");
    });

    test("handles short VRNs", () => {
      expect(maskVrn("1234")).toBe("***1234");
      expect(maskVrn("12")).toBe("***12");
    });

    test("handles edge cases", () => {
      expect(maskVrn(null)).toBe("***");
      expect(maskVrn(undefined)).toBe("***");
      expect(maskVrn("")).toBe("***");
    });
  });

  describe("publishActivityEvent", () => {
    const originalEnv = process.env.ACTIVITY_BUS_NAME;

    beforeEach(() => {
      mockSend.mockClear();
    });

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env.ACTIVITY_BUS_NAME;
      } else {
        process.env.ACTIVITY_BUS_NAME = originalEnv;
      }
    });

    test("is a no-op when ACTIVITY_BUS_NAME is not set", async () => {
      delete process.env.ACTIVITY_BUS_NAME;
      // Should not throw
      await publishActivityEvent({ event: "test-event", summary: "Test" });
    });

    test("does not throw on EventBridge failure", async () => {
      process.env.ACTIVITY_BUS_NAME = "test-bus";
      mockSend.mockRejectedValueOnce(new Error("AWS error"));
      await publishActivityEvent({ event: "test-event", summary: "Test" });
    });

    test("includes requestId from context in event detail", async () => {
      process.env.ACTIVITY_BUS_NAME = "test-bus";
      await context.run(new Map(), async () => {
        context.set("requestId", "req-abc-123");
        await publishActivityEvent({ event: "login", summary: "Login" });
      });

      expect(mockSend).toHaveBeenCalledTimes(1);
      const cmd = mockSend.mock.calls[0][0];
      const detail = JSON.parse(cmd.input.Entries[0].Detail);
      expect(detail.requestId).toBe("req-abc-123");
    });

    test("defaults actor to test-user when requestId has test_ prefix and no explicit actor", async () => {
      process.env.ACTIVITY_BUS_NAME = "test-bus";
      await context.run(new Map(), async () => {
        context.set("requestId", "test_abc-123");
        await publishActivityEvent({ event: "checkout", summary: "Checkout" });
      });

      const detail = JSON.parse(mockSend.mock.calls[0][0].input.Entries[0].Detail);
      expect(detail.actor).toBe("test-user");
      expect(detail.requestId).toBe("test_abc-123");
    });

    test("does not override explicit actor even with test_ requestId prefix", async () => {
      process.env.ACTIVITY_BUS_NAME = "test-bus";
      await context.run(new Map(), async () => {
        context.set("requestId", "test_abc-123");
        await publishActivityEvent({ event: "checkout", summary: "Checkout", actor: "customer" });
      });

      const detail = JSON.parse(mockSend.mock.calls[0][0].input.Entries[0].Detail);
      expect(detail.actor).toBe("customer");
    });

    test("defaults actor to customer when no requestId prefix and no explicit actor (fail-safe → LIVE)", async () => {
      process.env.ACTIVITY_BUS_NAME = "test-bus";
      await context.run(new Map(), async () => {
        context.set("requestId", "normal-request-id");
        await publishActivityEvent({ event: "login", summary: "Login" });
      });

      const detail = JSON.parse(mockSend.mock.calls[0][0].input.Entries[0].Detail);
      expect(detail.actor).toBe("customer");
    });

    test("defaults flow to user-journey when userSub is in context", async () => {
      process.env.ACTIVITY_BUS_NAME = "test-bus";
      await context.run(new Map(), async () => {
        context.set("requestId", "normal-request-id");
        context.set("userSub", "b6b252d4-9001-708e-7778-1264e34ac341");
        await publishActivityEvent({ event: "vat-return-submitted", summary: "VAT return submitted" });
      });

      const detail = JSON.parse(mockSend.mock.calls[0][0].input.Entries[0].Detail);
      expect(detail.actor).toBe("customer");
      expect(detail.flow).toBe("user-journey");
    });

    test("defaults flow to unknown when no userSub in context", async () => {
      process.env.ACTIVITY_BUS_NAME = "test-bus";
      await context.run(new Map(), async () => {
        context.set("requestId", "normal-request-id");
        await publishActivityEvent({ event: "login", summary: "Login" });
      });

      const detail = JSON.parse(mockSend.mock.calls[0][0].input.Entries[0].Detail);
      expect(detail.flow).toBe("unknown");
    });

    test("omits requestId from detail when not in context (still defaults to customer)", async () => {
      process.env.ACTIVITY_BUS_NAME = "test-bus";
      await publishActivityEvent({ event: "login", summary: "Login" });

      const detail = JSON.parse(mockSend.mock.calls[0][0].input.Entries[0].Detail);
      expect(detail.requestId).toBeUndefined();
      expect(detail.actor).toBe("customer");
    });

    test("carries the hashed sub from an explicit userSub, and never the raw sub", async () => {
      process.env.USER_SUB_HASH_SALT = '{"current":"v1","versions":{"v1":"test-salt-for-unit-tests"}}';
      await initializeSalt();
      process.env.ACTIVITY_BUS_NAME = "test-bus";

      await publishActivityEvent({ event: "vat-return-submitted", summary: "VAT return submitted", userSub: "explicit-sub-123" });

      const rawDetail = mockSend.mock.calls[0][0].input.Entries[0].Detail;
      expect(rawDetail).not.toContain("explicit-sub-123");
      expect(JSON.parse(rawDetail).hashedSub).toBe(hashSub("explicit-sub-123"));
    });

    test("falls back to the userSub in context when no explicit userSub is passed", async () => {
      process.env.USER_SUB_HASH_SALT = '{"current":"v1","versions":{"v1":"test-salt-for-unit-tests"}}';
      await initializeSalt();
      process.env.ACTIVITY_BUS_NAME = "test-bus";

      await context.run(new Map(), async () => {
        context.set("userSub", "context-sub-456");
        await publishActivityEvent({ event: "vat-return-submitted", summary: "VAT return submitted" });
      });

      const detail = JSON.parse(mockSend.mock.calls[0][0].input.Entries[0].Detail);
      expect(detail.hashedSub).toBe(hashSub("context-sub-456"));
    });

    test("omits the hashed sub when no sub is available", async () => {
      process.env.ACTIVITY_BUS_NAME = "test-bus";
      await publishActivityEvent({ event: "new-session", summary: "New session" });

      const detail = JSON.parse(mockSend.mock.calls[0][0].input.Entries[0].Detail);
      expect(detail.hashedSub).toBeUndefined();
    });
  });

  describe("resolveActivityBusRegion", () => {
    const originalActivityBusRegion = process.env.ACTIVITY_BUS_REGION;
    const originalAwsRegion = process.env.AWS_REGION;

    afterEach(() => {
      if (originalActivityBusRegion === undefined) {
        delete process.env.ACTIVITY_BUS_REGION;
      } else {
        process.env.ACTIVITY_BUS_REGION = originalActivityBusRegion;
      }
      if (originalAwsRegion === undefined) {
        delete process.env.AWS_REGION;
      } else {
        process.env.AWS_REGION = originalAwsRegion;
      }
    });

    test("comes from ACTIVITY_BUS_REGION when set", () => {
      process.env.ACTIVITY_BUS_REGION = "us-east-1";
      process.env.AWS_REGION = "eu-west-2";
      expect(resolveActivityBusRegion()).toBe("us-east-1");
    });

    test("falls back to AWS_REGION when ACTIVITY_BUS_REGION is not set", () => {
      delete process.env.ACTIVITY_BUS_REGION;
      process.env.AWS_REGION = "eu-west-2";
      expect(resolveActivityBusRegion()).toBe("eu-west-2");
    });

    test("falls back to eu-west-2 when neither is set", () => {
      delete process.env.ACTIVITY_BUS_REGION;
      delete process.env.AWS_REGION;
      expect(resolveActivityBusRegion()).toBe("eu-west-2");
    });
  });

  describe("resolveActorClass", () => {
    test("returns the explicit actor when one is supplied", async () => {
      await context.run(new Map(), async () => {
        context.set("requestId", "test_abc-123");
        expect(resolveActorClass("synthetic")).toBe("synthetic");
      });
    });

    test("returns test-user for a test_ prefixed requestId", async () => {
      await context.run(new Map(), async () => {
        context.set("requestId", "test_abc-123");
        expect(resolveActorClass()).toBe("test-user");
      });
    });

    test("returns customer for any other requestId", async () => {
      await context.run(new Map(), async () => {
        context.set("requestId", "abc-123");
        expect(resolveActorClass()).toBe("customer");
      });
      expect(resolveActorClass()).toBe("customer");
    });
  });

  describe("publishActivityFailureEvent", () => {
    const originalEnv = process.env.ACTIVITY_BUS_NAME;

    beforeEach(() => {
      mockSend.mockClear();
      process.env.ACTIVITY_BUS_NAME = "test-bus";
    });

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env.ACTIVITY_BUS_NAME;
      } else {
        process.env.ACTIVITY_BUS_NAME = originalEnv;
      }
    });

    test("marks the event as a failure and carries the failure category", async () => {
      await publishActivityFailureEvent({
        event: "vat-return-failed",
        summary: "VAT return rejected by HMRC",
        failure: "hmrc-rejected",
        detail: { hmrcStatus: 400 },
      });

      const entry = mockSend.mock.calls[0][0].input.Entries[0];
      expect(entry.DetailType).toBe("ActivityEvent");
      const detail = JSON.parse(entry.Detail);
      expect(detail.event).toBe("vat-return-failed");
      expect(detail.outcome).toBe("failure");
      expect(detail.failure).toBe("hmrc-rejected");
      expect(detail.hmrcStatus).toBe(400);
    });

    test("carries the hashed sub and never the raw sub", async () => {
      process.env.USER_SUB_HASH_SALT = '{"current":"v1","versions":{"v1":"test-salt-for-unit-tests"}}';
      await initializeSalt();

      await publishActivityFailureEvent({
        event: "vat-return-failed",
        summary: "VAT return failed unexpectedly",
        failure: "internal-error",
        userSub: "user-sub-abc",
      });

      const rawDetail = mockSend.mock.calls[0][0].input.Entries[0].Detail;
      expect(rawDetail).not.toContain("user-sub-abc");
      expect(JSON.parse(rawDetail).hashedSub).toBe(hashSub("user-sub-abc"));
    });

    test("falls back to the userSub in context when none is passed", async () => {
      process.env.USER_SUB_HASH_SALT = '{"current":"v1","versions":{"v1":"test-salt-for-unit-tests"}}';
      await initializeSalt();

      await context.run(new Map(), async () => {
        context.set("userSub", "context-sub");
        await publishActivityFailureEvent({
          event: "vat-return-failed",
          summary: "VAT return failed unexpectedly",
          failure: "internal-error",
        });
      });

      const detail = JSON.parse(mockSend.mock.calls[0][0].input.Entries[0].Detail);
      expect(detail.hashedSub).toBe(hashSub("context-sub"));
    });

    test("omits the hashed sub when no sub is available", async () => {
      await publishActivityFailureEvent({
        event: "vat-return-failed",
        summary: "VAT return blocked: no entitlement",
        failure: "access-denied",
      });

      const detail = JSON.parse(mockSend.mock.calls[0][0].input.Entries[0].Detail);
      expect(detail.hashedSub).toBeUndefined();
    });

    test("routes to test-user when the requestId marks a test run", async () => {
      await context.run(new Map(), async () => {
        context.set("requestId", "test_run-1");
        await publishActivityFailureEvent({
          event: "vat-return-failed",
          summary: "VAT return rejected by HMRC",
          failure: "hmrc-rejected",
        });
      });

      const detail = JSON.parse(mockSend.mock.calls[0][0].input.Entries[0].Detail);
      expect(detail.actor).toBe("test-user");
    });
  });
});
