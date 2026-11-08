// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/data/dynamoDbIntegrationCallRepository.js

import { executeDynamoDbCommand, getResourceName } from "../lib/dynamoDbClient.js";

/**
 * Write one outbound call record. The caller owns failure handling.
 * @param {Object} item - The record, with its pk and sk
 * @returns {Promise<void>}
 */
export async function putIntegrationCall(item) {
  const tableName = getResourceName("INTEGRATION_CALLS_DYNAMODB_TABLE_NAME", true);
  await executeDynamoDbCommand((module) => new module.PutCommand({ TableName: tableName, Item: item }));
}

/**
 * Read one header check result.
 * @param {string} pk - fph#<yyyy-mm-dd>
 * @param {string} sk - The shape hash
 * @returns {Promise<Object|undefined>} The item, or undefined when the shape has no result that day
 */
export async function getFphCheckResult(pk, sk) {
  const tableName = getResourceName("INTEGRATION_CALLS_DYNAMODB_TABLE_NAME", true);
  const result = await executeDynamoDbCommand(
    (module) => new module.GetCommand({ TableName: tableName, Key: { pk, sk }, ConsistentRead: true }),
  );
  return result?.Item;
}

/**
 * Write one header check result unless the shape already has one that day.
 * @param {Object} item - The result, with its pk and sk
 * @returns {Promise<boolean>} True when written, false when a result already existed
 */
export async function putFphCheckResultOnce(item) {
  const tableName = getResourceName("INTEGRATION_CALLS_DYNAMODB_TABLE_NAME", true);
  try {
    await executeDynamoDbCommand(
      (module) => new module.PutCommand({ TableName: tableName, Item: item, ConditionExpression: "attribute_not_exists(sk)" }),
    );
    return true;
  } catch (error) {
    if (error?.name === "ConditionalCheckFailedException") return false;
    throw error;
  }
}
