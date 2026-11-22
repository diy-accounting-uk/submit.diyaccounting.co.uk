// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/companiesHouseCacheDrop.js
// Drops a company's cached register answers (app/services/companiesHouseCache.js writes them), so
// the next view reads Companies House again. A filing that Companies House accepts changes the
// register: the profile's dates, the filing history, the officers, the PSCs. The figures of a filed
// set are kept, because a filed document does not change and a new filing has a new id.
//
// This file reads the cache table only, so a Lambda that records an accepted filing needs the
// table's name and dynamodb:Query and dynamodb:DeleteItem on it, and nothing else of the cache.

import { listCacheKeys, deleteCacheEntry } from "../data/dynamoDbCompaniesHouseCacheRepository.js";
import { createLogger } from "../lib/logger.js";

const logger = createLogger({ source: "app/services/companiesHouseCacheDrop.js" });

const isFigures = (sk) => sk.startsWith("figures");

/**
 * Deletes a company's cached answers, keeping the figures of its filings.
 * @param {string} companyNumber
 * @returns {Promise<number>} The entries deleted
 */
export async function invalidateCompany(companyNumber) {
  const keys = (await listCacheKeys(companyNumber)).filter((sk) => !isFigures(sk));
  for (const sk of keys) {
    await deleteCacheEntry(companyNumber, sk);
  }
  return keys.length;
}

/**
 * Drops the cached answers of the company an accepted filing was made for. The filing is already
 * accepted when this runs, so a drop that fails is logged and the caller carries on: the entries
 * then last to the end of their own lifetime, an hour at most.
 * @param {string|undefined} companyNumber - as Companies House's status names it
 * @returns {Promise<number|null>} The entries deleted, or null when nothing could be dropped
 */
export async function dropCompanyCacheAfterAcceptedFiling(companyNumber) {
  if (!companyNumber) {
    logger.warn({ message: "An accepted Companies House filing names no company, so no cached answers are dropped" });
    return null;
  }
  try {
    const dropped = await invalidateCompany(companyNumber);
    logger.info({ message: "Dropped a company's cached Companies House answers after an accepted filing", companyNumber, dropped });
    return dropped;
  } catch (error) {
    logger.warn({ message: "Could not drop a company's cached Companies House answers", companyNumber, error: error.message });
    return null;
  }
}
