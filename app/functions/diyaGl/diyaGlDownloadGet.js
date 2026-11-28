// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/diyaGl/diyaGlDownloadGet.js
// A download of one version of a DIYA-GL book as a workbook, a package zip, the stored DIYA-GL zip or
// a DIYA-GL book as JSON. The answer is a short-lived link, never the file: a company's package zip
// is several megabytes, past what a Lambda answer carries. The stored zip is linked where it is; any
// other format is built from it, kept under downloads/ (emptied by the bucket's lifecycle rule), and
// linked there.

import { randomUUID } from "node:crypto";

import { readBookSource, writeBookJson } from "@diy-accounting-uk/diya-gl/dist/app/lib/diya-gl-interchange.js";
import { savePackageZip, saveWorkbook, SingleFileOnlyError } from "@diy-accounting-uk/diya-gl/dist/app/lib/product-workbook.js";
import { PRODUCTS } from "@diy-accounting-uk/diya-gl/dist/app/lib/products.js";

import { createLogger } from "../../lib/logger.js";
import {
  extractUserFromAuthorizerContext,
  http200OkResponse,
  http400BadRequestResponse,
  http401UnauthorizedResponse,
  http403ForbiddenResponse,
  http404NotFoundResponse,
  http422UnprocessableEntityResponse,
  http500ServerErrorResponse,
} from "../../lib/httpResponseHelper.js";
import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";
import { respondWithDiyaGlCors } from "../../lib/diyaGlCors.js";
import { initializeSalt } from "../../services/subHasher.js";
import { resolveAppClient } from "../../lib/appClientResolver.js";
import { publishActivityEvent } from "../../lib/activityAlert.js";
import {
  isValidBookId,
  resolveOwnerPrefix,
  readMetadata,
  getVersion,
  versionKey,
  downloadKey,
  putDownload,
  presignDownload,
} from "../../data/s3DiyaGlRepository.js";
import { getClient } from "../../data/dynamoDbPracticeClientRepository.js";

const logger = createLogger({ source: "app/functions/diyaGl/diyaGlDownloadGet.js" });

export const DOWNLOAD_FORMATS = ["xlsx", "zip", "diya-gl-zip", "json"];

const CONTENT_TYPES = {
  "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "zip": "application/zip",
  "diya-gl-zip": "application/zip",
  "json": "application/json",
};

/* v8 ignore start */
export function apiEndpoint(app) {
  const urlPath = "/api/v1/books/:bookId/versions/:version/download";
  registerLambdaRoute(app, "get", urlPath, ingestHandler);
  app.options(urlPath, async (httpRequest, httpResponse) => {
    const lambdaResult = await ingestHandler({
      requestContext: { http: { method: "OPTIONS" } },
      headers: httpRequest.headers,
    });
    httpResponse.status(lambdaResult.statusCode).set(lambdaResult.headers).send(lambdaResult.body);
  });
}
/* v8 ignore stop */

function resolveVersion(versionParam, metadata) {
  if (versionParam === "latest") return metadata.latestVersion;
  if (!/^[1-9]\d*$/.test(versionParam ?? "")) return null;
  return Number(versionParam);
}

// The file name a download carries: the book's title as a safe stem.
function stemOf(title) {
  const words = (title || "").split(/[^\w.]+/).filter(Boolean);
  return words.length ? words.join("-") : "diya-gl-book";
}

// The built file for a format other than the stored zip.
async function buildDownload(format, bytes, bookId, stem) {
  const { book, lines } = await readBookSource(bytes, `${bookId}.zip`, { products: PRODUCTS });
  if (format === "json") return { bytes: Buffer.from(writeBookJson(book, lines), "utf8"), filename: `${stem}-diya-gl.json` };
  if (format === "zip") {
    const { zip, filename } = await savePackageZip(book, lines);
    return { bytes: Buffer.from(zip), filename };
  }
  const { workbook, filename } = await saveWorkbook(book, lines);
  return { bytes: Buffer.from(workbook), filename };
}

export async function ingestHandler(event) {
  return respondWithDiyaGlCors(event, async ({ request, corsHeaders }) => {
    const user = extractUserFromAuthorizerContext(event);
    if (!user) {
      return http401UnauthorizedResponse({ request, headers: corsHeaders, message: "Authentication required" });
    }

    const bookId = event.pathParameters?.bookId;
    if (!isValidBookId(bookId)) {
      return http400BadRequestResponse({ request, headers: corsHeaders, message: "invalid-book-id", error: { code: "invalid-book-id" } });
    }
    const format = event.queryStringParameters?.format || "xlsx";
    if (!DOWNLOAD_FORMATS.includes(format)) {
      return http400BadRequestResponse({ request, headers: corsHeaders, message: "invalid-format", error: { code: "invalid-format" } });
    }
    const clientId = event.queryStringParameters?.clientId || undefined;

    try {
      await initializeSalt();
      if (clientId && !(await getClient(user.sub, clientId))) {
        return http403ForbiddenResponse({
          request,
          headers: corsHeaders,
          message: "client-not-found",
          error: { code: "client-not-found" },
        });
      }

      const ownerPrefix = await resolveOwnerPrefix(user.sub, bookId, clientId);
      const metadataResult = await readMetadata(ownerPrefix, bookId);
      if (!metadataResult) {
        return http404NotFoundResponse({ request, headers: corsHeaders, message: "book-not-found", error: { code: "book-not-found" } });
      }
      const { metadata } = metadataResult;
      if (metadata.retention === "sandbox" && metadata.expiresAt && Date.parse(metadata.expiresAt) <= Date.now()) {
        return http404NotFoundResponse({ request, headers: corsHeaders, message: "book-expired", error: { code: "book-expired" } });
      }
      const version = resolveVersion(event.pathParameters?.version, metadata);
      if (version === null || !metadata.versions?.some((entry) => entry.version === version)) {
        return http404NotFoundResponse({
          request,
          headers: corsHeaders,
          message: "version-not-found",
          error: { code: "version-not-found" },
        });
      }

      const stem = stemOf(metadata.title);
      let link;
      if (format === "diya-gl-zip") {
        link = {
          url: await presignDownload(versionKey(ownerPrefix, bookId, version), `${stem}-v${version}.zip`),
          filename: `${stem}-v${version}.zip`,
        };
      } else {
        const { bytes } = await getVersion(ownerPrefix, bookId, version);
        let built;
        try {
          built = await buildDownload(format, bytes, bookId, stem);
        } catch (error) {
          if (error instanceof SingleFileOnlyError) {
            return http422UnprocessableEntityResponse({
              request,
              headers: corsHeaders,
              data: { message: "workbook-set-downloads-as-zip", code: "workbook-set-downloads-as-zip" },
            });
          }
          throw error;
        }
        const key = downloadKey(ownerPrefix, randomUUID(), built.filename);
        await putDownload({ key, bytes: built.bytes, contentType: CONTENT_TYPES[format] });
        link = { url: await presignDownload(key, built.filename), filename: built.filename };
      }

      const appClient = await resolveAppClient(user.appClientId);
      await publishActivityEvent({
        event: "book-downloaded",
        summary: `Book downloaded: ${metadata.product} as ${format}`,
        userSub: user.sub,
        appClient,
        clientId,
        detail: { product: metadata.product, format, version },
      });

      return http200OkResponse({ request, headers: corsHeaders, data: { ...link, format, version } });
    } catch (error) {
      logger.error({ message: "Failed to build a book download", error: error.message, stack: error.stack, bookId });
      return http500ServerErrorResponse({ request, headers: corsHeaders, message: "storage-error", error: { code: "storage-error" } });
    }
  });
}
