// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/account/passCampaignGet.js

import { validateEnv } from "../../lib/env.js";
import { createLogger } from "../../lib/logger.js";
import {
  extractRequest,
  http200OkResponse,
  http401UnauthorizedResponse,
  http403ForbiddenResponse,
  http500ServerErrorResponse,
} from "../../lib/httpResponseHelper.js";
import { decodeJwtToken } from "../../lib/jwtHelper.js";
import { isOperatorEmail } from "../../lib/operators.js";
import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";
import { listCampaignPasses } from "../../services/passService.js";
import { getPassFigures } from "../../data/dynamoDbPassRepository.js";
import { toPassCard } from "./passMyPassesGet.js";
import { corsOriginHeaders } from "../../lib/corsOrigins.js";

const logger = createLogger({ source: "app/functions/account/passCampaignGet.js" });

/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "get", "/api/v1/pass/campaign", ingestHandler);
}
/* v8 ignore stop */

export async function ingestHandler(event) {
  validateEnv(["PASSES_DYNAMODB_TABLE_NAME"]);

  const { request } = extractRequest(event);
  const responseHeaders = { "Content-Type": "application/json", ...corsOriginHeaders(event?.headers) };

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
  if (!(await isOperatorEmail(decodedToken.email))) {
    logger.warn({ message: "Campaign pass list refused, caller is not an operator" });
    return http403ForbiddenResponse({ request, headers: responseHeaders, message: "Not permitted to list campaign passes" });
  }

  try {
    const items = (await listCampaignPasses()).filter((pass) => !pass.deletedAt);
    const storedByCode = await getPassFigures(items.map((pass) => pass.code));
    const passes = items.map((pass) => toPassCard(pass, storedByCode.get(pass.code)));
    return http200OkResponse({ request, headers: responseHeaders, data: { passes, count: passes.length } });
  } catch (error) {
    logger.error({ message: "Error listing campaign passes", error: error.message, stack: error.stack });
    return http500ServerErrorResponse({
      request,
      headers: responseHeaders,
      message: "Failed to list campaign passes",
      error: { detail: error.message },
    });
  }
}
