// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability DATA-66 Serve a captured AWS console image to operators
// - **Use when:** the operator dashboard shows a graph that consoleCapturePublish.js rendered.
// - **Does:** operatorConsoleImageGet.js is the GET /api/v1/operator/console-image?id=<capture id> Lambda. It enforces the operator bundle, looks the id up in snapshots/<env>/console/index.json and answers the PNG from the lake. An id that is not in the index answers 404 in JSON, and the id never forms an object key, so no request reads another object.
// - **Run:** `GET /api/v1/operator/console-image?id=prod-lambda-errors`
// - **Entry:** `app/functions/analytics/operatorConsoleImageGet.js:ingestHandler`
// - **Files:** app/functions/analytics/operatorConsoleImageGet.js, app/unit-tests/analytics/operatorConsoleImageGet.test.js, app/lib/consoleCaptureStore.js
// - **Keywords:** console image api, operator bundle entitlement, captured graph, png response, operator dashboard route
// - **Related:** DATA-19, DATA-65
// @end-capability

// app/functions/analytics/operatorConsoleImageGet.js
//
// Serves one image the console capture wrote to the analytics lake. The image is never a public
// object: only this route reads it, after the operator entitlement check.

import { createLogger } from "../../lib/logger.js";
import {
  extractRequest,
  http200OkBinaryResponse,
  http400BadRequestResponse,
  http404NotFoundResponse,
  http500ServerErrorResponse,
} from "../../lib/httpResponseHelper.js";
import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";
import { enforceBundles } from "../../services/bundleManagement.js";
import { initializeSalt } from "../../services/subHasher.js";
import { readConsoleIndex, readConsoleImage } from "../../lib/consoleCaptureStore.js";
import { http403ForbiddenFromBundleEnforcement } from "./operatorSnapshotGet.js";

const logger = createLogger({ source: "app/functions/analytics/operatorConsoleImageGet.js" });

/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "get", "/api/v1/operator/console-image", ingestHandler);
}
/* v8 ignore stop */

export async function ingestHandler(event) {
  await initializeSalt();
  const { request } = extractRequest(event);
  const responseHeaders = { "Content-Type": "application/json" };

  try {
    await enforceBundles(event);
  } catch (error) {
    return http403ForbiddenFromBundleEnforcement(error, request);
  }

  const captureId = event.queryStringParameters?.id;
  if (!captureId) {
    return http400BadRequestResponse({
      request,
      headers: responseHeaders,
      message: "id is required",
      error: { code: "capture-id-required" },
    });
  }

  try {
    const index = await readConsoleIndex();
    const entry = index && Object.hasOwn(index.items || {}, captureId) ? index.items[captureId] : null;
    const image = entry?.imageKey ? await readConsoleImage(entry.imageKey) : null;
    if (!image) {
      return http404NotFoundResponse({
        request,
        headers: responseHeaders,
        message: "console-image-not-found",
        error: { code: "console-image-not-found" },
      });
    }
    return http200OkBinaryResponse({
      request,
      headers: { "Cache-Control": "private, no-store" },
      contentType: "image/png",
      data: image,
    });
  } catch (error) {
    logger.error({ message: "Failed to read console image", error: error.message, stack: error.stack });
    return http500ServerErrorResponse({ request, headers: responseHeaders, message: "Internal server error", error: error.message });
  }
}
