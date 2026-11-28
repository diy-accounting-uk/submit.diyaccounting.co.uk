// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/vat-fields.js
// The nine boxes of the VAT return as data: the form field, HMRC's box number, the section of VAT
// Notice 700/12 that says what goes in the box, and the cell of DIY Accounting's VAT workbook that
// holds the figure. The return form reads this table for each box's note and its "In DIY
// Accounting's spreadsheets" disclosure.

// page-chrome.js gives the text in the chosen language; without it (under Node, or a test that stubs
// the chrome) the English stands.
function siteText(id, english, values) {
  if (globalThis.siteText) return globalThis.siteText(id, english, values);
  return english.replace(/\{([a-z]+)\}/g, (whole, name) => (values && name in values ? String(values[name]) : whole));
}

export const VAT_NOTICE_URL = "https://www.gov.uk/guidance/how-to-fill-in-and-submit-your-vat-return-vat-notice-70012";

/** The section of VAT Notice 700/12 for a box. */
export function noticeUrl(box) {
  return `${VAT_NOTICE_URL}#filling-in-box-${box}`;
}

// The VAT workbook of the limited company package. Each quarter has its own sheet, VATQtr1 to
// VATQtr5, with the boxes in the same cells.
export const WORKBOOK = "Vatreturns.xlsx";
export const FIRST_QUARTER_SHEET = "VATQtr1";

function quarterCell(cell) {
  return `${WORKBOOK}!${FIRST_QUARTER_SHEET}!${cell}`;
}

export const VAT_BOX_FIELDS = [
  {
    id: "vatDueSales",
    box: 1,
    source: { thisYear: quarterCell("G9"), workbookLabel: "VAT due on sales" },
  },
  {
    id: "vatDueAcquisitions",
    box: 2,
    source: {
      thisYear: quarterCell("G11"),
      workbookLabel: "VAT due on purchases from other EU states",
      differenceNote: siteText(
        "vat.source-box-2-note",
        "The spreadsheet sets box 2 to 0 and asks you to work out any amount yourself (its note in B25). Box 2 is now only for goods brought into Northern Ireland from EU member states.",
      ),
    },
  },
  {
    id: "totalVatDue",
    box: 3,
    source: {
      thisYear: quarterCell("G13"),
      workbookLabel: "VAT due on sales",
      differenceNote: siteText(
        "vat.source-box-3-note",
        "The spreadsheet labels box 3 with the words of box 1. Its figure is box 1 plus box 2, as HMRC's box 3 is.",
      ),
    },
  },
  {
    id: "vatReclaimedCurrPeriod",
    box: 4,
    source: { thisYear: quarterCell("G15"), workbookLabel: "VAT reclaimed on purchases" },
  },
  {
    id: "netVatDue",
    box: 5,
    source: {
      thisYear: quarterCell("G17"),
      workbookLabel: "Net VAT to be PAID to Customs",
      differenceNote: siteText(
        "vat.source-box-5-note",
        "The spreadsheet's label names an amount to pay. HMRC's box 5 is the difference between boxes 3 and 4 either way, to pay or to reclaim.",
      ),
    },
  },
  {
    id: "totalValueSalesExVAT",
    box: 6,
    source: { thisYear: quarterCell("G21"), workbookLabel: "Total value of sales excluding VAT" },
  },
  {
    id: "totalValuePurchasesExVAT",
    box: 7,
    source: { thisYear: quarterCell("G23"), workbookLabel: "Total value of purchases excluding VAT" },
  },
  { id: "totalValueGoodsSuppliedExVAT", box: 8 },
  { id: "totalAcquisitionsExVAT", box: 9 },
];

/** The field for a form input id, or undefined. */
export function vatBoxField(id) {
  return VAT_BOX_FIELDS.find((field) => field.id === id);
}
