// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/functions/analytics/operatorSnapshotGet.js
//
// Serves the latest snapshot operatorSnapshotPublish.js wrote to the analytics lake. Never
// queries Athena itself: reading the pre-built JSON keeps the dashboard fast regardless of how
// long the nightly job's queries take, and keeps the page's entitlement check (the
// operator-dashboard activity, gating on the operator bundle) the only thing standing between a
// request and the data.

import { createLogger } from "../../lib/logger.js";
import {
  extractRequest,
  http200OkResponse,
  http401UnauthorizedResponse,
  http403ForbiddenResponse,
  http404NotFoundResponse,
  http500ServerErrorResponse,
} from "../../lib/httpResponseHelper.js";
import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";
import { enforceBundles, BundleAuthorizationError, BundleEntitlementError } from "../../services/bundleManagement.js";

const logger = createLogger({ source: "app/functions/analytics/operatorSnapshotGet.js" });

/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "get", "/api/v1/operator/snapshot", ingestHandler);
}
/* v8 ignore stop */

// Maps enforceBundles() failures to HTTP responses. Duplicated rather than imported from
// another API module, so this module pulls in no unrelated request-signing code - the same
// choice companiesHouseApi.js and hmrcApi.js each made for their own copy.
export function http403ForbiddenFromBundleEnforcement(error, request) {
  if (error instanceof BundleAuthorizationError) {
    logger.warn({ message: "Unauthorized - missing or invalid authorization token", error: error.message, details: error.details });
    return http401UnauthorizedResponse({
      request,
      message: error.message,
      error: { code: error.details?.code || "UNAUTHORIZED", ...error.details },
    });
  }
  if (!(error instanceof BundleEntitlementError)) {
    logger.error({ message: "Unexpected error during bundle enforcement", error: error.message, stack: error.stack });
    return http500ServerErrorResponse({
      request,
      message: "Authorization failure while checking entitlements",
      error: { detail: error.message || String(error) },
    });
  }
  logger.warn({ message: "Forbidden - bundle entitlement missing or insufficient", error: error.message, details: error.details });
  return http403ForbiddenResponse({
    request,
    message: "Forbidden - missing or insufficient bundle entitlement",
    error: { code: error.details?.code || "BUNDLE_ENTITLEMENT_REQUIRED", ...error.details },
  });
}

let cachedS3Client = null;

async function getS3Client() {
  if (!cachedS3Client) {
    const { S3Client } = await import("@aws-sdk/client-s3");
    cachedS3Client = new S3Client({ region: process.env.AWS_REGION || "eu-west-2" });
  }
  return cachedS3Client;
}

/**
 * Reads and parses `snapshots/<env>/latest.json` from the analytics lake.
 *
 * @returns {Promise<object|null>} the snapshot, or null when the nightly job has not run yet
 */
export async function readLatestSnapshot() {
  const bucket = process.env.ANALYTICS_LAKE_BUCKET_NAME;
  const envName = process.env.ENVIRONMENT_NAME;
  if (!bucket) throw new Error("ANALYTICS_LAKE_BUCKET_NAME environment variable is required");
  if (!envName) throw new Error("ENVIRONMENT_NAME environment variable is required");

  const client = await getS3Client();
  const { GetObjectCommand } = await import("@aws-sdk/client-s3");

  try {
    const response = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: `snapshots/${envName}/latest.json` }),
    );
    const body = await response.Body.transformToString("utf8");
    return JSON.parse(body);
  } catch (error) {
    if (error.name === "NoSuchKey") return null;
    throw error;
  }
}

export async function ingestHandler(event) {
  const { request } = extractRequest(event);
  const responseHeaders = { "Content-Type": "application/json" };

  try {
    await enforceBundles(event);
  } catch (error) {
    return http403ForbiddenFromBundleEnforcement(error, request);
  }

  let snapshot;
  try {
    snapshot = await readLatestSnapshot();
  } catch (error) {
    logger.error({ message: "Failed to read operator snapshot", error: error.message, stack: error.stack });
    return http500ServerErrorResponse({
      request,
      headers: responseHeaders,
      message: "Internal server error",
      error: error.message,
    });
  }

  if (!snapshot) {
    return http404NotFoundResponse({
      request,
      headers: responseHeaders,
      message: "snapshot-not-found",
      error: { code: "snapshot-not-found" },
    });
  }

  return http200OkResponse({
    request,
    headers: responseHeaders,
    data: snapshot,
  });
}
