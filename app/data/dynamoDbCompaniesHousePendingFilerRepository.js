// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/data/dynamoDbCompaniesHousePendingFilerRepository.js
// Who filed a submission under our presenter: the filer's sub, sealed to the filing-state item
// pending#<submissionNumber>, and the form kind. A presenter poll names only the submission number,
// so this is how it finds the filer. Kept apart from the rest of the filing state so that only the
// submit Lambdas and the presenter poll load the sealing key.

import { executeDynamoDbCommand } from "../lib/dynamoDbClient.js";
import { calculateTtl } from "../lib/dateUtils.js";
import { sealFor, openFor } from "../lib/codesSeal.js";
import { FILING_STATE_RETENTION, filingStateTableName, pendingFilingKey } from "./dynamoDbCompaniesHouseFilingStateRepository.js";

const PENDING_FILER_PURPOSE = "companies-house-pending-filer";

/**
 * Record who filed a submission under our presenter, so the presenter poll can find the filer from
 * the submission number alone. The sub is sealed to this item.
 * @param {{submissionNumber: string, userSub: string, kind: string}} input
 */
export async function putPendingFiling({ submissionNumber, userSub, kind }) {
  const key = pendingFilingKey(submissionNumber);
  const sealedFiler = await sealFor(PENDING_FILER_PURPOSE, { userSub }, key.requestId);
  const now = new Date();
  const { ttl } = calculateTtl(now, FILING_STATE_RETENTION);
  // An update, so the submit Lambdas need no PutItem on the table.
  await executeDynamoDbCommand(
    (module) =>
      new module.UpdateCommand({
        TableName: filingStateTableName(),
        Key: key,
        UpdateExpression: "SET sealedFiler = :sealedFiler, kind = :kind, createdAt = :createdAt, #ttl = :ttl",
        ExpressionAttributeNames: { "#ttl": "ttl" },
        ExpressionAttributeValues: { ":sealedFiler": sealedFiler, ":kind": kind, ":createdAt": now.toISOString(), ":ttl": ttl },
      }),
  );
}

/**
 * @param {string} submissionNumber
 * @returns {Promise<{userSub: string|undefined, kind: string|undefined}|null>} null
 *   when no filing under our presenter carries the number; userSub is undefined on a claim-only item
 */
export async function getPendingFiling(submissionNumber) {
  const key = pendingFilingKey(submissionNumber);
  const { Item } = await executeDynamoDbCommand(
    (module) => new module.GetCommand({ TableName: filingStateTableName(), Key: key, ConsistentRead: true }),
  );
  if (!Item) return null;
  const filer = Item.sealedFiler ? await openFor(PENDING_FILER_PURPOSE, Item.sealedFiler, key.requestId) : undefined;
  return { userSub: filer?.userSub, kind: Item.kind };
}
