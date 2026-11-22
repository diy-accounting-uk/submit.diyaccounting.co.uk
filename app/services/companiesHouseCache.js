// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/companiesHouseCache.js
//
// One cache for the Companies House answers the company reports read, so every report that reads
// an answer reads the same trimmed value, and a repeat view makes no call on the shared API key.
// Each kind of answer has its own trim and its own lifetime. Calls go one after another, never in
// parallel. A Companies House 429 sets the stop that every lookup on the shared key reads
// (companiesHouseLookupLimit.js); while it lasts the layer reads the cache only.

import { companiesHouseHttpGet } from "./companiesHouseApi.js";
import { companiesHouseStopSecondsLeft, stopCompaniesHouseLookups } from "./companiesHouseLookupLimit.js";
import { getCacheEntry, putCacheEntry, listCacheKeys, deleteCacheEntry } from "../data/dynamoDbCompaniesHouseCacheRepository.js";
import { emitMetric } from "../lib/emfMetrics.js";
import { createLogger } from "../lib/logger.js";

const logger = createLogger({ source: "app/services/companiesHouseCache.js" });

export const METRICS_NAMESPACE = "Submit/Business";
export const CALL_METRIC = "CompanyReportsCompaniesHouseCall";
export const RATE_LIMITED_METRIC = "CompanyReportsCompaniesHouse429";

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// A company that does not exist answers 404; a new company can appear, so the 404 is kept briefly.
export const NOT_FOUND_SECONDS = 10 * MINUTE;

// The most items one page of a Companies House list answers.
export const PAGE_SIZE = 100;
export const DEFAULT_MAX_PAGES = 10;

// The personal fields of a person on the register that the cache never holds.
const PERSONAL_FIELDS = ["date_of_birth", "nationality", "country_of_residence", "occupation", "address", "former_names"];

function withoutPersonalFields(person) {
  return Object.fromEntries(Object.entries(person || {}).filter(([name]) => !PERSONAL_FIELDS.includes(name)));
}

function pick(object, names) {
  return Object.fromEntries(names.filter((name) => object?.[name] !== undefined).map((name) => [name, object[name]]));
}

const LIST_FIELDS = ["total_count", "total_results", "items_per_page", "start_index", "active_count", "resigned_count", "ceased_count"];

// Each kind's lifetime and the trim of its answer before the cache write.
export const KINDS = {
  profile: {
    seconds: 10 * MINUTE,
    trim: (data) =>
      pick(data, [
        "company_name",
        "company_number",
        "company_status",
        "company_status_detail",
        "type",
        "subtype",
        "jurisdiction",
        "date_of_creation",
        "date_of_cessation",
        "registered_office_address",
        "accounts",
        "confirmation_statement",
        "sic_codes",
        "previous_company_names",
        "has_charges",
        "has_insolvency_history",
      ]),
  },
  filingHistory: {
    seconds: 10 * MINUTE,
    trim: (data) => ({
      ...pick(data, LIST_FIELDS),
      items: (data?.items || []).map((item) => ({
        ...pick(item, [
          "transaction_id",
          "category",
          "subcategory",
          "type",
          "date",
          "action_date",
          "description",
          "description_values",
          "paper_filed",
          "pages",
        ]),
        ...(item.links?.document_metadata ? { links: { document_metadata: item.links.document_metadata } } : {}),
      })),
    }),
  },
  officers: {
    seconds: HOUR,
    trim: (data) => ({
      ...pick(data, LIST_FIELDS),
      items: (data?.items || []).map((item) => pick(withoutPersonalFields(item), ["name", "officer_role", "appointed_on", "resigned_on"])),
    }),
  },
  psc: {
    seconds: HOUR,
    trim: (data) => ({
      ...pick(data, LIST_FIELDS),
      items: (data?.items || []).map((item) =>
        pick(withoutPersonalFields(item), ["name", "kind", "notified_on", "ceased_on", "ceased", "natures_of_control"]),
      ),
    }),
  },
  pscStatements: {
    seconds: HOUR,
    trim: (data) => ({
      ...pick(data, LIST_FIELDS),
      items: (data?.items || []).map((item) => pick(item, ["statement", "notified_on", "ceased_on"])),
    }),
  },
  charges: {
    seconds: HOUR,
    trim: (data) => ({
      ...pick(data, [...LIST_FIELDS, "unfiltered_count", "satisfied_count", "part_satisfied_count"]),
      items: (data?.items || []).map((item) => ({
        ...pick(item, [
          "charge_code",
          "charge_number",
          "status",
          "created_on",
          "delivered_on",
          "satisfied_on",
          "classification",
          "particulars",
        ]),
        persons_entitled: (item.persons_entitled || []).map((person) => pick(person, ["name"])),
      })),
    }),
  },
  insolvency: {
    seconds: HOUR,
    trim: (data) => ({
      cases: (data?.cases || []).map((insolvencyCase) => ({
        ...pick(insolvencyCase, ["type", "number", "dates"]),
        practitioners: (insolvencyCase.practitioners || []).map((practitioner) =>
          pick(practitioner, ["name", "role", "appointed_on", "ceased_to_act_on"]),
        ),
      })),
    }),
  },
  figures: {
    seconds: 400 * DAY,
    trim: (data) => pick(data, ["transactionId", "period", "type", "regime", "balanceSheet", "profitAndLoss", "filleted", "dormant"]),
  },
};

/**
 * The cache's key for an answer: the Companies House path with its query, in a fixed order.
 * @param {string} endpoint
 * @param {object} [queryParams]
 * @returns {string}
 */
export function cacheSk(endpoint, queryParams = {}) {
  const query = new URLSearchParams(
    Object.entries(queryParams)
      .filter(([, value]) => value !== undefined && value !== null && String(value) !== "")
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, value]) => [name, String(value)]),
  ).toString();
  return query ? `${endpoint}?${query}` : endpoint;
}

/** The cache's key for the figures of one filing. */
export const figuresSk = (transactionId) => `figures#${transactionId}`;

function kindOf(name) {
  const kind = KINDS[name];
  if (!kind) throw new Error(`Unknown Companies House cache kind: ${name}`);
  return kind;
}

async function readCache(companyNumber, sk) {
  try {
    return await getCacheEntry(companyNumber, sk);
  } catch (error) {
    logger.warn({ message: "Companies House cache could not be read", error: error.message });
    return null;
  }
}

async function writeCache(companyNumber, sk, value, readAt, seconds) {
  try {
    await putCacheEntry(companyNumber, sk, value, readAt, seconds);
  } catch (error) {
    logger.warn({ message: "Companies House cache could not be written", error: error.message });
  }
}

function fromEntry(entry) {
  return entry.value?.notFound
    ? { ok: false, status: 404, readAt: entry.readAt, fromCache: true }
    : { ok: true, data: entry.value, readAt: entry.readAt, fromCache: true };
}

/**
 * One Companies House answer through the cache. A hit makes no call. A miss calls Companies House
 * once, trims the answer by its kind and stores it for the kind's lifetime; a 404 is stored for ten
 * minutes and any other failure is not stored. During the stop a 429 sets, it reads the cache only.
 * @param {string} companyNumber
 * @param {string} endpoint - The Companies House path, for example /company/00000001/officers
 * @param {object} queryParams
 * @param {{kind: string}} options
 * @returns {Promise<{ok: true, data: object, readAt: string, fromCache: boolean}
 *   | {ok: false, status: number, readAt?: string, fromCache?: boolean, retryAfterSeconds?: number}>}
 */
export async function cachedCompaniesHouseGet(companyNumber, endpoint, queryParams, { kind }) {
  const { trim, seconds } = kindOf(kind);
  const sk = cacheSk(endpoint, queryParams);
  const cached = await readCache(companyNumber, sk);
  if (cached) return fromEntry(cached);

  const stoppedSeconds = await companiesHouseStopSecondsLeft();
  if (stoppedSeconds) return { ok: false, status: 429, retryAfterSeconds: stoppedSeconds };

  emitMetric({ namespace: METRICS_NAMESPACE, metricName: CALL_METRIC, dimensions: { Kind: kind } });
  const response = await companiesHouseHttpGet(endpoint, queryParams);
  const readAt = new Date().toISOString();
  if (response.ok) {
    const data = trim(response.data);
    await writeCache(companyNumber, sk, data, readAt, seconds);
    return { ok: true, data, readAt, fromCache: false };
  }
  if (response.status === 404) {
    await writeCache(companyNumber, sk, { notFound: true }, readAt, NOT_FOUND_SECONDS);
    return { ok: false, status: 404, readAt, fromCache: false };
  }
  if (response.status === 429) {
    emitMetric({ namespace: METRICS_NAMESPACE, metricName: RATE_LIMITED_METRIC });
    await stopCompaniesHouseLookups(response.headers?.["retry-after"]);
    return { ok: false, status: 429, retryAfterSeconds: (await companiesHouseStopSecondsLeft()) || undefined };
  }
  logger.warn({ message: "Companies House answer not cached", endpoint, status: response.status });
  return { ok: false, status: response.status };
}

/**
 * Every page of a Companies House list through the cache, one page after another, up to maxPages
 * pages of 100 items. An answer that fails part way carries the items read before it.
 * @param {string} companyNumber
 * @param {string} endpoint
 * @param {object} queryParams
 * @param {{kind: string, maxPages?: number}} options
 * @returns {Promise<{ok: boolean, data?: {items: object[], totalCount: number|undefined, truncated: boolean},
 *   readAt?: string, fromCache?: boolean, status?: number, retryAfterSeconds?: number, partialItems?: object[]}>}
 */
export async function cachedCompaniesHouseGetAllPages(companyNumber, endpoint, queryParams, { kind, maxPages = DEFAULT_MAX_PAGES }) {
  const items = [];
  let totalCount;
  let oldestReadAt;
  let fromCache = true;
  for (let page = 0; page < maxPages; page += 1) {
    const answer = await cachedCompaniesHouseGet(
      companyNumber,
      endpoint,
      { ...queryParams, items_per_page: PAGE_SIZE, start_index: page * PAGE_SIZE },
      { kind },
    );
    if (!answer.ok) return { ...answer, partialItems: items };
    const pageItems = answer.data.items || [];
    items.push(...pageItems);
    totalCount = answer.data.total_count ?? answer.data.total_results ?? totalCount;
    if (!oldestReadAt || answer.readAt < oldestReadAt) oldestReadAt = answer.readAt;
    fromCache = fromCache && answer.fromCache;
    const done = pageItems.length < PAGE_SIZE || (totalCount !== undefined && items.length >= totalCount);
    if (done) return { ok: true, data: { items, totalCount, truncated: false }, readAt: oldestReadAt, fromCache };
  }
  return { ok: true, data: { items, totalCount, truncated: true }, readAt: oldestReadAt, fromCache };
}

/**
 * Deletes a company's cached answers, keeping the figures of its filings, which do not change.
 * @param {string} companyNumber
 * @returns {Promise<number>} The entries deleted
 */
export async function invalidateCompany(companyNumber) {
  const keys = (await listCacheKeys(companyNumber)).filter((sk) => !sk.startsWith("figures"));
  for (const sk of keys) {
    await deleteCacheEntry(companyNumber, sk);
  }
  return keys.length;
}
