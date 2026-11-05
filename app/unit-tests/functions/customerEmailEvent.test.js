// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/customerEmailEvent.test.js

import { describe, test, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  publishActivityEvent: vi.fn(),
  publishActivityFailureEvent: vi.fn(),
  emitMetric: vi.fn(),
}));

vi.mock("@app/lib/activityAlert.js", () => ({
  publishActivityEvent: mocks.publishActivityEvent,
  publishActivityFailureEvent: mocks.publishActivityFailureEvent,
}));
vi.mock("@app/lib/emfMetrics.js", () => ({ emitMetric: mocks.emitMetric }));
vi.mock("@app/services/subHasher.js", () => ({ initializeSalt: vi.fn().mockResolvedValue(undefined) }));

import { handler } from "@app/functions/email/customerEmailEvent.js";

const tags = { kind: ["pass-redeemed"], actor: ["customer"], hashedsub: ["h1"] };

function snsEvent(message) {
  return { Records: [{ Sns: { Message: JSON.stringify(message) } }] };
}

describe("functions/email/customerEmailEvent", () => {
  beforeEach(() => vi.clearAllMocks());

  test("a permanent bounce is a failure with the tags and no recipient", async () => {
    await handler(
      snsEvent({
        eventType: "Bounce",
        bounce: { bounceType: "Permanent", bouncedRecipients: [{ emailAddress: "gone@example.com" }] },
        mail: { tags, destination: ["gone@example.com"] },
      }),
    );
    const call = mocks.publishActivityFailureEvent.mock.calls[0][0];
    expect(call).toMatchObject({
      event: "customer-email-bounced",
      failure: "bounce-permanent",
      actor: "customer",
      detail: { kind: "pass-redeemed", hashedSub: "h1" },
    });
    expect(JSON.stringify(call)).not.toContain("gone@example.com");
    expect(mocks.emitMetric).toHaveBeenCalledWith(
      expect.objectContaining({ metricName: "CustomerEmailFailure", dimensions: { Actor: "customer" } }),
    );
  });

  test("a complaint is a failure", async () => {
    await handler(snsEvent({ eventType: "Complaint", mail: { tags } }));
    expect(mocks.publishActivityFailureEvent.mock.calls[0][0]).toMatchObject({ event: "customer-email-complained", failure: "complaint" });
  });

  test("a reject and a rendering failure are failures", async () => {
    await handler(snsEvent({ eventType: "Reject", mail: { tags } }));
    await handler(snsEvent({ eventType: "Rendering Failure", mail: { tags } }));
    expect(mocks.publishActivityFailureEvent).toHaveBeenCalledTimes(2);
  });

  test("a transient bounce and a delivery delay are not failures", async () => {
    await handler(snsEvent({ eventType: "Bounce", bounce: { bounceType: "Transient" }, mail: { tags } }));
    await handler(snsEvent({ eventType: "DeliveryDelay", mail: { tags } }));
    expect(mocks.publishActivityFailureEvent).not.toHaveBeenCalled();
    expect(mocks.publishActivityEvent).toHaveBeenCalledTimes(2);
    expect(mocks.publishActivityEvent.mock.calls[0][0].event).toBe("customer-email-delayed");
  });

  test("other event types and non-JSON messages are ignored", async () => {
    await handler(snsEvent({ eventType: "Delivery", mail: { tags } }));
    await handler({ Records: [{ Sns: { Message: "not json" } }] });
    expect(mocks.publishActivityFailureEvent).not.toHaveBeenCalled();
    expect(mocks.publishActivityEvent).not.toHaveBeenCalled();
  });
});
