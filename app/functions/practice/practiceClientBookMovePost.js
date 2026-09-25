// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/practice/practiceClientBookMovePost.js

import { validateEnv } from "../../lib/env.js";
import { createLogger } from "../../lib/logger.js";
import {
  extractRequest,
  extractUserFromAuthorizerContext,
  http200OkResponse,
  http400BadRequestResponse,
  http401UnauthorizedResponse,
  http404NotFoundResponse,
  http409ConflictResponse,
  http500ServerErrorResponse,
} from "../../lib/httpResponseHelper.js";
import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";
import { initializeSalt } from "../../services/subHasher.js";
import { resolveAppClient } from "../../lib/appClientResolver.js";
import { publishActivityEvent } from "../../lib/activityAlert.js";
import { getClient } from "../../data/dynamoDbPracticeClientRepository.js";
import { isValidBookId, moveBookToClient, BookNotFoundError, DestinationBookExistsError } from "../../data/s3DiyaGlRepository.js";

const logger = createLogger({ source: "app/functions/practice/practiceClientBookMovePost.js" });

/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "post", "/api/v1/practice/clients/:clientId/books/:bookId/move", ingestHandler);
}
/* v8 ignore stop */

/**
 * Moves one of the practice's own books to a client's book set. The client must belong to the
 * signed-in practice; the book must be one of the practice's own, not already under any client.
 */
export async function ingestHandler(event) {
  await initializeSalt();
  validateEnv(["PRACTICE_CLIENTS_DYNAMODB_TABLE_NAME"]);

  const { request } = extractRequest(event);
  const responseHeaders = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" };

  const user = extractUserFromAuthorizerContext(event);
  if (!user) {
    return http401UnauthorizedResponse({ request, headers: responseHeaders, message: "Authentication required" });
  }

  const clientId = event.pathParameters?.clientId;
  const bookId = event.pathParameters?.bookId;
  if (!clientId) {
    return http400BadRequestResponse({ request, headers: responseHeaders, message: "clientId path parameter is required", error: {} });
  }
  if (!bookId || !isValidBookId(bookId)) {
    return http400BadRequestResponse({
      request,
      headers: responseHeaders,
      message: "bookId path parameter must be a valid book id",
      error: {},
    });
  }

  try {
    const client = await getClient(user.sub, clientId);
    if (!client || client.archivedAt) {
      return http404NotFoundResponse({ request, headers: responseHeaders, message: "Client not found", error: {} });
    }

    const result = await moveBookToClient(user.sub, clientId, bookId);

    const appClient = await resolveAppClient(user.appClientId);
    await publishActivityEvent({
      event: "book-moved",
      summary: `Book moved to client: ${bookId}`,
      userSub: user.sub,
      appClient,
      clientId,
      detail: { bookId, movedObjectCount: result.movedObjectCount },
    });

    return http200OkResponse({ request, headers: responseHeaders, data: result });
  } catch (error) {
    if (error instanceof BookNotFoundError) {
      return http404NotFoundResponse({ request, headers: responseHeaders, message: error.message, error: {} });
    }
    if (error instanceof DestinationBookExistsError) {
      return http409ConflictResponse({ request, headers: responseHeaders, message: error.message, error: {} });
    }
    logger.error({ message: "Failed to move book to client", error: error.message, stack: error.stack, clientId, bookId });
    return http500ServerErrorResponse({ request, headers: responseHeaders, message: "Internal server error", error: {} });
  }
}
