// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/revisedAccountsRegister.js
// Revised accounts that name no receipt are checked against the Companies House register: the
// company must be on it, with accounts made up to the end of the period the revision is for.
//
// The register gives most accounts filings their made-up date. Some it does not: the descriptions
// "accounts", "accounts-amended" and "accounts-balance-sheet" in Companies House's published filing
// history descriptions carry none. For such a filing the check reads the filed document and takes
// the period's end from it, within the calls the read is charged for. A filing whose period cannot
// be read (a scan with no iXBRL, a document the reader refuses, no calls left) may be the accounts
// to replace, so it is never a reason to refuse.

import { companiesHouseFilingHistory } from "./companiesHouseApi.js";
import { LOOKUP_CALLS, limitedLookup, lookupFailureResponse } from "./companiesHouseLookupLimit.js";
import { documentOfItem, isAccountsFiling } from "./companiesHouseFiledAccounts.js";
import { mapLastAccounts } from "./companiesHouseLastAccounts.js";
import { http400BadRequestResponse } from "../lib/httpResponseHelper.js";
import { registerRefusalReason, registerRefusalText } from "../../web/public/lib/accounts-revision-register.js";

// The Companies House test service files nothing on the register and holds no accounts of its own,
// so the register says nothing about a filing that goes there. The setting is the deployment's, the
// one that sends the envelope to the test service; a request cannot change it.
function filesToTheRegister() {
  return process.env.COMPANIES_HOUSE_GATEWAY_TEST !== "true";
}

// The calls one read of a filed document makes: its metadata, then its content.
const CALLS_PER_DOCUMENT = 2;
const HISTORY_PAGE_SIZE = 100;

const madeUpDateOf = (item) => item.description_values?.made_up_date;

// The end of the period a filed document reports, or undefined when the reader cannot tell.
function periodEndOfDocument(document) {
  try {
    return mapLastAccounts(document).period?.end;
  } catch {
    return undefined;
  }
}

// What the accounts filings with no made-up date say of the period: "holds" when a filed document
// is made up to its end, "unknown" when one's period could not be read, else "none". An accounts
// filing delivered on or before the period's end cannot be accounts for that period, so it is not
// read. A failed read of a document answers its response as failed.
async function undatedAccountsFor(items, periodEnd, documentsAffordable) {
  const undated = items.filter((item) => !madeUpDateOf(item) && (item.date === undefined || item.date > periodEnd));
  let unknown = undated.length > documentsAffordable;
  for (const item of undated.slice(0, documentsAffordable)) {
    const filed = await documentOfItem(item);
    if (filed.chResponse && filed.chResponse.status !== 404) return { failed: filed.chResponse };
    const end = filed.document ? periodEndOfDocument(filed.document) : undefined;
    if (end === periodEnd) return { verdict: "holds" };
    if (!end) unknown = true;
  }
  return { verdict: unknown ? "unknown" : "none" };
}

// What the register holds for the company and the period: companyFound, the made-up dates of its
// accounts, and periodUnknown when a filing with no made-up date may be the period's accounts. A
// failed read answers its response as failed.
async function readRegister(companyNumber, periodEnd) {
  const history = await companiesHouseFilingHistory(companyNumber, { category: "accounts" });
  if (!history.ok) return history.status === 404 ? { companyFound: false, madeUpDates: [] } : { failed: history };
  const items = history.data.items.filter(isAccountsFiling);
  const madeUpDates = items.map(madeUpDateOf).filter(Boolean);
  if (madeUpDates.includes(periodEnd)) return { companyFound: true, madeUpDates };
  const pagesRead = Math.max(1, Math.ceil(history.data.items.length / HISTORY_PAGE_SIZE));
  const documentsAffordable = Math.floor((LOOKUP_CALLS.filingHistory - pagesRead) / CALLS_PER_DOCUMENT);
  const undated = await undatedAccountsFor(items, periodEnd, documentsAffordable);
  if (undated.failed) return { failed: undated.failed };
  return {
    companyFound: true,
    madeUpDates: undated.verdict === "holds" ? [...madeUpDates, periodEnd] : madeUpDates,
    periodUnknown: undated.verdict === "unknown",
  };
}

/**
 * The refusal of revised accounts with no accounts on the register to replace, or undefined when
 * the register holds accounts for the period, may hold them in a filing whose period it does not
 * state, or the filing goes to the test service. The read is one of the signed-in lookups on the
 * shared API key, charged the five calls it can make, and a 429 it meets sets the stop every
 * lookup reads.
 * @param {{request: object, headers: object, userSub: string, companyNumber: string, periodEnd: string}} filing
 * @returns {Promise<object|undefined>} an HTTP response: 400 with the reason, or the JSON error of a read that failed or was refused
 */
export async function refuseRevisionWithNothingToReplace({ request, headers, userSub, companyNumber, periodEnd }) {
  if (!filesToTheRegister()) return undefined;
  const { answer: register, failure } = await limitedLookup({
    request,
    headers,
    userSub,
    calls: LOOKUP_CALLS.filingHistory,
    read: () => readRegister(companyNumber, periodEnd),
    notRead: {
      message: "The Companies House register could not be read, so the revised accounts were not filed. Try again later.",
      reason: "revision-register-not-read",
    },
  });
  if (failure) return failure;
  if (register.failed) return lookupFailureResponse(request, register.failed, headers);
  if (register.periodUnknown) return undefined;
  const reason = registerRefusalReason(register, periodEnd);
  if (!reason) return undefined;
  return http400BadRequestResponse({
    request,
    headers: { ...headers },
    message: registerRefusalText(reason, { companyNumber, periodEnd }),
    error: { reason, companyNumber, periodEnd },
  });
}
