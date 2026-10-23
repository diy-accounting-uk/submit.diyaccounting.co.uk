// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/hmrcAssistApi.js
//
// The one place that knows the HMRC Assist wire contracts. The Income Tax half follows the
// published Self Assessment Assist (MTD) 1.0 specification. The VAT half follows the published
// VAT Assist (MTD) 1.0 specification (mtd-transaction-risking).

const ACCEPT_HEADER = "application/vnd.hmrc.1.0+json";

const VAT_BOX_FIELDS = [
  "vatDueSales",
  "vatDueAcquisitions",
  "totalVatDue",
  "vatReclaimedCurrPeriod",
  "netVatDue",
  "totalValueSalesExVAT",
  "totalValuePurchasesExVAT",
  "totalValueGoodsSuppliedExVAT",
  "totalAcquisitionsExVAT",
];

function normaliseMessages(list) {
  return (list || []).map((message) => ({
    title: message.title,
    body: message.body,
    action: message.action,
    links: (message.links || []).map((link) => ({ title: link.title, url: link.url })),
    path: message.path,
  }));
}

/**
 * Reduce an Income Tax HMRC Assist report to the shape the rest of the system uses. Message
 * text, links, paths and order pass through unchanged.
 * @param {Object} json - The HMRC report body
 * @returns {{reportId: string, correlationId: string, messages: Array<{title: string, body: string, action?: string, links: Array<{title: string, url: string}>, path: string}>}}
 */
function normaliseReport(json) {
  return { reportId: json?.reportId, correlationId: json?.correlationId, messages: normaliseMessages(json?.messages) };
}

/**
 * Reduce a VAT Assist feedback response to the same shape: the English feedback, unchanged and
 * in order.
 * @param {Object} json - The HMRC feedback body
 */
function normaliseVatReport(json) {
  return { reportId: json?.reportId, correlationId: json?.correlationId, messages: normaliseMessages(json?.englishFeedback) };
}

export const vatAssist = {
  acceptHeader: ACCEPT_HEADER,
  scopes: ["write:vat"],
  reportUrl: (base, { vrn }) => `${base}/organisations/vat-assist/feedback/${vrn}`,
  acknowledgeUrl: (base, { vrn, reportId, correlationId, presentedDateTime }) =>
    `${base}/organisations/vat-assist/acknowledge/${vrn}/${reportId}/${correlationId}?presentedDateTime=${encodeURIComponent(presentedDateTime)}`,
  reportBody: ({ periodKey }, figures) => {
    const body = { periodKey };
    for (const field of VAT_BOX_FIELDS) body[field] = figures[field];
    return body;
  },
  normaliseReport: normaliseVatReport,
  normaliseWelshMessages: (json) => normaliseMessages(json?.welshFeedback),
  // The "no feedback" answer is one message numbered 0, without a correlation id; it needs no acknowledgement.
  isNoFeedback: (json) => (json?.englishFeedback || []).every((item) => Number(item.itemNumber) === 0),
};

export const itsaAssist = {
  acceptHeader: ACCEPT_HEADER,
  scopes: ["read:self-assessment-assist", "write:self-assessment-assist"],
  reportUrl: (base, { nino, taxYear, calculationId }) =>
    `${base}/individuals/self-assessment/assist/reports/${nino}/${taxYear}/${calculationId}`,
  acknowledgeUrl: (base, { nino, reportId, correlationId }) =>
    `${base}/individuals/self-assessment/assist/reports/acknowledge/${nino}/${reportId}/${correlationId}`,
  reportBody: () => undefined,
  normaliseReport,
};

export { VAT_BOX_FIELDS };
