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
