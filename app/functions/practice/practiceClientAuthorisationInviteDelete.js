// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/practice/practiceClientAuthorisationInviteDelete.js

import { validateEnv } from "../../lib/env.js";
import { createLogger } from "../../lib/logger.js";
import {
  extractRequest,
  extractUserFromAuthorizerContext,
  http200OkResponse,
  http400BadRequestResponse,
  http401UnauthorizedResponse,
  http404NotFoundResponse,
  http500ServerErrorResponse,
} from "../../lib/httpResponseHelper.js";
import { extractHmrcAccessTokenFromLambdaEvent } from "../../services/hmrcApi.js";
import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";
import { initializeSalt } from "../../services/subHasher.js";
import { buildFraudHeaders } from "../../lib/buildFraudHeaders.js";
import { cancelInvitation, agentAuthorisationErrorResponse } from "../../lib/hmrcAgentAuthorisation.js";
import { getClient, getPracticeArn, setClientAuthorisation } from "../../data/dynamoDbPracticeClientRepository.js";

const logger = createLogger({ source: "app/functions/practice/practiceClientAuthorisationInviteDelete.js" });

/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "delete", "/api/v1/practice/clients/:clientId/authorisation/invitations", ingestHandler);
}
/* v8 ignore stop */

const SUPPORTED_SERVICES = ["MTD-VAT", "MTD-IT"];

/**
 * Cancels a client's pending invitation. Cancelling an invitation is the practice's own act
 * (PLAN_PRICE_UPDATE.md (d), "Migration from sole trader to practice"), so it never touches an
 * already-accepted relationship - only a pending invitation held on the client row.
 */
export async function ingestHandler(event) {
  await initializeSalt();
  validateEnv(["PRACTICE_CLIENTS_DYNAMODB_TABLE_NAME", "HMRC_AGENT_AUTHORISATION_BASE_URI"]);

  const { request } = extractRequest(event);
  const { govClientHeaders } = buildFraudHeaders(event, {});
  const responseHeaders = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" };

  const user = extractUserFromAuthorizerContext(event);
  if (!user) {
    return http401UnauthorizedResponse({ request, headers: responseHeaders, message: "Authentication required" });
  }

  const clientId = event.pathParameters?.clientId;
  if (!clientId) {
    return http400BadRequestResponse({ request, headers: responseHeaders, message: "clientId path parameter is required", error: {} });
  }

  const service = event.queryStringParameters?.service;
  if (!SUPPORTED_SERVICES.includes(service)) {
    return http400BadRequestResponse({ request, headers: responseHeaders, message: "service query parameter must be one of MTD-VAT, MTD-IT", error: {} });
  }

  const accessToken = extractHmrcAccessTokenFromLambdaEvent(event);
  if (!accessToken) {
    return http400BadRequestResponse({ request, headers: responseHeaders, message: "Missing Authorization Bearer token", error: {} });
  }

  try {
    const client = await getClient(user.sub, clientId);
    if (!client || client.archivedAt) {
      return http404NotFoundResponse({ request, headers: responseHeaders, message: "Client not found", error: {} });
    }

    const invitationId = client.authorisations?.[service]?.invitationId;
    if (!invitationId) {
      return http404NotFoundResponse({ request, headers: responseHeaders, message: "No pending invitation for this service", error: {} });
    }

    const arn = await getPracticeArn(user.sub);
    if (!arn) {
      return http400BadRequestResponse({
        request,
        headers: responseHeaders,
        message: "Agent reference number not set for this practice",
        error: {},
      });
    }

    const result = await cancelInvitation({ arn, invitationId, accessToken, govClientHeaders });
    if (!result.ok) {
      return agentAuthorisationErrorResponse(request, result, responseHeaders);
    }

    const updated = await setClientAuthorisation(user.sub, clientId, service, { status: "cancelled", invitationId: null });

    return http200OkResponse({
      request,
      headers: responseHeaders,
      data: { client: updated, status: "cancelled" },
    });
  } catch (error) {
    logger.error({ message: "Failed to cancel practice client invitation", error: error.message, stack: error.stack, clientId, service });
    return http500ServerErrorResponse({ request, headers: responseHeaders, message: "Internal server error", error: {} });
  }
}
