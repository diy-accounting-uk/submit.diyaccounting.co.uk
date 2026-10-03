// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/http-simulator/scenarios/assist.js
// Gov-Test-Scenario handlers and canned report content for the HMRC Assist endpoints

const ACTION = "If the figures are correct, you do not need to change anything.";

/**
 * The three illustrative VAT messages, in HMRC's order. {vrn} in a path is replaced per request.
 */
const VAT_MESSAGES = [
  {
    title: "Review the VAT on purchases (input tax)",
    body: "The VAT on purchases (box 4) appears high compared to the value of the total purchases (box 7).",
    action: ACTION,
    links: [
      {
        title: "Go to GOV.UK to learn more about claiming VAT on purchases (input tax)",
        url: "https://www.gov.uk/reclaim-vat",
      },
    ],
    path: "/organisations/vat/{vrn}/returns#vatReclaimedCurrPeriod",
  },
  {
    title: "Review the VAT on sales (output tax)",
    body: "For the business in this sector, the VAT due on sales (box 1) appears low compared to the total value of the sales (box 6). Check zero-rated and reduced-rated sales are correct.",
    action: ACTION,
    links: [
      {
        title: "Go to GOV.UK to learn more about VAT due on sales (output tax)",
        url: "https://www.gov.uk/vat-rates",
      },
    ],
    path: "/organisations/vat/{vrn}/returns#vatDueSales",
  },
  {
    title: "Review the online sales (outputs)",
    body: "The total sales (box 6) are lower than expected. Check that all sales, including those from online platforms and in-person sales are included.",
    action: ACTION,
    links: [
      {
        title: "Go to GOV.UK to learn more about declaring all sales income and commissions",
        url: "https://www.gov.uk/vat-record-keeping",
      },
    ],
    path: "/organisations/vat/{vrn}/returns#totalValueSalesExVAT",
  },
];

const ITSA_MESSAGES = [
  {
    title: "Review your self-employment income",
    body: "Your turnover appears low compared to similar businesses.",
    action: "If the figures are correct, you do not need to change anything.",
    links: [{ title: "Go to GOV.UK to learn more about working out your business income", url: "https://www.gov.uk/income-tax" }],
    path: "/individuals/business/self-employment/{nino}/{businessId}/cumulative/{taxYear}",
  },
  {
    title: "Review your allowable expenses",
    body: "Your expenses appear high compared to your turnover.",
    action: "If the figures are correct, you do not need to change anything.",
    links: [
      { title: "Go to GOV.UK to learn more about simplified expenses", url: "https://www.gov.uk/simpler-income-tax-simplified-expenses" },
    ],
    path: "/individuals/business/self-employment/{nino}/{businessId}/cumulative/{taxYear}",
  },
];

export const ITSA_NO_MESSAGES_CALCULATION_ID = "620490b4-06e3-4fef-a555-6fd0877dc7ca";
export const ITSA_NOT_FOUND_CALCULATION_ID = "640490b4-06e3-4fef-a555-6fd0877dc7ca";

export function vatDefaultMessages(vrn) {
  return VAT_MESSAGES.map((message) => ({
    ...message,
    links: message.links.map((link) => ({ ...link })),
    path: message.path.replace("{vrn}", vrn),
  }));
}

export function itsaDefaultMessages() {
  return ITSA_MESSAGES.map((message) => ({ ...message, links: message.links.map((link) => ({ ...link })) }));
}

const NOT_FOUND = { status: 404, body: { code: "MATCHING_RESOURCE_NOT_FOUND", message: "Matching resource not found" } };
const NOT_AUTHORISED = {
  status: 403,
  body: { code: "CORRELATION_ID_NOT_AUTHORISED", message: "The correlation id was not issued for this report" },
};

/**
 * Get the report-request response for a Gov-Test-Scenario header.
 * @param {string|undefined} scenario - Gov-Test-Scenario header value
 * @returns {null|{status: number, body?: object}}
 */
export function getReportScenarioResponse(scenario) {
  if (!scenario) return null;
  switch (scenario.toUpperCase()) {
    case "NO_MESSAGES":
      return { status: 204 };
    case "NOT_FOUND":
      return NOT_FOUND;
    default:
      return null;
  }
}

/**
 * Get the acknowledge response for a Gov-Test-Scenario header.
 * @param {string|undefined} scenario - Gov-Test-Scenario header value
 * @returns {null|{status: number, body?: object}}
 */
export function getAcknowledgeScenarioResponse(scenario) {
  if (!scenario) return null;
  switch (scenario.toUpperCase()) {
    case "CORRELATION_ID_NOT_AUTHORISED":
      return NOT_AUTHORISED;
    case "NOT_FOUND":
      return NOT_FOUND;
    default:
      return null;
  }
}

export const acknowledgeErrors = { NOT_FOUND, NOT_AUTHORISED };
