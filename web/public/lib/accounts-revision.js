// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability CH-24 File revised accounts to Companies House
// - **Use when:** a page offers to revise accounts already filed at Companies House, from the receipt of the accepted filing.
// - **Does:** accounts-revision.js reads an accounts receipt, refuses one that is not accounts, not accepted or part of a joint filing, and maps the filed document with the books bundle's mapIxbrlAccounts for either regime. It answers the regime, the original approval date, the period, the figures, the signer and the dormant facts, and keeps the filed document and the mapped accounts. It shows the page's revision section and checks it: both revision texts, and a new approval date on or after the original. fileMicroEntityAccounts.html and fileSmallCompanyAccounts.html file the revision with the accounts request's revision field; a filleted copy holds no profit and loss account, so the small company form asks for those lines.
// - **Run:** `companies-house/fileMicroEntityAccounts.html?amend=<receipt name>` or `companies-house/fileSmallCompanyAccounts.html?amend=<receipt name>`, opened from "Amend" on companies-house/filings.html
// - **Entry:** `web/public/lib/accounts-revision.js:readRevisionSource`; `web/public/lib/accounts-revision.js:checkRevision`
// - **Files:** web/public/lib/accounts-revision.js, web/public/companies-house/fileMicroEntityAccounts.page.js, web/public/companies-house/fileSmallCompanyAccounts.page.js, web/public/companies-house/filings.page.js, web/public/lib/filing-record.js, web/browser-tests/fileMicroEntityAccounts.amend.browser.test.js
// - **Keywords:** revised accounts, amend accounts, revision, section 454, 28 days, original approval date, revision texts, file-revised-accounts
// - **Related:** CH-07, CH-08
// @end-capability

// web/public/lib/accounts-revision.js
// Revised accounts start from the receipt of the accounts they revise. The module reads that receipt,
// maps the document filed with it, and checks the revision the customer describes. It holds no page
// state: a page passes in its fetch, its bundle loader and its elements.

export const ACCOUNTS_RECEIPT_KIND = "companies-house-accounts";

// The law asks the directors to deliver revised accounts within this many days of approving them.
export const DELIVERY_DAYS = 28;

const DAY_MS = 24 * 60 * 60 * 1000;

// page-chrome.js gives the text in the chosen language; without it the English stands.
function siteText(id, english, values) {
  if (globalThis.siteText) return globalThis.siteText(id, english, values);
  return english.replace(/\{([a-z]+)\}/g, (whole, name) => (values && name in values ? String(values[name]) : whole));
}

/**
 * Whether this person may file revised accounts in this environment: the catalogue shows them the
 * revised accounts activity. A catalogue or environment that cannot be read offers no revision.
 * @returns {Promise<boolean>}
 */
export async function isRevisionOfferedHere() {
  try {
    const service = await import("/lib/services/catalog-service.js");
    const viewerSettings = await import("/lib/services/viewer-settings.js");
    const [text, environmentName, viewer] = await Promise.all([
      service.fetchCatalogText(),
      service.fetchCurrentEnvironmentName(),
      viewerSettings.fetchViewer(),
    ]);
    return service.isRevisedAccountsOffered(service.parseCatalogueText(text), environmentName, viewer);
  } catch (error) {
    console.warn("Revised accounts are off because the catalogue could not be read:", error);
    return false;
  }
}

/**
 * Why a receipt cannot be revised here, or null when it can.
 * @param {object|null} receipt - the stored receipt
 * @returns {string|null}
 */
export function refusalOf(receipt) {
  if (receipt?.kind !== ACCOUNTS_RECEIPT_KIND) {
    return siteText("ch.revision.refuse-kind", "That receipt is not an accounts filing, so there are no accounts to revise.");
  }
  if (receipt.statusCode !== "ACCEPT") {
    return siteText("ch.revision.refuse-not-accepted", "Companies House did not accept those accounts, so there is nothing to revise.");
  }
  if (receipt.jointFilingId) {
    return siteText(
      "ch.revision.refuse-joint",
      "Those accounts were filed with a Company Tax Return, so revise them on the Company Tax Return page.",
    );
  }
  if (!receipt.filedDocument) {
    return siteText("ch.revision.refuse-no-document", "The document filed with that receipt was not kept, so it cannot be revised here.");
  }
  return null;
}

/**
 * The accounts a receipt filed, mapped for a revision.
 * @param {object} receipt - an accounts receipt that refusalOf accepts
 * @param {{mapIxbrlAccounts: Function}} bundle - the books bundle
 */
export function revisionSourceOf(receipt, bundle) {
  const mapped = bundle.mapIxbrlAccounts(receipt.filedDocument, { regime: "any" });
  return {
    receipt,
    regime: mapped.regime,
    companyNumber: mapped.company?.number || receipt.companyNumber,
    approvalDate: mapped.approvalDate,
    period: mapped.period,
    figures: mapped.balanceSheet,
    averageEmployees: mapped.averageEmployees,
    signer: mapped.signer || mapped.directors?.[0] || "",
    dormant: { dormant: mapped.dormant, tradingStatus: mapped.tradingStatus, shareNote: mapped.shareNote },
    filedDocument: receipt.filedDocument,
    mapped,
  };
}

/**
 * Read a receipt and the accounts it filed.
 * @param {string} receiptName - the receipt's stored name
 * @param {{fetchReceipt: (name: string) => Promise<Response>, loadBundle: () => Promise<object>}} io
 * @returns {Promise<{refusal: string}|{source: object}>}
 */
export async function readRevisionSource(receiptName, { fetchReceipt, loadBundle }) {
  const response = await fetchReceipt(receiptName);
  if (!response.ok) {
    return { refusal: siteText("ch.revision.refuse-load", "We could not load that receipt. Open the filing again from your receipts.") };
  }
  const receipt = await response.json();
  const refusal = refusalOf(receipt);
  if (refusal) return { refusal };
  return { source: revisionSourceOf(receipt, await loadBundle()) };
}

/**
 * The problems with a revision: each revision text is required, and the revised accounts are
 * approved on or after the date the original accounts were approved.
 * @param {{originalDateOfApproval: string, nonCompliance: string, amendments: string, dateApproved: string}} revision
 * @returns {{field: "nonCompliance"|"amendments"|"dateApproved", message: string}[]}
 */
export function checkRevision({ originalDateOfApproval, nonCompliance, amendments, dateApproved }) {
  const problems = [];
  if (!String(nonCompliance ?? "").trim()) {
    problems.push({
      field: "nonCompliance",
      message: siteText("ch.revision.need-non-compliance", "Say what was wrong with the original accounts"),
    });
  }
  if (!String(amendments ?? "").trim()) {
    problems.push({ field: "amendments", message: siteText("ch.revision.need-amendments", "Say what the revised accounts change") });
  }
  if (dateApproved && originalDateOfApproval && dateApproved < originalDateOfApproval) {
    problems.push({
      field: "dateApproved",
      message: siteText(
        "ch.revision.date-before-original",
        "The revised accounts must be approved on or after {date}, when the original accounts were approved",
        {
          date: originalDateOfApproval,
        },
      ),
    });
  }
  return problems;
}

/**
 * Whether the revised accounts were approved more than the delivery days before today.
 * @param {string} dateApproved - YYYY-MM-DD
 * @param {Date} today
 */
export function isPastDeliveryDays(dateApproved, today) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateApproved ?? ""))) return false;
  const approved = Date.parse(`${dateApproved}T00:00:00Z`);
  const startOfToday = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return startOfToday - approved > DELIVERY_DAYS * DAY_MS;
}

/**
 * Show the revision section for a source and leave the texts to the customer.
 * @param {{section: HTMLElement, originalDate: HTMLInputElement, nonCompliance: HTMLTextAreaElement, amendments: HTMLTextAreaElement}} elements
 * @param {{approvalDate: string}} source
 */
export function showRevisionSection({ section, originalDate, nonCompliance, amendments }, source) {
  originalDate.value = source.approvalDate || "";
  nonCompliance.required = true;
  amendments.required = true;
  section.hidden = false;
}

/** The revision field of the accounts request. */
export function revisionPayload({ originalDate, nonCompliance, amendments }) {
  return {
    originalDateOfApproval: originalDate.value,
    nonCompliance: nonCompliance.value.trim(),
    amendments: amendments.value.trim(),
  };
}
