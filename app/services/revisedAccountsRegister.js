// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/revisedAccountsRegister.js
// Revised accounts that name no receipt are checked against the Companies House register: the
// company must be on it, with accounts made up to the end of the period the revision is for.

import { companiesHouseFilingHistory } from "./companiesHouseApi.js";
import { LOOKUP_CALLS, lookupFailureResponse, lookupLimitResponse, lookupRefusalSeconds } from "./companiesHouseLookupLimit.js";
import { isAccountsFiling } from "./companiesHouseFiledAccounts.js";
import { http400BadRequestResponse, http502BadGatewayResponse } from "../lib/httpResponseHelper.js";
import { createLogger } from "../lib/logger.js";
import { registerRefusalReason, registerRefusalText } from "../../web/public/lib/accounts-revision-register.js";

const logger = createLogger({ source: "app/services/revisedAccountsRegister.js" });

// The Companies House test service files nothing on the register and holds no accounts of its own,
// so the register says nothing about a filing that goes there. The setting is the deployment's, the
// one that sends the envelope to the test service; a request cannot change it.
function filesToTheRegister() {
  return process.env.COMPANIES_HOUSE_GATEWAY_TEST !== "true";
}

// The register's accounts filing history for the company, or the JSON answer of a read that could
// not be made. The read is one of the signed-in lookups on the shared API key: it is refused during
// the stop a Companies House 429 sets and past the account's share of the key, it is charged to
// that share, and a 429 it meets sets the stop.
async function readAccountsHistory({ request, headers, userSub, companyNumber }) {
  const refusalSeconds = await lookupRefusalSeconds(userSub, LOOKUP_CALLS.filingHistory);
  if (refusalSeconds) return { failure: lookupLimitResponse(request, headers, refusalSeconds) };
  let history;
  try {
    history = await companiesHouseFilingHistory(companyNumber, { category: "accounts" });
  } catch (error) {
    logger.error({ message: "The register read for revised accounts could not be made", error: error.message });
    return {
      failure: http502BadGatewayResponse({
        request,
        headers: { ...headers },
        message: "The Companies House register could not be read, so the revised accounts were not filed. Try again later.",
        error: { reason: "revision-register-not-read" },
      }),
    };
  }
  if (!history.ok && history.status !== 404) return { failure: await lookupFailureResponse(request, history, headers) };
  return { history };
}

/**
 * The refusal of revised accounts with no accounts on the register to replace, or undefined when
 * the register holds accounts for the period or the filing goes to the test service.
 * @param {{request: object, headers: object, userSub: string, companyNumber: string, periodEnd: string}} filing
 * @returns {Promise<object|undefined>} an HTTP response: 400 with the reason, or the JSON error of a read that failed or was refused
 */
export async function refuseRevisionWithNothingToReplace({ request, headers, userSub, companyNumber, periodEnd }) {
  if (!filesToTheRegister()) return undefined;
  const { history, failure } = await readAccountsHistory({ request, headers, userSub, companyNumber });
  if (failure) return failure;
  const madeUpDates = history.ok ? history.data.items.filter(isAccountsFiling).map((item) => item.description_values?.made_up_date) : [];
  const reason = registerRefusalReason({ companyFound: history.ok, madeUpDates }, periodEnd);
  if (!reason) return undefined;
  return http400BadRequestResponse({
    request,
    headers: { ...headers },
    message: registerRefusalText(reason, { companyNumber, periodEnd }),
    error: { reason, companyNumber, periodEnd },
  });
}
