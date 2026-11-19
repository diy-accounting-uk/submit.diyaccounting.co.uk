// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/data/dynamoDbCompaniesHouseFilingStateRepository.js
// The state of Companies House XML Gateway filings that outlives one page visit. It lives in the
// Companies House async-requests table (COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME), in the
// "companies-house-xmlgw" partition that already holds the submission-number counter, so no item
// here can collide with a user's own request item:
//   pending#<submissionNumber>  - one per filing: claimedAt marks that its final status is recorded.
//                                 For a filing under our presenter it also holds the filer's sub,
//                                 sealed, and the form kind (dynamoDbCompaniesHousePendingFilerRepository.js).
//   presenter-poll-state        - nextPollAt: the earliest epoch second the presenter poll may run.
// The filer's own request item (partition = hashed sub, sort key = submission number) stays where
// the submit Lambda writes it; listFilingsInProgress reads those items for the filings list.

import { createLogger } from "../lib/logger.js";
import { executeDynamoDbCommand } from "../lib/dynamoDbClient.js";
import { calculateTtl } from "../lib/dateUtils.js";
import { hashSub } from "../services/subHasher.js";

const logger = createLogger({ source: "app/data/dynamoDbCompaniesHouseFilingStateRepository.js" });

const GATEWAY_PARTITION = "companies-house-xmlgw";
const PENDING_PREFIX = "pending#";
const PRESENTER_POLL_STATE_KEY = { hashedSub: GATEWAY_PARTITION, requestId: "presenter-poll-state" };

// Companies House answers a status poll for 90 days after it accepts or rejects a submission. A
// filing still in progress, or rejected, is kept a little longer than that.
export const FILING_STATE_RETENTION = { days: 100 };

export function filingStateTableName() {
  const name = process.env.COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME;
  if (!name) throw new Error("Missing required environment variable COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME");
  return name;
}

export function pendingFilingKey(submissionNumber) {
  return { hashedSub: GATEWAY_PARTITION, requestId: `${PENDING_PREFIX}${submissionNumber}` };
}

/**
 * Take the one right to record a submission's final status. The page poll and the presenter poll
 * both call this before they write a receipt, so only the first records it and sends the email.
 * @param {string} submissionNumber
 * @returns {Promise<boolean>} false when the status is already recorded
 */
export async function claimFinalStatus(submissionNumber) {
  const now = new Date();
  const { ttl } = calculateTtl(now, FILING_STATE_RETENTION);
  try {
    await executeDynamoDbCommand(
      (module) =>
        new module.UpdateCommand({
          TableName: filingStateTableName(),
          Key: pendingFilingKey(submissionNumber),
          UpdateExpression: "SET claimedAt = :now, #ttl = if_not_exists(#ttl, :ttl)",
          ConditionExpression: "attribute_not_exists(claimedAt)",
          ExpressionAttributeNames: { "#ttl": "ttl" },
          ExpressionAttributeValues: { ":now": now.toISOString(), ":ttl": ttl },
        }),
    );
    return true;
  } catch (error) {
    if (error.name === "ConditionalCheckFailedException") return false;
    throw error;
  }
}

/**
 * Give the claim back when the record of a final status failed part-way, so the next poll can try
 * again.
 * @param {string} submissionNumber
 */
export async function releaseFinalStatus(submissionNumber) {
  await executeDynamoDbCommand(
    (module) =>
      new module.UpdateCommand({
        TableName: filingStateTableName(),
        Key: pendingFilingKey(submissionNumber),
        UpdateExpression: "REMOVE claimedAt",
      }),
  );
}

/**
 * Take the presenter poll slot: true when no deployment of this environment has polled within the
 * interval the last poll set. Every deployment's schedule shares one slot, so the presenter is
 * polled at most once per interval.
 * @param {{nowSeconds: number, intervalSeconds: number}} input
 * @returns {Promise<boolean>}
 */
export async function claimPresenterPollSlot({ nowSeconds, intervalSeconds }) {
  try {
    await executeDynamoDbCommand(
      (module) =>
        new module.UpdateCommand({
          TableName: filingStateTableName(),
          Key: PRESENTER_POLL_STATE_KEY,
          UpdateExpression: "SET nextPollAt = :next, lastPolledAt = :now",
          ConditionExpression: "attribute_not_exists(nextPollAt) OR nextPollAt <= :now",
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
 * Move the next allowed presenter poll later, never earlier.
 * @param {number} nextPollAt - epoch seconds
 */
export async function deferPresenterPoll(nextPollAt) {
  try {
    await executeDynamoDbCommand(
      (module) =>
        new module.UpdateCommand({
          TableName: filingStateTableName(),
          Key: PRESENTER_POLL_STATE_KEY,
          UpdateExpression: "SET nextPollAt = :next",
          ConditionExpression: "nextPollAt < :next",
          ExpressionAttributeValues: { ":next": nextPollAt },
        }),
    );
  } catch (error) {
    if (error.name !== "ConditionalCheckFailedException") throw error;
  }
}

/**
 * The reader's Companies House filings that Companies House has not accepted yet: each one still
 * pending, and each rejection recorded in the last 100 days. An accepted filing is a receipt.
 * @param {string} userSub
 * @returns {Promise<Array<{submissionNumber: string, kind: string|undefined, status: "pending"|"rejected", submittedAt: string|undefined, rejections: Array}>>}
 */
export async function listFilingsInProgress(userSub) {
  const hashedSub = hashSub(userSub);
  const filings = [];
  let startKey;
  do {
    const exclusiveStartKey = startKey;
    const response = await executeDynamoDbCommand(
      (module) =>
        new module.QueryCommand({
          TableName: filingStateTableName(),
          KeyConditionExpression: "hashedSub = :hashedSub",
          // The table also holds Company Tax Return requests; only the XML Gateway forms are filings here.
          FilterExpression:
            "#data.#kind IN (:accounts, :confirmationStatement, :pscVerificationStatement) AND " +
            "(#status = :pending OR (#status = :failed AND #data.#statusCode = :reject))",
          // The pending item carries the filed document; only the fields the list shows are read.
          ProjectionExpression: "requestId, #status, createdAt, #data.#kind, #data.#statusCode, #data.#rejections",
          ExpressionAttributeNames: {
            "#status": "status",
            "#data": "data",
            "#kind": "kind",
            "#statusCode": "statusCode",
            "#rejections": "rejections",
          },
          ExpressionAttributeValues: {
            ":hashedSub": hashedSub,
            ":pending": "pending",
            ":failed": "failed",
            ":reject": "REJECT",
            ":accounts": "accounts",
            ":confirmationStatement": "confirmation-statement",
            ":pscVerificationStatement": "psc-verification-statement",
          },
          ExclusiveStartKey: exclusiveStartKey,
        }),
    );
    for (const item of response.Items ?? []) {
      filings.push({
        submissionNumber: item.requestId,
        kind: item.data?.kind,
        status: item.status === "pending" ? "pending" : "rejected",
        submittedAt: item.createdAt,
        rejections: item.data?.rejections ?? [],
      });
    }
    startKey = response.LastEvaluatedKey;
  } while (startKey);
  logger.info({ message: "Listed Companies House filings in progress", hashedSub, count: filings.length });
  return filings;
}
