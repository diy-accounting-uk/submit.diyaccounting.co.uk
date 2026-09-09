// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/bedrockBudgetAlertForward.test.js

import { describe, test, expect, vi, beforeEach } from "vitest";

const mockPublishActivityEvent = vi.fn().mockResolvedValue(undefined);
vi.mock("@app/lib/activityAlert.js", () => ({
  publishActivityEvent: (...args) => mockPublishActivityEvent(...args),
}));

import { handler, parseBudgetSnsRecord, summarizeBudgetAlert } from "@app/functions/ops/bedrockBudgetAlertForward.js";

function snsEvent(records) {
  return {
    Records: records.map((sns) => ({ EventSource: "aws:sns", Sns: sns })),
  };
}

describe("functions/ops/bedrockBudgetAlertForward", () => {
  beforeEach(() => {
    mockPublishActivityEvent.mockClear();
  });

  describe("parseBudgetSnsRecord", () => {
    test("extracts subject and message from an SNS record", () => {
      const parsed = parseBudgetSnsRecord({
        Sns: { Subject: "AWS Budgets: prod-env-bedrock-daily has exceeded your alert threshold", Message: "Body text" },
      });
      expect(parsed).toEqual({
        subject: "AWS Budgets: prod-env-bedrock-daily has exceeded your alert threshold",
        message: "Body text",
      });
    });

    test("returns null when the record carries no message", () => {
      expect(parseBudgetSnsRecord({ Sns: {} })).toBeNull();
      expect(parseBudgetSnsRecord({})).toBeNull();
    });
  });

  describe("summarizeBudgetAlert", () => {
    test("prefers the subject line when present", () => {
      const summary = summarizeBudgetAlert({ subject: "AWS Budgets: prod-env-bedrock-daily exceeded", message: "line one\nline two" });
      expect(summary).toBe("AWS Budgets: prod-env-bedrock-daily exceeded");
    });

    test("falls back to the first line of the message when there is no subject", () => {
      const summary = summarizeBudgetAlert({ subject: "", message: "Your budget has exceeded its threshold.\nMore detail follows." });
      expect(summary).toBe("Your budget has exceeded its threshold.");
    });
  });

  describe("handler", () => {
    test("publishes one ActivityEvent per notification record", async () => {
      const event = snsEvent([
        { Subject: "AWS Budgets: prod-env-bedrock-daily exceeded", Message: "Body one" },
        { Subject: "AWS Budgets: prod-env-bedrock-daily exceeded again", Message: "Body two" },
      ]);
      const result = await handler(event);

      expect(result.published).toBe(2);
      expect(mockPublishActivityEvent).toHaveBeenCalledTimes(2);
    });

    test("the event carries flow: operational and the full message as detail", async () => {
      const event = snsEvent([{ Subject: "AWS Budgets: prod-env-bedrock-daily exceeded", Message: "Full body text" }]);
      await handler(event);

      const call = mockPublishActivityEvent.mock.calls[0][0];
      expect(call.flow).toBe("operational");
      expect(call.event).toBe("bedrock-budget-alert");
      expect(call.summary).toBe("AWS Budgets: prod-env-bedrock-daily exceeded");
      expect(call.detail.message).toBe("Full body text");
    });

    test("a record with no message is skipped", async () => {
      const event = snsEvent([{}]);
      const result = await handler(event);

      expect(result.published).toBe(0);
      expect(mockPublishActivityEvent).not.toHaveBeenCalled();
    });

    test("no records published produces an empty result without throwing", async () => {
      const result = await handler({ Records: [] });
      expect(result.published).toBe(0);
      expect(mockPublishActivityEvent).not.toHaveBeenCalled();
    });
  });
});
