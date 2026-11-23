// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/companies-house/companiesHousePscVerificationStatementPost.js
// Files the PSCVerificationStatement through the Companies House XML Gateway, by the route every
// form shares (app/services/companiesHouseFormFiling.js). Filed separately from the confirmation
// statement, once per director who is also a person with significant control, inside the window
// starting the day after the review date. The PSC's personal code the user types goes into the
// form body only and is never logged.

import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";
import { fileCompaniesHouseForm } from "../../services/companiesHouseFormFiling.js";

// Server hook for Express app, and construction of a Lambda-like event from HTTP request)
/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "post", "/api/v1/companies-house/psc-verification-statement", ingestHandler);
  registerLambdaRoute(app, "head", "/api/v1/companies-house/psc-verification-statement", ingestHandler);
}
/* v8 ignore stop */

// HTTP request/response, aware Lambda ingestHandler function
export async function ingestHandler(event) {
  return fileCompaniesHouseForm(event, "psc-verification-statement");
}
