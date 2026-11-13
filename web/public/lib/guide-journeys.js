// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// The guide's journeys and the wording of their titles. The guide page script renders them in the
// browser and the build script that writes the committed guide page reads the same list.

export const GROUPS = [
  {
    title: "VAT",
    intro: "Check what is due, file the return and look up what HMRC holds.",
    journeys: [
      { video: "hmrc-authorise" },
      { video: "view-obligations" },
      { video: "submit-return" },
      { video: "vat-from-books" },
      { video: "vat-hmrc-assist" },
      { video: "view-return" },
      { video: "view-liabilities" },
      { video: "view-payments" },
      { video: "view-penalties" },
    ],
  },
  {
    title: "Income Tax (Self Assessment)",
    intro: "Quarterly updates, the year-end submission, losses and the tax calculation.",
    journeys: [
      { video: "itsa-business-details" },
      { video: "itsa-quarterly-update" },
      { video: "itsa-quarterly-from-books" },
      { video: "itsa-self-employment-amend" },
      { video: "itsa-uk-property-year" },
      { video: "itsa-annual-from-book" },
      { video: "itsa-loss-claims" },
      { video: "itsa-foreign-property-losses" },
      { video: "itsa-carry-back-adjustments" },
      { video: "itsa-in-year-estimate" },
      { video: "itsa-year-part" },
      { video: "itsa-year" },
    ],
  },
  {
    title: "Companies House",
    intro: "Look up a company, change its details and file with the registry.",
    journeys: [
      { video: "company-lookup" },
      { video: "change-registered-office" },
      { video: "change-registered-email" },
      { video: "file-confirmation-statement" },
      { video: "file-micro-entity-accounts" },
      { video: "file-small-company-accounts" },
      { video: "file-psc-verification-statement" },
    ],
  },
  {
    title: "Company Tax Return (CT600)",
    intro: "File the corporation tax return from a book, with the accounts, or for a period over 12 months.",
    journeys: [
      { video: "file-company-tax-return-book" },
      { video: "file-company-tax-return-typed" },
      { video: "file-company-tax-return-with-accounts" },
      { video: "file-company-tax-return-long-period" },
    ],
  },
  {
    title: "Receipts",
    intro: "Find a submission record again.",
    journeys: [{ video: "my-receipts" }],
  },
  {
    title: "Passes",
    intro: "Give a pass to someone else.",
    journeys: [{ video: "generate-pass-digital" }, { video: "generate-pass-physical" }],
  },
  {
    title: "Bundles and your account",
    intro: "Sign in, see what an activity costs and manage a subscription.",
    journeys: [{ video: "sign-in" }, { video: "tokens" }, { video: "subscription-management" }, { video: "bundles" }, { video: "tour" }],
  },
  {
    title: "Your books (diya-gl)",
    intro: "Keep sales and purchases in a book and see your profit.",
    journeys: [
      { video: "accounting-diya-gl-profit" },
      { video: "accounting-spreadsheet-profit" },
      {
        id: "diya-gl-storage",
        catalogueActivity: "diya-gl-storage",
        title: "Save your diya-gl books",
        steps: [
          ["Keep your book in diya-gl", "Write your sales and purchases to a diya-gl book."],
          ["Save it to your account", "With Resident Pro, the book saves to your account from diya-gl."],
          ["Use it in a filing", "Load the saved book into a VAT return, a quarterly update or a Company Tax Return."],
        ],
      },
    ],
  },
  {
    title: "MCP servers",
    intro: "Connect an assistant to your books and submissions.",
    journeys: [{ video: "mcp-hosted" }, { video: "mcp-harness" }, { video: "mcp-diya-gl" }, { video: "mcp-docker" }, { video: "mcp-cli" }],
  },
];

// "DIY Accounting Submit: view your VAT obligations (sandbox example)" becomes the title and a note.
export function splitTitle(raw) {
  const colon = raw.indexOf(":");
  let title = (colon === -1 ? raw : raw.slice(colon + 1)).trim();
  let note = "";
  const open = title.lastIndexOf("(");
  if (open !== -1 && title.endsWith(")")) {
    note = title.slice(open + 1, -1);
    title = title.slice(0, open).trim();
  }
  const startsWithProductName = title.startsWith("diya-gl");
  return { title: startsWithProductName ? title : title.charAt(0).toUpperCase() + title.slice(1), note };
}
