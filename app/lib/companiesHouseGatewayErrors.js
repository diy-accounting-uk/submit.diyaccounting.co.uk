// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/companiesHouseGatewayErrors.js

export const INVALID_COMPANY_AUTHENTICATION_CODE_REASON = "invalid-company-authentication-code";

export const INVALID_COMPANY_AUTHENTICATION_CODE_MESSAGE =
  "Companies House does not accept this company authentication code. Check the 6 to 8 character code and enter it again.";

/**
 * The gateway reports a wrong company authentication code with the generic error number 9999, so
 * the text is the only thing that tells it apart from a fault on the gateway's side.
 * @param {Array<{text?: string}>} gatewayErrors
 * @returns {boolean}
 */
export function hasInvalidCompanyAuthenticationCodeError(gatewayErrors) {
  return (gatewayErrors ?? []).some((gatewayError) => /^invalid\s+companyauthenticationcode\b/i.test((gatewayError?.text ?? "").trim()));
}
