// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/analytics/companyBookPull.js
//
// Nightly job that reads DIY Accounting Limited's own resident diya-gl book straight off S3
// (COMPANY_BOOK_ID under COMPANY_BOOK_OWNER_PREFIX), derives the seven FRS 105 balance-sheet
// lines the accounts filing takes and the published profit and loss account's turnover, costs
// and profit, and writes one observation to the lake so the operator dashboard can show the
// company's own P&L and balance sheet. The job's IAM role can only s3:GetObject under that one
// book's prefix; it carries no user identity, no salt and never calls the HTTP diya-gl route.
//
// A missing book, a non-resident book, or a book that fails to parse throws rather than writing a
// partial or stale observation: the Telegram alarm on this job's errors is the right outcome, not
// a silent gap on the dashboard.

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { PRODUCTS } from "@diy-accounting-uk/diya-gl/dist/app/lib/products.js";
import { readBookSource } from "@diy-accounting-uk/diya-gl/dist/app/lib/diya-gl-interchange.js";
import { readMetadata, getVersion } from "../../data/s3DiyaGlRepository.js";
import { deriveMicroEntityAccounts } from "../../services/microEntityAccounts.js";
import { createLogger } from "../../lib/logger.js";

const logger = createLogger({ source: "app/functions/analytics/companyBookPull.js" });

let cachedS3Client = null;

function getS3Client() {
  if (!cachedS3Client) {
    cachedS3Client = new S3Client({ region: process.env.AWS_REGION || "eu-west-2" });
  }
  return cachedS3Client;
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} environment variable is required`);
  return value;
}

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

function objectKey(dateStr) {
  return `curated/finance/dt=${dateStr}/company-accounts.json`;
}

/**
 * Read the configured book, derive its FRS 105 balance-sheet lines, and write one observation
 * line to the lake.
 *
 * @param {{date?: string}} [event] - an explicit `date` ("YYYY-MM-DD") overrides today's UTC
 *   date, which is what a backfill invoke passes.
 * @returns {Promise<{date: string, key: string, latestVersion: number, latestETag: string}>}
 */
export async function handler(event = {}) {
  const targetDate = event.date ?? todayUtc();

  const bookId = requireEnv("COMPANY_BOOK_ID");
  const ownerPrefix = requireEnv("COMPANY_BOOK_OWNER_PREFIX");
  const bucket = requireEnv("ANALYTICS_LAKE_BUCKET_NAME");

  const metadataResult = await readMetadata(ownerPrefix, bookId);
  if (!metadataResult) {
    throw new Error(`No book ${bookId} found under the configured owner prefix`);
  }
  const { metadata } = metadataResult;
  if (metadata.retention !== "resident") {
    throw new Error(`Book ${bookId} has retention "${metadata.retention}", not "resident"`);
  }

  const versionResult = await getVersion(ownerPrefix, bookId, metadata.latestVersion);
  const { book, lines } = await readBookSource(versionResult.bytes, `${bookId}-v${metadata.latestVersion}.zip`, {
    products: PRODUCTS,
  });

  const accounts = await deriveMicroEntityAccounts({ book, lines });

  const observation = {
    date: targetDate,
    bookId,
    latestVersion: metadata.latestVersion,
    latestETag: versionResult.etag,
    accounts,
  };

  const key = objectKey(targetDate);
  const s3Client = getS3Client();
  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: JSON.stringify(observation) + "\n",
      ContentType: "application/json",
    }),
  );

  logger.info({ message: "Company book pull complete", date: targetDate, key, latestVersion: metadata.latestVersion });

  return { date: targetDate, key, latestVersion: metadata.latestVersion, latestETag: versionResult.etag };
}
