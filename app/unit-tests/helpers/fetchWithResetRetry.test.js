// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/helpers/fetchWithResetRetry.test.js
// Unit tests for the behaviour-test static-asset fetch retry

import { describe, test, expect, vi } from "vitest";
import { fetchWithResetRetry } from "../../../behaviour-tests/helpers/fetchWithResetRetry.js";

describe("fetchWithResetRetry", () => {
  test("returns the response when the first fetch succeeds", async () => {
    const route = { fetch: vi.fn().mockResolvedValue("ok") };
    await expect(fetchWithResetRetry(route)).resolves.toBe("ok");
    expect(route.fetch).toHaveBeenCalledTimes(1);
  });

  test("retries once after a connection reset", async () => {
    const route = { fetch: vi.fn().mockRejectedValueOnce(new Error("read ECONNRESET")).mockResolvedValue("ok") };
    await expect(fetchWithResetRetry(route)).resolves.toBe("ok");
    expect(route.fetch).toHaveBeenCalledTimes(2);
  });

  test("retries after a socket hang up", async () => {
    const route = { fetch: vi.fn().mockRejectedValueOnce(new Error("socket hang up")).mockResolvedValue("ok") };
    await expect(fetchWithResetRetry(route)).resolves.toBe("ok");
    expect(route.fetch).toHaveBeenCalledTimes(2);
  });

  test("throws another error at once", async () => {
    const route = { fetch: vi.fn().mockRejectedValue(new Error("net::ERR_NAME_NOT_RESOLVED")) };
    await expect(fetchWithResetRetry(route)).rejects.toThrow("ERR_NAME_NOT_RESOLVED");
    expect(route.fetch).toHaveBeenCalledTimes(1);
  });

  test("throws the last error after three resets", async () => {
    const route = { fetch: vi.fn().mockRejectedValue(new Error("read ECONNRESET")) };
    await expect(fetchWithResetRetry(route)).rejects.toThrow("read ECONNRESET");
    expect(route.fetch).toHaveBeenCalledTimes(3);
  });
});
