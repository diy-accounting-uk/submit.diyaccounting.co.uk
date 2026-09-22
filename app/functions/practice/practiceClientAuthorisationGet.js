// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/practice/practiceClientAuthorisationGet.js

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
import { getInvitationStatus, getRelationship, agentAuthorisationErrorResponse } from "../../lib/hmrcAgentAuthorisation.js";
import { getClient, getPracticeArn, setClientAuthorisation } from "../../data/dynamoDbPracticeClientRepository.js";

const logger = createLogger({ source: "app/functions/practice/practiceClientAuthorisationGet.js" });

/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "get", "/api/v1/practice/clients/:clientId/authorisation", ingestHandler);
}
/* v8 ignore stop */

const SERVICE_IDENTIFIER = {
  "MTD-VAT": { clientIdType: "vrn", field: "vrn" },
  "MTD-IT": { clientIdType: "ni", field: "nino" },
};

/**
 * Reads a client's authorisation state for one HMRC service. The stored status is a cache: when
 * a pending invitation is on file it is re-read from HMRC; otherwise HMRC's own relationships
 * endpoint answers whether an authority already exists (PLAN_PRICE_UPDATE.md (d), "The
 * authorisation flow", "a relationship already in place").
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
  if (!SERVICE_IDENTIFIER[service]) {
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

    const { clientIdType, field } = SERVICE_IDENTIFIER[service];
    const clientIdentifier = client.identifiers?.[field];
    if (!clientIdentifier) {
      return http400BadRequestResponse({
        request,
        headers: responseHeaders,
        message: `Client has no ${field} on file for ${service}`,
        error: {},
      });
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

    const storedAuthorisation = client.authorisations?.[service];

    let status;
    let invitationId = storedAuthorisation?.invitationId || null;
    if (invitationId) {
      const result = await getInvitationStatus({ arn, invitationId, accessToken, govClientHeaders });
      if (!result.ok) {
        return agentAuthorisationErrorResponse(request, result, responseHeaders);
      }
      status = String(result.data?.status || "").toLowerCase() || "pending";
    } else {
      const result = await getRelationship({ arn, service, clientIdType, clientId: clientIdentifier, accessToken, govClientHeaders });
      if (result.status === 404) {
        status = "unauthorised";
      } else if (!result.ok) {
        return agentAuthorisationErrorResponse(request, result, responseHeaders);
      } else {
        status = "authorised";
      }
    }

    const updated = await setClientAuthorisation(user.sub, clientId, service, { status, invitationId });

    return http200OkResponse({
      request,
      headers: responseHeaders,
      data: { client: updated, status, invitationId },
    });
  } catch (error) {
    logger.error({ message: "Failed to read practice client authorisation", error: error.message, stack: error.stack, clientId, service });
    return http500ServerErrorResponse({ request, headers: responseHeaders, message: "Internal server error", error: {} });
  }
}
