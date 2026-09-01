// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/data/dynamoDbSecurityStateRepository.js
//
// Repository for the {env}-env-security-state table (issue #10 data-theft detection).
// One table, two item shapes distinguished by stateKey prefix:
//   rate#{hashedSub}#{minute} - bundle-endpoint burst counters (bundleGet.js)
//   geo#{hashedSub}           - mid-session country state (customAuthorizer.js)
// Every item carries a short TTL; none of it is customer data.

import { createLogger } from "../lib/logger.js";
import { getDynamoDbDocClient } from "../lib/dynamoDbClient.js";
import { fiveMinuteTtl } from "../lib/dateUtils.js";

const logger = createLogger({ source: "app/data/dynamoDbSecurityStateRepository.js" });

function getTableName() {
  return process.env.SECURITY_STATE_DYNAMODB_TABLE_NAME || "";
}

/**
 * Atomically increments the one-minute request counter for a consumer and returns the
 * updated count. One round trip: the TTL is set only on the item's first write in a given
 * minute bucket (if_not_exists), and the count comes back from the same UpdateItem call
 * that bumped it.
 *
 * @param {Object} params
 * @param {string} params.hashedSub
 * @param {number|string} params.minute - minute bucket key, e.g. from nowMinute()
 * @returns {Promise<number>} the updated hit count
 */
export async function incrementRateCounter({ hashedSub, minute }) {
  const { docClient, module } = await getDynamoDbDocClient();
  const tableName = getTableName();

  const { Attributes } = await docClient.send(
    new module.UpdateCommand({
      TableName: tableName,
      Key: { stateKey: `rate#${hashedSub}#${minute}` },
      UpdateExpression: "SET #ttl = if_not_exists(#ttl, :ttl) ADD hits :one",
      ExpressionAttributeNames: { "#ttl": "ttl" },
      ExpressionAttributeValues: { ":one": 1, ":ttl": fiveMinuteTtl() },
      ReturnValues: "UPDATED_NEW",
    }),
  );

  logger.info({ message: "Rate counter incremented", hashedSub, minute, hits: Attributes?.hits });
  return Attributes.hits;
}
