// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/practice/practiceClientDelete.js

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
import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";
import { initializeSalt } from "../../services/subHasher.js";
import { archiveClient } from "../../data/dynamoDbPracticeClientRepository.js";

const logger = createLogger({ source: "app/functions/practice/practiceClientDelete.js" });

/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "delete", "/api/v1/practice/clients/:clientId", ingestHandler);
}
/* v8 ignore stop */

function isClientNotFound(error) {
  return error?.name === "ConditionalCheckFailedException";
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

  const clientId = event.pathParameters?.clientId;
  if (!clientId) {
    return http400BadRequestResponse({
      request,
      headers: responseHeaders,
      message: "clientId path parameter is required",
      error: {},
    });
  }

  try {
    const client = await archiveClient(user.sub, clientId);
    return http200OkResponse({
      request,
      headers: responseHeaders,
      data: { client },
    });
  } catch (error) {
    if (isClientNotFound(error)) {
      return http404NotFoundResponse({
        request,
        headers: responseHeaders,
        message: "Client not found",
        error: {},
      });
    }
    logger.error({ message: "Failed to archive practice client", error: error.message, stack: error.stack, clientId });
    return http500ServerErrorResponse({
      request,
      headers: responseHeaders,
      message: "Internal server error",
      error: {},
    });
  }
}
