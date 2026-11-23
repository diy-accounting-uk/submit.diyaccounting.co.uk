// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/data/dynamoDbCompaniesHouseFilingStateRepository.js
// The state of Companies House XML Gateway filings that outlives one page visit. It lives in the
// Companies House async-requests table (COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME), in the
// "companies-house-xmlgw" partition that already holds the submission-number counter, so no item
// here can collide with a user's own request item:
//   pending#<submissionNumber>  - one per filing: claimedAt marks that a poll is recording its final
//                                 status, or has recorded it.
//                                 For a filing under our presenter it also holds the filer's sub,
//                                 sealed, and the form kind (dynamoDbCompaniesHousePendingFilerRepository.js).
//   presenter-poll-state        - nextPollAt: the earliest epoch second the presenter poll may run.
// The filer's own request item (partition = hashed sub, sort key = submission number) stays where
// the submit Lambda writes it; listFilingsInProgress reads those items for the filings list.

import { createLogger } from "../lib/logger.js";
import { executeDynamoDbCommand } from "../lib/dynamoDbClient.js";
import { calculateTtl } from "../lib/dateUtils.js";
import { hashSub } from "../services/subHasher.js";
import { COMPANIES_HOUSE_FORM_KINDS } from "../../web/public/lib/companies-house-forms.js";

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

// A record of a final status takes seconds and runs inside one Lambda invocation, which AWS stops
// after 15 minutes. A claim older than this belongs to a record that can no longer be running (its
// release failed, or its Lambda was stopped), so the next poll may take it.
export const FINAL_STATUS_CLAIM_STALE_MINUTES = 20;

/**
 * Take the one right to record a submission's final status. The page poll and the presenter poll
 * both call this before they write a receipt, so only the first records it and sends the email. A
 * claim older than FINAL_STATUS_CLAIM_STALE_MINUTES counts as given back.
 * @param {string} submissionNumber
 * @param {{now?: Date}} [options]
 * @returns {Promise<boolean>} false when another poll holds a claim that is not stale
 */
export async function claimFinalStatus(submissionNumber, { now = new Date() } = {}) {
  const { ttl } = calculateTtl(now, FILING_STATE_RETENTION);
  const staleBefore = new Date(now.getTime() - FINAL_STATUS_CLAIM_STALE_MINUTES * 60 * 1000);
  try {
    await executeDynamoDbCommand(
      (module) =>
        new module.UpdateCommand({
          TableName: filingStateTableName(),
          Key: pendingFilingKey(submissionNumber),
          UpdateExpression: "SET claimedAt = :now, #ttl = if_not_exists(#ttl, :ttl)",
          ConditionExpression: "attribute_not_exists(claimedAt) OR claimedAt < :staleBefore",
          ExpressionAttributeNames: { "#ttl": "ttl" },
          ExpressionAttributeValues: { ":now": now.toISOString(), ":staleBefore": staleBefore.toISOString(), ":ttl": ttl },
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

// The XML gateway forms, as the shared table lists them, as the filter's placeholders and values.
const FORM_KIND_PLACEHOLDERS = COMPANIES_HOUSE_FORM_KINDS.map((_, index) => `:kind${index}`);
const FORM_KIND_VALUES = Object.fromEntries(COMPANIES_HOUSE_FORM_KINDS.map((kind, index) => [`:kind${index}`, kind]));

/**
 * The reader's Companies House filings that Companies House has not accepted yet: each one still
 * pending, and each rejection recorded in the last 100 days. An accepted filing is a receipt. As
 * listUserReceipts does, it answers a practice client's filings for that client's id, and only the
 * filings made for no client otherwise.
 * @param {string} userSub
 * @param {string} [clientId] - one of the practice's clients
 * @returns {Promise<Array<{submissionNumber: string, kind: string|undefined, status: "pending"|"rejected", submittedAt: string|undefined, rejections: Array, clientId: string|null}>>}
 */
export async function listFilingsInProgress(userSub, clientId) {
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
            `#data.#kind IN (${FORM_KIND_PLACEHOLDERS.join(", ")}) AND ` +
            "(#status = :pending OR (#status = :failed AND #data.#statusCode = :reject))",
          // The pending item carries the filed document; only the fields the list shows are read.
          ProjectionExpression: "requestId, #status, createdAt, #data.#kind, #data.#statusCode, #data.#rejections, #data.#clientId",
          ExpressionAttributeNames: {
            "#status": "status",
            "#data": "data",
            "#kind": "kind",
            "#statusCode": "statusCode",
            "#rejections": "rejections",
            "#clientId": "clientId",
          },
          ExpressionAttributeValues: {
            ":hashedSub": hashedSub,
            ":pending": "pending",
            ":failed": "failed",
            ":reject": "REJECT",
            ...FORM_KIND_VALUES,
          },
          ExclusiveStartKey: exclusiveStartKey,
        }),
    );
    for (const item of response.Items ?? []) {
      const filingClientId = item.data?.clientId || null;
      if (clientId ? filingClientId !== clientId : filingClientId) continue;
      filings.push({
        submissionNumber: item.requestId,
        kind: item.data?.kind,
        status: item.status === "pending" ? "pending" : "rejected",
        submittedAt: item.createdAt,
        rejections: item.data?.rejections ?? [],
        clientId: filingClientId,
      });
    }
    startKey = response.LastEvaluatedKey;
  } while (startKey);
  logger.info({ message: "Listed Companies House filings in progress", hashedSub, count: filings.length });
  return filings;
}
