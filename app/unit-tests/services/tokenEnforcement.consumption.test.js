// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/services/tokenEnforcement.consumption.test.js

import { describe, test, expect, vi, beforeEach } from "vitest";
import { consumeTokenForActivity } from "@app/services/tokenEnforcement.js";

const mockConsumeToken = vi.fn();
const mockGetUserBundles = vi.fn();
const mockRecordTokenEvent = vi.fn();

vi.mock("@app/data/dynamoDbBundleRepository.js", () => ({
  consumeToken: (...args) => mockConsumeToken(...args),
  getUserBundles: (...args) => mockGetUserBundles(...args),
  recordTokenEvent: (...args) => mockRecordTokenEvent(...args),
}));

describe("services/tokenEnforcement - consumption recording", () => {
  beforeEach(() => {
    mockConsumeToken.mockClear();
    mockGetUserBundles.mockClear();
    mockRecordTokenEvent.mockClear();
  });

  test("records token event after successful consumption", async () => {
    mockGetUserBundles.mockResolvedValue([{ bundleId: "day-guest", tokensGranted: 10, tokensConsumed: 2 }]);
    mockConsumeToken.mockResolvedValue({ consumed: true, tokensRemaining: 7, bundle: {} });
    mockRecordTokenEvent.mockResolvedValue();

    const catalog = {
      activities: [{ id: "submit-vat", tokenCost: 1, bundles: ["day-guest"] }],
    };

    const result = await consumeTokenForActivity("test-user", "submit-vat", catalog);

    expect(result.consumed).toBe(true);
    // recordTokenEvent is fire-and-forget; wait for microtask
    await new Promise((r) => setTimeout(r, 10));
    expect(mockRecordTokenEvent).toHaveBeenCalledWith("test-user", "day-guest", {
      activity: "submit-vat",
      tokensUsed: 1,
    });
  });

  test("does not record token event when consumption fails", async () => {
    mockGetUserBundles.mockResolvedValue([{ bundleId: "day-guest", tokensGranted: 10, tokensConsumed: 10 }]);

    const catalog = {
      activities: [{ id: "submit-vat", tokenCost: 1, bundles: ["day-guest"] }],
    };

    const result = await consumeTokenForActivity("test-user", "submit-vat", catalog);

    expect(result.consumed).toBe(false);
    expect(mockRecordTokenEvent).not.toHaveBeenCalled();
  });

  test("does not record token event for free activities", async () => {
    const catalog = {
      activities: [{ id: "free-action", tokenCost: 0, bundles: [] }],
    };

    const result = await consumeTokenForActivity("test-user", "free-action", catalog);

    expect(result.consumed).toBe(true);
    expect(result.cost).toBe(0);
    expect(mockRecordTokenEvent).not.toHaveBeenCalled();
  });
});
