// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/diyaGl/diyaGlLapseSweep.js
//
// Daily scheduled Lambda (DiyaGlStack's EventBridge rule) that deletes the resident books of a
// lapsed diya-gl subscriber once the grace period has passed. A sandbox book is left to the
// bucket's own lifecycle rule.

import { createLogger } from "../../lib/logger.js";
import { listLapsedBundleOwners } from "../../data/dynamoDbBundleRepository.js";
import { listBooks, deleteBook } from "../../data/s3DiyaGlRepository.js";

const logger = createLogger({ source: "app/functions/diyaGl/diyaGlLapseSweep.js" });

const DEFAULT_BUNDLE_ID = "resident";
const DEFAULT_LAPSE_GRACE_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export async function handler(event = {}) {
  const bucket = process.env.DIYA_GL_BUCKET_NAME;
  const bundleTableName = process.env.BUNDLE_DYNAMODB_TABLE_NAME;
  if (!bucket) throw new Error("DIYA_GL_BUCKET_NAME environment variable is required");
  if (!bundleTableName) throw new Error("BUNDLE_DYNAMODB_TABLE_NAME environment variable is required");

  const bundleId = process.env.DIYA_GL_BUNDLE_ID || DEFAULT_BUNDLE_ID;
  const graceDays = Number(process.env.DIYA_GL_LAPSE_GRACE_DAYS) || DEFAULT_LAPSE_GRACE_DAYS;
  const now = event.now ? new Date(event.now) : new Date();
  const beforeIso = new Date(now.getTime() - graceDays * MS_PER_DAY).toISOString();

  const ownerPrefixes = await listLapsedBundleOwners(bundleId, beforeIso);

  let deletedBookCount = 0;
  for (const ownerPrefix of ownerPrefixes) {
    const books = await listBooks(ownerPrefix);
    const residentBooks = books.filter((book) => book.retention === "resident");
    for (const book of residentBooks) {
      await deleteBook(ownerPrefix, book.bookId);
      deletedBookCount += 1;
    }
  }

  logger.info({
    message: "Lapse sweep complete",
    bundleId,
    beforeIso,
    ownerCount: ownerPrefixes.length,
    deletedBookCount,
  });

  return { ownerCount: ownerPrefixes.length, deletedBookCount };
}
