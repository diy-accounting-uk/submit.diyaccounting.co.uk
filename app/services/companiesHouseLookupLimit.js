// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/companiesHouseLookupLimit.js
// A limit on the Companies House calls one signed-in account drives on the shared API key, which
// allows 600 calls in five minutes for everyone. Each lookup route charges the most calls it can
// make; an account past its share in a five-minute window gets a JSON 429 until the window ends.

import { createLogger } from "../lib/logger.js";
import { http429TooManyRequestsResponse } from "../lib/httpResponseHelper.js";
import { incrementRateCounter } from "../data/dynamoDbSecurityStateRepository.js";
import { hashSub } from "./subHasher.js";

const logger = createLogger({ source: "app/services/companiesHouseLookupLimit.js" });

// A quarter of the key's 600 calls in five minutes: enough for a full watch list and several
// company drill-downs, and short of what would starve every other account.
export const LOOKUP_CALLS_PER_ACCOUNT_PER_WINDOW = 150;
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

/**
 * Charges an account the calls of one lookup and answers whether it is now past its share. The
 * charge is one atomic update of a counter with a five-minute time to live. Where the security state
 * table is not configured (the simulator and local servers), or the counter cannot be written, no
 * limit applies.
 * @param {string} userSub
 * @param {number} calls - the most Companies House calls the lookup makes
 * @returns {Promise<boolean>} true when the account has passed its share in this window
 */
export async function lookupLimitReached(userSub, calls) {
  if (!process.env.SECURITY_STATE_DYNAMODB_TABLE_NAME) return false;
  const window = Math.floor(Date.now() / 1000 / WINDOW_SECONDS);
  let used;
  try {
    used = await incrementRateCounter({ namespace: "chlookup", identifier: hashSub(userSub), minute: window, hits: calls });
  } catch (error) {
    // As the support ticket limit does: a counter that cannot be written leaves the lookup to the
    // WAF's per-address rule, rather than refusing every account's lookups.
    logger.warn({ message: "Companies House lookup counter failed", error: error.message });
    return false;
  }
  if (used > LOOKUP_CALLS_PER_ACCOUNT_PER_WINDOW) {
    logger.warn({ message: "Companies House lookups refused, the account has used its share of the API key", used });
    return true;
  }
  return false;
}

/** The JSON 429 a lookup answers once the account has used its share of the shared key. */
export function lookupLimitResponse(request, headers) {
  return http429TooManyRequestsResponse({
    request,
    headers: { ...headers },
    message: "Too many Companies House lookups from this account. Try again in a few minutes.",
    retryAfterSeconds: WINDOW_SECONDS,
  });
}
