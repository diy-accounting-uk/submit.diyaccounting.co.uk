// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability BILL-16 Manage practice clients
// - **Use when:** a practice's client roster must be created, read, archived or listed.
// - **Does:** The practiceClientsPost.js, practiceClientGet.js, practiceClientDelete.js and practiceClientsListGet.js handlers create, read, archive-delete and list a practice's clients against dynamoDbPracticeClientRepository.js. web/public/practice.js renders the roster with HMRC authorisation status and invitation controls on practice.html.
// - **Run:** `POST /api/v1/practice/clients`; `GET /api/v1/practice/clients/:clientId`; `DELETE /api/v1/practice/clients/:clientId`; `GET /api/v1/practice/clients`
// - **Entry:** `app/functions/practice/practiceClientsPost.js:ingestHandler`; `app/functions/practice/practiceClientsListGet.js:ingestHandler`; `app/data/dynamoDbPracticeClientRepository.js:createClient`
// - **Files:** app/functions/practice/practiceClientsPost.js, app/functions/practice/practiceClientGet.js, app/functions/practice/practiceClientDelete.js, app/functions/practice/practiceClientsListGet.js, app/unit-tests/functions/practiceClientsPost.test.js, app/unit-tests/functions/practiceClientGet.test.js, app/unit-tests/functions/practiceClientDelete.test.js, app/unit-tests/functions/practiceClientsListGet.test.js, app/data/dynamoDbPracticeClientRepository.js, app/unit-tests/data/dynamoDbPracticeClientRepository.test.js, web/public/practice.html, web/public/practice.js, web/browser-tests/practice.browser.test.js, behaviour-tests/practiceLicence.behaviour.test.js
// - **Keywords:** practice, client roster, crud, archive client, list clients, practice.html
// - **Related:** BILL-12, BILL-13, BILL-14, BILL-15
// @end-capability

// app/functions/practice/practiceClientsPost.js

import { validateEnv } from "../../lib/env.js";
import { createLogger } from "../../lib/logger.js";
import {
  extractRequest,
  extractUserFromAuthorizerContext,
  http201CreatedResponse,
  http400BadRequestResponse,
  http401UnauthorizedResponse,
  http500ServerErrorResponse,
  parseRequestBody,
} from "../../lib/httpResponseHelper.js";
import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";
import { initializeSalt } from "../../services/subHasher.js";
import { practiceEnforcementResponse } from "../../lib/practiceEnforcement.js";
import { isValidVrn, isValidNino, isValidUtr } from "../../lib/hmrcValidation.js";
import { isValidCompanyNumber } from "../../services/companiesHouseApi.js";
import { createClient } from "../../data/dynamoDbPracticeClientRepository.js";

const logger = createLogger({ source: "app/functions/practice/practiceClientsPost.js" });

/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "post", "/api/v1/practice/clients", ingestHandler);
}
/* v8 ignore stop */

function isValidDisplayName(displayName) {
  return typeof displayName === "string" && displayName.trim().length >= 1 && displayName.trim().length <= 200;
}

/**
 * Validates and normalises the create-client request body. Every identifier is optional, but a
 * given one must match its HMRC or Companies House format when present.
 *
 * @param {object} body
 * @returns {{fields: object, errorMessages: string[]}}
 */
function validateCreateClientBody(body) {
  const errorMessages = [];
  if (!body || typeof body !== "object") {
    errorMessages.push("Request body is required");
    return { fields: null, errorMessages };
  }

  const { displayName, vrn, nino, utr, companyNumber } = body;

  if (!isValidDisplayName(displayName)) {
    errorMessages.push("displayName is required and must be 1-200 characters");
  }
  if (vrn !== undefined && vrn !== null && vrn !== "" && !isValidVrn(vrn)) {
    errorMessages.push("Invalid VAT registration number format - must be 9 digits");
  }
  if (nino !== undefined && nino !== null && nino !== "" && !isValidNino(nino)) {
    errorMessages.push("Invalid National Insurance number format");
  }
  if (utr !== undefined && utr !== null && utr !== "" && !isValidUtr(utr)) {
    errorMessages.push("Invalid Unique Taxpayer Reference format - must be 10 digits");
  }
  let normalisedCompanyNumber;
  if (companyNumber !== undefined && companyNumber !== null && companyNumber !== "") {
    const { valid, normalised } = isValidCompanyNumber(companyNumber);
    if (!valid) {
      errorMessages.push("Invalid company number format");
    } else {
      normalisedCompanyNumber = normalised;
    }
  }

  if (errorMessages.length > 0) {
    return { fields: null, errorMessages };
  }

  return {
    fields: {
      displayName: displayName.trim(),
      vrn: vrn || undefined,
      nino: nino || undefined,
      utr: utr || undefined,
      companyNumber: normalisedCompanyNumber,
    },
    errorMessages: [],
  };
}

export async function ingestHandler(event) {
  await initializeSalt();
  validateEnv(["PRACTICE_CLIENTS_DYNAMODB_TABLE_NAME"]);

  const { request } = extractRequest(event);
  const responseHeaders = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" };

  const user = extractUserFromAuthorizerContext(event);
  if (!user) {
    return http401UnauthorizedResponse({
      request,
      headers: responseHeaders,
      message: "Authentication required",
    });
  }

  const denied = await practiceEnforcementResponse(event, request, responseHeaders);
  if (denied) return denied;

  const body = parseRequestBody(event);
  const { fields, errorMessages } = validateCreateClientBody(body);
  if (errorMessages.length > 0) {
    return http400BadRequestResponse({
      request,
      headers: responseHeaders,
      message: "Invalid request",
      error: { errorMessages },
    });
  }

  try {
    const client = await createClient(user.sub, fields);
    return http201CreatedResponse({
      request,
      headers: responseHeaders,
      data: { client },
    });
  } catch (error) {
    logger.error({ message: "Failed to create practice client", error: error.message, stack: error.stack });
    return http500ServerErrorResponse({
      request,
      headers: responseHeaders,
      message: "Internal server error",
      error: {},
    });
  }
}
