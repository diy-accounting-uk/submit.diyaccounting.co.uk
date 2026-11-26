// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/filed-receipts.test.js

import { describe, test, expect } from "vitest";
import { filedAccountsDocumentOf, filedBoxesOf, receiptsForForm } from "../public/lib/filed-receipts.js";
import { formEntriesFromFiledBoxes } from "../public/lib/ct600-fields.js";

const CT600_RECORD = {
  kind: "company-tax-return",
  statusCode: "ACCEPT",
  correlationId: "ABCDEF0123456789",
  filed: {
    boxes: {
      1: "Harbour Lane Joinery Limited",
      2: "00000001",
      3: "8596148860",
      30: "2025-04-01",
      35: "2026-03-31",
      160: 1200,
      170: 350,
      326: 0,
      515: 12.5,
      975: "Eleanor Bramwell",
      440: 9198,
    },
    accountsIxbrl: "<html>small company accounts</html>",
  },
};

const ACCOUNTS_RECORD = {
  kind: "companies-house-accounts",
  statusCode: "ACCEPT",
  submissionNumber: "00001A",
  companyNumber: "00000001",
  filedDocument: "<html>micro-entity accounts</html>",
};

const LISTED = [
  {
    name: "a.json",
    kind: "company-tax-return",
    companyNumber: "00000001",
    periodStart: "2025-04-01",
    periodEnd: "2026-03-31",
    timestamp: "2026-10-01T09:00:00.000Z",
  },
  {
    name: "b.json",
    kind: "companies-house-accounts",
    companyNumber: "00000001",
    periodStart: "2025-04-01",
    periodEnd: "2026-03-31",
    timestamp: "2026-11-01T09:00:00.000Z",
  },
  {
    name: "c.json",
    kind: "companies-house-accounts",
    companyNumber: "00000002",
    periodStart: "2025-04-01",
    periodEnd: "2026-03-31",
    timestamp: "2026-11-02T09:00:00.000Z",
  },
  {
    name: "d.json",
    kind: "companies-house-accounts",
    companyNumber: "00000001",
    periodStart: "2024-04-01",
    periodEnd: "2025-03-31",
    timestamp: "2025-11-01T09:00:00.000Z",
  },
  { name: "e.json", kind: null, companyNumber: undefined, timestamp: "2026-11-03T09:00:00.000Z" },
  { name: "f.json", kind: "company-tax-return", companyNumber: undefined, timestamp: "2026-11-04T09:00:00.000Z" },
];

describe("filed-receipts", () => {
  test("lists the company's Company Tax Return and accounts receipts, newest first, and no other company's", () => {
    expect(receiptsForForm(LISTED, { companyNumber: "00000001" }).map((receipt) => receipt.name)).toEqual(["b.json", "a.json", "d.json"]);
  });

  test("a form that holds a period lists only the filings of that period", () => {
    expect(
      receiptsForForm(LISTED, { companyNumber: "00000001", periodStart: "2025-04-01", periodEnd: "2026-03-31" }).map(
        (receipt) => receipt.name,
      ),
    ).toEqual(["b.json", "a.json"]);
  });

  test("a company number matches whatever its case, and no company lists nothing", () => {
    expect(receiptsForForm([{ ...LISTED[0], companyNumber: "sc000001" }], { companyNumber: "SC000001" })).toHaveLength(1);
    expect(receiptsForForm(LISTED, { companyNumber: "" })).toEqual([]);
  });

  test("a Company Tax Return fills from the accounts it filed and its boxes", () => {
    expect(filedAccountsDocumentOf(CT600_RECORD)).toBe("<html>small company accounts</html>");
    expect(filedBoxesOf(CT600_RECORD)).toBe(CT600_RECORD.filed.boxes);
  });

  test("accounts filed at Companies House fill from their document, with no boxes", () => {
    expect(filedAccountsDocumentOf(ACCOUNTS_RECORD)).toBe("<html>micro-entity accounts</html>");
    expect(filedBoxesOf(ACCOUNTS_RECORD)).toBeNull();
  });

  test("a receipt that kept no document, or of another kind, gives nothing", () => {
    expect(filedAccountsDocumentOf({ kind: "company-tax-return", filed: { boxes: {} } })).toBeNull();
    expect(filedAccountsDocumentOf({ formBundleNumber: "FB1" })).toBeNull();
  });

  test("a filed return's boxes give back the period and each form field that files to one box, and no worked box", () => {
    const entries = Object.fromEntries(formEntriesFromFiledBoxes(CT600_RECORD.filed.boxes));
    expect(entries).toEqual({
      periodStart: "2025-04-01",
      periodEnd: "2026-03-31",
      utr: "8596148860",
      lossesBroughtForward: "1200",
      nonTradingLoanRelationshipCredits: "350",
      associatedCompanies: "0",
      incomeTaxDeducted: "12.50",
      declarantName: "Eleanor Bramwell",
    });
  });
});
