// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/companiesHouseCacheDrop.js
// Drops a company's cached register answers (app/services/companiesHouseCache.js writes them), so
// the next view reads Companies House again. A filing that Companies House accepts changes the
// register: the profile's dates, the filing history, the officers, the PSCs. The figures of a filed
// set are kept, because a filed document does not change and a new filing has a new id.
//
// It also writes the accepted filing's marker (companiesHouseAcceptedFiling.js), which keeps answers
// read while the public register has not caught up from lasting. A Lambda that records an accepted
// filing needs the table's name and, on it, dynamodb:Query (listCacheKeys), dynamodb:DeleteItem
// (deleteCacheEntry) and dynamodb:PutItem (the marker), and nothing else of the cache.

import { listCacheKeys, deleteCacheEntry } from "../data/dynamoDbCompaniesHouseCacheRepository.js";
import { ACCEPTED_FILING_SK, markAcceptedFiling } from "./companiesHouseAcceptedFiling.js";
import { createLogger } from "../lib/logger.js";

const logger = createLogger({ source: "app/services/companiesHouseCacheDrop.js" });

const kept = (sk) => sk.startsWith("figures") || sk === ACCEPTED_FILING_SK;

/**
 * Deletes a company's cached answers, keeping the figures of its filings and its accepted filing marker.
 * @param {string} companyNumber
 * @returns {Promise<number>} The entries deleted
 */
export async function invalidateCompany(companyNumber) {
  const keys = (await listCacheKeys(companyNumber)).filter((sk) => !kept(sk));
  for (const sk of keys) {
    await deleteCacheEntry(companyNumber, sk);
  }
  return keys.length;
}

/**
 * Marks the company's accepted filing and drops the cached answers of the company. The filing is
 * already accepted when this runs, so a mark or a drop that fails is logged and the caller carries
 * on: the entries then last to the end of their own lifetime, an hour at most.
 * @param {string|undefined} companyNumber - as Companies House's status names it
 * @returns {Promise<number|null>} The entries deleted, or null when nothing could be dropped
 */
export async function dropCompanyCacheAfterAcceptedFiling(companyNumber) {
  if (!companyNumber) {
    logger.warn({ message: "An accepted Companies House filing names no company, so no cached answers are dropped" });
    return null;
  }
  await markAcceptedFiling(companyNumber);
  try {
    const dropped = await invalidateCompany(companyNumber);
    logger.info({ message: "Dropped a company's cached Companies House answers after an accepted filing", companyNumber, dropped });
    return dropped;
  } catch (error) {
    logger.warn({ message: "Could not drop a company's cached Companies House answers", companyNumber, error: error.message });
    return null;
  }
}
