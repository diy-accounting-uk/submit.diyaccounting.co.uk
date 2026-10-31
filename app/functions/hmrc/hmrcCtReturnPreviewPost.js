// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability CH-15 File a Company Tax Return with HMRC
// - **Use when:** a small company's CT600 return, computations and FRS 102 section 1A accounts must be previewed and sent to the HMRC Transaction Engine, or the journey needs a simulator proof.
// - **Does:** hmrcCtReturnPreviewPost.js builds the CT600 IRenvelope, the computations iXBRL and the accounts iXBRL from a book export plus the typed UTR, declarant and statements, and sends nothing. hmrcCtReturnPost.js signs the CT600 with its base32 IRmark, redacts the typed Government Gateway credentials and posts it. hmrcCtReturnGet.js polls within HMRC's poll interval and stores the receipt. fileCompanyTaxReturn.html takes the figures from a pasted or chosen book export (or from the accounts just accepted on fileSmallCompanyAccounts.html), stops on an overdrawn director's loan account, shows the CT600 and computations tables, and shows the IRmark on acceptance. The simulator acknowledges the first poll and answers the receipt after; the scenario CT600_REJECT_IRMARK returns error 2021. An accepted accounts or CT600 filing keeps its filed documents in the receipt, and companies-house/filings.html draws it as the customer copy (web/public/lib/filing-record.js), reached from the receipts list. The `behaviour-test-simulator-company-tax-return` job in `test.yml` runs the behaviour test.
// - **Run:** `npm run test:companyTaxReturnBehaviour-simulator`
// - **Entry:** `app/functions/hmrc/hmrcCtReturnPreviewPost.js:ingestHandler`; `app/functions/hmrc/hmrcCtReturnPost.js:ingestHandler`; `app/functions/hmrc/hmrcCtReturnGet.js:ingestHandler`; `web/public/companies-house/fileCompanyTaxReturn.page.js`
// - **Files:** app/functions/hmrc/hmrcCtReturnPreviewPost.js, app/functions/hmrc/hmrcCtReturnPost.js, app/functions/hmrc/hmrcCtReturnGet.js, app/services/hmrcCtReturnRequest.js, app/services/hmrcCtSubmissionStatus.js, app/test-helpers/ctReturnFixture.js, web/public/companies-house/fileCompanyTaxReturn.html, web/public/companies-house/fileCompanyTaxReturn.page.js, web/public/lib/services/hmrc-ct-return-service.js, behaviour-tests/companyTaxReturn.behaviour.test.js, behaviour-tests/steps/behaviour-hmrc-company-tax-return-steps.js, .github/workflows/test.yml
// - **Keywords:** company tax return, CT600, corporation tax, computations, irmark, transaction engine, government gateway, UTR, hmrc, filing, simulator
// - **Related:** CH-08
// @end-capability

// app/functions/hmrc/hmrcCtReturnPreviewPost.js
// Builds the CT600 return, the computations iXBRL and the FRS 102 accounts iXBRL from the figures
// the user entered, so the page can show them before anything reaches HMRC. Never calls HMRC and
// never takes the Government Gateway credentials.

import { createLogger } from "../../lib/logger.js";
import { extractRequest, buildValidationError, http200OkResponse } from "../../lib/httpResponseHelper.js";
import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";
import { enforceBundles } from "../../services/bundleManagement.js";
import { http403ForbiddenFromBundleEnforcement } from "../../services/companiesHouseApi.js";
import { fillRegisteredOffice } from "../../services/registeredOfficeFill.js";
import { extractAndValidateCtReturnParameters, buildCtReturnDocuments } from "../../services/hmrcCtReturnRequest.js";
import { publishActivityEvent } from "../../lib/activityAlert.js";
import { initializeSalt } from "../../services/subHasher.js";

const logger = createLogger({ source: "app/functions/hmrc/hmrcCtReturnPreviewPost.js" });

// Server hook for Express app, and construction of a Lambda-like event from HTTP request)
/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "post", "/api/v1/hmrc/ct/return/preview", ingestHandler);
  registerLambdaRoute(app, "head", "/api/v1/hmrc/ct/return/preview", ingestHandler);
}
/* v8 ignore stop */

// HTTP request/response, aware Lambda ingestHandler function
export async function ingestHandler(event) {
  await initializeSalt();

  const { request } = extractRequest(event);
  const responseHeaders = { "Content-Type": "application/json" };

  let userSub;
  try {
    ({ userSub } = await enforceBundles(event));
  } catch (error) {
    return http403ForbiddenFromBundleEnforcement(error, request);
  }

  if (event?.requestContext?.http?.method === "HEAD") {
    return http200OkResponse({ request, headers: { ...responseHeaders }, data: {} });
  }

  const errorMessages = [];
  const returnRequest = extractAndValidateCtReturnParameters(event, errorMessages, {
    requireGatewayCredentials: false,
    requireReviewedBoxes: false,
  });
  if (errorMessages.length === 0) await fillRegisteredOffice(returnRequest.accounts, errorMessages);
  if (errorMessages.length > 0) {
    return buildValidationError(request, errorMessages, responseHeaders);
  }

  let documents;
  try {
    documents = buildCtReturnDocuments(returnRequest);
  } catch (error) {
    logger.warn({ message: "Company Tax Return documents could not be built", error: error.message });
    return buildValidationError(request, [error.message], responseHeaders);
  }

  await publishActivityEvent({
    event: "hmrc-ct-return-previewed",
    summary: "HMRC Company Tax Return previewed",
    userSub,
  });

  return http200OkResponse({
    request,
    headers: { ...responseHeaders },
    data: {
      ct600Xml: documents.irEnvelopeXml,
      computationsIxbrl: documents.computationsIxbrl,
      accountsIxbrl: documents.accountsIxbrl,
      boxes: documents.boxes,
      computationLines: documents.computationLines,
      losses: documents.losses,
      carryBack: documents.carryBack,
      worked: documents.worked,
    },
  });
}
