// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/data/dynamoDbCompaniesHouseCacheRepository.js
//
// The Companies House cache: trimmed copies of public register answers. The partition key is the
// company number and sk names the answer: the Companies House path with its query, or
// figures#<transaction id> for the figures of one filing. Each item has a ttl, and DynamoDB deletes
// an expired item some time after it expires, so a read treats an item whose ttl has passed as absent.

import { executeDynamoDbCommand, getResourceName } from "../lib/dynamoDbClient.js";

const TABLE = "COMPANIES_HOUSE_CACHE_DYNAMODB_TABLE_NAME";

const nowSeconds = () => Math.floor(Date.now() / 1000);

/**
 * The cached entry, or null when there is none or its ttl has passed.
 * @param {string} companyNumber
 * @param {string} sk
 * @returns {Promise<{value: object, readAt: string}|null>}
 */
export async function getCacheEntry(companyNumber, sk) {
  const result = await executeDynamoDbCommand(
    (module) => new module.GetCommand({ TableName: getResourceName(TABLE), Key: { companyNumber, sk } }),
  );
  const item = result.Item;
  if (!item || typeof item.ttl !== "number" || item.ttl <= nowSeconds()) return null;
  return { value: item.value, readAt: item.readAt };
}

/**
 * Stores an entry for ttlSeconds, with the time it was read from Companies House.
 * @param {string} companyNumber
 * @param {string} sk
 * @param {object} value
 * @param {string} readAt - ISO time
 * @param {number} ttlSeconds
 */
export async function putCacheEntry(companyNumber, sk, value, readAt, ttlSeconds) {
  await executeDynamoDbCommand(
    (module) =>
      new module.PutCommand({
        TableName: getResourceName(TABLE),
        Item: { companyNumber, sk, value, readAt, ttl: nowSeconds() + ttlSeconds },
      }),
  );
}

/**
 * The sort keys of every entry the company holds, with one Query on its partition.
 * @param {string} companyNumber
 * @returns {Promise<string[]>}
 */
export async function listCacheKeys(companyNumber) {
  const keys = [];
  let startKey;
  do {
    const result = await executeDynamoDbCommand(
      (module) =>
        new module.QueryCommand({
          TableName: getResourceName(TABLE),
          KeyConditionExpression: "companyNumber = :companyNumber",
          ExpressionAttributeValues: { ":companyNumber": companyNumber },
          ProjectionExpression: "sk",
          ...(startKey ? { ExclusiveStartKey: startKey } : {}),
        }),
    );
    keys.push(...(result.Items || []).map((item) => item.sk));
    startKey = result.LastEvaluatedKey;
  } while (startKey);
  return keys;
}

/**
 * Removes one entry.
 * @param {string} companyNumber
 * @param {string} sk
 */
export async function deleteCacheEntry(companyNumber, sk) {
  await executeDynamoDbCommand((module) => new module.DeleteCommand({ TableName: getResourceName(TABLE), Key: { companyNumber, sk } }));
}
