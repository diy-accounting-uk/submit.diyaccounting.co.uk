// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/data/dynamoDbFphCheckResultRepository.js

// Read-only access to the header check results in the integration calls table. The snapshot
// Lambda reads them here; it holds no write access to the table.

import { executeDynamoDbCommand, getResourceName } from "../lib/dynamoDbClient.js";

/**
 * Read every header check result of one UTC day.
 * @param {string} pk - fph#<yyyy-mm-dd>
 * @returns {Promise<Array<Object>>} The day's items, in shape hash order
 */
export async function listFphCheckResults(pk) {
  const tableName = getResourceName("INTEGRATION_CALLS_DYNAMODB_TABLE_NAME", true);
  const items = [];
  let startKey;
  do {
    const page = await executeDynamoDbCommand(
      (module) =>
        new module.QueryCommand({
          TableName: tableName,
          KeyConditionExpression: "pk = :pk",
          ExpressionAttributeValues: { ":pk": pk },
          ExclusiveStartKey: startKey,
        }),
    );
    items.push(...(page?.Items ?? []));
    startKey = page?.LastEvaluatedKey;
  } while (startKey);
  return items;
}
