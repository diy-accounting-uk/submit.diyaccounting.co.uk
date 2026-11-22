// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/companiesHouseFiledAccounts.js
// The sets of accounts Companies House holds for a company, read from its filing history and the
// Document API, and one set's iXBRL document.

import { companiesHouseFilingHistory, companiesHouseHttpGet } from "./companiesHouseApi.js";
import { companiesHouseDocumentMetadata, companiesHouseDocumentContent, documentIdFromMetadataLink } from "./companiesHouseDocumentApi.js";

export const IXBRL_CONTENT_TYPE = "application/xhtml+xml";

// A Lambda answers at most 6 MB; the document travels as a JSON string, whose escaping adds to it.
export const MAX_DOCUMENT_RESPONSE_BYTES = 5_000_000;

const ACCOUNTS_FILING_TYPES = new Set(["AA", "AAMD"]);
const ACCOUNTS_TYPE_PREFIX = "accounts-with-accounts-type-";

/** Whether a filing history item is a set of accounts: annual accounts or amended accounts. */
export function isAccountsFiling(item) {
  return ACCOUNTS_FILING_TYPES.has(item?.type);
}

/** The accounts type a filing history item's description names, for example micro-entity. */
export function accountsTypeOf(item) {
  const description = item?.description ?? "";
  return description.startsWith(ACCOUNTS_TYPE_PREFIX) ? description.slice(ACCOUNTS_TYPE_PREFIX.length) : undefined;
}

/** Whether a filing history item is amended accounts, which replace or correct a set already filed. */
export function isAmendedAccounts(item) {
  return item?.type === "AAMD" || String(item?.description ?? "").startsWith("accounts-amended");
}

function filedSet(item, metadata) {
  return {
    transactionId: item.transaction_id,
    madeUpDate: item.description_values?.made_up_date,
    filedOn: item.date,
    accountsType: accountsTypeOf(item),
    amended: isAmendedAccounts(item),
    paperFiled: item.paper_filed === true,
    pages: item.pages,
    ixbrl: Boolean(metadata?.resources?.[IXBRL_CONTENT_TYPE]),
  };
}

async function metadataOf(item) {
  const documentId = documentIdFromMetadataLink(item.links?.document_metadata);
  if (!documentId) return { documentId: null, metadata: null, failed: null };
  const response = await companiesHouseDocumentMetadata(documentId);
  return { documentId, metadata: response.ok ? response.data : null, failed: response.ok ? null : response };
}

/**
 * The sets of accounts Companies House holds for a company, newest first as the register lists them.
 * @param {string} companyNumber
 * @returns {Promise<{chResponse: object, sets: Array<object>|null}>} sets is null when a read failed;
 *   chResponse is then the failed response
 */
export async function listFiledAccounts(companyNumber) {
  const history = await companiesHouseFilingHistory(companyNumber, { category: "accounts" });
  if (!history.ok) return { chResponse: history, sets: null };
  const items = history.data.items.filter(isAccountsFiling);
  const read = await Promise.all(items.map(metadataOf));
  const failed = read.find((entry) => entry.failed)?.failed;
  if (failed) return { chResponse: failed, sets: null };
  return { chResponse: history, sets: items.map((item, index) => filedSet(item, read[index].metadata)) };
}

/**
 * One filed set's iXBRL document.
 * @param {string} companyNumber
 * @param {string} transactionId - the filing history item's transaction id
 * @returns {Promise<{chResponse?: object, problem?: "not-accounts"|"no-ixbrl"|"too-large", set?: object, document?: string}>}
 *   chResponse alone when a read failed
 */
export async function fetchFiledAccountsDocument(companyNumber, transactionId) {
  const itemResponse = await companiesHouseHttpGet(`/company/${companyNumber}/filing-history/${transactionId}`);
  if (!itemResponse.ok) return { chResponse: itemResponse };
  const item = itemResponse.data;
  if (!isAccountsFiling(item)) return { problem: "not-accounts" };

  const { documentId, metadata, failed } = await metadataOf(item);
  if (failed) return { chResponse: failed };
  const set = filedSet(item, metadata);
  if (!documentId || !set.ixbrl) return { problem: "no-ixbrl", set };
  if (Number(metadata.resources[IXBRL_CONTENT_TYPE]?.content_length) > MAX_DOCUMENT_RESPONSE_BYTES) {
    return { problem: "too-large", set };
  }

  const content = await companiesHouseDocumentContent(documentId, IXBRL_CONTENT_TYPE);
  if (content.status === 406) return { problem: "no-ixbrl", set };
  if (!content.ok) return { chResponse: content };
  if (Buffer.byteLength(JSON.stringify(content.data)) > MAX_DOCUMENT_RESPONSE_BYTES) return { problem: "too-large", set };
  return { set, document: content.data };
}
