// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/companies-house/companiesHouseOfficerChangePost.js
// Files the OfficerChangeDetails form, the notice that a director's or a secretary's details have changed
// (Companies House's CH01, CH02, CH03 and CH04), through the Companies House XML Gateway by the
// route every form shares (app/services/companiesHouseFormFiling.js). Its outcome is polled through
// companiesHouseFormStatusGet.js.

import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";
import { fileCompaniesHouseForm } from "../../services/companiesHouseFormFiling.js";

// Server hook for Express app, and construction of a Lambda-like event from HTTP request)
/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "post", "/api/v1/companies-house/officer-change", ingestHandler);
  registerLambdaRoute(app, "head", "/api/v1/companies-house/officer-change", ingestHandler);
}
/* v8 ignore stop */

// HTTP request/response, aware Lambda ingestHandler function
export async function ingestHandler(event) {
  return fileCompaniesHouseForm(event, "officer-change");
}
