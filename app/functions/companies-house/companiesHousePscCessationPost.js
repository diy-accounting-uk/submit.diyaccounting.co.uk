// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/companies-house/companiesHousePscCessationPost.js
// Files the PSCCessation form, the notice that a person with significant control has ceased to be
// one, through the Companies House XML Gateway by the route every form shares
// (app/services/companiesHouseFormFiling.js). Its outcome is polled through
// companiesHouseFormStatusGet.js.

import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";
import { fileCompaniesHouseForm } from "../../services/companiesHouseFormFiling.js";

// Server hook for Express app, and construction of a Lambda-like event from HTTP request)
/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "post", "/api/v1/companies-house/psc-cessation", ingestHandler);
  registerLambdaRoute(app, "head", "/api/v1/companies-house/psc-cessation", ingestHandler);
}
/* v8 ignore stop */

// HTTP request/response, aware Lambda ingestHandler function
export async function ingestHandler(event) {
  return fileCompaniesHouseForm(event, "psc-cessation");
}
