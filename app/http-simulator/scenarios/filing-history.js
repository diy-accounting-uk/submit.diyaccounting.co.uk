// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/http-simulator/scenarios/filing-history.js
// Filing histories and filed documents for the simulator's companies. 00000001 holds two sets of
// accounts: the latest filed by software, with an iXBRL document built by the micro-entity accounts
// builder from the company's own profile, and the one before filed on paper, as a PDF only. Its
// confirmation statement is a PDF. 00000003 holds one set of accounts, filed on paper as a PDF only.
// 12345678 holds more filings than a lookup reads (620 changes of registered office after its
// incorporation, no accounts). Each other company holds its incorporation alone. A filing history item links its document as the
// live register does, on the Document API's host.

import { buildMicroEntityAccounts } from "../../services/microEntityAccountsIxbrl.js";
import { getCompany } from "./companies.js";

const DOCUMENT_API_HOST = "https://document-api.company-information.service.gov.uk";
const PDF_CONTENT = "%PDF-1.4\n% Simulator filed document\n%%EOF\n";

const IXBRL_DOCUMENT_ID = "SIMDOC00000001AA2098";
const PAPER_DOCUMENT_ID = "SIMDOC00000001AA2097";
const CONFIRMATION_DOCUMENT_ID = "SIMDOC00000001CS2098";
const PDF_ONLY_DOCUMENT_ID = "SIMDOC00000003AA2098";

function filing({ companyNumber, transactionId, category, type, description, madeUpDate, date, pages, paperFiled, documentId }) {
  return {
    transaction_id: transactionId,
    category,
    type,
    description,
    description_values: madeUpDate ? { made_up_date: madeUpDate } : {},
    date,
    pages,
    ...(paperFiled ? { paper_filed: true } : {}),
    links: {
      self: `/company/${companyNumber}/filing-history/${transactionId}`,
      ...(documentId ? { document_metadata: `${DOCUMENT_API_HOST}/document/${documentId}` } : {}),
    },
  };
}

const historyByCompanyNumber = {
  "00000001": [
    filing({
      companyNumber: "00000001",
      transactionId: "SIMTX00000001AA2098",
      category: "accounts",
      type: "AA",
      description: "accounts-with-accounts-type-micro-entity",
      madeUpDate: "2098-04-30",
      date: "2098-11-02",
      pages: 4,
      documentId: IXBRL_DOCUMENT_ID,
    }),
    filing({
      companyNumber: "00000001",
      transactionId: "SIMTX00000001CS2098",
      category: "confirmation-statement",
      type: "CS01",
      description: "confirmation-statement-with-no-updates",
      madeUpDate: "2098-04-16",
      date: "2098-04-20",
      pages: 3,
      documentId: CONFIRMATION_DOCUMENT_ID,
    }),
    filing({
      companyNumber: "00000001",
      transactionId: "SIMTX00000001AA2097",
      category: "accounts",
      type: "AA",
      description: "accounts-with-accounts-type-total-exemption-full",
      madeUpDate: "2097-04-30",
      date: "2097-12-15",
      pages: 6,
      paperFiled: true,
      documentId: PAPER_DOCUMENT_ID,
    }),
  ],
  "00000003": [
    filing({
      companyNumber: "00000003",
      transactionId: "SIMTX00000003AA2098",
      category: "accounts",
      type: "AA",
      description: "accounts-with-accounts-type-micro-entity",
      madeUpDate: "2098-03-31",
      date: "2098-10-14",
      pages: 5,
      paperFiled: true,
      documentId: PDF_ONLY_DOCUMENT_ID,
    }),
  ],
};

function incorporationOnly(company) {
  return [
    filing({
      companyNumber: company.company_number,
      transactionId: `SIMTX${company.company_number}NEWINC`,
      category: "incorporation",
      type: "NEWINC",
      description: "incorporation-company",
      date: company.date_of_creation,
      pages: 12,
    }),
  ];
}

const LONG_HISTORY_COMPANY_NUMBER = "12345678";
const LONG_HISTORY_ADDRESS_CHANGES = 620;

// Newest first: one change of registered office a day, back from the last day of 2098, then the
// incorporation.
function longHistory(company) {
  const changes = Array.from({ length: LONG_HISTORY_ADDRESS_CHANGES }, (_, index) => {
    const date = new Date(Date.UTC(2098, 11, 31 - index)).toISOString().slice(0, 10);
    return filing({
      companyNumber: company.company_number,
      transactionId: `SIMTX${company.company_number}AD${String(index).padStart(4, "0")}`,
      category: "address",
      type: "AD01",
      description: "change-registered-office-address-company-with-date-old-address-new-address",
      date,
      pages: 1,
    });
  });
  return [...changes, ...incorporationOnly(company)];
}

function historyOf(companyNumber) {
  const company = getCompany(companyNumber);
  if (!company || company.status) return null;
  if (companyNumber === LONG_HISTORY_COMPANY_NUMBER) return longHistory(company);
  return historyByCompanyNumber[companyNumber] ?? incorporationOnly(company);
}

/**
 * One page of a company's filing history, newest first, narrowed to the comma-separated categories
 * when given. Returns null for an unknown company number.
 * @param {string} companyNumber
 * @param {{category?: string, itemsPerPage?: number, startIndex?: number}} [options]
 */
export function getFilingHistory(companyNumber, { category, itemsPerPage = 25, startIndex = 0 } = {}) {
  const history = historyOf(companyNumber);
  if (!history) return null;
  const categories = category ? String(category).split(",") : null;
  const items = categories ? history.filter((item) => categories.includes(item.category)) : history;
  return {
    total_count: items.length,
    items_per_page: itemsPerPage,
    start_index: startIndex,
    filing_history_status: "filing-history-available",
    items: items.slice(startIndex, startIndex + itemsPerPage),
  };
}

/**
 * One filing history item. Returns null for an unknown company or transaction.
 * @param {string} companyNumber
 * @param {string} transactionId
 */
export function getFiling(companyNumber, transactionId) {
  return historyOf(companyNumber)?.find((item) => item.transaction_id === transactionId) ?? null;
}

let ixbrlDocument;

// The latest set of 00000001's accounts as the micro-entity accounts builder writes it.
function ixbrlAccounts() {
  if (ixbrlDocument === undefined) {
    const company = getCompany("00000001");
    ixbrlDocument = buildMicroEntityAccounts({
      companyNumber: company.company_number,
      companyName: company.company_name,
      registeredOffice: { addressLine1: "1 Example Street", cityOrTown: "Cardiff", postalCode: "CF14 3UZ" },
      periodStart: company.accounts.last_accounts.period_start_on,
      periodEnd: company.accounts.last_accounts.period_end_on,
      averageNumberOfEmployees: 2,
      directorName: "Eleanor Bramwell",
      dateOfApproval: "2098-10-20",
      balanceSheet: {
        current: {
          fixedAssets: 10000,
          currentAssets: 5000,
          creditorsWithinOneYear: 3000,
          creditorsAfterOneYear: 2000,
          calledUpShareCapital: 100,
          profitAndLossAccount: 9900,
          capitalAndReserves: 10000,
        },
      },
    });
  }
  return ixbrlDocument;
}

const documents = {
  [IXBRL_DOCUMENT_ID]: {
    companyNumber: "00000001",
    category: "accounts",
    pages: 4,
    content: { "application/pdf": () => PDF_CONTENT, "application/xhtml+xml": ixbrlAccounts },
  },
  [PAPER_DOCUMENT_ID]: { companyNumber: "00000001", category: "accounts", pages: 6, content: { "application/pdf": () => PDF_CONTENT } },
  [PDF_ONLY_DOCUMENT_ID]: { companyNumber: "00000003", category: "accounts", pages: 5, content: { "application/pdf": () => PDF_CONTENT } },
  [CONFIRMATION_DOCUMENT_ID]: {
    companyNumber: "00000001",
    category: "confirmation-statement",
    pages: 3,
    content: { "application/pdf": () => PDF_CONTENT },
  },
};

/**
 * A filed document's metadata, listing the content types it is held in. Returns null for an
 * unknown document.
 * @param {string} documentId
 * @param {string} baseUrl - the simulator's own address, for the document links
 */
export function getDocumentMetadata(documentId, baseUrl) {
  const document = documents[documentId];
  if (!document) return null;
  const resources = Object.fromEntries(
    Object.entries(document.content).map(([type, build]) => [type, { content_length: Buffer.byteLength(build()) }]),
  );
  return {
    company_number: document.companyNumber,
    category: document.category,
    pages: document.pages,
    links: { self: `${baseUrl}/document/${documentId}`, document: `${baseUrl}/document/${documentId}/content` },
    resources,
  };
}

/**
 * A filed document's content in one content type. Returns null for an unknown document, and
 * { notAcceptable: true } when the document is not held in that type.
 * @param {string} documentId
 * @param {string} contentType
 */
export function getDocumentContent(documentId, contentType) {
  const document = documents[documentId];
  if (!document) return null;
  const build = document.content[contentType];
  return build ? { content: build() } : { notAcceptable: true };
}
