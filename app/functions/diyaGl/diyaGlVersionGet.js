// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/diyaGl/diyaGlVersionGet.js

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
import { isValidBookId, resolveOwnerPrefix, readMetadata, getVersion } from "../../data/s3DiyaGlRepository.js";

const logger = createLogger({ source: "app/functions/diyaGl/diyaGlVersionGet.js" });

/* v8 ignore start */
export function apiEndpoint(app) {
  // Both prefixes serve permanently: the spreadsheets site's cloud.js, including copies held
  // by installed service workers, calls the old path and never switches to the new one.
  for (const urlPath of ["/api/v1/diya-gl/:bookId/versions/:version", "/api/v1/books/:bookId/versions/:version"]) {
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

/**
 * Resolves the "latest" or positive-integer version path parameter against a book's metadata.
 *
 * @param {string} versionParam
 * @param {object} metadata
 * @returns {number|null} the resolved version number, or null when the parameter is invalid
 */
function resolveVersionParam(versionParam, metadata) {
  if (versionParam === "latest") {
    return metadata.latestVersion;
  }
  if (!/^[1-9][0-9]*$/.test(versionParam || "")) {
    return null;
  }
  return Number(versionParam);
}

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
      const metadataResult = await readMetadata(ownerPrefix, bookId);
      if (!metadataResult) {
        return http404NotFoundResponse({
          request,
          headers: corsHeaders,
          message: "book-not-found",
          error: { code: "book-not-found" },
        });
      }
      const { metadata } = metadataResult;

      const version = resolveVersionParam(event.pathParameters?.version, metadata);
      if (version === null) {
        return http400BadRequestResponse({
          request,
          headers: corsHeaders,
          message: "invalid-request",
          error: { code: "invalid-request" },
        });
      }

      let versionResult;
      try {
        versionResult = await getVersion(ownerPrefix, bookId, version);
      } catch (error) {
        if (error.name === "NoSuchKey") {
          return http404NotFoundResponse({
            request,
            headers: corsHeaders,
            message: "version-not-found",
            error: { code: "version-not-found" },
          });
        }
        throw error;
      }

      return http200OkResponse({
        request,
        headers: { ...corsHeaders, ETag: `"${versionResult.etag}"` },
        data: {
          metadata,
          version,
          etag: versionResult.etag,
          zipBase64: versionResult.bytes.toString("base64"),
        },
      });
    } catch (error) {
      logger.error({ message: "Failed to read book version", error: error.message, stack: error.stack, bookId });
      return http500ServerErrorResponse({
        request,
        headers: corsHeaders,
        message: "storage-error",
        error: { code: "storage-error" },
      });
    }
  });
}
