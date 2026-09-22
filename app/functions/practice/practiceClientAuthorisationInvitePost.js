// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/practice/practiceClientAuthorisationInvitePost.js

import { validateEnv } from "../../lib/env.js";
import { createLogger } from "../../lib/logger.js";
import {
  extractRequest,
  extractUserFromAuthorizerContext,
  http201CreatedResponse,
  http400BadRequestResponse,
  http401UnauthorizedResponse,
  http404NotFoundResponse,
  http500ServerErrorResponse,
  parseRequestBody,
} from "../../lib/httpResponseHelper.js";
import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";
import { initializeSalt } from "../../services/subHasher.js";
import { buildFraudHeaders } from "../../lib/buildFraudHeaders.js";
import { createInvitation, agentAuthorisationErrorResponse } from "../../lib/hmrcAgentAuthorisation.js";
import { getClient, getPracticeArn, setPracticeArn, setClientAuthorisation } from "../../data/dynamoDbPracticeClientRepository.js";

const logger = createLogger({ source: "app/functions/practice/practiceClientAuthorisationInvitePost.js" });

/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "post", "/api/v1/practice/clients/:clientId/authorisation/invitations", ingestHandler);
}
/* v8 ignore stop */

const SERVICE_IDENTIFIER = {
  "MTD-VAT": { clientIdType: "vrn", field: "vrn" },
  "MTD-IT": { clientIdType: "ni", field: "nino" },
};

function isClientNotFound(error) {
  return error?.name === "ConditionalCheckFailedException";
}

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

  const body = parseRequestBody(event) || {};
  const { service, knownFact, accessToken, arn: arnFromBody } = body;

  const errorMessages = [];
  if (!SERVICE_IDENTIFIER[service]) {
    errorMessages.push("service must be one of MTD-VAT, MTD-IT");
  }
  if (!knownFact || typeof knownFact !== "string") {
    errorMessages.push("knownFact is required (the VAT registration date, or the client's postcode)");
  }
  if (!accessToken || typeof accessToken !== "string") {
    errorMessages.push("accessToken is required");
  }
  if (errorMessages.length > 0) {
    return http400BadRequestResponse({ request, headers: responseHeaders, message: "Invalid request", error: { errorMessages } });
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

    let arn = arnFromBody;
    if (arn) {
      await setPracticeArn(user.sub, arn);
    } else {
      arn = await getPracticeArn(user.sub);
    }
    if (!arn) {
      return http400BadRequestResponse({
        request,
        headers: responseHeaders,
        message: "Agent reference number not set for this practice",
        error: {},
      });
    }

    const result = await createInvitation({
      arn,
      service,
      clientIdType,
      clientId: clientIdentifier,
      knownFact,
      accessToken,
      govClientHeaders,
    });

    if (!result.ok || !result.invitationId) {
      return agentAuthorisationErrorResponse(request, result, responseHeaders);
    }

    const updated = await setClientAuthorisation(user.sub, clientId, service, {
      status: "pending",
      invitationId: result.invitationId,
    });

    return http201CreatedResponse({
      request,
      headers: responseHeaders,
      data: { client: updated, invitationId: result.invitationId, status: "pending" },
    });
  } catch (error) {
    if (isClientNotFound(error)) {
      return http404NotFoundResponse({ request, headers: responseHeaders, message: "Client not found", error: {} });
    }
    logger.error({ message: "Failed to invite practice client", error: error.message, stack: error.stack, clientId });
    return http500ServerErrorResponse({ request, headers: responseHeaders, message: "Internal server error", error: {} });
  }
}
