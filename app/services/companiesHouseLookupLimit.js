// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/companiesHouseLookupLimit.js
// Limits on the Companies House calls signed-in lookups drive on the shared API key, which allows
// 600 calls in five minutes for everyone: each account's share, and a budget for all signed-in
// lookups together. Each lookup route charges the most calls it can make; a lookup past either
// limit in a five-minute window gets a JSON 429 until the window ends. After Companies House itself
// answers 429, every lookup, signed in or public, stops for the time its Retry-After names.

import { createLogger } from "../lib/logger.js";
import { http429TooManyRequestsResponse } from "../lib/httpResponseHelper.js";
import { getCachedValue, incrementRateCounter, putCachedValue } from "../data/dynamoDbSecurityStateRepository.js";
import { hashSub } from "./subHasher.js";
import { httpResponseFromCompaniesHouseResponse } from "./companiesHouseApi.js";

const logger = createLogger({ source: "app/services/companiesHouseLookupLimit.js" });

// A quarter of the key's 600 calls in five minutes: enough for a full watch list and several
// company drill-downs, and short of what would starve every other account.
export const LOOKUP_CALLS_PER_ACCOUNT_PER_WINDOW = 150;

// All signed-in lookups together stop at three quarters of the key's 600 calls, so the key is not
// driven into Companies House's own limit and the public lookups and the filings keep the rest.
export const LOOKUP_CALLS_FOR_ALL_ACCOUNTS_PER_WINDOW = 450;
const ALL_ACCOUNTS = "all-signed-in-lookups";
// The event a refusal by the budget of all logs, which a metric filter counts for the alarm.
export const LOOKUP_BUDGET_REFUSED_EVENT = "CompaniesHouseLookupBudgetRefused";
const WINDOW_SECONDS = 300;

// All public lookups together, which need no sign-in, stop at a sixth of the key's 600 calls. The
// WAF limits each address; this limits every address together, so callers spread over many
// addresses cannot spend the calls the signed-in lookups and the filings need.
export const PUBLIC_LOOKUP_CALLS_PER_WINDOW = 100;
const ALL_PUBLIC = "all-public-lookups";

// The most Companies House calls each public lookup makes on the shared key.
export const PUBLIC_LOOKUP_CALLS = {
  deadlines: 1,
  register: 5,
};

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

// The one stop every lookup reads and sets after Companies House answers 429 on the shared key.
const STOP_KEY = "chlookup#stopped";
// Companies House counts its limit in five-minute windows; a 429 with no Retry-After stops for one.
const STOP_SECONDS_WITHOUT_RETRY_AFTER = WINDOW_SECONDS;

function secondsLeftInWindow() {
  return Math.max(1, Math.ceil(WINDOW_SECONDS - ((Date.now() / 1000) % WINDOW_SECONDS)));
}

/**
 * The seconds left in the stop that a Companies House 429 set, or 0 when there is none. Where the
 * security state table is not configured, or the stop cannot be read, no stop applies.
 * @returns {Promise<number>}
 */
export async function companiesHouseStopSecondsLeft() {
  if (!process.env.SECURITY_STATE_DYNAMODB_TABLE_NAME) return 0;
  try {
    const stop = await getCachedValue(STOP_KEY);
    const secondsLeft = Math.ceil(((stop?.until ?? 0) - Date.now()) / 1000);
    return secondsLeft > 0 ? secondsLeft : 0;
  } catch (error) {
    logger.warn({ message: "Companies House stop could not be read", error: error.message });
    return 0;
  }
}

/**
 * Stops every lookup on the shared key for the seconds Companies House's Retry-After names, or
 * five minutes when it names none. Where the security state table is not configured, or the stop
 * cannot be written, nothing is stored.
 * @param {string|number|undefined} retryAfter - the 429's Retry-After header
 */
export async function stopCompaniesHouseLookups(retryAfter) {
  if (!process.env.SECURITY_STATE_DYNAMODB_TABLE_NAME) return;
  const named = Number.parseInt(retryAfter, 10);
  const seconds = Number.isFinite(named) && named > 0 ? named : STOP_SECONDS_WITHOUT_RETRY_AFTER;
  try {
    await putCachedValue(STOP_KEY, { until: Date.now() + seconds * 1000 }, seconds);
    logger.warn({ message: "Companies House answered 429; lookups on the shared key stop", seconds });
  } catch (error) {
    logger.warn({ message: "Companies House stop could not be written", error: error.message });
  }
}

/**
 * Whether a signed-in lookup is refused, as the seconds the caller should wait, or 0 when it may go
 * ahead. During a Companies House stop it is refused for the seconds left, and charged nothing.
 * Otherwise it charges the lookup's calls to the account's share and then to the budget of all
 * signed-in lookups; past either it is refused until the five-minute window ends. Each charge is one
 * atomic update of a counter with a five-minute time to live; a lookup refused for the account's
 * share is not charged to the budget of all. Where the security state table is not configured (the
 * simulator and local servers), or a counter cannot be written, that limit does not apply.
 * @param {string} userSub
 * @param {number} calls - the most Companies House calls the lookup makes
 * @returns {Promise<number>} the seconds to wait, or 0
 */
export async function lookupRefusalSeconds(userSub, calls) {
  if (!process.env.SECURITY_STATE_DYNAMODB_TABLE_NAME) return 0;
  const stopped = await companiesHouseStopSecondsLeft();
  if (stopped) return stopped;
  const window = Math.floor(Date.now() / 1000 / WINDOW_SECONDS);
  const accountUsed = await charge(hashSub(userSub), window, calls);
  if (accountUsed !== null && accountUsed > LOOKUP_CALLS_PER_ACCOUNT_PER_WINDOW) {
    logger.warn({ message: "Companies House lookups refused, the account has used its share of the API key", used: accountUsed });
    return secondsLeftInWindow();
  }
  const allUsed = await charge(ALL_ACCOUNTS, window, calls);
  if (allUsed !== null && allUsed > LOOKUP_CALLS_FOR_ALL_ACCOUNTS_PER_WINDOW) {
    logger.warn({
      message: "Companies House lookups refused, signed-in lookups have used their budget of the API key",
      event: LOOKUP_BUDGET_REFUSED_EVENT,
      window,
      used: allUsed,
    });
    return secondsLeftInWindow();
  }
  return 0;
}

/**
 * Why and for how long a public lookup is refused, or null when it may go ahead. During a Companies
 * House stop it is refused for the seconds left, with reason stopped, and charged nothing. Otherwise
 * it charges the lookup's calls to the budget of all public lookups; past it, it is refused until the
 * five-minute window ends, with reason budget_spent. Where the security state table is not
 * configured (the simulator and local servers), or the counter cannot be written, the budget does
 * not apply.
 * @param {number} calls - the most Companies House calls the lookup makes
 * @returns {Promise<{seconds: number, reason: "stopped"|"budget_spent"}|null>}
 */
export async function publicLookupRefusal(calls) {
  if (!process.env.SECURITY_STATE_DYNAMODB_TABLE_NAME) return null;
  const stopped = await companiesHouseStopSecondsLeft();
  if (stopped) return { seconds: stopped, reason: "stopped" };
  const window = Math.floor(Date.now() / 1000 / WINDOW_SECONDS);
  const used = await charge(ALL_PUBLIC, window, calls);
  if (used !== null && used > PUBLIC_LOOKUP_CALLS_PER_WINDOW) {
    logger.warn({ message: "Public Companies House lookups refused, they have used their budget of the API key", window, used });
    return { seconds: secondsLeftInWindow(), reason: "budget_spent" };
  }
  return null;
}

/**
 * The JSON 429 a refused lookup answers, with Retry-After the seconds lookupRefusalSeconds or
 * publicLookupRefusal answered.
 * @param {object} request
 * @param {object} headers
 * @param {number} retryAfterSeconds
 */
export function lookupLimitResponse(request, headers, retryAfterSeconds) {
  return http429TooManyRequestsResponse({
    request,
    headers: { ...headers },
    message: "Too many Companies House lookups just now. Try again in a few minutes.",
    retryAfterSeconds,
  });
}

/**
 * The JSON answer a lookup gives for a failed Companies House response. A 429 first stops every
 * lookup on the shared key for the time its Retry-After names.
 * @param {object} request
 * @param {{status: number, headers?: object}} chResponse
 * @param {object} headers
 */
export async function lookupFailureResponse(request, chResponse, headers) {
  if (chResponse.status === 429) await stopCompaniesHouseLookups(chResponse.headers?.["retry-after"]);
  return httpResponseFromCompaniesHouseResponse(request, chResponse, headers);
}
