// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/data/dynamoDbCtPendingReturnRepository.js
// The Company Tax Returns that wait for HMRC's final answer, for the scheduled status check. Each
// return sent has one marker item in the "hmrc-ct-pending" partition of the Companies House
// async-requests table (COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME), keyed by its
// correlation ID. The marker holds the filer's sub, sealed to the item, and when the return was
// sent, so the check finds every pending return with one Query on that partition and reads the
// filer's own request item by key. A hashed sub is hex, so no user partition can be named
// "hmrc-ct-pending".

import { executeDynamoDbCommand } from "../lib/dynamoDbClient.js";
import { calculateTtl } from "../lib/dateUtils.js";
import { sealFor, openFor } from "../lib/codesSeal.js";

export const CT_PENDING_PARTITION = "hmrc-ct-pending";
const CT_PENDING_FILER_PURPOSE = "hmrc-ct-pending-filer";
// The marker outlives the pending request by a day, so the check that records "no answer" finds it.
const CT_PENDING_MARKER_RETENTION = { days: 31 };

function tableName() {
  const name = process.env.COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME;
  if (!name) throw new Error("Missing required environment variable COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME");
  return name;
}

function markerKey(correlationId) {
  return { hashedSub: CT_PENDING_PARTITION, requestId: correlationId };
}

function sealedFor(correlationId) {
  return `${CT_PENDING_PARTITION}#${correlationId}`;
}

/**
 * Record a Company Tax Return sent to HMRC, so the scheduled check can ask for its answer.
 * @param {{correlationId: string, userSub: string, sentAt: Date}} input
 */
export async function putPendingCtReturn({ correlationId, userSub, sentAt }) {
  const sealedFiler = await sealFor(CT_PENDING_FILER_PURPOSE, { userSub }, sealedFor(correlationId));
  const { ttl } = calculateTtl(sentAt, CT_PENDING_MARKER_RETENTION);
  // An update, so the submit Lambda needs no PutItem on the table.
  await executeDynamoDbCommand(
    (module) =>
      new module.UpdateCommand({
        TableName: tableName(),
        Key: markerKey(correlationId),
        UpdateExpression: "SET sealedFiler = :sealedFiler, sentAt = :sentAt, #ttl = :ttl",
        ExpressionAttributeNames: { "#ttl": "ttl" },
        ExpressionAttributeValues: { ":sealedFiler": sealedFiler, ":sentAt": sentAt.toISOString(), ":ttl": ttl },
      }),
  );
}

/**
 * Every Company Tax Return that waits for HMRC's final answer, by a Query on the marker partition.
 * @returns {Promise<Array<{correlationId: string, sentAt: string, sealedFiler: string}>>}
 */
export async function listPendingCtReturns() {
  const markers = [];
  let startKey;
  do {
    const exclusiveStartKey = startKey;
    const response = await executeDynamoDbCommand(
      (module) =>
        new module.QueryCommand({
          TableName: tableName(),
          KeyConditionExpression: "hashedSub = :partition",
          ProjectionExpression: "requestId, sentAt, sealedFiler",
          ExpressionAttributeValues: { ":partition": CT_PENDING_PARTITION },
          ExclusiveStartKey: exclusiveStartKey,
        }),
    );
    for (const item of response.Items ?? []) {
      markers.push({ correlationId: item.requestId, sentAt: item.sentAt, sealedFiler: item.sealedFiler });
    }
    startKey = response.LastEvaluatedKey;
  } while (startKey);
  return markers;
}

/**
 * @param {{correlationId: string, sealedFiler: string}} marker
 * @returns {Promise<string>} the filer's sub
 */
export async function openPendingCtFiler(marker) {
  const { userSub } = await openFor(CT_PENDING_FILER_PURPOSE, marker.sealedFiler, sealedFor(marker.correlationId));
  return userSub;
}

/**
 * Take the right to check one return now: false when another run checked it within intervalSeconds.
 * Every deployment of an environment shares the table, so this keeps each return to one check per
 * interval however many schedules run.
 * @param {string} correlationId
 * @param {{now: Date, intervalSeconds: number}} input
 * @returns {Promise<boolean>}
 */
export async function claimPendingCtCheck(correlationId, { now, intervalSeconds }) {
  const nowSeconds = Math.floor(now.getTime() / 1000);
  try {
    await executeDynamoDbCommand(
      (module) =>
        new module.UpdateCommand({
          TableName: tableName(),
          Key: markerKey(correlationId),
          UpdateExpression: "SET checkAfter = :next",
          ConditionExpression: "attribute_exists(sealedFiler) AND (attribute_not_exists(checkAfter) OR checkAfter <= :now)",
          ExpressionAttributeValues: { ":now": nowSeconds, ":next": nowSeconds + intervalSeconds },
        }),
    );
    return true;
  } catch (error) {
    if (error.name === "ConditionalCheckFailedException") return false;
    throw error;
  }
}

/**
 * Drop the marker of a return that has its final answer, or that is no longer held.
 * @param {string} correlationId
 */
export async function deletePendingCtReturn(correlationId) {
  await executeDynamoDbCommand((module) => new module.DeleteCommand({ TableName: tableName(), Key: markerKey(correlationId) }));
}
