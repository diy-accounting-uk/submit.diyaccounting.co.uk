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
//   presenter-poll-state        - nextPollAt: the earliest epoch second the presenter poll may run;
//                                 lastAskedAt: when the gateway last answered a presenter poll.
// The filer's own request item (partition = hashed sub, sort key = submission number) stays where
// the submit Lambda writes it; listFilingsInProgress reads those items for the filings list. The
// same partition holds the filer's Company Tax Return requests (listCompanyTaxReturnsInProgress).

import { createLogger } from "../lib/logger.js";
import { executeDynamoDbCommand } from "../lib/dynamoDbClient.js";
import { calculateTtl } from "../lib/dateUtils.js";
import { hashSub } from "../services/subHasher.js";
import { COMPANIES_HOUSE_FORM_KINDS } from "../../web/public/lib/companies-house-forms.js";
import { CT_RETURN_KIND } from "../services/ctReturnKind.js";

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

/**
 * Record when the gateway answered a presenter poll. That poll asks about every filing under our
 * presenter at once, so the filings list reads this time as the last time Submit asked about each.
 * @param {Date} askedAt
 */
export async function recordPresenterPollAsked(askedAt) {
  await executeDynamoDbCommand(
    (module) =>
      new module.UpdateCommand({
        TableName: filingStateTableName(),
        Key: PRESENTER_POLL_STATE_KEY,
        UpdateExpression: "SET lastAskedAt = :askedAt",
        ExpressionAttributeValues: { ":askedAt": askedAt.toISOString() },
      }),
  );
}

// BatchGetItem reads at most 100 keys a call.
const BATCH_GET_KEYS = 100;

/**
 * Which of these pending filings the presenter poll asks about, and when it last asked. A filing
 * under our presenter has a pending#<submissionNumber> item that names its kind; a filing under the
 * customer's own presenter has none, or one that holds only a claim.
 * @param {string[]} submissionNumbers
 * @returns {Promise<{onSchedule: Set<string>, lastAskedAt: string|undefined}>}
 */
async function presenterPollCoverage(submissionNumbers) {
  const tableName = filingStateTableName();
  const onSchedule = new Set();
  let lastAskedAt;
  const allKeys = [PRESENTER_POLL_STATE_KEY, ...submissionNumbers.map(pendingFilingKey)];
  for (let start = 0; start < allKeys.length; start += BATCH_GET_KEYS) {
    let keys = allKeys.slice(start, start + BATCH_GET_KEYS);
    while (keys.length > 0) {
      const batch = await executeDynamoDbCommand(
        (module) =>
          new module.BatchGetCommand({
            RequestItems: {
              [tableName]: {
                Keys: keys,
                ProjectionExpression: "requestId, #kind, lastAskedAt",
                ExpressionAttributeNames: { "#kind": "kind" },
              },
            },
          }),
      );
      for (const item of batch.Responses?.[tableName] ?? []) {
        if (item.requestId === PRESENTER_POLL_STATE_KEY.requestId) lastAskedAt = item.lastAskedAt;
        else if (item.kind) onSchedule.add(item.requestId.slice(PENDING_PREFIX.length));
      }
      keys = batch.UnprocessedKeys?.[tableName]?.Keys ?? [];
    }
  }
  return { onSchedule, lastAskedAt };
}

// The later of two ISO times, either of which may be missing.
function laterOf(first, second) {
  if (!first) return second;
  if (!second) return first;
  return first > second ? first : second;
}

// The XML gateway forms, as the shared table lists them, as the filter's placeholders and values.
const FORM_KIND_PLACEHOLDERS = COMPANIES_HOUSE_FORM_KINDS.map((_, index) => `:kind${index}`);
const FORM_KIND_VALUES = Object.fromEntries(COMPANIES_HOUSE_FORM_KINDS.map((kind, index) => [`:kind${index}`, kind]));

/**
 * The reader's Companies House filings that Companies House has not accepted yet: each one still
 * pending, and each rejection recorded in the last 100 days. An accepted filing is a receipt. As
 * listUserReceipts does, it answers a practice client's filings for that client's id, and only the
 * filings made for no client otherwise. A pending filing also says whether the scheduled presenter
 * poll asks about it (askedOnSchedule) and when Submit last asked Companies House about it
 * (lastCheckedAt): the later of its own last status poll and, on schedule, the last presenter poll
 * since it was sent.
 * @param {string} userSub
 * @param {string} [clientId] - one of the practice's clients
 * @returns {Promise<Array<{submissionNumber: string, kind: string|undefined, companyNumber: string|undefined, status: "pending"|"rejected", submittedAt: string|undefined, rejections: Array, clientId: string|null, askedOnSchedule?: boolean, lastCheckedAt?: string}>>}
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
          ProjectionExpression:
            "requestId, #status, createdAt, #data.#kind, #data.#companyNumber, #data.#statusCode, #data.#rejections, #data.#clientId, #data.#lastCheckedAt",
          ExpressionAttributeNames: {
            "#status": "status",
            "#data": "data",
            "#kind": "kind",
            "#companyNumber": "companyNumber",
            "#statusCode": "statusCode",
            "#rejections": "rejections",
            "#clientId": "clientId",
            "#lastCheckedAt": "lastCheckedAt",
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
        companyNumber: item.data?.companyNumber,
        status: item.status === "pending" ? "pending" : "rejected",
        submittedAt: item.createdAt,
        rejections: item.data?.rejections ?? [],
        clientId: filingClientId,
        lastCheckedAt: item.data?.lastCheckedAt,
      });
    }
    startKey = response.LastEvaluatedKey;
  } while (startKey);
  const pending = filings.filter((filing) => filing.status === "pending");
  const { onSchedule, lastAskedAt } = pending.length
    ? await presenterPollCoverage(pending.map((filing) => filing.submissionNumber))
    : { onSchedule: new Set() };
  for (const filing of filings) {
    if (filing.status !== "pending") {
      delete filing.lastCheckedAt;
      continue;
    }
    filing.askedOnSchedule = onSchedule.has(filing.submissionNumber);
    const askedSinceSent = filing.askedOnSchedule && lastAskedAt && (!filing.submittedAt || lastAskedAt >= filing.submittedAt);
    filing.lastCheckedAt = laterOf(filing.lastCheckedAt, askedSinceSent ? lastAskedAt : undefined);
    if (!filing.lastCheckedAt) delete filing.lastCheckedAt;
  }
  logger.info({ message: "Listed Companies House filings in progress", hashedSub, count: filings.length });
  return filings;
}

/**
 * The reader's Company Tax Returns that HMRC has not answered finally yet: the requests of the
 * Company Tax Return kind still pending, read by a Query on the reader's own partition. As
 * listFilingsInProgress does, a practice client's returns answer for that client's id, and only the
 * returns made for no client otherwise. The filed documents are not read.
 * @param {string} userSub
 * @param {string} [clientId] - one of the practice's clients
 * @returns {Promise<Array<{correlationId: string, status: "pending", submittedAt: string|undefined, lastCheckedAt: string|undefined, utr: string|undefined, companyName: string|undefined, companyNumber: string|undefined, periodStart: string|undefined, periodEnd: string|undefined, clientId: string|null}>>}
 */
export async function listCompanyTaxReturnsInProgress(userSub, clientId) {
  const hashedSub = hashSub(userSub);
  const returns = [];
  let startKey;
  do {
    const exclusiveStartKey = startKey;
    const response = await executeDynamoDbCommand(
      (module) =>
        new module.QueryCommand({
          TableName: filingStateTableName(),
          KeyConditionExpression: "hashedSub = :hashedSub",
          FilterExpression: "#data.#kind = :ctReturn AND #status = :pending",
          ProjectionExpression:
            "requestId, #status, createdAt, #data.#clientId, #data.#utr, #data.#lastCheckedAt, " +
            "#data.#formRequest.#company.#companyName, #data.#formRequest.#company.#companyNumber, " +
            "#data.#filed.#boxes.#periodStart, #data.#filed.#boxes.#periodEnd",
          ExpressionAttributeNames: {
            "#status": "status",
            "#data": "data",
            "#kind": "kind",
            "#clientId": "clientId",
            "#utr": "utr",
            "#lastCheckedAt": "lastCheckedAt",
            "#formRequest": "formRequest",
            "#company": "company",
            "#companyName": "companyName",
            "#companyNumber": "companyNumber",
            "#filed": "filed",
            "#boxes": "boxes",
            // CT600 boxes 30 and 35: the start and end of the period the return covers.
            "#periodStart": "30",
            "#periodEnd": "35",
          },
          ExpressionAttributeValues: { ":hashedSub": hashedSub, ":ctReturn": CT_RETURN_KIND, ":pending": "pending" },
          ExclusiveStartKey: exclusiveStartKey,
        }),
    );
    for (const item of response.Items ?? []) {
      const returnClientId = item.data?.clientId || null;
      if (clientId ? returnClientId !== clientId : returnClientId) continue;
      const company = item.data?.formRequest?.company;
      const boxes = item.data?.filed?.boxes;
      returns.push({
        correlationId: item.requestId,
        status: "pending",
        submittedAt: item.createdAt,
        lastCheckedAt: item.data?.lastCheckedAt,
        utr: item.data?.utr,
        companyName: company?.companyName || undefined,
        companyNumber: company?.companyNumber || undefined,
        periodStart: boxes?.["30"],
        periodEnd: boxes?.["35"],
        clientId: returnClientId,
      });
    }
    startKey = response.LastEvaluatedKey;
  } while (startKey);
  logger.info({ message: "Listed Company Tax Returns in progress", hashedSub, count: returns.length });
  return returns;
}
