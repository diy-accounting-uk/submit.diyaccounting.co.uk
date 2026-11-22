// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/companiesHouseCache.js
//
// One cache for the Companies House answers the company reports read, so every report that reads
// an answer reads the same trimmed value, and a repeat view makes no call on the shared API key.
// Each kind of answer has its own trim and its own lifetime. Calls go one after another, never in
// parallel. A Companies House 429 sets the stop that every lookup on the shared key reads
// (companiesHouseLookupLimit.js); while it lasts the layer reads the cache only.

import { AsyncLocalStorage } from "node:async_hooks";
import { companiesHouseHttpGet } from "./companiesHouseApi.js";
import { companiesHouseStopSecondsLeft, stopCompaniesHouseLookups } from "./companiesHouseLookupLimit.js";
import { getCacheEntry, putCacheEntry } from "../data/dynamoDbCompaniesHouseCacheRepository.js";
import { emitMetric } from "../lib/emfMetrics.js";
import { createLogger } from "../lib/logger.js";

const logger = createLogger({ source: "app/services/companiesHouseCache.js" });

export const METRICS_NAMESPACE = "Submit/Business";
export const CALL_METRIC = "CompanyReportsCompaniesHouseCall";
export const RATE_LIMITED_METRIC = "CompanyReportsCompaniesHouse429";
export const TOO_LARGE_METRIC = "CompanyReportsCacheValueTooLarge";

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// A company that does not exist answers 404; a new company can appear, so the 404 is kept briefly.
export const NOT_FOUND_SECONDS = 10 * MINUTE;

// The most items one page of a Companies House list answers.
export const PAGE_SIZE = 100;
export const DEFAULT_MAX_PAGES = 10;

// DynamoDB stores at most 400 KB in an item. A value whose JSON is longer than this is stored in
// parts of this many bytes, and one that needs more than MAX_PARTS parts is not stored.
export const ITEM_VALUE_BYTES = 300 * 1024;
export const MAX_PARTS = 6;

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

const partSk = (sk, index) => `${sk}#part#${index}`;

// A stored value in parts: the entry under the key names how many, and each part holds a slice of
// the value's JSON. A part that is missing or past its ttl makes the whole entry a miss.
async function valueFromParts(companyNumber, sk, parts) {
  const slices = [];
  for (let index = 0; index < parts; index += 1) {
    const part = await getCacheEntry(companyNumber, partSk(sk, index));
    if (!part) return null;
    slices.push(Buffer.from(part.value.slice));
  }
  return JSON.parse(Buffer.concat(slices).toString("utf8"));
}

async function readCache(companyNumber, sk) {
  try {
    const entry = await getCacheEntry(companyNumber, sk);
    if (!entry?.value?.parts) return entry;
    const value = await valueFromParts(companyNumber, sk, entry.value.parts);
    return value === null ? null : { value, readAt: entry.readAt };
  } catch (error) {
    logger.warn({ message: "Companies House cache could not be read", error: error.message });
    return null;
  }
}

// Stores a value. One that fits an item is stored as it is. A larger one is stored as slices of its
// JSON, the parts before the entry that names them. One too large for MAX_PARTS parts is not stored:
// a marker takes its place for the same lifetime, so later views answer from the marker and make no
// call for it.
async function writeCache(companyNumber, sk, value, readAt, seconds, kind) {
  try {
    const json = Buffer.from(JSON.stringify(value), "utf8");
    if (json.length <= ITEM_VALUE_BYTES) {
      await putCacheEntry(companyNumber, sk, value, readAt, seconds);
      return;
    }
    const parts = Math.ceil(json.length / ITEM_VALUE_BYTES);
    if (parts > MAX_PARTS) {
      emitMetric({ namespace: METRICS_NAMESPACE, metricName: TOO_LARGE_METRIC, dimensions: { Kind: kind } });
      logger.warn({ message: "Companies House answer too large for the cache", companyNumber, kind, bytes: json.length });
      await putCacheEntry(companyNumber, sk, { tooLarge: true }, readAt, seconds);
      return;
    }
    for (let index = 0; index < parts; index += 1) {
      const slice = json.subarray(index * ITEM_VALUE_BYTES, (index + 1) * ITEM_VALUE_BYTES);
      await putCacheEntry(companyNumber, partSk(sk, index), { slice }, readAt, seconds);
    }
    await putCacheEntry(companyNumber, sk, { parts }, readAt, seconds);
  } catch (error) {
    logger.warn({ message: "Companies House cache could not be written", error: error.message });
  }
}

function fromEntry(entry) {
  if (entry.value?.notFound) return { ok: false, status: 404, readAt: entry.readAt, fromCache: true };
  if (entry.value?.tooLarge) return { ok: false, status: 413, tooLarge: true, readAt: entry.readAt, fromCache: true };
  return { ok: true, data: entry.value, readAt: entry.readAt, fromCache: true };
}

// The Companies House calls left to the report view that is running, when one is.
const viewCalls = new AsyncLocalStorage();

/**
 * Runs one report view with a limit on the Companies House calls the layer makes for it, however
 * many lists the report reads. A read from the cache counts nothing. Past the limit the layer makes
 * no call and answers status 429 with callLimitReached; a list cut short carries the items it read.
 * @param {number} limit - The most calls the view may make
 * @param {() => Promise<T>} view
 * @returns {Promise<T>}
 * @template T
 */
export function withCompaniesHouseCallLimit(limit, view) {
  return viewCalls.run({ left: limit }, view);
}

/**
 * One Companies House answer through the cache. A hit makes no call. A miss calls Companies House
 * once, trims the answer by its kind and stores it for the kind's lifetime; a 404 is stored for ten
 * minutes and any other failure is not stored. During the stop a 429 sets, it reads the cache only.
 * An answer too large to store is answered once and then, for its kind's lifetime, as status 413
 * with tooLarge, with no further call.
 * @param {string} companyNumber
 * @param {string} endpoint - The Companies House path, for example /company/00000001/officers
 * @param {object} queryParams
 * @param {{kind: string}} options
 * @returns {Promise<{ok: true, data: object, readAt: string, fromCache: boolean}
 *   | {ok: false, status: number, readAt?: string, fromCache?: boolean, retryAfterSeconds?: number, tooLarge?: boolean,
 *   callLimitReached?: boolean}>}
 */
export async function cachedCompaniesHouseGet(companyNumber, endpoint, queryParams, { kind }) {
  const { trim, seconds } = kindOf(kind);
  const sk = cacheSk(endpoint, queryParams);
  const cached = await readCache(companyNumber, sk);
  if (cached) return fromEntry(cached);

  const stoppedSeconds = await companiesHouseStopSecondsLeft();
  if (stoppedSeconds) return { ok: false, status: 429, retryAfterSeconds: stoppedSeconds };

  const view = viewCalls.getStore();
  if (view && view.left <= 0) return { ok: false, status: 429, callLimitReached: true };
  if (view) view.left -= 1;

  emitMetric({ namespace: METRICS_NAMESPACE, metricName: CALL_METRIC, dimensions: { Kind: kind } });
  const response = await companiesHouseHttpGet(endpoint, queryParams);
  const readAt = new Date().toISOString();
  if (response.ok) {
    const data = trim(response.data);
    await writeCache(companyNumber, sk, data, readAt, seconds, kind);
    return { ok: true, data, readAt, fromCache: false };
  }
  if (response.status === 404) {
    await writeCache(companyNumber, sk, { notFound: true }, readAt, NOT_FOUND_SECONDS, kind);
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
 * pages. It asks for 100 items a page and starts each page after the items it holds, so a list that
 * answers fewer a page is still read to its total. An answer that fails part way carries the items
 * read before it.
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
      { ...queryParams, items_per_page: PAGE_SIZE, start_index: items.length },
      { kind },
    );
    if (!answer.ok) return { ...answer, partialItems: items };
    const pageItems = answer.data.items || [];
    items.push(...pageItems);
    totalCount = answer.data.total_count ?? answer.data.total_results ?? totalCount;
    if (!oldestReadAt || answer.readAt < oldestReadAt) oldestReadAt = answer.readAt;
    fromCache = fromCache && answer.fromCache;
    const done = pageItems.length === 0 || (totalCount === undefined ? pageItems.length < PAGE_SIZE : items.length >= totalCount);
    if (done)
      return { ok: true, data: { items, totalCount, truncated: items.length < (totalCount ?? 0) }, readAt: oldestReadAt, fromCache };
  }
  return { ok: true, data: { items, totalCount, truncated: true }, readAt: oldestReadAt, fromCache };
}

export { invalidateCompany } from "./companiesHouseCacheDrop.js";
