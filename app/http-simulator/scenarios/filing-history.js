// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/http-simulator/scenarios/filing-history.js
// Filing histories and filed documents for the simulator's companies, dated from the register's
// accounting dates (fixtures/register.js). 00000001 holds two sets of accounts: the latest filed by
// software, with an iXBRL document built by the micro-entity accounts builder from the company's own
// profile, and the one before filed on paper, as a PDF only. Its confirmation statement is a PDF.
// 00000003 holds one set of accounts, filed on paper as a PDF only, and after it the notice of an
// inspection location (SAIL) and of records moved to it. SC000001 holds one set of small company
// accounts filed by software, with both years and a profit and loss account, built by the small
// company accounts builder.
// 00000007 holds more filings than a lookup reads (620 changes of registered office after its
// incorporation, no accounts). Each other company holds its incorporation alone. A filing history item links its document as the
// live register does, on the Document API's host.

import { buildMicroEntityAccounts } from "../../services/microEntityAccountsIxbrl.js";
import { buildSmallCompanyAccounts } from "../../services/smallCompanyAccountsIxbrl.js";
import { getCompany } from "./companies.js";
import { registerDates, registerCompany, confirmationStatementDates, addressLine1, addDays, PEOPLE } from "../fixtures/register.js";

const DATES = registerDates();
const FILED_YEAR = DATES.filed.end.slice(0, 4);
const EARLIER_YEAR = DATES.earlier.end.slice(0, 4);
const HARBOUR_LANE = registerCompany("00000001");
const GLENMORE = registerCompany("SC000001");
const HARBOUR_LANE_STATEMENT = confirmationStatementDates(HARBOUR_LANE.incorporatedOn).lastMadeUpTo;
const officeOf = (company) => ({
  addressLine1: addressLine1(company.address),
  cityOrTown: company.address.locality,
  postalCode: company.address.postalCode,
});

const DOCUMENT_API_HOST = "https://document-api.company-information.service.gov.uk";
const SAIL_ADDRESS = "Unit 4, Harbour House 12 Quay Street Bristol BS1 4DJ";
const PDF_CONTENT = "%PDF-1.4\n% Simulator filed document\n%%EOF\n";

const IXBRL_DOCUMENT_ID = `SIMDOC00000001AA${FILED_YEAR}`;
const PAPER_DOCUMENT_ID = `SIMDOC00000001AA${EARLIER_YEAR}`;
const CONFIRMATION_DOCUMENT_ID = `SIMDOC00000001CS${FILED_YEAR}`;
const PDF_ONLY_DOCUMENT_ID = `SIMDOC00000003AA${FILED_YEAR}`;
const SMALL_IXBRL_DOCUMENT_ID = `SIMDOCSC000001AA${FILED_YEAR}`;

function filing({
  companyNumber,
  transactionId,
  category,
  type,
  description,
  madeUpDate,
  newAddress,
  date,
  pages,
  paperFiled,
  documentId,
}) {
  return {
    transaction_id: transactionId,
    category,
    type,
    description,
    description_values: { ...(madeUpDate ? { made_up_date: madeUpDate } : {}), ...(newAddress ? { new_address: newAddress } : {}) },
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
      transactionId: `SIMTX00000001AA${FILED_YEAR}`,
      category: "accounts",
      type: "AA",
      description: "accounts-with-accounts-type-micro-entity",
      madeUpDate: DATES.filed.end,
      date: DATES.filed.filedOn,
      pages: 4,
      documentId: IXBRL_DOCUMENT_ID,
    }),
    filing({
      companyNumber: "00000001",
      transactionId: `SIMTX00000001CS${HARBOUR_LANE_STATEMENT.slice(0, 4)}`,
      category: "confirmation-statement",
      type: "CS01",
      description: "confirmation-statement-with-no-updates",
      madeUpDate: HARBOUR_LANE_STATEMENT,
      date: addDays(HARBOUR_LANE_STATEMENT, 4),
      pages: 3,
      documentId: CONFIRMATION_DOCUMENT_ID,
    }),
    filing({
      companyNumber: "00000001",
      transactionId: `SIMTX00000001AA${EARLIER_YEAR}`,
      category: "accounts",
      type: "AA",
      description: "accounts-with-accounts-type-total-exemption-full",
      madeUpDate: DATES.earlier.end,
      date: DATES.earlier.filedOn,
      pages: 6,
      paperFiled: true,
      documentId: PAPER_DOCUMENT_ID,
    }),
  ],
  "00000003": [
    filing({
      companyNumber: "00000003",
      transactionId: `SIMTX00000003AD03${FILED_YEAR}`,
      category: "address",
      type: "AD03",
      description: "move-registers-to-sail-company-with-new-address",
      newAddress: SAIL_ADDRESS,
      date: addDays(DATES.filed.filedOn, 37),
      pages: 2,
    }),
    filing({
      companyNumber: "00000003",
      transactionId: `SIMTX00000003AD02${FILED_YEAR}`,
      category: "address",
      type: "AD02",
      description: "change-sail-address-company-with-new-address",
      newAddress: SAIL_ADDRESS,
      date: addDays(DATES.filed.filedOn, 37),
      pages: 1,
    }),
    filing({
      companyNumber: "00000003",
      transactionId: `SIMTX00000003AA${FILED_YEAR}`,
      category: "accounts",
      type: "AA",
      description: "accounts-with-accounts-type-micro-entity",
      madeUpDate: DATES.filed.end,
      date: addDays(DATES.filed.filedOn, -19),
      pages: 5,
      paperFiled: true,
      documentId: PDF_ONLY_DOCUMENT_ID,
    }),
  ],
  "SC000001": [
    filing({
      companyNumber: "SC000001",
      transactionId: `SIMTXSC000001AA${FILED_YEAR}`,
      category: "accounts",
      type: "AA",
      description: "accounts-with-accounts-type-total-exemption-full",
      madeUpDate: DATES.filed.end,
      date: addDays(DATES.filed.filedOn, 30),
      pages: 9,
      documentId: SMALL_IXBRL_DOCUMENT_ID,
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

const LONG_HISTORY_COMPANY_NUMBER = "00000007";
const LONG_HISTORY_ADDRESS_CHANGES = 620;

// Newest first: one change of registered office a day, back from the end of the last filed period,
// then the incorporation.
function longHistory(company) {
  const changes = Array.from({ length: LONG_HISTORY_ADDRESS_CHANGES }, (_, index) => {
    const date = addDays(DATES.filed.end, -index);
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
      registeredOffice: officeOf(HARBOUR_LANE),
      periodStart: company.accounts.last_accounts.period_start_on,
      periodEnd: company.accounts.last_accounts.period_end_on,
      averageNumberOfEmployees: 2,
      directorName: `${PEOPLE.eleanorBramwell.forename} ${PEOPLE.eleanorBramwell.surname}`,
      dateOfApproval: DATES.filed.approvedOn,
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

let smallIxbrlDocument;

// SC000001's set of small company accounts as the small company accounts builder writes it.
function smallIxbrlAccounts() {
  if (smallIxbrlDocument === undefined) {
    const company = getCompany("SC000001");
    smallIxbrlDocument = buildSmallCompanyAccounts({
      companyNumber: company.company_number,
      companyName: company.company_name,
      registeredOffice: officeOf(GLENMORE),
      periodStart: company.accounts.last_accounts.period_start_on,
      periodEnd: company.accounts.last_accounts.period_end_on,
      averageNumberOfEmployees: 3,
      principalActivity: "Industrial machinery engineering",
      accountingPolicies:
        "The financial statements have been prepared under the historical cost convention and in accordance with FRS 102 section 1A.",
      directors: [`${PEOPLE.catrionaMacleod.forename} ${PEOPLE.catrionaMacleod.surname}`],
      directorName: `${PEOPLE.catrionaMacleod.forename} ${PEOPLE.catrionaMacleod.surname}`,
      dateOfApproval: addDays(DATES.filed.approvedOn, 10),
      balanceSheet: {
        current: {
          fixedAssets: 8000,
          stocks: 600,
          debtors: 3400,
          cashAtBank: 9000,
          tradeCreditors: 1200,
          corporationTax: 1400,
          otherCreditors: 400,
          creditorsAfterOneYear: 3000,
          calledUpShareCapital: 100,
          profitAndLossAccount: 14900,
          capitalAndReserves: 15000,
        },
        prior: {
          fixedAssets: 7000,
          stocks: 500,
          debtors: 2500,
          cashAtBank: 6000,
          tradeCreditors: 1000,
          corporationTax: 900,
          otherCreditors: 600,
          creditorsAfterOneYear: 2500,
          calledUpShareCapital: 100,
          profitAndLossAccount: 10900,
          capitalAndReserves: 11000,
        },
      },
      profitAndLoss: {
        current: {
          turnover: 60000,
          costOfSales: 24000,
          grossProfit: 36000,
          administrativeExpenses: 31000,
          operatingProfit: 5000,
          interestReceivable: 0,
          profitBeforeTax: 5000,
          tax: 1000,
          profit: 4000,
        },
        prior: {
          turnover: 52000,
          costOfSales: 21000,
          grossProfit: 31000,
          administrativeExpenses: 28000,
          operatingProfit: 3000,
          interestReceivable: 0,
          profitBeforeTax: 3000,
          tax: 600,
          profit: 2400,
        },
      },
    });
  }
  return smallIxbrlDocument;
}

const documents = {
  [IXBRL_DOCUMENT_ID]: {
    companyNumber: "00000001",
    category: "accounts",
    pages: 4,
    content: { "application/pdf": () => PDF_CONTENT, "application/xhtml+xml": ixbrlAccounts },
  },
  [PAPER_DOCUMENT_ID]: { companyNumber: "00000001", category: "accounts", pages: 6, content: { "application/pdf": () => PDF_CONTENT } },
  [SMALL_IXBRL_DOCUMENT_ID]: {
    companyNumber: "SC000001",
    category: "accounts",
    pages: 9,
    content: { "application/pdf": () => PDF_CONTENT, "application/xhtml+xml": smallIxbrlAccounts },
  },
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
