// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/account/passGeneratePost.js

import { validateEnv } from "../../lib/env.js";
import { createLogger } from "../../lib/logger.js";
import {
  extractRequest,
  http200OkResponse,
  http400BadRequestResponse,
  http403ForbiddenResponse,
  http500ServerErrorResponse,
  parseRequestBody,
} from "../../lib/httpResponseHelper.js";
import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";
import { initializeSalt, hashSub } from "../../services/subHasher.js";
import { createPass } from "../../services/passService.js";
import { consumeTokenForActivity } from "../../services/tokenEnforcement.js";
import { getUserBundles } from "../../data/dynamoDbBundleRepository.js";
import { publishActivityEvent, classifyActor } from "../../lib/activityAlert.js";
import {
  loadPassTypesFromRoot,
  getPassTypeById,
  loadCatalogFromRoot,
  isUnlimitedTokenGrant,
  sumTokensRemaining,
} from "../../services/productCatalog.js";
import { decodeJwtToken } from "../../lib/jwtHelper.js";

const logger = createLogger({ source: "app/functions/account/passGeneratePost.js" });

/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "post", "/api/v1/pass/generate", ingestHandler);
}
/* v8 ignore stop */

export async function ingestHandler(event) {
  validateEnv(["PASSES_DYNAMODB_TABLE_NAME", "BUNDLE_DYNAMODB_TABLE_NAME"]);

  await initializeSalt();

  const { request } = extractRequest(event);
  const responseHeaders = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };

  // Authenticate
  let decodedToken;
  try {
    decodedToken = decodeJwtToken(event.headers);
  } catch {
    return http403ForbiddenResponse({ request, headers: responseHeaders, message: "Authentication required" });
  }

  const userSub = decodedToken.sub;
  const hashedSub = hashSub(userSub);

  // Parse request body
  const requestBody = parseRequestBody(event);
  if (event.body && !requestBody) {
    return http400BadRequestResponse({ request, headers: responseHeaders, message: "Invalid JSON in request body" });
  }

  if (!requestBody?.passTypeId) {
    return http400BadRequestResponse({ request, headers: responseHeaders, message: "Missing required field: passTypeId" });
  }

  const { passTypeId, notes } = requestBody;

  // Look up pass type definition
  const passTypesConfig = loadPassTypesFromRoot();
  const passTypeDef = getPassTypeById(passTypesConfig, passTypeId);
  if (!passTypeDef) {
    return http400BadRequestResponse({ request, headers: responseHeaders, message: `Unknown pass type: ${passTypeId}` });
  }

  if (!passTypeDef.tokenCostToIssue || passTypeDef.tokenCostToIssue <= 0) {
    return http400BadRequestResponse({ request, headers: responseHeaders, message: `Pass type ${passTypeId} is not user-issuable` });
  }

  // Determine which activity this maps to
  const activityId = passTypeId === "digital-pass" ? "generate-pass-digital" : "generate-pass-physical";

  // Consume tokens via tokenEnforcement
  const catalog = loadCatalogFromRoot();
  const tokenResult = await consumeTokenForActivity(userSub, activityId, catalog);
  if (!tokenResult.consumed) {
    return http403ForbiddenResponse({
      request,
      headers: responseHeaders,
      message: "Insufficient tokens",
    });
  }

  logger.info({ message: "Generating user pass", passTypeId, hashedSub, activityId });

  try {
    const pass = await createPass({
      passTypeId,
      bundleId: passTypeDef.bundleId,
      validityPeriod: passTypeDef.defaultValidityPeriod,
      maxUses: passTypeDef.defaultMaxUses || 1,
      issuedBy: hashedSub,
      createdBy: "user",
      notes,
      actor: classifyActor(decodedToken?.email),
    });

    logger.info({ message: "User pass created", passTypeId, code: pass.code });
    await publishActivityEvent({
      event: "pass-generated",
      summary: `User pass generated: ${passTypeId}`,
      userSub,
      detail: { passTypeId, bundleId: pass.bundleId, issuedBy: hashedSub },
    });

    // The balance across every bundle, the figure the header shows, not the one bucket that paid.
    const userBundles = await getUserBundles(userSub);
    const holdsUnlimitedGrant = userBundles.some((b) => isUnlimitedTokenGrant(b.tokensGranted));

    return http200OkResponse({
      request,
      headers: responseHeaders,
      data: {
        code: pass.code,
        passTypeId: pass.passTypeId,
        bundleId: pass.bundleId,
        validFrom: pass.validFrom,
        validUntil: pass.validUntil || null,
        maxUses: pass.maxUses,
        tokensConsumed: tokenResult.cost,
        tokensRemaining: holdsUnlimitedGrant ? undefined : sumTokensRemaining(userBundles),
      },
    });
  } catch (error) {
    logger.error({ message: "Error creating user pass", error: error.message, stack: error.stack });
    return http500ServerErrorResponse({
      request,
      headers: responseHeaders,
      message: "Failed to create pass",
      error: { detail: error.message },
    });
  }
}
