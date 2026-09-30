// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, vi, beforeEach } from "vitest";
import { gunzipSync } from "zlib";

const mockS3Send = vi.fn();
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    send(...args) {
      return mockS3Send(...args);
    }
  },
  PutObjectCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
}));

const mockSecretsSend = vi.fn();
vi.mock("@aws-sdk/client-secrets-manager", () => ({
  SecretsManagerClient: class {
    send(...args) {
      return mockSecretsSend(...args);
    }
  },
  GetSecretValueCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
}));

const mockFetchAccessToken = vi.fn();
const mockFetchAllTransactions = vi.fn();
vi.mock("@app/services/paypalTransactionSearch.js", () => ({
  fetchAccessToken: (...args) => mockFetchAccessToken(...args),
  fetchAllTransactions: (...args) => mockFetchAllTransactions(...args),
  createPacer: () => async () => {},
  realSleep: async () => {},
}));

const { handler, donationRowsFromTransactions, computeDayWindow, daysOf, defaultTargetDate, objectKey, toNdjsonGzip } =
  await import("../../functions/analytics/paypalDonationsPull.js");

function record({ id, code, status = "S", amount, currency = "GBP", fee, date = "2026-09-14T10:15:00+0000", subject, referenceId }) {
  return {
    transaction_info: {
      transaction_id: id,
      ...(referenceId ? { paypal_reference_id: referenceId, paypal_reference_id_type: "TXN" } : {}),
      transaction_event_code: code,
      transaction_initiation_date: date,
      transaction_updated_date: date,
      transaction_amount: { currency_code: currency, value: amount },
      ...(fee ? { fee_amount: { currency_code: currency, value: fee } } : {}),
      transaction_status: status,
      ...(subject ? { transaction_subject: subject } : {}),
    },
    payer_info: {
      account_id: "TESTPAYER0001",
      email_address: "payer@example.com",
      payer_name: { alternate_full_name: "Test Payer" },
      country_code: "GB",
    },
    shipping_info: { name: "Test Payer" },
  };
}

// A day of Transaction Search output in the API's documented shape, with synthetic ids, names and
// addresses: two donations, an ordinary receipt, a pending donation, a hold and its release, a
// currency conversion pair, a bank top-up, a withdrawal, a refund, a cashback bonus and a bill.
const RECORDED_DAY = [
  record({ id: "DON000000000000A1", code: "T0013", amount: "5.00", fee: "-0.45", subject: "Donation" }),
  record({ id: "DON000000000000A2", code: "T0013", amount: "20.00", fee: "-0.98", subject: "Donation" }),
  record({ id: "PAY000000000000B1", code: "T0006", amount: "12.50", fee: "-0.55", subject: "Checkout" }),
  record({ id: "DON000000000000P1", code: "T0013", status: "P", amount: "10.00", subject: "Donation" }),
  record({ id: "HLD000000000000C1", code: "T1501", status: "P", amount: "-30.00" }),
  record({ id: "REL000000000000C2", code: "T1105", amount: "30.00", referenceId: "HLD000000000000C1" }),
  record({ id: "CNV000000000000D1", code: "T0200", amount: "-11.59" }),
  record({ id: "CNV000000000000D2", code: "T0200", amount: "14.91", currency: "USD" }),
  record({ id: "TOP000000000000E1", code: "T0300", amount: "60.00" }),
  record({ id: "WDR000000000000F1", code: "T0400", amount: "-40.00" }),
  record({ id: "CSH000000000000H1", code: "T0801", amount: "0.30" }),
  record({ id: "BIL000000000000J1", code: "T0500", amount: "-8.00", subject: "Hosting" }),
];

describe("donationRowsFromTransactions", () => {
  test("keeps settled donations and other receipts and drops everything else", () => {
    const rows = donationRowsFromTransactions(RECORDED_DAY);
    expect(rows.map((row) => row.id)).toEqual(["DON000000000000A1", "DON000000000000A2", "PAY000000000000B1"]);
  });

  test("labels a donation receipt and any other receipt differently", () => {
    const rows = donationRowsFromTransactions(RECORDED_DAY);
    expect(rows.map((row) => row.product)).toEqual(["donation-paypal", "donation-paypal", "paypal-other-receipt"]);
  });

  test("carries the pound amount, the original amount and currency, the fee as a positive number and the date", () => {
    const [first] = donationRowsFromTransactions(RECORDED_DAY);
    expect(first).toEqual({
      id: "DON000000000000A1",
      date: "2026-09-14",
      amount: 5,
      fee: 0.45,
      product: "donation-paypal",
      original_amount: 5,
      original_currency: "GBP",
      refund_of: null,
    });
  });

  test("a receipt with no fee has a zero fee", () => {
    const [row] = donationRowsFromTransactions([record({ id: "NOFEE00000000001", code: "T0013", amount: "3.00" })]);
    expect(row.fee).toBe(0);
  });

  test("no row carries a payer name, email address or address", () => {
    const serialised = JSON.stringify(donationRowsFromTransactions(RECORDED_DAY));
    expect(serialised).not.toMatch(/Test Payer|example\.com|TESTPAYER|"GB"/);
  });

  test("a refund is a negative row naming its original, with the original's product when it is on the page", () => {
    const rows = donationRowsFromTransactions([
      record({ id: "DON000000000000A1", code: "T0013", amount: "20.00", fee: "-0.98" }),
      record({ id: "RFD000000000000G1", code: "T1107", amount: "-20.00", referenceId: "DON000000000000A1" }),
    ]);
    expect(rows[1]).toMatchObject({
      id: "RFD000000000000G1",
      amount: -20,
      product: "donation-paypal",
      refund_of: "DON000000000000A1",
    });
  });

  test("a refund on a later day than its donation has no product and still names the original", () => {
    const donationDay = donationRowsFromTransactions([
      record({ id: "DON000000000000A1", code: "T0013", amount: "20.00", date: "2026-09-14T10:00:00+0000" }),
    ]);
    const refundDay = donationRowsFromTransactions([
      record({
        id: "RFD000000000000G1",
        code: "T1107",
        amount: "-20.00",
        date: "2026-09-16T09:00:00+0000",
        referenceId: "DON000000000000A1",
      }),
    ]);
    expect(donationDay[0]).toMatchObject({ date: "2026-09-14", amount: 20 });
    expect(refundDay).toEqual([
      expect.objectContaining({ date: "2026-09-16", amount: -20, product: null, refund_of: "DON000000000000A1" }),
    ]);
  });

  test("a pending refund is left out", () => {
    const rows = donationRowsFromTransactions([
      record({ id: "RFD000000000000G2", code: "T1107", status: "P", amount: "-5.00", referenceId: "DON000000000000A1" }),
    ]);
    expect(rows).toEqual([]);
  });

  test("a USD receipt takes the pound amount its conversion credited and keeps the original", () => {
    const rows = donationRowsFromTransactions([
      record({ id: "USD000000000000K1", code: "T0013", amount: "10.00", currency: "USD", fee: "-0.64" }),
      record({ id: "CNV000000000000K2", code: "T0200", amount: "-10.00", currency: "USD", referenceId: "USD000000000000K1" }),
      record({ id: "CNV000000000000K3", code: "T0200", amount: "7.42", currency: "GBP", referenceId: "USD000000000000K1" }),
    ]);
    expect(rows).toEqual([
      expect.objectContaining({
        id: "USD000000000000K1",
        amount: 7.42,
        original_amount: 10,
        original_currency: "USD",
        product: "donation-paypal",
      }),
    ]);
  });

  test("a USD receipt with no conversion is left out and reported by id", () => {
    const onUnmatched = vi.fn();
    const rows = donationRowsFromTransactions([record({ id: "USD000000000000K9", code: "T0013", amount: "10.00", currency: "USD" })], {
      onUnmatched,
    });
    expect(rows).toEqual([]);
    expect(onUnmatched).toHaveBeenCalledWith("USD000000000000K9", "USD");
  });

  test("onlyDate keeps that day's rows and ignores the next day's, which only serve to find conversions", () => {
    const rows = donationRowsFromTransactions(
      [
        record({ id: "DAY000000000000M1", code: "T0013", amount: "5.00", date: "2026-09-14T10:00:00+0000" }),
        record({ id: "DAY000000000000M2", code: "T0013", amount: "6.00", date: "2026-09-15T10:00:00+0000" }),
      ],
      { onlyDate: "2026-09-14" },
    );
    expect(rows.map((row) => row.id)).toEqual(["DAY000000000000M1"]);
  });
});

describe("daysOf", () => {
  test("a date is one day", () => {
    expect(daysOf({ date: "2026-09-14" })).toEqual(["2026-09-14"]);
  });

  test("a range is every day inclusive", () => {
    expect(daysOf({ from: "2026-02-27", to: "2026-03-02" })).toEqual(["2026-02-27", "2026-02-28", "2026-03-01", "2026-03-02"]);
  });

  test("a range of 93 days is accepted and 94 is refused", () => {
    expect(daysOf({ from: "2026-01-01", to: "2026-04-03" })).toHaveLength(93);
    expect(() => daysOf({ from: "2026-01-01", to: "2026-04-04" })).toThrow(/at most 93 days/);
  });

  test("a reversed range, a lone bound, both forms together and a malformed date are refused", () => {
    expect(() => daysOf({ from: "2026-03-02", to: "2026-03-01" })).toThrow(/after/);
    expect(() => daysOf({ from: "2026-03-01" })).toThrow(/together/);
    expect(() => daysOf({ date: "2026-03-01", from: "2026-03-01", to: "2026-03-02" })).toThrow(/either/);
    expect(() => daysOf({ date: "14/09/2026" })).toThrow(/Not an ISO date/);
  });
});

describe("computeDayWindow", () => {
  test("spans the first second of the UTC day to the last second of the next", () => {
    const { start, end } = computeDayWindow("2026-09-14");
    expect(start.toISOString()).toBe("2026-09-14T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-09-15T23:59:59.000Z");
  });
});

describe("defaultTargetDate", () => {
  test("is yesterday in UTC", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01T00:30:00Z"));
    try {
      expect(defaultTargetDate()).toBe("2026-02-28");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("toNdjsonGzip", () => {
  test("an empty day is a valid empty gzip member", () => {
    expect(gunzipSync(toNdjsonGzip([])).toString()).toBe("");
  });
});

describe("handler", () => {
  beforeEach(() => {
    mockS3Send.mockReset();
    mockSecretsSend.mockReset();
    mockFetchAccessToken.mockReset();
    mockFetchAllTransactions.mockReset();
    process.env.ANALYTICS_LAKE_BUCKET_NAME = "lake-bucket";
    process.env.PAYPAL_CLIENT_ID_SECRET_ID = "prod/submit/paypal/client_id";
    process.env.PAYPAL_CLIENT_SECRET_SECRET_ID = "prod/submit/paypal/client_secret";
    mockSecretsSend.mockImplementation(async (command) => ({
      SecretString: command.input.SecretId.endsWith("client_id") ? "the-client-id" : "the-client-secret",
    }));
    mockFetchAccessToken.mockResolvedValue("the-access-token");
    mockFetchAllTransactions.mockResolvedValue(RECORDED_DAY);
    mockS3Send.mockResolvedValue({});
  });

  test("writes the day's receipts to the curated PayPal prefix as gzipped NDJSON", async () => {
    const result = await handler({ date: "2026-09-14" });

    expect(result).toEqual({
      days: [{ date: "2026-09-14", key: "curated/paypal/paypal_donations/dt=2026-09-14/donations.json.gz", count: 3 }],
    });
    const put = mockS3Send.mock.calls[0][0].input;
    expect(put.Bucket).toBe("lake-bucket");
    expect(put.Key).toBe(objectKey("2026-09-14"));
    const lines = gunzipSync(put.Body)
      .toString()
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(lines.map((row) => row.id)).toEqual(["DON000000000000A1", "DON000000000000A2", "PAY000000000000B1"]);
  });

  test("exchanges the two secrets for a token and searches the requested day", async () => {
    await handler({ date: "2026-09-14" });

    expect(mockFetchAccessToken).toHaveBeenCalledWith("the-client-id", "the-client-secret");
    const [token, start, end] = mockFetchAllTransactions.mock.calls[0];
    expect(token).toBe("the-access-token");
    expect(start.toISOString()).toBe("2026-09-14T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-09-15T23:59:59.000Z");
  });

  test("a range writes one object per day and fetches the token once", async () => {
    mockFetchAllTransactions.mockResolvedValue([]);
    const result = await handler({ from: "2026-09-14", to: "2026-09-16" });

    expect(result.days.map((day) => day.date)).toEqual(["2026-09-14", "2026-09-15", "2026-09-16"]);
    expect(mockS3Send.mock.calls.map((call) => call[0].input.Key)).toEqual([
      objectKey("2026-09-14"),
      objectKey("2026-09-15"),
      objectKey("2026-09-16"),
    ]);
    expect(mockFetchAccessToken).toHaveBeenCalledTimes(1);
  });

  test("every day of a range fetches through the same pacer", async () => {
    mockFetchAllTransactions.mockResolvedValue([]);
    await handler({ from: "2026-09-14", to: "2026-09-16" });

    const paces = mockFetchAllTransactions.mock.calls.map((call) => call[4].pace);
    expect(paces).toHaveLength(3);
    expect(new Set(paces).size).toBe(1);
  });

  test("a range over 93 days writes nothing", async () => {
    await expect(handler({ from: "2026-01-01", to: "2026-04-04" })).rejects.toThrow(/at most 93 days/);
    expect(mockS3Send).not.toHaveBeenCalled();
  });

  test("a quiet day still writes its object", async () => {
    mockFetchAllTransactions.mockResolvedValue([]);
    const result = await handler({ date: "2026-09-15" });
    expect(result.days[0].count).toBe(0);
    expect(mockS3Send).toHaveBeenCalledTimes(1);
  });

  test("throws when a secret id is not configured", async () => {
    delete process.env.PAYPAL_CLIENT_SECRET_SECRET_ID;
    await expect(handler({ date: "2026-09-14" })).rejects.toThrow(/PAYPAL_CLIENT_SECRET_SECRET_ID/);
    expect(mockS3Send).not.toHaveBeenCalled();
  });

  test("throws and writes nothing when PayPal refuses the search", async () => {
    mockFetchAllTransactions.mockRejectedValue(new Error("PayPal Transaction Search request failed with 403"));
    await expect(handler({ date: "2026-09-14" })).rejects.toThrow(/403/);
    expect(mockS3Send).not.toHaveBeenCalled();
  });
});
