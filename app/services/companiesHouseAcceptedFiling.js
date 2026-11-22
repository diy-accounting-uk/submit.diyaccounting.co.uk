// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/companiesHouseAcceptedFiling.js
// The marker an accepted filing leaves in the Companies House cache, under the company's partition.
// Companies House's public register can show a filing some time after the XML gateway accepts it, so
// a register answer read in that gap can still be the old register. While the marker stands, the
// cache layer (companiesHouseCache.js) keeps a register answer for that company for at most
// AFTER_ACCEPTED_FILING_SECONDS, and treats an answer read before the acceptance as absent.
//
// The marker lives as long as the longest-lived register answer, so it outlasts every answer that
// could have been read before the acceptance.

import { getCacheEntry, putCacheEntry } from "../data/dynamoDbCompaniesHouseCacheRepository.js";
import { createLogger } from "../lib/logger.js";

const logger = createLogger({ source: "app/services/companiesHouseAcceptedFiling.js" });

export const ACCEPTED_FILING_SK = "accepted-filing";

// How long the marker stands: the longest lifetime of a register kind in companiesHouseCache.js KINDS.
export const ACCEPTED_FILING_MARKER_SECONDS = 60 * 60;

// The most a register answer for a company with a standing marker is kept.
export const AFTER_ACCEPTED_FILING_SECONDS = 2 * 60;

/**
 * Writes the marker of a filing Companies House has accepted. A write that fails is logged and
 * answers false; the filing is accepted already, so nothing waits on it.
 * @param {string} companyNumber
 * @param {string} [acceptedAt] - ISO time of the acceptance
 * @returns {Promise<boolean>}
 */
export async function markAcceptedFiling(companyNumber, acceptedAt = new Date().toISOString()) {
  try {
    await putCacheEntry(companyNumber, ACCEPTED_FILING_SK, { acceptedAt }, acceptedAt, ACCEPTED_FILING_MARKER_SECONDS);
    return true;
  } catch (error) {
    logger.warn({
      message: "Could not mark a company's accepted Companies House filing in the cache",
      companyNumber,
      error: error.message,
    });
    return false;
  }
}

/**
 * The time of the company's last accepted filing while its marker stands, else null. A read that
 * fails answers null, as a cache read that fails answers a miss.
 * @param {string} companyNumber
 * @returns {Promise<string|null>}
 */
export async function acceptedFilingAt(companyNumber) {
  try {
    const entry = await getCacheEntry(companyNumber, ACCEPTED_FILING_SK);
    return entry?.value?.acceptedAt ?? null;
  } catch (error) {
    logger.warn({ message: "Could not read a company's accepted filing marker", companyNumber, error: error.message });
    return null;
  }
}
