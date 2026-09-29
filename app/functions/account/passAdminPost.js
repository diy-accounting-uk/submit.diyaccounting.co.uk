// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/account/passAdminPost.js

import { validateEnv } from "../../lib/env.js";
import { createLogger } from "../../lib/logger.js";
import {
  extractRequest,
  http200OkResponse,
  http400BadRequestResponse,
  http401UnauthorizedResponse,
  http403ForbiddenResponse,
  http500ServerErrorResponse,
  parseRequestBody,
} from "../../lib/httpResponseHelper.js";
import { decodeJwtToken } from "../../lib/jwtHelper.js";
import { isOperatorEmail } from "../../lib/operators.js";
import { isSyntheticTestUserEmail } from "../../lib/syntheticTestUser.js";
import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";
import { createPass } from "../../services/passService.js";
import { publishActivityEvent, classifyActor } from "../../lib/activityAlert.js";
import { loadPassTypesFromRoot, getPassTypeById } from "../../services/productCatalog.js";

const logger = createLogger({ source: "app/functions/account/passAdminPost.js" });

// Synthetic test users may create passes only for the bundles the automated lanes exercise.
const SYNTHETIC_ISSUABLE_BUNDLE_IDS = ["day-guest", "invited-guest", "resident-vat", "resident", "resident-pro"];

/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "post", "/api/v1/pass/admin", ingestHandler);
}
/* v8 ignore stop */

export async function ingestHandler(event) {
  validateEnv(["PASSES_DYNAMODB_TABLE_NAME"]);

  const { request } = extractRequest(event);
  const responseHeaders = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };

  let decodedToken;
  try {
    decodedToken = decodeJwtToken(event.headers);
  } catch (error) {
    return http401UnauthorizedResponse({
      request,
      headers: responseHeaders,
      message: "Authentication required",
      error: error.message,
    });
  }
  const callerEmail = decodedToken.email;
  const callerIsOperator = await isOperatorEmail(callerEmail);
  const callerIsSyntheticTestUser = isSyntheticTestUserEmail(callerEmail);
  if (!callerIsOperator && !callerIsSyntheticTestUser) {
    logger.warn({ message: "Pass creation refused, caller is not an operator or a synthetic test user" });
    return http403ForbiddenResponse({
      request,
      headers: responseHeaders,
      message: "Not permitted to create passes",
    });
  }

  const requestBody = parseRequestBody(event);
  if (event.body && !requestBody) {
    return http400BadRequestResponse({
      request,
      headers: responseHeaders,
      message: "Invalid JSON in request body",
    });
  }

  if (!requestBody || !requestBody.passTypeId || !requestBody.bundleId) {
    return http400BadRequestResponse({
      request,
      headers: responseHeaders,
      message: "Missing required fields: passTypeId, bundleId",
    });
  }

  if (!callerIsOperator && !SYNTHETIC_ISSUABLE_BUNDLE_IDS.includes(requestBody.bundleId)) {
    logger.warn({ message: "Pass creation refused, bundle is not issuable by a synthetic test user", bundleId: requestBody.bundleId });
    return http403ForbiddenResponse({
      request,
      headers: responseHeaders,
      message: "Not permitted to create a pass for this bundle",
    });
  }

  const {
    passTypeId,
    bundleId,
    testPass: explicitTestPass,
    validFrom,
    validUntil,
    validityPeriod,
    maxUses,
    restrictedToEmail,
    createdBy,
    notes,
  } = requestBody;

  // Derive testPass from pass type definition if not explicitly provided
  let testPass = callerIsOperator ? explicitTestPass : true;
  if (testPass === undefined) {
    try {
      const passTypesConfig = loadPassTypesFromRoot();
      const passTypeDef = getPassTypeById(passTypesConfig, passTypeId);
      if (passTypeDef?.test) {
        testPass = true;
      }
    } catch (error) {
      logger.warn({ message: "Could not load pass types config, testPass not auto-derived", error: error.message });
    }
  }

  logger.info({ message: "Creating admin pass", passTypeId, bundleId, testPass: !!testPass });

  try {
    const pass = await createPass({
      passTypeId,
      bundleId,
      testPass,
      validFrom,
      validUntil,
      validityPeriod,
      maxUses,
      restrictedToEmail: callerIsOperator ? restrictedToEmail : undefined,
      createdBy: createdBy || "admin",
      notes,
      actor: classifyActor(callerEmail),
    });

    logger.info({ message: "Admin pass created", passTypeId, bundleId });
    await publishActivityEvent({
      event: "pass-generated",
      summary: "Pass generated: " + bundleId,
      detail: { bundleId, passTypeId },
    });

    return http200OkResponse({
      request,
      headers: responseHeaders,
      data: {
        code: pass.code,
        bundleId: pass.bundleId,
        passTypeId: pass.passTypeId,
        testPass: pass.testPass || false,
        validFrom: pass.validFrom,
        validUntil: pass.validUntil,
        maxUses: pass.maxUses,
        restrictedToEmail: callerIsOperator && restrictedToEmail ? true : false,
      },
    });
  } catch (error) {
    logger.error({ message: "Error creating admin pass", error: error.message, stack: error.stack });
    return http500ServerErrorResponse({
      request,
      headers: responseHeaders,
      message: "Failed to create pass",
      error: { detail: error.message },
    });
  }
}
