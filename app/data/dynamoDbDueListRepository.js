// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/data/dynamoDbDueListRepository.js
//
// The due list: an account's businesses and the filing and payment rows due for them. The
// partition key is the account's hashed sub and sk names the item:
//   business#<id>                                  a business on the list
//   row#<businessId>#<type>#<periodEnd or date>    a row due for that business
//   feed                                           the account's calendar feed token, by its hash
//   count                                          how many businesses and rows the account holds
//   seen#<companyNumber>                           the last filing seen for a watched company
// A calendar feed's lookup sits in its own partition, feed#<sha256 of the token>, so the feed URL
// finds the account without its sub. The index job-jobOn-index finds the items a daily job is due
// to act on (job = refresh or remind, jobOn a date); an item with a job holds the raw sub, which
// the jobs need to find the account's address.
//
// The limits of businesses and rows hold under writes that arrive at once because a write that adds
// items first reserves them on the count item with a conditional update, which DynamoDB applies one
// at a time, and the batch write follows; items the batch leaves unwritten are given back after it.
// The count item sits under the current hash. Rows also leave by their ttl and a salt rotation
// deletes the count item, so a refused or missing count is counted again from the account's items
// before a write is refused.

import { createLogger } from "../lib/logger.js";
import { hashSub, subHashCandidates } from "../services/subHasher.js";
import { executeDynamoDbCommand, getResourceName } from "../lib/dynamoDbClient.js";
import { dueListRowRetention } from "../lib/recordRetention.js";
import { DUE_LIST_BUSINESS_CAP, DUE_LIST_ROW_CAP } from "../services/dueList.js";
import { COUNT_SETTLE_MS, COUNT_SK } from "../lib/dueListCount.js";

const logger = createLogger({ source: "app/data/dynamoDbDueListRepository.js" });

const TABLE = "DUE_LIST_DYNAMODB_TABLE_NAME";
const JOB_INDEX = "job-jobOn-index";
// The most requests one BatchWriteItem call takes.
const BATCH_SIZE = 25;
// The times one batch is sent, and the wait before the second; each later wait is twice the last.
export const BATCH_ATTEMPTS = 5;
export const BATCH_FIRST_WAIT_MS = 50;
const FEED_SK = "feed";
// How often a write starts again after another write changed the same items first.
const WRITE_ATTEMPTS = 4;

/** The account's due list holds as many businesses or rows as it may. */
export class DueListFullError extends Error {
  /** @param {"businesses"|"rows"} counted */
  constructor(counted) {
    super(`The due list holds no more ${counted}`);
    this.name = "DueListFullError";
    this.counted = counted;
  }
}

/** The business a write names is not on the account's due list. */
export class DueListBusinessMissingError extends Error {
  constructor() {
    super("No such business on the due list");
    this.name = "DueListBusinessMissingError";
  }
}

/** Other writes kept changing the same items, so this one gave up. */
export class DueListBusyError extends Error {
  constructor() {
    super("The due list is being changed by another request");
    this.name = "DueListBusyError";
  }
}

const businessSk = (businessId) => `business#${businessId}`;
const businessRowsPrefix = (businessId) => `row#${businessId}#`;
const feedPartition = (tokenHash) => `feed#${tokenHash}`;

/**
 * The sort key of a row: its business, its type, and its period end (or, for a row the user
 * entered, the date they entered).
 * @param {{businessId: string, type: string, periodEnd?: string, date?: string}} row
 * @returns {string}
 */
export function rowSk(row) {
  const keyDate = row.periodEnd || row.date;
  if (!row.businessId || !row.type || !keyDate) throw new Error("a due list row needs a businessId, a type, and a periodEnd or a date");
  return `row#${row.businessId}#${row.type}#${keyDate}`;
}

async function queryAll(params) {
  const items = [];
  let startKey;
  do {
    const result = await executeDynamoDbCommand(
      (module) => new module.QueryCommand({ ...params, ...(startKey ? { ExclusiveStartKey: startKey } : {}) }),
    );
    items.push(...(result.Items || []));
    startKey = result.LastEvaluatedKey;
  } while (startKey);
  return items;
}

// Every item of the account. During a salt rotation an account's items can sit under two hashes at
// once, so every salt version is read and merged; the current version wins for a key held under both.
async function itemsOfAccount(userSub) {
  const tableName = getResourceName(TABLE);
  const itemsBySk = new Map();
  for (const { hashedSub } of subHashCandidates(userSub)) {
    const items = await queryAll({
      TableName: tableName,
      KeyConditionExpression: "hashedSub = :hashedSub",
      ExpressionAttributeValues: { ":hashedSub": hashedSub },
      ConsistentRead: true,
    });
    for (const item of items) {
      if (!itemsBySk.has(item.sk)) itemsBySk.set(item.sk, item);
    }
  }
  return [...itemsBySk.values()];
}

// Sends the requests in batches of 25. DynamoDB can leave part of a batch unprocessed when the table
// is throttled: those requests are sent again after a wait that doubles each time, at most
// BATCH_ATTEMPTS times a batch. Answers the requests it could not write.
async function batchWrite(requests) {
  const tableName = getResourceName(TABLE);
  const unwritten = [];
  for (let start = 0; start < requests.length; start += BATCH_SIZE) {
    let pending = requests.slice(start, start + BATCH_SIZE);
    for (let attempt = 1; pending.length > 0 && attempt <= BATCH_ATTEMPTS; attempt += 1) {
      if (attempt > 1) await new Promise((resolve) => setTimeout(resolve, BATCH_FIRST_WAIT_MS * 2 ** (attempt - 2)));
      const result = await executeDynamoDbCommand((module) => new module.BatchWriteCommand({ RequestItems: { [tableName]: pending } }));
      pending = result.UnprocessedItems?.[tableName] || [];
    }
    unwritten.push(...pending);
  }
  if (unwritten.length > 0) logger.warn({ message: "Due list items left unwritten after every attempt", unwritten: unwritten.length });
  return unwritten;
}

const requestSk = (request) => (request.PutRequest ? request.PutRequest.Item.sk : request.DeleteRequest.Key.sk);

// An item that names a job holds the raw sub; an item without one does not.
function withJobSub(item, userSub) {
  return item.job ? { ...item, sub: userSub } : item;
}

const isBusiness = (item) => item.sk.startsWith("business#");
const isRow = (item) => item.sk.startsWith("row#");
const isConditionFailure = (error) => error?.name === "ConditionalCheckFailedException";

/**
 * Counts the account's businesses and rows, under every salt version, and writes the count item
 * under the current hash when it differs. A count changed within COUNT_SETTLE_MS is kept, because
 * it may hold reservations for items another write has not written yet. The count item is read
 * first, and the write holds only if it is still as read, so a reservation that lands while this
 * counts is not lost.
 * @param {string} userSub
 * @returns {Promise<{businesses: number, rows: number}>}
 */
async function recount(userSub) {
  const tableName = getResourceName(TABLE);
  const key = { hashedSub: hashSub(userSub), sk: COUNT_SK };
  const seen = (await executeDynamoDbCommand((module) => new module.GetCommand({ TableName: tableName, Key: key, ConsistentRead: true })))
    .Item;
  if (seen && Date.now() - (seen.countedAt ?? 0) < COUNT_SETTLE_MS) return { businesses: seen.businesses, rows: seen.rows };
  const items = await itemsOfAccount(userSub);
  const counts = { businesses: items.filter(isBusiness).length, rows: items.filter(isRow).length };
  // A count under an earlier salt version that moved within the settle window may hold reservations
  // for items a write that began before the rotation is still writing there: those are its count
  // less the items it counts, which are those still under that version and those moved from it.
  for (const { version, hashedSub } of subHashCandidates(userSub)) {
    if (hashedSub === key.hashedSub) continue;
    const earlier = (
      await executeDynamoDbCommand(
        (module) => new module.GetCommand({ TableName: tableName, Key: { hashedSub, sk: COUNT_SK }, ConsistentRead: true }),
      )
    ).Item;
    if (!earlier || Date.now() - (earlier.countedAt ?? 0) >= COUNT_SETTLE_MS) continue;
    // The earlier count counts every item the account held under that version, so an item the
    // rotation has moved from there (marked from:<version>) is one of its items, not a reservation.
    const there = items.filter((item) => item.hashedSub === hashedSub || item.saltRotation === `from:${version}`);
    counts.businesses += Math.max(0, (earlier.businesses ?? 0) - there.filter(isBusiness).length);
    counts.rows += Math.max(0, (earlier.rows ?? 0) - there.filter(isRow).length);
  }
  if (seen && seen.businesses === counts.businesses && seen.rows === counts.rows) return counts;
  try {
    await executeDynamoDbCommand(
      (module) =>
        new module.UpdateCommand({
          TableName: tableName,
          Key: key,
          UpdateExpression: "SET #businesses = :businesses, #rows = :rows, countedAt = :now",
          ConditionExpression: seen ? "#businesses = :seenBusinesses AND #rows = :seenRows" : "attribute_not_exists(sk)",
          ExpressionAttributeNames: { "#businesses": "businesses", "#rows": "rows" },
          ExpressionAttributeValues: {
            ":businesses": counts.businesses,
            ":rows": counts.rows,
            ":now": Date.now(),
            ...(seen ? { ":seenBusinesses": seen.businesses, ":seenRows": seen.rows } : {}),
          },
        }),
    );
    logger.info({ message: "Due list count corrected", ...counts });
  } catch (error) {
    if (!isConditionFailure(error)) throw error;
  }
  return counts;
}

/**
 * Reserves room for items before they are written: adds change to the count on the condition that
 * the count exists and stays within the cap. A missing or refused count is counted again from the
 * account's items, and the reservation tried again, before it answers that there is no room.
 * @param {string} userSub
 * @param {"businesses"|"rows"} counted
 * @param {number} change - More than 0
 * @param {number} cap
 * @returns {Promise<boolean>} False when the items would pass the cap
 */
async function reserve(userSub, counted, change, cap) {
  for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt += 1) {
    try {
      await executeDynamoDbCommand(
        (module) =>
          new module.UpdateCommand({
            TableName: getResourceName(TABLE),
            Key: { hashedSub: hashSub(userSub), sk: COUNT_SK },
            UpdateExpression: "ADD #counted :change SET countedAt = :now",
            ConditionExpression: "attribute_exists(#counted) AND #counted <= :room",
            ExpressionAttributeNames: { "#counted": counted },
            ExpressionAttributeValues: { ":change": change, ":room": cap - change, ":now": Date.now() },
          }),
      );
      return true;
    } catch (error) {
      if (!isConditionFailure(error)) throw error;
      if ((await recount(userSub))[counted] + change > cap) return false;
    }
  }
  throw new DueListBusyError();
}

/**
 * Moves the count by items written or removed outside a reservation, or gives back what a
 * reservation held for items that were not written. With no count item, the account's items are
 * counted, which already holds the change.
 * @param {string} userSub
 * @param {"businesses"|"rows"} counted
 * @param {number} change
 */
async function adjustCount(userSub, counted, change) {
  if (change === 0) return;
  try {
    await executeDynamoDbCommand(
      (module) =>
        new module.UpdateCommand({
          TableName: getResourceName(TABLE),
          Key: { hashedSub: hashSub(userSub), sk: COUNT_SK },
          UpdateExpression: "ADD #counted :change SET countedAt = :now",
          ConditionExpression: "attribute_exists(#counted)",
          ExpressionAttributeNames: { "#counted": counted },
          ExpressionAttributeValues: { ":change": change, ":now": Date.now() },
        }),
    );
  } catch (error) {
    if (!isConditionFailure(error)) throw error;
    await recount(userSub);
  }
}

// Writes one item on a condition; answers false when the condition does not hold.
async function conditionalPut(item, condition) {
  try {
    await executeDynamoDbCommand(
      (module) => new module.PutCommand({ TableName: getResourceName(TABLE), Item: item, ConditionExpression: condition }),
    );
    return true;
  } catch (error) {
    if (!isConditionFailure(error)) throw error;
    return false;
  }
}

// Removes one item; answers whether it was there, so a count moves only for items this removed.
async function removeItem(key) {
  const result = await executeDynamoDbCommand(
    (module) => new module.DeleteCommand({ TableName: getResourceName(TABLE), Key: key, ReturnValues: "ALL_OLD" }),
  );
  return Boolean(result?.Attributes);
}

/**
 * Adds a business to the account's due list, or replaces it. A business that is there is replaced
 * where it is stored, keeping the time HMRC was read, with no count; a new one is written under the
 * current hash once the account's count has room for it.
 * @param {string} userSub
 * @param {{id: string, kind: string, label: string, companyNumber?: string, itsa?: boolean, hmrcReadAt?: string,
 *   job?: string, jobOn?: string}} business
 * @param {number} [cap] - The most businesses the account holds
 * @returns {Promise<{item: object, created: boolean}>} The stored item, and whether it is new
 * @throws {DueListFullError} When the account holds the cap of businesses
 */
export async function putBusiness(userSub, business, cap = DUE_LIST_BUSINESS_CAP) {
  const { id, ...fields } = business;
  const sk = businessSk(id);
  for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt += 1) {
    const stored = (await itemsOfAccount(userSub)).find((item) => item.sk === sk);
    if (stored) {
      const hmrcReadAt = fields.hmrcReadAt ?? stored.hmrcReadAt;
      const item = withJobSub(
        { hashedSub: stored.hashedSub, sk, businessId: id, ...fields, ...(hmrcReadAt ? { hmrcReadAt } : {}) },
        userSub,
      );
      if (await conditionalPut(item, "attribute_exists(sk)")) {
        logger.info({ message: "Due list business stored", kind: business.kind, created: false });
        return { item, created: false };
      }
      continue;
    }
    if (!(await reserve(userSub, "businesses", 1, cap))) throw new DueListFullError("businesses");
    const item = withJobSub({ hashedSub: hashSub(userSub), sk, businessId: id, ...fields }, userSub);
    if (await conditionalPut(item, "attribute_not_exists(sk)")) {
      logger.info({ message: "Due list business stored", kind: business.kind, created: true });
      return { item, created: true };
    }
    await adjustCount(userSub, "businesses", -1);
  }
  throw new DueListBusyError();
}

/**
 * Removes a business and every row due for it. The business goes first, so that a rows write for it
 * that lands afterwards finds it gone and takes its rows back; its rows are then read and removed.
 * @param {string} userSub
 * @param {string} businessId
 * @returns {Promise<number>} The items removed
 */
export async function deleteBusiness(userSub, businessId) {
  const items = await itemsOfAccount(userSub);
  const business = items.find((item) => item.sk === businessSk(businessId));
  let removed = 0;
  if (business && (await removeItem({ hashedSub: business.hashedSub, sk: business.sk }))) {
    removed += 1;
    await adjustCount(userSub, "businesses", -1);
  }
  const rows = (business ? await itemsOfAccount(userSub) : items).filter((item) => item.sk.startsWith(businessRowsPrefix(businessId)));
  const unwritten = await batchWrite(rows.map((item) => ({ DeleteRequest: { Key: { hashedSub: item.hashedSub, sk: item.sk } } })));
  const rowsRemoved = rows.length - unwritten.length;
  removed += rowsRemoved;
  await adjustCount(userSub, "rows", -rowsRemoved);
  if (unwritten.length > 0) throw new Error(`${unwritten.length} of the business's ${rows.length + 1} due list items could not be removed`);
  logger.info({ message: "Due list business removed", removed });
  return removed;
}

/**
 * The account's businesses and rows, read with one Query on its hashed sub.
 * @param {string} userSub
 * @returns {Promise<{businesses: object[], rows: object[]}>}
 */
export async function listBusinessesAndRows(userSub) {
  const items = await itemsOfAccount(userSub);
  return { businesses: items.filter(isBusiness), rows: items.filter(isRow) };
}

// The writes of a rows write: a refresh of readAt for a row stored with the same due date and
// source, and a put for every other row, marked new when no row of its key is stored.
function rowWrites(userSub, rows, storedBySk) {
  const hashedSub = hashSub(userSub);
  const newSks = new Set();
  const refreshes = [];
  const puts = [];
  for (const row of rows) {
    const sk = rowSk(row);
    newSks.add(sk);
    const stored = storedBySk.get(sk);
    if (stored && stored.dueDate === row.dueDate && stored.source === row.source) {
      refreshes.push({ key: { hashedSub: stored.hashedSub, sk }, readAt: row.readAt });
      continue;
    }
    const { ttl } = dueListRowRetention(row.dueDate);
    const item = withJobSub({ ...row, hashedSub: stored?.hashedSub ?? hashedSub, sk, status: "open", ttl }, userSub);
    puts.push({ request: { PutRequest: { Item: item } }, isNew: !stored });
  }
  return { newSks, refreshes, puts };
}

async function refreshReadAt({ key, readAt }) {
  try {
    await executeDynamoDbCommand(
      (module) =>
        new module.UpdateCommand({
          TableName: getResourceName(TABLE),
          Key: key,
          UpdateExpression: "SET readAt = :readAt",
          ConditionExpression: "attribute_exists(sk)",
          ExpressionAttributeValues: { ":readAt": readAt },
        }),
    );
    return true;
  } catch (error) {
    if (!isConditionFailure(error)) throw error;
    return false;
  }
}

// Sets attributes on a business only if it is still there.
async function updateBusiness(key, set) {
  const names = Object.keys(set);
  try {
    await executeDynamoDbCommand(
      (module) =>
        new module.UpdateCommand({
          TableName: getResourceName(TABLE),
          Key: key,
          UpdateExpression: "SET " + names.map((name) => `#${name} = :${name}`).join(", "),
          ConditionExpression: "attribute_exists(sk)",
          ExpressionAttributeNames: Object.fromEntries(names.map((name) => [`#${name}`, name])),
          ExpressionAttributeValues: Object.fromEntries(names.map((name) => [`:${name}`, set[name]])),
        }),
    );
    return true;
  } catch (error) {
    if (!isConditionFailure(error)) throw error;
    return false;
  }
}

/**
 * Writes rows to the account's due list. A row that matches a stored row in key, due date and
 * source updates only that row's readAt, so it keeps its status and its reminder job. Every other
 * row is written as a new open row, with a ttl 90 days after its due date. A stored row that
 * replace selects, and that the new rows do not hold, is removed.
 *
 * The whole write is checked against the cap before anything is written: the rows it adds beyond
 * those it removes are reserved on the account's count, and a write the count has no room for
 * changes nothing. The rows then go in batches; what DynamoDB leaves unwritten is given back to the
 * count. A write for a business records forBusiness.set on it afterwards, only if the business is
 * still there; when it was removed meanwhile, the rows this write added are taken out again.
 * @param {string} userSub
 * @param {object[]} rows - Each with businessId, type, periodEnd (or date), dueDate, source and readAt
 * @param {(storedRow: object) => boolean} [replace] - Selects the stored rows the new rows replace
 * @param {{forBusiness?: {id: string, set: Record<string, string>}, cap?: number}} [options]
 * @returns {Promise<{written: number, refreshed: number, removed: number, unwritten: string[]}>} unwritten holds the
 *   sort keys of the rows DynamoDB left unprocessed after every attempt
 * @throws {DueListFullError} When the rows would pass the cap; nothing is written
 * @throws {DueListBusinessMissingError} When forBusiness names a business the account does not hold
 */
export async function putRows(userSub, rows, replace = () => false, { forBusiness, cap = DUE_LIST_ROW_CAP } = {}) {
  const items = await itemsOfAccount(userSub);
  const business = forBusiness && items.find((item) => item.sk === businessSk(forBusiness.id));
  if (forBusiness && !business) throw new DueListBusinessMissingError();
  const storedRows = items.filter(isRow);
  const { newSks, refreshes, puts } = rowWrites(userSub, rows, new Map(storedRows.map((row) => [row.sk, row])));
  const removals = storedRows
    .filter((row) => !newSks.has(row.sk) && replace(row))
    .map((row) => ({ DeleteRequest: { Key: { hashedSub: row.hashedSub, sk: row.sk } } }));

  const reserved = Math.max(0, puts.filter((put) => put.isNew).length - removals.length);
  if (reserved > 0 && !(await reserve(userSub, "rows", reserved, cap))) throw new DueListFullError("rows");

  let refreshed = 0;
  for (const refresh of refreshes) if (await refreshReadAt(refresh)) refreshed += 1;
  // Removals first, so the rows stored never pass what was reserved while the batches run.
  const unwritten = (await batchWrite([...removals, ...puts.map((put) => put.request)])).map(requestSk);
  const writtenPuts = puts.filter((put) => !unwritten.includes(requestSk(put.request)));
  const removed = removals.filter((request) => !unwritten.includes(requestSk(request))).length;
  const added = writtenPuts.filter((put) => put.isNew).length;
  await adjustCount(userSub, "rows", added - removed - reserved);

  if (business && !(await updateBusiness({ hashedSub: business.hashedSub, sk: business.sk }, forBusiness.set))) {
    // Every row this write put goes back out. A row it added was counted here, so its removal moves
    // the count. A row it replaced was counted before, and the business's removal took that count
    // away when it removed the row, so a put that brought the row back is removed with no count.
    let takenBack = 0;
    for (const put of writtenPuts) {
      const removedNow = await removeItem({ hashedSub: put.request.PutRequest.Item.hashedSub, sk: put.request.PutRequest.Item.sk });
      if (removedNow && put.isNew) takenBack += 1;
    }
    await adjustCount(userSub, "rows", -takenBack);
    throw new DueListBusinessMissingError();
  }
  logger.info({ message: "Due list rows stored", written: writtenPuts.length, refreshed, removed, unwritten: unwritten.length });
  return { written: writtenPuts.length, refreshed, removed, unwritten };
}

/**
 * Closes a row: its status becomes closed and it loses its job and the raw sub that went with it, so
 * the reminder job no longer finds it.
 * @param {string} userSub
 * @param {string} sk - The row's sort key
 * @returns {Promise<boolean>} False when the account holds no such row, or the key is not a row's
 */
export async function closeRow(userSub, sk) {
  const tableName = getResourceName(TABLE);
  if (!String(sk).startsWith("row#")) return false;
  for (const { hashedSub } of subHashCandidates(userSub)) {
    try {
      await executeDynamoDbCommand(
        (module) =>
          new module.UpdateCommand({
            TableName: tableName,
            Key: { hashedSub, sk },
            UpdateExpression: "SET #status = :closed REMOVE job, jobOn, #sub",
            ConditionExpression: "attribute_exists(sk)",
            ExpressionAttributeNames: { "#status": "status", "#sub": "sub" },
            ExpressionAttributeValues: { ":closed": "closed" },
          }),
      );
      logger.info({ message: "Due list row closed" });
      return true;
    } catch (error) {
      if (error.name !== "ConditionalCheckFailedException") throw error;
    }
  }
  return false;
}

/**
 * The items a daily job is due to act on: those whose job is this job and whose jobOn is on or before the date.
 * @param {"refresh"|"remind"} job
 * @param {string} date - YYYY-MM-DD
 * @returns {Promise<object[]>}
 */
export async function queryJobsDue(job, date) {
  return queryAll({
    TableName: getResourceName(TABLE),
    IndexName: JOB_INDEX,
    KeyConditionExpression: "job = :job AND jobOn <= :date",
    ExpressionAttributeValues: { ":job": job, ":date": date },
  });
}

/**
 * Stores the account's calendar feed token, by its hash: the lookup the feed URL reads, and a
 * pointer from the account to it. A token the account held before is removed.
 * @param {string} userSub
 * @param {string} tokenHash - The sha256 of the token
 */
export async function putFeedToken(userSub, tokenHash) {
  const hashedSub = hashSub(userSub);
  const previous = (await itemsOfAccount(userSub)).find((item) => item.sk === FEED_SK);
  const previousTokenHash = previous?.tokenHash;
  const unwritten = await batchWrite([
    { PutRequest: { Item: { hashedSub: feedPartition(tokenHash), sk: FEED_SK, sub: userSub, createdAt: new Date().toISOString() } } },
    { PutRequest: { Item: { hashedSub, sk: FEED_SK, tokenHash } } },
    ...(previousTokenHash && previousTokenHash !== tokenHash
      ? [{ DeleteRequest: { Key: { hashedSub: feedPartition(previousTokenHash), sk: FEED_SK } } }]
      : []),
    ...(previous && previous.hashedSub !== hashedSub ? [{ DeleteRequest: { Key: { hashedSub: previous.hashedSub, sk: FEED_SK } } }] : []),
  ]);
  if (unwritten.length > 0) throw new Error(`${unwritten.length} of the calendar feed token's items could not be written`);
  logger.info({ message: "Due list feed token stored" });
}

/**
 * The calendar feed's lookup for a token hash, or null.
 * @param {string} tokenHash
 * @returns {Promise<{sub: string, createdAt: string}|null>}
 */
export async function findFeedByTokenHash(tokenHash) {
  const result = await executeDynamoDbCommand(
    (module) => new module.GetCommand({ TableName: getResourceName(TABLE), Key: { hashedSub: feedPartition(tokenHash), sk: FEED_SK } }),
  );
  return result.Item ? { sub: result.Item.sub, createdAt: result.Item.createdAt } : null;
}

/**
 * Closes the account's open VAT return row for a period end when exactly one matches. With two or
 * more (two VAT businesses on one stagger, and no business holds a VRN) it leaves them for the next
 * HMRC read.
 * @param {string} userSub
 * @param {string} periodEnd - YYYY-MM-DD
 * @returns {Promise<{matched: number, closed: boolean}>}
 */
export async function closeVatReturnRow(userSub, periodEnd) {
  const { rows } = await listBusinessesAndRows(userSub);
  const matching = rows.filter((row) => row.type === "vat-return" && row.periodEnd === periodEnd && row.status === "open");
  if (matching.length !== 1) return { matched: matching.length, closed: false };
  return { matched: 1, closed: await closeRow(userSub, matching[0].sk) };
}
