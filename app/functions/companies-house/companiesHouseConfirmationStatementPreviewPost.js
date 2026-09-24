// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/companies-house/companiesHouseConfirmationStatementPreviewPost.js
// Renders the ConfirmationAndVerificationStatement body from the form's answers, so the page can
// show it before anything reaches the Companies House XML Gateway. Never calls the gateway; the
// directors' personal codes are masked in the rendered body before it leaves this Lambda, the same
// way the company authentication code never reaches the accounts preview.

import { createLogger } from "../../lib/logger.js";
import { extractRequest, buildValidationError, http200OkResponse } from "../../lib/httpResponseHelper.js";
import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";
import { enforceBundles } from "../../services/bundleManagement.js";
import { http403ForbiddenFromBundleEnforcement } from "../../services/companiesHouseApi.js";
import { buildConfirmationStatementBody } from "../../services/companiesHouseConfirmationStatementXml.js";
import { extractAndValidateConfirmationStatementParameters } from "./companiesHouseConfirmationStatementPost.js";
import { publishActivityEvent } from "../../lib/activityAlert.js";
import { initializeSalt } from "../../services/subHasher.js";

const logger = createLogger({ source: "app/functions/companies-house/companiesHouseConfirmationStatementPreviewPost.js" });

// Server hook for Express app, and construction of a Lambda-like event from HTTP request)
/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "post", "/api/v1/companies-house/confirmation-statement/preview", ingestHandler);
  registerLambdaRoute(app, "head", "/api/v1/companies-house/confirmation-statement/preview", ingestHandler);
}
/* v8 ignore stop */

// A director's personal code never leaves this Lambda: mask every CompaniesHousePersonalCode
// element's content before the rendered body reaches the page.
export function maskPersonalCodes(bodyXml) {
  return bodyXml.replace(
    /<CompaniesHousePersonalCode>[^<]*<\/CompaniesHousePersonalCode>/g,
    "<CompaniesHousePersonalCode>***********</CompaniesHousePersonalCode>",
  );
}

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
    return http200OkResponse({
      request,
      headers: { ...responseHeaders },
      data: {},
    });
  }

  const errorMessages = [];
  const statement = extractAndValidateConfirmationStatementParameters(event, errorMessages, { requireCompanyAuthCode: false });

  if (errorMessages.length > 0) {
    return buildValidationError(request, errorMessages, responseHeaders);
  }

  let confirmationStatementXml;
  try {
    confirmationStatementXml = maskPersonalCodes(
      buildConfirmationStatementBody({
        reviewDate: statement.reviewDate,
        sicCodes: statement.sicCodes,
        statementOfCapital: statement.statementOfCapital,
        shareholdings: statement.shareholdings,
        registeredEmailAddress: statement.registeredEmailAddress,
        directors: statement.directors,
        officers: statement.officers,
      }),
    );
  } catch (error) {
    logger.error({ message: "Failed to render confirmation statement body", error: error.message, stack: error.stack });
    throw error;
  }

  await publishActivityEvent({
    event: "companies-house-confirmation-statement-previewed",
    summary: "Companies House confirmation statement previewed",
    userSub,
  });

  return http200OkResponse({
    request,
    headers: { ...responseHeaders },
    data: { confirmationStatementXml },
  });
}
