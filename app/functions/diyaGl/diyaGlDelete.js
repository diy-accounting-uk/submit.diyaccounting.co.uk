// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/diyaGl/diyaGlDelete.js

import { createLogger } from "../../lib/logger.js";
import {
  extractUserFromAuthorizerContext,
  http200OkResponse,
  http400BadRequestResponse,
  http401UnauthorizedResponse,
  http403ForbiddenResponse,
  http404NotFoundResponse,
  http500ServerErrorResponse,
} from "../../lib/httpResponseHelper.js";
import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";
import { respondWithDiyaGlCors } from "../../lib/diyaGlCors.js";
import { initializeSalt } from "../../services/subHasher.js";
import { resolveAppClient } from "../../lib/appClientResolver.js";
import { publishActivityEvent } from "../../lib/activityAlert.js";
import { isValidBookId, resolveOwnerPrefix, readMetadata, deleteBook } from "../../data/s3DiyaGlRepository.js";
import { getClient } from "../../data/dynamoDbPracticeClientRepository.js";

const logger = createLogger({ source: "app/functions/diyaGl/diyaGlDelete.js" });

/* v8 ignore start */
export function apiEndpoint(app) {
  // Both prefixes serve permanently: the spreadsheets site's cloud.js, including copies held
  // by installed service workers, calls the old path and never switches to the new one.
  for (const urlPath of ["/api/v1/diya-gl/:bookId", "/api/v1/books/:bookId"]) {
    registerLambdaRoute(app, "delete", urlPath, ingestHandler);
  }
}
/* v8 ignore stop */

export async function ingestHandler(event) {
  return respondWithDiyaGlCors(event, async ({ request, corsHeaders }) => {
    const user = extractUserFromAuthorizerContext(event);
    if (!user) {
      return http401UnauthorizedResponse({
        request,
        headers: corsHeaders,
        message: "Authentication required",
      });
    }

    const bookId = event.pathParameters?.bookId;
    if (!isValidBookId(bookId)) {
      return http400BadRequestResponse({
        request,
        headers: corsHeaders,
        message: "invalid-book-id",
        error: { code: "invalid-book-id" },
      });
    }

    const clientId = event.queryStringParameters?.clientId || undefined;

    try {
      await initializeSalt();
      if (clientId) {
        const client = await getClient(user.sub, clientId);
        if (!client) {
          return http403ForbiddenResponse({
            request,
            headers: corsHeaders,
            message: "client-not-found",
            error: { code: "client-not-found" },
          });
        }
      }

      const ownerPrefix = await resolveOwnerPrefix(user.sub, bookId, clientId);
      const existing = await readMetadata(ownerPrefix, bookId);
      if (!existing) {
        return http404NotFoundResponse({
          request,
          headers: corsHeaders,
          message: "book-not-found",
          error: { code: "book-not-found" },
        });
      }

      const deletedObjects = await deleteBook(ownerPrefix, bookId);

      const appClient = await resolveAppClient(user.appClientId);
      await publishActivityEvent({
        event: "book-deleted",
        summary: `Book deleted: ${existing.metadata.product}`,
        userSub: user.sub,
        appClient,
        clientId,
        detail: { product: existing.metadata.product, retention: existing.metadata.retention },
      });

      return http200OkResponse({
        request,
        headers: corsHeaders,
        data: { bookId, deletedObjects },
      });
    } catch (error) {
      logger.error({ message: "Failed to delete book", error: error.message, stack: error.stack, bookId });
      return http500ServerErrorResponse({
        request,
        headers: corsHeaders,
        message: "storage-error",
        error: { code: "storage-error" },
      });
    }
  });
}
