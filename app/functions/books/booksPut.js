// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/functions/books/booksPut.js

import { createLogger } from "../../lib/logger.js";
import {
  extractRequest,
  extractUserFromAuthorizerContext,
  getHeader,
  parseRequestBody,
  http200OkResponse,
  http400BadRequestResponse,
  http401UnauthorizedResponse,
  http403ForbiddenResponse,
  http409ConflictResponse,
  http412PreconditionFailedResponse,
  http413PayloadTooLargeResponse,
  http422UnprocessableEntityResponse,
  http500ServerErrorResponse,
} from "../../lib/httpResponseHelper.js";
import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";
import { resolveBooksCorsHeaders, booksPreflightResponse } from "../../lib/booksCors.js";
import { initializeSalt } from "../../services/subHasher.js";
import { entitlementFor } from "../../services/booksEntitlement.js";
import { listZipMemberNames, isDiyaGlPackage, NotAZipError } from "../../lib/zipMembers.js";
import { isValidBookId, resolveOwnerPrefix, readMetadata, writeMetadata, putVersion, deleteVersion, listBooks } from "../../data/s3BooksRepository.js";

const logger = createLogger({ source: "app/functions/books/booksPut.js" });

const VALID_PRODUCTS = ["bst", "se", "taxi", "ltd"];
const PROVENANCE_FIELDS = ["formatVersion", "engineVersion", "taxDataHash", "templateHash", "reconciledCommit"];
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

class WriteRaceError extends Error {}

/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "put", "/api/v1/books/:bookId", ingestHandler);
  app.options("/api/v1/books/:bookId", async (httpRequest, httpResponse) => {
    const lambdaResult = await ingestHandler({
      requestContext: { http: { method: "OPTIONS" } },
      headers: httpRequest.headers,
    });
    httpResponse.status(lambdaResult.statusCode).set(lambdaResult.headers).send(lambdaResult.body);
  });
}
/* v8 ignore stop */

function isValidTitle(title) {
  return typeof title === "string" && title.trim().length >= 1 && title.trim().length <= 120;
}

function isValidIsoDateOrNull(value) {
  return value === null || value === undefined || (typeof value === "string" && ISO_DATE_PATTERN.test(value));
}

function isValidProvenanceField(value) {
  return value === null || value === undefined || (typeof value === "string" && value.length <= 200);
}

function normaliseProvenance(provenance) {
  if (provenance === null || provenance === undefined) {
    provenance = {};
  }
  if (typeof provenance !== "object" || Array.isArray(provenance)) {
    return null;
  }
  const normalised = {};
  for (const field of PROVENANCE_FIELDS) {
    if (!isValidProvenanceField(provenance[field])) {
      return null;
    }
    normalised[field] = provenance[field] ?? null;
  }
  return normalised;
}

/**
 * Validates and normalises the PUT request body per section 2.3 of the storage plan.
 *
 * @param {object} body
 * @returns {{title: string, product: string, periodCoveredStart: string|null,
 *   periodCoveredEnd: string|null, provenance: object, zipBase64: string} | null}
 */
function validatePutBody(body) {
  if (!body || typeof body !== "object") {
    return null;
  }
  const { title, product, periodCoveredStart, periodCoveredEnd, provenance, zipBase64 } = body;

  if (typeof zipBase64 !== "string" || zipBase64.length === 0) {
    return null;
  }
  if (!isValidTitle(title)) {
    return null;
  }
  if (!VALID_PRODUCTS.includes(product)) {
    return null;
  }
  if (!isValidIsoDateOrNull(periodCoveredStart) || !isValidIsoDateOrNull(periodCoveredEnd)) {
    return null;
  }
  const normalisedProvenance = normaliseProvenance(provenance);
  if (normalisedProvenance === null) {
    return null;
  }

  return {
    title: title.trim(),
    product,
    periodCoveredStart: periodCoveredStart ?? null,
    periodCoveredEnd: periodCoveredEnd ?? null,
    provenance: normalisedProvenance,
    zipBase64,
  };
}

function isPreconditionFailed(error) {
  return error?.name === "PreconditionFailed";
}

/**
 * Writes the next version's zip and metadata in one attempt. Throws WriteRaceError when an S3
 * conditional write loses a race, for the caller to retry once from a fresh metadata read.
 */
async function attemptWrite({ ownerPrefix, bookId, existing, fields, decodedBytes, entitlement, versionsKept }) {
  const nextVersion = existing ? existing.metadata.latestVersion + 1 : 1;

  let zipETag;
  try {
    zipETag = await putVersion({ ownerPrefix, bookId, version: nextVersion, bytes: decodedBytes });
  } catch (error) {
    if (isPreconditionFailed(error)) {
      throw new WriteRaceError("Zip version write raced with another writer");
    }
    throw error;
  }

  const now = new Date().toISOString();
  const versions = existing ? [...existing.metadata.versions] : [];
  versions.push({ version: nextVersion, etag: zipETag, size: decodedBytes.length, createdAt: now });

  while (versions.length > versionsKept) {
    const oldest = versions.shift();
    await deleteVersion(ownerPrefix, bookId, oldest.version);
  }

  const metadata = {
    formatVersion: 1,
    bookId,
    product: fields.product,
    title: fields.title,
    latestVersion: nextVersion,
    latestETag: zipETag,
    latestSize: decodedBytes.length,
    versions,
    createdAt: existing ? existing.metadata.createdAt : now,
    updatedAt: now,
    periodCoveredStart: fields.periodCoveredStart,
    periodCoveredEnd: fields.periodCoveredEnd,
    provenance: fields.provenance,
    entitlementAtPut: entitlement,
  };

  try {
    await writeMetadata({
      ownerPrefix,
      bookId,
      metadata,
      ...(existing ? { ifMatch: existing.metaETag } : { ifNoneMatch: "*" }),
    });
  } catch (error) {
    if (isPreconditionFailed(error)) {
      throw new WriteRaceError("Metadata write raced with another writer");
    }
    throw error;
  }

  return metadata;
}

export async function ingestHandler(event) {
  if (event?.requestContext?.http?.method === "OPTIONS") {
    return booksPreflightResponse(event.headers);
  }

  const { request } = extractRequest(event);
  const corsHeaders = resolveBooksCorsHeaders(event.headers);

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

  const body = parseRequestBody(event);
  const fields = validatePutBody(body);
  if (!fields) {
    return http400BadRequestResponse({
      request,
      headers: corsHeaders,
      message: "invalid-request",
      error: { code: "invalid-request" },
    });
  }

  const decodedBytes = Buffer.from(fields.zipBase64, "base64");
  const maxBytes = Number(process.env.BOOKS_MAX_BYTES || 2097152);
  if (decodedBytes.length > maxBytes) {
    return http413PayloadTooLargeResponse({
      request,
      headers: corsHeaders,
      message: "book-too-large",
      error: { code: "book-too-large" },
    });
  }

  try {
    const memberNames = listZipMemberNames(decodedBytes);
    if (!isDiyaGlPackage(memberNames)) {
      return http422UnprocessableEntityResponse({
        request,
        headers: corsHeaders,
        data: { message: "not-a-diya-gl-package", code: "not-a-diya-gl-package" },
      });
    }
  } catch (error) {
    if (error instanceof NotAZipError) {
      return http422UnprocessableEntityResponse({
        request,
        headers: corsHeaders,
        data: { message: "not-a-diya-gl-package", code: "not-a-diya-gl-package" },
      });
    }
    throw error;
  }

  try {
    await initializeSalt();
    const entitlement = await entitlementFor(user.sub);
    if (!entitlement.allowed) {
      return http403ForbiddenResponse({
        request,
        headers: corsHeaders,
        message: "subscription-required",
        error: { code: "subscription-required" },
      });
    }

    const ownerPrefix = await resolveOwnerPrefix(user.sub, bookId);
    let existing = await readMetadata(ownerPrefix, bookId);

    if (!existing) {
      const currentBooks = await listBooks(ownerPrefix);
      const maxPerUser = Number(process.env.BOOKS_MAX_PER_USER || 20);
      if (currentBooks.length >= maxPerUser) {
        return http403ForbiddenResponse({
          request,
          headers: corsHeaders,
          message: "book-limit-reached",
          error: { code: "book-limit-reached" },
        });
      }
    }

    const ifMatchHeader = getHeader(event.headers, "if-match");
    if (existing) {
      if (ifMatchHeader !== existing.metadata.latestETag) {
        return http412PreconditionFailedResponse({
          request,
          headers: corsHeaders,
          message: "etag-mismatch",
          error: {
            code: "etag-mismatch",
            latestETag: existing.metadata.latestETag,
            latestVersion: existing.metadata.latestVersion,
          },
        });
      }
    } else if (ifMatchHeader) {
      return http412PreconditionFailedResponse({
        request,
        headers: corsHeaders,
        message: "etag-mismatch",
        error: { code: "etag-mismatch" },
      });
    }

    const versionsKept = Number(process.env.BOOKS_VERSIONS_KEPT || 30);
    let metadata;
    try {
      metadata = await attemptWrite({ ownerPrefix, bookId, existing, fields, decodedBytes, entitlement, versionsKept });
    } catch (error) {
      if (!(error instanceof WriteRaceError)) {
        throw error;
      }
      logger.warn({ message: "Write race detected, retrying once", bookId, error: error.message });
      existing = await readMetadata(ownerPrefix, bookId);
      try {
        metadata = await attemptWrite({ ownerPrefix, bookId, existing, fields, decodedBytes, entitlement, versionsKept });
      } catch (retryError) {
        if (retryError instanceof WriteRaceError) {
          return http409ConflictResponse({
            request,
            headers: corsHeaders,
            message: "write-conflict",
            error: { code: "write-conflict" },
          });
        }
        throw retryError;
      }
    }

    return http200OkResponse({
      request,
      headers: { ...corsHeaders, ETag: `"${metadata.latestETag}"` },
      data: { metadata },
    });
  } catch (error) {
    logger.error({ message: "Failed to store book", error: error.message, stack: error.stack, bookId });
    return http500ServerErrorResponse({
      request,
      headers: corsHeaders,
      message: "storage-error",
      error: { code: "storage-error" },
    });
  }
}
