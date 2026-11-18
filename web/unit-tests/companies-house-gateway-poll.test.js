// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/companies-house-gateway-poll.test.js

// @vitest-environment happy-dom

import { describe, test, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";

describe("companies-house-gateway-poll", () => {
  let gatewayPoll;

  beforeAll(async () => {
    await import("../public/lib/companies-house-gateway-poll.js");
    gatewayPoll = window.companiesHouseGatewayPoll;
  });

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  async function run(options) {
    const done = gatewayPoll.pollGatewayUntilSettled(options);
    await vi.runAllTimersAsync();
    return done;
  }

  test("waits the gateway's PollInterval before each poll and stops at the outcome", async () => {
    const times = [];
    const statuses = ["PENDING", "PENDING", "ACCEPT"];
    const result = await run({
      submissionNumber: "000001",
      pollIntervalSeconds: 10,
      poll: () => {
        times.push(Date.now());
        return Promise.resolve({ submissionNumber: "000001", statusCode: statuses.shift() });
      },
    });
    expect(result.statusCode).toBe("ACCEPT");
    expect(times).toHaveLength(3);
    expect(times[1] - times[0]).toBe(10_000);
    expect(times[2] - times[1]).toBe(10_000);
  });

  test("polls at most MAX_GATEWAY_POLLS times and hands back the pending status", async () => {
    const poll = vi.fn(() => Promise.resolve({ submissionNumber: "000001", statusCode: "PENDING" }));
    const onPending = vi.fn();
    const result = await run({ submissionNumber: "000001", pollIntervalSeconds: 1, poll, onPending });
    expect(result.statusCode).toBe("PENDING");
    expect(poll).toHaveBeenCalledTimes(gatewayPoll.MAX_GATEWAY_POLLS);
    expect(onPending).toHaveBeenCalledTimes(gatewayPoll.MAX_GATEWAY_POLLS);
  });

  test("polls no more when the PollInterval is 0", async () => {
    const poll = vi.fn();
    const result = await run({ submissionNumber: "000001", pollIntervalSeconds: 0, poll });
    expect(poll).not.toHaveBeenCalled();
    expect(result).toEqual({ submissionNumber: "000001", statusCode: "PENDING" });
  });

  test("an acknowledgement with no PollInterval waits one second", async () => {
    const times = [Date.now()];
    await run({
      submissionNumber: "000001",
      pollIntervalSeconds: undefined,
      poll: () => {
        times.push(Date.now());
        return Promise.resolve({ statusCode: "REJECT" });
      },
    });
    expect(times[1] - times[0]).toBe(1_000);
  });

  test("the pending note offers Check again unless the gateway asked for no more polls", () => {
    expect(gatewayPoll.pendingNote({ submissionNumber: "000001", pollInterval: 5 })).toContain("Check again");
    expect(gatewayPoll.pendingNote({ submissionNumber: "000001", pollInterval: 0 })).not.toContain("Check again");
    expect(gatewayPoll.pendingNote({ submissionNumber: "000001", pollInterval: 0 })).toContain("000001");
  });
});
