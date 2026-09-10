// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/diyaGl/diyaGlDelete.js

import { createLogger } from "../../lib/logger.js";
import {
  extractUserFromAuthorizerContext,
  http200OkResponse,
  http400BadRequestResponse,
  http401UnauthorizedResponse,
  http404NotFoundResponse,
  http500ServerErrorResponse,
} from "../../lib/httpResponseHelper.js";
import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";
import { respondWithDiyaGlCors } from "../../lib/diyaGlCors.js";
import { initializeSalt } from "../../services/subHasher.js";
import { isValidBookId, resolveOwnerPrefix, readMetadata, deleteBook } from "../../data/s3DiyaGlRepository.js";

const logger = createLogger({ source: "app/functions/diyaGl/diyaGlDelete.js" });

/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "delete", "/api/v1/books/:bookId", ingestHandler);
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

    try {
      await initializeSalt();
      const ownerPrefix = await resolveOwnerPrefix(user.sub, bookId);
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
