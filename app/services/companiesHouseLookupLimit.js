// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/companiesHouseLookupLimit.js
// Limits on the Companies House calls signed-in lookups drive on the shared API key, which allows
// 600 calls in five minutes for everyone: each account's share, and a budget for all signed-in
// lookups together. Each lookup route charges the most calls it can make; a lookup past either
// limit in a five-minute window gets a JSON 429 until the window ends.

import { createLogger } from "../lib/logger.js";
import { http429TooManyRequestsResponse } from "../lib/httpResponseHelper.js";
import { incrementRateCounter } from "../data/dynamoDbSecurityStateRepository.js";
import { hashSub } from "./subHasher.js";

const logger = createLogger({ source: "app/services/companiesHouseLookupLimit.js" });

// A quarter of the key's 600 calls in five minutes: enough for a full watch list and several
// company drill-downs, and short of what would starve every other account.
export const LOOKUP_CALLS_PER_ACCOUNT_PER_WINDOW = 150;

// All signed-in lookups together stop at three quarters of the key's 600 calls, so the key is not
// driven into Companies House's own limit and the public lookups and the filings keep the rest.
export const LOOKUP_CALLS_FOR_ALL_ACCOUNTS_PER_WINDOW = 450;
const ALL_ACCOUNTS = "all-signed-in-lookups";
const WINDOW_SECONDS = 300;

// The most Companies House calls each signed-in lookup makes on the shared key.
export const LOOKUP_CALLS = {
  search: 1,
  profile: 1,
  registeredOffice: 1,
  officers: 1,
  psc: 1,
  filingHistory: 5,
  filedAccounts: 15,
  filedDocument: 3,
  lastAccounts: 3,
};

// Adds a lookup's calls to one counter for this window and answers the calls counted so far, or null
// when the counter cannot be written: as the support ticket limit does, the lookup is then left to
// the WAF's per-address rule, rather than every account's lookups being refused.
async function charge(identifier, window, calls) {
  try {
    return await incrementRateCounter({ namespace: "chlookup", identifier, minute: window, hits: calls });
  } catch (error) {
    logger.warn({ message: "Companies House lookup counter failed", error: error.message });
    return null;
  }
}

/**
 * Charges the calls of one lookup to the account's share and then to the budget of all signed-in
 * lookups, and answers whether either is now spent. Each charge is one atomic update of a counter
 * with a five-minute time to live; a lookup refused for the account's share is not charged to the
 * budget of all. Where the security state table is not configured (the simulator and local
 * servers), or a counter cannot be written, that limit does not apply.
 * @param {string} userSub
 * @param {number} calls - the most Companies House calls the lookup makes
 * @returns {Promise<boolean>} true when the account has passed its share in this window
 */
export async function lookupLimitReached(userSub, calls) {
  if (!process.env.SECURITY_STATE_DYNAMODB_TABLE_NAME) return false;
  const window = Math.floor(Date.now() / 1000 / WINDOW_SECONDS);
  const accountUsed = await charge(hashSub(userSub), window, calls);
  if (accountUsed !== null && accountUsed > LOOKUP_CALLS_PER_ACCOUNT_PER_WINDOW) {
    logger.warn({ message: "Companies House lookups refused, the account has used its share of the API key", used: accountUsed });
    return true;
  }
  const allUsed = await charge(ALL_ACCOUNTS, window, calls);
  if (allUsed !== null && allUsed > LOOKUP_CALLS_FOR_ALL_ACCOUNTS_PER_WINDOW) {
    logger.warn({ message: "Companies House lookups refused, signed-in lookups have used their budget of the API key", used: allUsed });
    return true;
  }
  return false;
}

/** The JSON 429 a lookup answers once the account's share, or the budget of all signed-in lookups, is spent. */
export function lookupLimitResponse(request, headers) {
  return http429TooManyRequestsResponse({
    request,
    headers: { ...headers },
    message: "Too many Companies House lookups just now. Try again in a few minutes.",
    retryAfterSeconds: WINDOW_SECONDS,
  });
}
