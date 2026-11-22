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

// The newest sets of accounts whose document metadata the list reads; an older set's iXBRL mark is
// unknown, so the list leaves it out.
export const FILED_ACCOUNTS_METADATA_LIMIT = 10;

// metadata undefined means it was not read, so the set carries no iXBRL mark.
function filedSet(item, metadata) {
  return {
    transactionId: item.transaction_id,
    madeUpDate: item.description_values?.made_up_date,
    filedOn: item.date,
    accountsType: accountsTypeOf(item),
    amended: isAmendedAccounts(item),
    paperFiled: item.paper_filed === true,
    pages: item.pages,
    ...(metadata === undefined ? {} : { ixbrl: Boolean(metadata?.resources?.[IXBRL_CONTENT_TYPE]) }),
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
 * The newest sets' document metadata is read one set at a time, so each of them carries its iXBRL
 * mark; an older set carries its dates and type from the filing history alone.
 * @param {string} companyNumber
 * @returns {Promise<{chResponse: object, sets: Array<object>|null, truncated?: boolean}>} sets is null
 *   when a read failed; chResponse is then the failed response. truncated is true when the company's
 *   accounts filing history holds more items than were read
 */
export async function listFiledAccounts(companyNumber) {
  const history = await companiesHouseFilingHistory(companyNumber, { category: "accounts" });
  if (!history.ok) return { chResponse: history, sets: null };
  const items = history.data.items.filter(isAccountsFiling);
  const sets = [];
  for (const [index, item] of items.entries()) {
    if (index >= FILED_ACCOUNTS_METADATA_LIMIT) {
      sets.push(filedSet(item, undefined));
      continue;
    }
    const { metadata, failed } = await metadataOf(item);
    if (failed) return { chResponse: failed, sets: null };
    sets.push(filedSet(item, metadata));
  }
  return { chResponse: history, sets, truncated: history.data.truncated };
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
  return documentOfItem(item);
}

/**
 * The newest set of accounts on a company's register and its iXBRL document: the filing history
 * of accounts, then that set's document metadata and content.
 * @param {string} companyNumber
 * @returns {Promise<{chResponse?: object, problem?: "no-accounts"|"no-ixbrl"|"too-large", set?: object, document?: string}>}
 *   chResponse alone when a read failed
 */
export async function fetchLastFiledAccounts(companyNumber) {
  const history = await companiesHouseFilingHistory(companyNumber, { category: "accounts" });
  if (!history.ok) return { chResponse: history };
  const item = history.data.items.find(isAccountsFiling);
  if (!item) return { problem: "no-accounts" };
  return documentOfItem(item);
}

// One accounts filing's iXBRL document, or why there is none to give.
async function documentOfItem(item) {
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
