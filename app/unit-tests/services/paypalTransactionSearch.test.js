// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, vi } from "vitest";
import { createPacer, fetchTransactionsPage } from "@app/services/paypalTransactionSearch.js";

const params = { startDate: new Date("2026-09-01T00:00:00Z"), endDate: new Date("2026-09-02T23:59:59Z"), page: 1 };
const okResponse = { ok: true, status: 200, headers: new Headers(), json: async () => ({ transaction_details: [] }) };
const rateLimited = (retryAfter) => ({
  ok: false,
  status: 429,
  headers: new Headers(retryAfter === undefined ? {} : { "Retry-After": String(retryAfter) }),
  json: async () => ({ name: "RATE_LIMIT_REACHED" }),
});

describe("fetchTransactionsPage rate limiting", () => {
  test("a 429 then a 200 succeeds after one wait of the Retry-After value", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(rateLimited(7)).mockResolvedValueOnce(okResponse);
    const sleep = vi.fn().mockResolvedValue();

    const body = await fetchTransactionsPage("token", params, fetchImpl, { sleep });

    expect(body.transaction_details).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep.mock.calls).toEqual([[7000]]);
  });

  test("three 429s without Retry-After then a 200 succeeds after 5, 15 and 45 seconds", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(rateLimited())
      .mockResolvedValueOnce(rateLimited())
      .mockResolvedValueOnce(rateLimited())
      .mockResolvedValueOnce(okResponse);
    const sleep = vi.fn().mockResolvedValue();

    await fetchTransactionsPage("token", params, fetchImpl, { sleep });

    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(sleep.mock.calls).toEqual([[5000], [15000], [45000]]);
  });

  test("four 429s throw the rate limit error", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(rateLimited());
    const sleep = vi.fn().mockResolvedValue();

    await expect(fetchTransactionsPage("token", params, fetchImpl, { sleep })).rejects.toThrow(
      /Transaction Search request failed with 429.*RATE_LIMIT_REACHED/,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(sleep).toHaveBeenCalledTimes(3);
  });

  test("a 500 throws without retry", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 500, headers: new Headers(), json: async () => ({}) });
    const sleep = vi.fn().mockResolvedValue();

    await expect(fetchTransactionsPage("token", params, fetchImpl, { sleep })).rejects.toThrow(/failed with 500/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });
});

describe("createPacer", () => {
  test("successive calls wait until one second has passed since the previous call", async () => {
    let clock = 0;
    const sleep = vi.fn(async (ms) => {
      clock += ms;
    });
    const pace = createPacer(1000, sleep, () => clock);

    await pace();
    clock += 300;
    await pace();
    await pace();
    clock += 2500;
    await pace();

    expect(sleep.mock.calls).toEqual([[700], [1000]]);
  });

  test("a request through fetchTransactionsPage waits on the pacer before each attempt", async () => {
    const order = [];
    const pace = vi.fn(async () => order.push("pace"));
    const fetchImpl = vi.fn(async () => {
      order.push("fetch");
      return order.filter((step) => step === "fetch").length === 1 ? rateLimited(1) : okResponse;
    });

    await fetchTransactionsPage("token", params, fetchImpl, { sleep: async () => order.push("sleep"), pace });

    expect(order).toEqual(["pace", "fetch", "sleep", "pace", "fetch"]);
  });
});
