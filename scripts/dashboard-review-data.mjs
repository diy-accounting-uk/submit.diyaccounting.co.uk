// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/dashboard-review-data.mjs
//
// Reads what the operator dashboard shows, with the functions the dashboard's own Lambdas use:
// the snapshot, the console index, each console image and the held passes.
// env: ANALYTICS_LAKE_BUCKET_NAME, ENVIRONMENT_NAME, PASSES_DYNAMODB_TABLE_NAME (and AWS credentials).

import { readLatestSnapshot } from "../app/functions/analytics/operatorSnapshotGet.js";
import { readConsoleIndex, readConsoleImage } from "../app/lib/consoleCaptureStore.js";
import { listHeldPasses } from "../app/services/passService.js";

// The review role holds no s3:ListBucket, so a missing key answers AccessDenied, not NoSuchKey.
async function nullWhenAccessDenied(read) {
  try {
    return await read();
  } catch (error) {
    if (error && error.name === "AccessDenied") return null;
    throw error;
  }
}

// The review role may query the passes index only under the held key. A refused query leaves the
// held passes panel out of the review: null, where an empty list would show an empty panel.
async function heldPassesOrNull() {
  try {
    return await listHeldPasses();
  } catch (error) {
    if (error && error.name === "AccessDeniedException") return null;
    throw error;
  }
}

/**
 * @returns {Promise<{
 *   snapshot: object|null,
 *   consoleIndex: object|null,
 *   images: Map<string, Buffer|null>,
 *   heldPasses: object[]|null,
 * }>} images holds one entry for each console item that has an imageKey, keyed by capture id.
 * heldPasses is null when the read was refused.
 */
export async function readReviewData() {
  const snapshot = await nullWhenAccessDenied(() => readLatestSnapshot());
  const consoleIndex = snapshot ? await nullWhenAccessDenied(() => readConsoleIndex()) : null;
  const images = new Map();
  for (const [captureId, item] of Object.entries((consoleIndex && consoleIndex.items) || {})) {
    if (item && item.imageKey) {
      images.set(captureId, await nullWhenAccessDenied(() => readConsoleImage(item.imageKey)));
    }
  }
  const heldPasses = await heldPassesOrNull();
  return { snapshot, consoleIndex, images, heldPasses };
}

/**
 * The body of GET /api/v1/operator/snapshot: the snapshot, plus `console` when an index exists.
 *
 * @returns {object|null} null when no snapshot is published
 */
export function snapshotAnswer({ snapshot, consoleIndex }) {
  if (!snapshot) return null;
  return consoleIndex ? { ...snapshot, console: consoleIndex } : snapshot;
}
