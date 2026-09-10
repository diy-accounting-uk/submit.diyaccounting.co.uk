// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/diyaGl/diyaGlListGet.js

import { createLogger } from "../../lib/logger.js";
import {
  extractUserFromAuthorizerContext,
  http200OkResponse,
  http401UnauthorizedResponse,
  http500ServerErrorResponse,
} from "../../lib/httpResponseHelper.js";
import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";
import { respondWithDiyaGlCors } from "../../lib/diyaGlCors.js";
import { initializeSalt } from "../../services/subHasher.js";
import { resolveOwnerPrefix, listBooks } from "../../data/s3DiyaGlRepository.js";

const logger = createLogger({ source: "app/functions/diyaGl/diyaGlListGet.js" });

/* v8 ignore start */
export function apiEndpoint(app) {
  // Both prefixes serve permanently: the spreadsheets site's cloud.js, including copies held
  // by installed service workers, calls the old path and never switches to the new one.
  for (const urlPath of ["/api/v1/diya-gl", "/api/v1/books"]) {
    registerLambdaRoute(app, "get", urlPath, ingestHandler);
    app.options(urlPath, async (httpRequest, httpResponse) => {
      const lambdaResult = await ingestHandler({
        requestContext: { http: { method: "OPTIONS" } },
        headers: httpRequest.headers,
      });
      httpResponse.status(lambdaResult.statusCode).set(lambdaResult.headers).send(lambdaResult.body);
    });
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
  });
}
