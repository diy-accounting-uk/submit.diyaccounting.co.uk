// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildProofReceipt, deleteProofReceipt, putProofReceipt, readProofIds } from "../../../scripts/customer-email-proof-receipt.mjs";
import { buildCustomerEmail } from "../../lib/customerEmailTemplates.js";

describe("customer-email-proof-receipt", () => {
  beforeEach(() => {
    process.env.RECEIPTS_DYNAMODB_TABLE_NAME = "ci-env-receipts";
  });

  it("builds a receipt that the submission-receipt template renders in full", () => {
    const receipt = buildProofReceipt(new Date("2026-11-05T09:30:00.000Z"));
    const message = buildCustomerEmail({
      kind: "submission-receipt",
      data: { receiptKind: "vat-return" },
      baseUrl: "https://ci.submit.diyaccounting.co.uk/",
      receipt,
    });
    expect(receipt.processingDate).toBe("2026-11-05T09:30:00.000Z");
    expect(message.text).toContain("Form bundle number: 256616771364");
    expect(message.text).toContain("Charge reference: XM002610011594");
    expect(message.text).toContain("BANK means a payment through your bank.");
  });

  it("reads the proof ids from the environment and refuses a missing one", () => {
    expect(readProofIds({ PROOF_USER_SUB: "proof-1", PROOF_RECEIPT_ID: "proof-receipt-1" })).toEqual({
      userSub: "proof-1",
      receiptId: "proof-receipt-1",
    });
    expect(() => readProofIds({ PROOF_USER_SUB: "proof-1" })).toThrow(/required/);
  });

  it("puts the receipt under the proof account with the probe actor", async () => {
    const put = vi.fn().mockResolvedValue();
    await putProofReceipt({ userSub: "proof-1", receiptId: "proof-receipt-1" }, { put });
    expect(put).toHaveBeenCalledWith("proof-1", "proof-receipt-1", expect.objectContaining({ formBundleNumber: "256616771364" }), "probe");
  });

  it("deletes the item by the hashed account and the receipt id", async () => {
    const run = vi.fn().mockResolvedValue({});
    const hash = vi.fn().mockReturnValue("hashed");
    await deleteProofReceipt({ userSub: "proof-1", receiptId: "proof-receipt-1" }, { hash, run });
    const DeleteCommand = vi.fn();
    run.mock.calls[0][0]({ DeleteCommand });
    expect(DeleteCommand).toHaveBeenCalledWith({
      TableName: "ci-env-receipts",
      Key: { hashedSub: "hashed", receiptId: "proof-receipt-1" },
    });
  });
});
