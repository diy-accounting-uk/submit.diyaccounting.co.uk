// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/functions/account/passAdminPost.js

import { validateEnv } from "../../lib/env.js";
import { createLogger } from "../../lib/logger.js";
import {
  extractRequest,
  http200OkResponse,
  http400BadRequestResponse,
  http500ServerErrorResponse,
  parseRequestBody,
} from "../../lib/httpResponseHelper.js";
import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";
import { initializeEmailHashSecret } from "../../lib/emailHash.js";
import { createPass } from "../../services/passService.js";
import { publishActivityEvent } from "../../lib/activityAlert.js";
import { loadPassTypesFromRoot, getPassTypeById } from "../../services/productCatalog.js";

const logger = createLogger({ source: "app/functions/account/passAdminPost.js" });

/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "post", "/api/v1/pass/admin", ingestHandler);
}
/* v8 ignore stop */

export async function ingestHandler(event) {
  validateEnv(["PASSES_DYNAMODB_TABLE_NAME"]);

  // Initialize email hash secret (needed for email-restricted passes)
  try {
    await initializeEmailHashSecret();
  } catch (error) {
    logger.warn({ message: "Email hash secret not available, email-restricted passes will fail", error: error.message });
  }

  const { request } = extractRequest(event);
  const responseHeaders = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };

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
  let testPass = explicitTestPass;
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
      restrictedToEmail,
      createdBy: createdBy || "admin",
      notes,
    });

    logger.info({ message: "Admin pass created", passTypeId, bundleId });
    await publishActivityEvent({
      event: "pass-generated",
      summary: "Pass generated: " + bundleId,
      detail: { bundleId },
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
        restrictedToEmail: restrictedToEmail ? true : false,
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
