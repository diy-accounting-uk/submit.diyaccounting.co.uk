// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/finance/paypalStage.test.js

import { describe, test, expect, vi } from "vitest";

import {
  parseArgs,
  computeMonthRange,
  formatDateStamp,
  formatPayPalDateTime,
  fetchAccessToken,
  fetchAllTransactions,
} from "../../../../scripts/finance/paypal-stage.js";

describe("parseArgs", () => {
  test("reads --month", () => {
    expect(parseArgs(["--month", "2026-03"])).toEqual({ month: "2026-03" });
  });

  test("throws when --month is missing", () => {
    expect(() => parseArgs([])).toThrow(/--month is required/);
  });

  test("throws when --month is not YYYY-MM", () => {
    expect(() => parseArgs(["--month", "March 2026"])).toThrow(/--month is required/);
  });

  test("rejects an unknown argument", () => {
    expect(() => parseArgs(["--nope"])).toThrow(/Unknown argument/);
  });
});

describe("computeMonthRange", () => {
  test("bounds March 2026 across its full 31 days", () => {
    const { start, end, lastDay } = computeMonthRange("2026-03");
    expect(start.toISOString()).toBe("2026-03-01T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-03-31T23:59:59.000Z");
    expect(lastDay.toISOString()).toBe("2026-03-31T00:00:00.000Z");
  });

  test("bounds a 30-day month", () => {
    const { end, lastDay } = computeMonthRange("2026-04");
    expect(end.toISOString()).toBe("2026-04-30T23:59:59.000Z");
    expect(lastDay.toISOString()).toBe("2026-04-30T00:00:00.000Z");
  });
});

describe("formatDateStamp", () => {
  test("formats a UTC date as yyyy-mm-dd", () => {
    expect(formatDateStamp(new Date(Date.UTC(2026, 2, 31)))).toBe("2026-03-31");
  });
});

describe("formatPayPalDateTime", () => {
  test("formats a UTC date in the Transaction Search API's shape", () => {
    expect(formatPayPalDateTime(new Date("2026-03-01T00:00:00.000Z"))).toBe("2026-03-01T00:00:00+0000");
  });
});

describe("fetchAccessToken", () => {
  test("returns the recorded token response's access_token", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        scope: "https://uri.paypal.com/services/reporting/search/read",
        access_token: "A21AAFakeAccessToken0000000000000000000000000000000000000000",
        token_type: "Bearer",
        app_id: "APP-00000000000000",
        expires_in: 32400,
        nonce: "2026-03-01T00:00:00Z",
      }),
    });
    const token = await fetchAccessToken("test-client-id", "test-client-secret", fetchImpl);
    expect(token).toBe("A21AAFakeAccessToken0000000000000000000000000000000000000000");
    expect(fetchImpl).toHaveBeenCalledWith("https://api-m.paypal.com/v1/oauth2/token", expect.objectContaining({ method: "POST" }));
  });

  test("throws with the response body when the grant is refused", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: "invalid_client", error_description: "Client Authentication failed" }),
    });
    await expect(fetchAccessToken("bad-id", "bad-secret", fetchImpl)).rejects.toThrow(/invalid_client/);
  });
});

// A recorded page of the Transaction Search API's documented response shape
// (https://developer.paypal.com/docs/api/transaction-search/v1/), redacted: real account,
// payer and tracking identifiers replaced with synthetic ones, amounts rounded.
const RECORDED_TRANSACTION_SEARCH_PAGE = {
  transaction_details: [
    {
      transaction_info: {
        transaction_id: "3TY00000AA0000000",
        transaction_event_code: "T0006",
        transaction_initiation_date: "2026-03-05T10:00:00+0000",
        transaction_updated_date: "2026-03-05T10:00:05+0000",
        transaction_amount: { currency_code: "GBP", value: "50.00" },
        fee_amount: { currency_code: "GBP", value: "-1.75" },
        transaction_status: "S",
        transaction_subject: "Donation",
      },
      payer_info: {
        account_id: "TESTPAYERID000",
        email_address: "redacted@example.com",
        payer_name: { given_name: "Test", surname: "Payer" },
      },
    },
    {
      transaction_info: {
        transaction_id: "3TY00000AA0000001",
        transaction_event_code: "T1105",
        transaction_initiation_date: "2026-03-12T09:00:00+0000",
        transaction_updated_date: "2026-03-12T09:00:00+0000",
        transaction_amount: { currency_code: "GBP", value: "-245.17" },
        fee_amount: { currency_code: "GBP", value: "0.00" },
        transaction_status: "P",
        transaction_subject: "General hold",
      },
    },
  ],
  account_number: "TESTACCOUNTNUMBER",
  last_refreshed_datetime: "2026-04-01T00:00:00+0000",
  page: 1,
  total_items: 2,
  total_pages: 1,
  links: [],
};

describe("fetchAllTransactions", () => {
  test("returns the recorded page's transactions with transaction_status kept", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => RECORDED_TRANSACTION_SEARCH_PAGE,
    });
    const transactions = await fetchAllTransactions(
      "test-access-token",
      new Date("2026-03-01T00:00:00.000Z"),
      new Date("2026-03-31T23:59:59.000Z"),
      fetchImpl,
    );
    expect(transactions).toHaveLength(2);
    expect(transactions[0].transaction_info).toMatchObject({ transaction_id: "3TY00000AA0000000", transaction_status: "S" });
    expect(transactions[1].transaction_info).toMatchObject({ transaction_status: "P", transaction_subject: "General hold" });
  });

  test("follows total_pages across pages", async () => {
    const firstPage = { ...RECORDED_TRANSACTION_SEARCH_PAGE, page: 1, total_pages: 2 };
    const secondPage = {
      ...RECORDED_TRANSACTION_SEARCH_PAGE,
      page: 2,
      total_pages: 2,
      transaction_details: [
        {
          transaction_info: {
            ...RECORDED_TRANSACTION_SEARCH_PAGE.transaction_details[0].transaction_info,
            transaction_id: "3TY00000AA0000002",
          },
        },
      ],
    };
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => firstPage })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => secondPage });
    const transactions = await fetchAllTransactions(
      "test-access-token",
      new Date("2026-03-01T00:00:00.000Z"),
      new Date("2026-03-31T23:59:59.000Z"),
      fetchImpl,
    );
    expect(transactions.map((t) => t.transaction_info.transaction_id)).toEqual([
      "3TY00000AA0000000",
      "3TY00000AA0000001",
      "3TY00000AA0000002",
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  test("throws with the response body when the search request fails", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ name: "INVALID_REQUEST", message: "Date range too large" }),
    });
    await expect(
      fetchAllTransactions("test-access-token", new Date("2026-03-01T00:00:00.000Z"), new Date("2026-03-31T23:59:59.000Z"), fetchImpl),
    ).rejects.toThrow(/Date range too large/);
  });
});
