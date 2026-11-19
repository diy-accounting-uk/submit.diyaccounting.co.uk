// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/services/filedReceipt.test.js

import { describe, test, beforeEach, expect, vi } from "vitest";

const calls = [];
const mockPutReceipt = vi.fn();
const mockPutReceiptIfNew = vi.fn();
const mockFindReceiptForSubmission = vi.fn();
const mockMarkReceiptStepDone = vi.fn();
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
  findReceiptForSubmission: (...args) => {
    calls.push("findReceiptForSubmission");
    return mockFindReceiptForSubmission(...args);
  },
  markReceiptStepDone: (...args) => {
    calls.push("markReceiptStepDone");
    return mockMarkReceiptStepDone(...args);
  },
}));
vi.mock("@app/lib/customerEmailRequest.js", () => ({
  requestCustomerEmail: (...args) => {
    calls.push("requestCustomerEmail");
    return mockRequestCustomerEmail(...args);
  },
}));

import { recordFiledReceipt, recordFiledReceiptForSubmission } from "@app/services/filedReceipt.js";

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

describe("recordFiledReceiptForSubmission", () => {
  const SENT_AT = "2026-01-01T00:00:00.000Z";
  const submission = {
    userSub: "user-sub-1",
    submissionNumber: "00001A",
    sentAt: SENT_AT,
    receipt: { submissionNumber: "00001A" },
    actor: "customer",
    clientId: "client-1",
    receiptKind: "accounts",
    synthetic: true,
  };
  const newReceiptId = `${SENT_AT}-00001A`;

  beforeEach(() => {
    calls.length = 0;
    mockPutReceiptIfNew.mockReset().mockResolvedValue("hashed-1");
    mockFindReceiptForSubmission.mockReset().mockResolvedValue(null);
    mockMarkReceiptStepDone.mockReset().mockResolvedValue(true);
    mockRequestCustomerEmail.mockReset().mockResolvedValue({ requested: true });
  });

  test("stores a new receipt dated by the send, requests the email, then records that it did", async () => {
    await expect(recordFiledReceiptForSubmission({ ...submission, language: "cy" })).resolves.toEqual({
      receiptId: newReceiptId,
      hashedSub: "hashed-1",
    });
    expect(mockPutReceiptIfNew).toHaveBeenCalledWith("user-sub-1", newReceiptId, submission.receipt, "customer", "client-1");
    expect(calls).toEqual(["findReceiptForSubmission", "putReceiptIfNew", "requestCustomerEmail", "markReceiptStepDone"]);
    expect(mockRequestCustomerEmail).toHaveBeenCalledWith({
      kind: "submission-receipt",
      userSub: "user-sub-1",
      synthetic: true,
      data: { receiptId: newReceiptId, receiptKind: "accounts", clientId: "client-1", language: "cy" },
    });
    expect(mockMarkReceiptStepDone).toHaveBeenCalledWith("hashed-1", newReceiptId, "emailRequestedAt");
  });

  test("a retry after a stop before the email asks for it once and stores no second receipt", async () => {
    mockFindReceiptForSubmission.mockResolvedValue({ receiptId: newReceiptId, hashedSub: "hashed-1" });

    await recordFiledReceiptForSubmission(submission);

    expect(mockPutReceiptIfNew).not.toHaveBeenCalled();
    expect(mockRequestCustomerEmail).toHaveBeenCalledTimes(1);
    expect(mockMarkReceiptStepDone).toHaveBeenCalledWith("hashed-1", newReceiptId, "emailRequestedAt");
  });

  test("a retry of a receipt whose email is recorded asks for no second email", async () => {
    mockFindReceiptForSubmission.mockResolvedValue({ receiptId: newReceiptId, hashedSub: "hashed-1", emailRequestedAt: SENT_AT });

    await recordFiledReceiptForSubmission(submission);

    expect(mockPutReceiptIfNew).not.toHaveBeenCalled();
    expect(mockRequestCustomerEmail).not.toHaveBeenCalled();
    expect(mockMarkReceiptStepDone).not.toHaveBeenCalled();
  });

  test("reuses a receipt stored under the id dated by its record time, which was emailed when it was stored", async () => {
    const earlierFormId = "2026-01-02T09:30:00.000Z-00001A";
    mockFindReceiptForSubmission.mockResolvedValue({ receiptId: earlierFormId, hashedSub: "hashed-1" });

    await expect(recordFiledReceiptForSubmission(submission)).resolves.toMatchObject({ receiptId: earlierFormId });

    expect(mockFindReceiptForSubmission).toHaveBeenCalledWith("user-sub-1", "00001A", SENT_AT);
    expect(mockPutReceiptIfNew).not.toHaveBeenCalled();
    expect(mockRequestCustomerEmail).not.toHaveBeenCalled();
    expect(mockMarkReceiptStepDone).toHaveBeenCalledWith("hashed-1", earlierFormId, "emailRequestedAt");
  });

  test("a receipt another poll stored between the lookup and the put is reused", async () => {
    mockPutReceiptIfNew.mockResolvedValue(null);
    mockFindReceiptForSubmission
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ receiptId: newReceiptId, hashedSub: "hashed-1", emailRequestedAt: SENT_AT });

    await expect(recordFiledReceiptForSubmission(submission)).resolves.toMatchObject({ receiptId: newReceiptId });
    expect(mockRequestCustomerEmail).not.toHaveBeenCalled();
  });
});
