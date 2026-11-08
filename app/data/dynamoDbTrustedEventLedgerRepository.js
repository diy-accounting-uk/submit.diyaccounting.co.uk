// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/data/dynamoDbTrustedEventLedgerRepository.js
//
// Repository for the {env}-env-trusted-events table. Two kinds of item share one hash key:
// dedupeKey = "{key}" holds the issue that carries the fact and the last version written, and
// dedupeKey = "{key}#{version}" holds the hash of one written version. Items expire after 400 days.
// None of it is customer data.

import { executeDynamoDbCommand, getResourceName } from "../lib/dynamoDbClient.js";
import { calculateTtl } from "../lib/dateUtils.js";

const LEDGER_LIFETIME = { days: 400 };

const tableName = () => getResourceName("TRUSTED_EVENT_LEDGER_DYNAMODB_TABLE_NAME", true);
const ttl = () => calculateTtl(new Date(), LEDGER_LIFETIME).ttl;

/** The item stored under `dedupeKey`, or null. */
export async function getLedgerItem(dedupeKey) {
  const result = await executeDynamoDbCommand(
    (module) => new module.GetCommand({ TableName: tableName(), Key: { dedupeKey }, ConsistentRead: true }),
  );
  return result?.Item || null;
}

export async function putVersion({ key, version, factHash, sourceId, issueNumber, observedAt }) {
  await executeDynamoDbCommand(
    (module) =>
      new module.PutCommand({
        TableName: tableName(),
        Item: { dedupeKey: `${key}#${version}`, factHash, sourceId, issueNumber, observedAt, ttl: ttl() },
      }),
  );
}

export async function putKey({ key, issueNumber, lastVersion }) {
  await executeDynamoDbCommand(
    (module) => new module.PutCommand({ TableName: tableName(), Item: { dedupeKey: key, issueNumber, lastVersion, ttl: ttl() } }),
  );
}
