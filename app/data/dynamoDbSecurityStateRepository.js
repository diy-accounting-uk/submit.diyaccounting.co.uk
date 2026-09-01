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
import { fiveMinuteTtl, calculateOneHourTtl } from "../lib/dateUtils.js";

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

/**
 * Reads the stored session-geo item for a consumer.
 *
 * @param {string} hashedSub
 * @returns {Promise<{country?: string, revokedAt?: number}|null>} null when no item exists
 */
export async function getSessionGeo(hashedSub) {
  const { docClient, module } = await getDynamoDbDocClient();
  const tableName = getTableName();

  const result = await docClient.send(
    new module.GetCommand({
      TableName: tableName,
      Key: { stateKey: `geo#${hashedSub}` },
    }),
  );

  return result.Item || null;
}

/**
 * Writes the session-geo item for a consumer in one call, always refreshing the one-hour
 * TTL. A country-change write passes both the new country and revokedAt together: writing
 * the new country as part of the same call that revokes is what lets a genuine
 * re-authentication from the new country be recognised as trusted on its next request,
 * rather than mismatching against the stale country forever.
 *
 * @param {string} hashedSub
 * @param {Object} fields
 * @param {string} fields.country
 * @param {number} [fields.revokedAt] - epoch seconds; omitted clears any prior revocation
 */
export async function putSessionGeo(hashedSub, { country, revokedAt }) {
  const { docClient, module } = await getDynamoDbDocClient();
  const tableName = getTableName();

  await docClient.send(
    new module.PutCommand({
      TableName: tableName,
      Item: {
        stateKey: `geo#${hashedSub}`,
        country,
        ...(revokedAt !== undefined ? { revokedAt } : {}),
        ttl: calculateOneHourTtl(new Date()).ttl,
      },
    }),
  );

  logger.info({ message: "Session geo written", hashedSub, country, revoked: revokedAt !== undefined });
}
