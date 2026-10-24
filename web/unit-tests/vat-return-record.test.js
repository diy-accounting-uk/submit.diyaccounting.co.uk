// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/vat-return-record.test.js

import { describe, it, expect, beforeAll } from "vitest";

describe("vat-return-record", () => {
  let record;
  let boxes;

  beforeAll(async () => {
    globalThis.window = globalThis;
    await import("../public/lib/money-format.js");
    await import("../public/lib/hmrc-field-table.js");
    boxes = window.HmrcFieldTable.VAT_RETURN_BOXES;
    record = await import("../public/lib/vat-return-record.js");
  });

  const returnData = {
    vatDueSales: 1234.56,
    vatDueAcquisitions: 0,
    totalVatDue: 1234.56,
    vatReclaimedCurrPeriod: 234.5,
    netVatDue: 1000.06,
    totalValueSalesExVAT: 6173,
    totalValuePurchasesExVAT: 1172,
    totalValueGoodsSuppliedExVAT: 0,
    totalAcquisitionsExVAT: 0,
  };

  const sections = (data) =>
    record.vatReturnRecordSections({
      data,
      boxes,
      vatNumber: "123456789",
      periodHtml: "<strong>1 Jul 2026 to 30 Sep 2026</strong>",
      declarationHtml: "Finalised: Yes",
    });

  it("prints boxes 1 to 5 with pence and boxes 6 to 9 in whole pounds", () => {
    const { moneyHtml, turnoverHtml } = sections(returnData);
    expect(moneyHtml).toContain(">1,234.56<");
    expect(moneyHtml).toContain(">234.50<");
    expect(moneyHtml).toContain(">0.00<");
    expect(turnoverHtml).toContain(">6,173<");
    expect(turnoverHtml).not.toContain("6,173.00");
  });

  it("starts each label with its box number and gives each row a stable id and field name", () => {
    const { moneyHtml, turnoverHtml } = sections(returnData);
    for (let box = 1; box <= 9; box += 1) {
      const html = box <= 5 ? moneyHtml : turnoverHtml;
      expect(html).toMatch(new RegExp(`<tr id="vatReturnBox${box}" data-hmrc-field="[A-Za-z]+"[^>]*><td class="label">Box ${box}: `));
    }
  });

  it("shows a dash for a box HMRC left out, never a nought, undefined or NaN", () => {
    const { moneyHtml, turnoverHtml } = sections({ vatDueSales: 10, netVatDue: "abc", totalValueSalesExVAT: null });
    for (const html of [moneyHtml, turnoverHtml]) {
      expect(html).not.toContain("undefined");
      expect(html).not.toContain("NaN");
      expect(html).not.toContain("null");
    }
    expect(moneyHtml.match(/>—</g)).toHaveLength(4);
    expect(turnoverHtml.match(/>—</g)).toHaveLength(4);
  });

  it("puts the VAT number and the period in the record heading", () => {
    const { moneyHtml } = sections(returnData);
    expect(moneyHtml).toContain("VAT registration number 123456789");
    expect(moneyHtml).toContain("Period: <strong>1 Jul 2026 to 30 Sep 2026</strong>");
  });

  it("leaves out the VAT number line when there is none", () => {
    const { moneyHtml } = record.vatReturnRecordSections({ data: returnData, boxes, vatNumber: "", periodHtml: "x", declarationHtml: "y" });
    expect(moneyHtml).not.toContain("VAT registration number");
  });

  it("records the receipt as HMRC returned it, and says so when a reference is missing", () => {
    const html = record.vatReceiptRecordHtml({
      processingDateText: "30 September 2026 at 11:15",
      formBundleNumber: "256660290587",
      paymentIndicator: "DD",
    });
    expect(html).toContain("Form bundle number 256660290587");
    expect(html).toContain('<td class="label text-value">DD</td>');
    expect(html).toContain('<td class="label text-value">Not returned by HMRC</td>');
    expect(html).not.toContain("undefined");
  });

  it("escapes markup in values HMRC returned", () => {
    const html = record.vatReceiptRecordHtml({ processingDateText: "x", formBundleNumber: "<b>1</b>", paymentIndicator: "A&B" });
    expect(html).not.toContain("<b>1</b>");
    expect(html).toContain("A&amp;B");
  });
});
