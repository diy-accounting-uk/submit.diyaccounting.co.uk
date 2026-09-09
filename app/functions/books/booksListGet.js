// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/functions/books/booksListGet.js

import { createLogger } from "../../lib/logger.js";
import {
  extractRequest,
  extractUserFromAuthorizerContext,
  http200OkResponse,
  http401UnauthorizedResponse,
  http500ServerErrorResponse,
} from "../../lib/httpResponseHelper.js";
import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";
import { resolveDiyaGlCorsHeaders, diyaGlPreflightResponse } from "../../lib/diyaGlCors.js";
import { initializeSalt } from "../../services/subHasher.js";
import { resolveOwnerPrefix, listBooks } from "../../data/s3DiyaGlRepository.js";

const logger = createLogger({ source: "app/functions/books/booksListGet.js" });

/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "get", "/api/v1/books", ingestHandler);
  app.options("/api/v1/books", async (httpRequest, httpResponse) => {
    const lambdaResult = await ingestHandler({
      requestContext: { http: { method: "OPTIONS" } },
      headers: httpRequest.headers,
    });
    httpResponse.status(lambdaResult.statusCode).set(lambdaResult.headers).send(lambdaResult.body);
  });
}
/* v8 ignore stop */

export async function ingestHandler(event) {
  if (event?.requestContext?.http?.method === "OPTIONS") {
    return diyaGlPreflightResponse(event.headers);
  }

  const { request } = extractRequest(event);
  const corsHeaders = resolveDiyaGlCorsHeaders(event.headers);

  const user = extractUserFromAuthorizerContext(event);
  if (!user) {
    return http401UnauthorizedResponse({
      request,
      headers: corsHeaders,
      message: "Authentication required",
    });
  }

  try {
    await initializeSalt();
    const ownerPrefix = await resolveOwnerPrefix(user.sub);
    const books = await listBooks(ownerPrefix);
    books.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));

    return http200OkResponse({
      request,
      headers: corsHeaders,
      data: { books },
    });
  } catch (error) {
    logger.error({ message: "Failed to list books", error: error.message, stack: error.stack });
    return http500ServerErrorResponse({
      request,
      headers: corsHeaders,
      message: "storage-error",
      error: { code: "storage-error" },
    });
  }
}
