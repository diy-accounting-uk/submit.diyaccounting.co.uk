// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/services/filedReceipt.test.js

import { describe, test, beforeEach, expect, vi } from "vitest";

const calls = [];
const mockPutReceipt = vi.fn();
const mockPutReceiptIfNew = vi.fn();
const mockRequestCustomerEmail = vi.fn();
vi.mock("@app/data/dynamoDbReceiptRepository.js", () => ({
  putReceipt: (...args) => {
    calls.push("putReceipt");
    return mockPutReceipt(...args);
  },
  putReceiptIfNew: (...args) => {
    calls.push("putReceiptIfNew");
    return mockPutReceiptIfNew(...args);
  },
}));
vi.mock("@app/lib/customerEmailRequest.js", () => ({
  requestCustomerEmail: (...args) => {
    calls.push("requestCustomerEmail");
    return mockRequestCustomerEmail(...args);
  },
}));

import { recordFiledReceipt, recordFiledReceiptOnce } from "@app/services/filedReceipt.js";

const filing = {
  userSub: "user-sub-1",
  receiptId: "2026-01-01T00:00:00.000Z-123456",
  receipt: { formBundleNumber: "123456" },
  actor: "customer",
  clientId: "client-1",
  receiptKind: "vat-return",
  synthetic: true,
};

describe("recordFiledReceipt", () => {
  beforeEach(() => {
    calls.length = 0;
    mockPutReceipt.mockReset().mockResolvedValue(undefined);
    mockRequestCustomerEmail.mockReset().mockResolvedValue({ requested: true });
  });

  test("stores the receipt with the same arguments, then requests the email", async () => {
    await recordFiledReceipt(filing);
    expect(mockPutReceipt).toHaveBeenCalledWith(filing.userSub, filing.receiptId, filing.receipt, "customer", "client-1");
    expect(calls).toEqual(["putReceipt", "requestCustomerEmail"]);
    expect(mockRequestCustomerEmail).toHaveBeenCalledWith({
      kind: "submission-receipt",
      userSub: filing.userSub,
      synthetic: true,
      data: { receiptId: filing.receiptId, receiptKind: "vat-return", clientId: "client-1" },
    });
  });

  test("passes a Welsh reader's language to the email request", async () => {
    await recordFiledReceipt({ ...filing, language: "cy" });
    expect(mockRequestCustomerEmail).toHaveBeenCalledWith(
      expect.objectContaining({ data: { receiptId: filing.receiptId, receiptKind: "vat-return", clientId: "client-1", language: "cy" } }),
    );
  });

  test("carries the Welsh language choice into the email request", async () => {
    await recordFiledReceipt({ ...filing, receiptKind: "accounts", language: "cy" });
    expect(mockRequestCustomerEmail).toHaveBeenCalledWith(
      expect.objectContaining({ data: { receiptId: filing.receiptId, receiptKind: "accounts", clientId: "client-1", language: "cy" } }),
    );
  });

  test("rejects and requests nothing when the receipt write fails", async () => {
    mockPutReceipt.mockRejectedValue(new Error("write failed"));
    await expect(recordFiledReceipt(filing)).rejects.toThrow("write failed");
    expect(mockRequestCustomerEmail).not.toHaveBeenCalled();
  });

  test("resolves when the request reports it was not made", async () => {
    mockRequestCustomerEmail.mockResolvedValue({ requested: false });
    await expect(recordFiledReceipt(filing)).resolves.toBeUndefined();
  });
});

describe("recordFiledReceiptOnce", () => {
  beforeEach(() => {
    calls.length = 0;
    mockPutReceiptIfNew.mockReset().mockResolvedValue(true);
    mockRequestCustomerEmail.mockReset().mockResolvedValue({ requested: true });
  });

  test("stores a new receipt, then requests the email", async () => {
    await expect(recordFiledReceiptOnce({ ...filing, language: "cy" })).resolves.toBe(true);
    expect(mockPutReceiptIfNew).toHaveBeenCalledWith(filing.userSub, filing.receiptId, filing.receipt, "customer", "client-1");
    expect(calls).toEqual(["putReceiptIfNew", "requestCustomerEmail"]);
    expect(mockRequestCustomerEmail).toHaveBeenCalledWith({
      kind: "submission-receipt",
      userSub: filing.userSub,
      synthetic: true,
      data: { receiptId: filing.receiptId, receiptKind: "vat-return", clientId: "client-1", language: "cy" },
    });
  });

  test("requests no second email when the receipt is already stored", async () => {
    mockPutReceiptIfNew.mockResolvedValue(false);
    await expect(recordFiledReceiptOnce(filing)).resolves.toBe(false);
    expect(mockRequestCustomerEmail).not.toHaveBeenCalled();
  });
});
