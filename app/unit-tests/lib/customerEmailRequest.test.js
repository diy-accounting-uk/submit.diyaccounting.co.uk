// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/lib/customerEmailRequest.test.js

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

const mockSend = vi.fn();
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

import { kindHasAccount, requestCustomerEmail } from "@app/lib/customerEmailRequest.js";
import { context } from "@app/lib/logger.js";

describe("lib/customerEmailRequest", () => {
  beforeEach(() => {
    mockSend.mockReset().mockResolvedValue({ FailedEntryCount: 0 });
    process.env.ACTIVITY_BUS_NAME = "test-bus";
  });
  afterEach(() => {
    delete process.env.ACTIVITY_BUS_NAME;
    vi.restoreAllMocks();
  });

  test("puts one CustomerEmailRequest entry shaped for the queue worker", async () => {
    const result = await requestCustomerEmail({ kind: "pass-redeemed", userSub: "sub-1", data: { bundleId: "day-guest" } });
    expect(result).toEqual({ requested: true });
    const entry = mockSend.mock.calls[0][0].input.Entries[0];
    expect(entry.EventBusName).toBe("test-bus");
    expect(entry.Source).toBe("diy.submit");
    expect(entry.DetailType).toBe("CustomerEmailRequest");
    const detail = JSON.parse(entry.Detail);
    expect(detail.userId).toBe("sub-1");
    expect(detail.requestId).toBeTruthy();
    expect(detail.payload).toMatchObject({ kind: "pass-redeemed", userSub: "sub-1", synthetic: false, data: { bundleId: "day-guest" } });
  });

  test("uses the hashed sub as the user id when there is no raw sub", async () => {
    await requestCustomerEmail({ kind: "subscription-started", to: "a@example.com", hashedSub: "h1" });
    const detail = JSON.parse(mockSend.mock.calls[0][0].input.Entries[0].Detail);
    expect(detail.userId).toBe("h1");
    expect(detail.payload.to).toBe("a@example.com");
  });

  test("keeps the request id of the running request", async () => {
    await context.run(new Map([["requestId", "req-9"]]), () => requestCustomerEmail({ kind: "pass-redeemed", userSub: "s" }));
    expect(JSON.parse(mockSend.mock.calls[0][0].input.Entries[0].Detail).requestId).toBe("req-9");
  });

  test("never carries userEmail", async () => {
    await requestCustomerEmail({ kind: "pass-redeemed", userSub: "s", userEmail: "x@example.com" });
    expect(mockSend.mock.calls[0][0].input.Entries[0].Detail).not.toContain("x@example.com");
  });

  test("returns requested false when the bus name is unset", async () => {
    delete process.env.ACTIVITY_BUS_NAME;
    expect(await requestCustomerEmail({ kind: "pass-redeemed", userSub: "s" })).toEqual({ requested: false });
    expect(mockSend).not.toHaveBeenCalled();
  });

  test("returns requested false when there is no account reference", async () => {
    expect(await requestCustomerEmail({ kind: "pass-redeemed" })).toEqual({ requested: false });
    expect(mockSend).not.toHaveBeenCalled();
  });

  test("requests a notice-digest with no account reference", async () => {
    mockSend.mockResolvedValue({ FailedEntryCount: 0 });
    const result = await requestCustomerEmail({ kind: "notice-digest", to: "ops@example.com", data: { count: 2 } });
    expect(result).toEqual({ requested: true });
    const detail = JSON.parse(mockSend.mock.calls[0][0].input.Entries[0].Detail);
    expect(detail.userId).toBeUndefined();
    expect(detail.requestId).toBeTruthy();
    expect(detail.payload).toMatchObject({ kind: "notice-digest", to: "ops@example.com" });
  });

  test("swallows a PutEvents error", async () => {
    mockSend.mockRejectedValue(new Error("boom"));
    expect(await requestCustomerEmail({ kind: "pass-redeemed", userSub: "s" })).toEqual({ requested: false });
  });

  test("treats a failed entry as a failed request", async () => {
    mockSend.mockResolvedValue({ FailedEntryCount: 1 });
    expect(await requestCustomerEmail({ kind: "pass-redeemed", userSub: "s" })).toEqual({ requested: false });
  });

  test("only notice-digest has no customer account", () => {
    expect(kindHasAccount("notice-digest")).toBe(false);
    for (const kind of ["subscription-started", "submission-receipt", "pass-generated", "pass-redeemed"]) {
      expect(kindHasAccount(kind)).toBe(true);
    }
  });
});
