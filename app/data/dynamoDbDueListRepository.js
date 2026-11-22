// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/data/dynamoDbDueListRepository.js
//
// The due list: an account's businesses and the filing and payment rows due for them. The
// partition key is the account's hashed sub and sk names the item:
//   business#<id>                                  a business on the list
//   row#<businessId>#<type>#<periodEnd or date>    a row due for that business
//   feed                                           the account's calendar feed token, by its hash
//   seen#<companyNumber>                           the last filing seen for a watched company
// A calendar feed's lookup sits in its own partition, feed#<sha256 of the token>, so the feed URL
// finds the account without its sub. The index job-jobOn-index finds the items a daily job is due
// to act on (job = refresh or remind, jobOn a date); an item with a job holds the raw sub, which
// the jobs need to find the account's address.

import { createLogger } from "../lib/logger.js";
import { hashSub, subHashCandidates } from "../services/subHasher.js";
import { executeDynamoDbCommand, getResourceName } from "../lib/dynamoDbClient.js";
import { dueListRowRetention } from "../lib/recordRetention.js";

const logger = createLogger({ source: "app/data/dynamoDbDueListRepository.js" });

const TABLE = "DUE_LIST_DYNAMODB_TABLE_NAME";
const JOB_INDEX = "job-jobOn-index";
// The most requests one BatchWriteItem call takes.
const BATCH_SIZE = 25;
const FEED_SK = "feed";

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

// Every item of the account under the first salt version of its hash that holds any, the current
// version first, so a list read during a salt rotation still finds the account's items.
async function itemsOfAccount(userSub) {
  const tableName = getResourceName(TABLE);
  for (const { hashedSub } of subHashCandidates(userSub)) {
    const items = await queryAll({
      TableName: tableName,
      KeyConditionExpression: "hashedSub = :hashedSub",
      ExpressionAttributeValues: { ":hashedSub": hashedSub },
    });
    if (items.length > 0) return items;
  }
  return [];
}

async function batchWrite(requests) {
  const tableName = getResourceName(TABLE);
  for (let start = 0; start < requests.length; start += BATCH_SIZE) {
    let pending = { [tableName]: requests.slice(start, start + BATCH_SIZE) };
    while (pending && pending[tableName]?.length) {
      const result = await executeDynamoDbCommand((module) => new module.BatchWriteCommand({ RequestItems: pending }));
      pending = result.UnprocessedItems && Object.keys(result.UnprocessedItems).length > 0 ? result.UnprocessedItems : null;
    }
  }
}

// An item that names a job holds the raw sub; an item without one does not.
function withJobSub(item, userSub) {
  return item.job ? { ...item, sub: userSub } : item;
}

/**
 * Adds a business to the account's due list, or replaces it.
 * @param {string} userSub
 * @param {{id: string, kind: string, label: string, companyNumber?: string, itsa?: boolean, hmrcReadAt?: string,
 *   job?: string, jobOn?: string}} business
 * @returns {Promise<object>} The stored item
 */
export async function putBusiness(userSub, business) {
  const { id, ...fields } = business;
  const item = withJobSub({ hashedSub: hashSub(userSub), sk: businessSk(id), businessId: id, ...fields }, userSub);
  await executeDynamoDbCommand((module) => new module.PutCommand({ TableName: getResourceName(TABLE), Item: item }));
  logger.info({ message: "Due list business stored", businessId: id, kind: business.kind });
  return item;
}

/**
 * Removes a business and every row due for it.
 * @param {string} userSub
 * @param {string} businessId
 * @returns {Promise<number>} The items removed
 */
export async function deleteBusiness(userSub, businessId) {
  const items = await itemsOfAccount(userSub);
  const removed = items.filter((item) => item.sk === businessSk(businessId) || item.sk.startsWith(businessRowsPrefix(businessId)));
  await batchWrite(removed.map((item) => ({ DeleteRequest: { Key: { hashedSub: item.hashedSub, sk: item.sk } } })));
  logger.info({ message: "Due list business removed", businessId, removed: removed.length });
  return removed.length;
}

/**
 * The account's businesses and rows, read with one Query on its hashed sub.
 * @param {string} userSub
 * @returns {Promise<{businesses: object[], rows: object[]}>}
 */
export async function listBusinessesAndRows(userSub) {
  const items = await itemsOfAccount(userSub);
  return {
    businesses: items.filter((item) => item.sk.startsWith("business#")),
    rows: items.filter((item) => item.sk.startsWith("row#")),
  };
}

/**
 * Writes rows to the account's due list. A row that matches a stored row in key, due date and
 * source updates only that row's readAt, so it keeps its status and its reminder job. Every other
 * row is written as a new open row, with a ttl 90 days after its due date. A stored row that
 * replace selects, and that the new rows do not hold, is removed.
 * @param {string} userSub
 * @param {object[]} rows - Each with businessId, type, periodEnd (or date), dueDate, source and readAt
 * @param {(storedRow: object) => boolean} [replace] - Selects the stored rows the new rows replace
 * @returns {Promise<{written: number, refreshed: number, removed: number}>}
 */
export async function putRows(userSub, rows, replace = () => false) {
  const tableName = getResourceName(TABLE);
  const { rows: storedRows } = await listBusinessesAndRows(userSub);
  const storedBySk = new Map(storedRows.map((row) => [row.sk, row]));
  const hashedSub = storedRows[0]?.hashedSub ?? hashSub(userSub);
  const newSks = new Set();
  const writes = [];
  let refreshed = 0;

  for (const row of rows) {
    const sk = rowSk(row);
    newSks.add(sk);
    const stored = storedBySk.get(sk);
    if (stored && stored.dueDate === row.dueDate && stored.source === row.source) {
      await executeDynamoDbCommand(
        (module) =>
          new module.UpdateCommand({
            TableName: tableName,
            Key: { hashedSub: stored.hashedSub, sk },
            UpdateExpression: "SET readAt = :readAt",
            ExpressionAttributeValues: { ":readAt": row.readAt },
          }),
      );
      refreshed += 1;
      continue;
    }
    const { ttl } = dueListRowRetention(row.dueDate);
    const item = withJobSub({ ...row, hashedSub: stored?.hashedSub ?? hashedSub, sk, status: "open", ttl }, userSub);
    writes.push({ PutRequest: { Item: item } });
  }

  const removals = storedRows
    .filter((row) => !newSks.has(row.sk) && replace(row))
    .map((row) => ({ DeleteRequest: { Key: { hashedSub: row.hashedSub, sk: row.sk } } }));
  await batchWrite([...writes, ...removals]);
  logger.info({ message: "Due list rows stored", written: writes.length, refreshed, removed: removals.length });
  return { written: writes.length, refreshed, removed: removals.length };
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
  const tableName = getResourceName(TABLE);
  const hashedSub = hashSub(userSub);
  const previous = await executeDynamoDbCommand(
    (module) => new module.GetCommand({ TableName: tableName, Key: { hashedSub, sk: FEED_SK } }),
  );
  const previousTokenHash = previous.Item?.tokenHash;
  await batchWrite([
    { PutRequest: { Item: { hashedSub: feedPartition(tokenHash), sk: FEED_SK, sub: userSub, createdAt: new Date().toISOString() } } },
    { PutRequest: { Item: { hashedSub, sk: FEED_SK, tokenHash } } },
    ...(previousTokenHash && previousTokenHash !== tokenHash
      ? [{ DeleteRequest: { Key: { hashedSub: feedPartition(previousTokenHash), sk: FEED_SK } } }]
      : []),
  ]);
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
