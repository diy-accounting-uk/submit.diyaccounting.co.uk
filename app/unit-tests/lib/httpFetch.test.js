// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, vi, afterEach } from "vitest";
import { fetchRetryingNetworkErrors } from "../../lib/httpFetch.js";

describe("fetchRetryingNetworkErrors", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("returns the response of the first attempt without waiting", async () => {
    const response = { ok: true };
    const fetchImpl = vi.fn().mockResolvedValue(response);
    const sleep = vi.fn();
    vi.stubGlobal("fetch", fetchImpl);

    await expect(fetchRetryingNetworkErrors("https://example.test/a", { method: "GET" }, { sleep })).resolves.toBe(response);

    expect(fetchImpl).toHaveBeenCalledWith("https://example.test/a", { method: "GET" });
    expect(sleep).not.toHaveBeenCalled();
  });

  test("retries a network failure with a growing wait and returns the later response", async () => {
    const response = { ok: true };
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(response);
    const sleep = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("fetch", fetchImpl);

    await expect(fetchRetryingNetworkErrors("https://example.test/a", {}, { sleep })).resolves.toBe(response);

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([500, 1000]);
  });

  test("rethrows the last network failure after three attempts", async () => {
    const failure = new TypeError("fetch failed");
    const fetchImpl = vi.fn().mockRejectedValue(failure);
    vi.stubGlobal("fetch", fetchImpl);

    await expect(fetchRetryingNetworkErrors("https://example.test/a", {}, { sleep: async () => {} })).rejects.toBe(failure);

    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  test("rethrows an error that is not a TypeError at once", async () => {
    const failure = new Error("boom");
    const fetchImpl = vi.fn().mockRejectedValue(failure);
    vi.stubGlobal("fetch", fetchImpl);

    await expect(fetchRetryingNetworkErrors("https://example.test/a", {}, { sleep: async () => {} })).rejects.toBe(failure);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test("returns a non-OK response without retrying", async () => {
    const response = { ok: false, status: 503 };
    const fetchImpl = vi.fn().mockResolvedValue(response);
    vi.stubGlobal("fetch", fetchImpl);

    await expect(fetchRetryingNetworkErrors("https://example.test/a", {}, { sleep: async () => {} })).resolves.toBe(response);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
