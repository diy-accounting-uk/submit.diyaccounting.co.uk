// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/revisedAccountsRegister.js
// Revised accounts that name no receipt are checked against the Companies House register: the
// company must be on it, with accounts made up to the end of the period the revision is for.

import { companiesHouseFilingHistory, httpResponseFromCompaniesHouseResponse } from "./companiesHouseApi.js";
import { isAccountsFiling } from "./companiesHouseFiledAccounts.js";
import { http400BadRequestResponse } from "../lib/httpResponseHelper.js";
import { registerRefusalReason, registerRefusalText } from "../../web/public/lib/accounts-revision-register.js";

// The Companies House test service files nothing on the register and holds no accounts of its own,
// so the register says nothing about a filing that goes there. The setting is the deployment's, the
// one that sends the envelope to the test service; a request cannot change it.
function filesToTheRegister() {
  return process.env.COMPANIES_HOUSE_GATEWAY_TEST !== "true";
}

/**
 * The refusal of revised accounts with no accounts on the register to replace, or undefined when
 * the register holds accounts for the period or the filing goes to the test service.
 * @param {{request: object, headers: object, companyNumber: string, periodEnd: string}} filing
 * @returns {Promise<object|undefined>} an HTTP response: 400 with the reason, or the failed read from Companies House
 */
export async function refuseRevisionWithNothingToReplace({ request, headers, companyNumber, periodEnd }) {
  if (!filesToTheRegister()) return undefined;
  const history = await companiesHouseFilingHistory(companyNumber, { category: "accounts" });
  if (!history.ok && history.status !== 404) return httpResponseFromCompaniesHouseResponse(request, history, headers);
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
