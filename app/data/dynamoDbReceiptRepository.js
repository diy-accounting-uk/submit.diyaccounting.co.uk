// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/data/dynamoDbReceiptRepository.js

import { createLogger } from "../lib/logger.js";
import { hashSub, hashSubWithVersion, getSaltVersion, getPreviousVersions, subHashCandidates } from "../services/subHasher.js";
import { executeDynamoDbCommand, getResourceName } from "../lib/dynamoDbClient.js";
import { receiptRetention } from "../lib/recordRetention.js";

const logger = createLogger({ source: "app/data/dynamoDbReceiptRepository.js" });

/**
 * Store a receipt in DynamoDB with 7-year retention (2555 days); a test or synthetic actor's receipt lives 2 days
 * @param {string} userSub - The user's subject identifier
 * @param {string} receiptId - Unique receipt identifier (timestamp-formBundleNumber)
 * @param {object} receipt - The receipt data to store
 * @param {string} actor - Actor class of the filer ("customer", "test-user", "probe"),
 *   so real filings can be counted apart from CI and behaviour-test submissions
 * @param {string} [clientId] - The practice's client id when the filing was client-scoped;
 *   omitted for the practice's own filings, so existing receipts with no client id stay readable
 */
export async function putReceipt(userSub, receiptId, receipt, actor, clientId) {
  await storeReceipt(userSub, receiptId, receipt, actor, clientId, { onlyIfNew: false });
}

/**
 * Store a receipt as putReceipt does, unless one is already stored under this receipt id, which it
 * leaves as it is. For a record that may be retried under the same receipt id.
 * @param {string} userSub
 * @param {string} receiptId
 * @param {object} receipt
 * @param {string} actor
 * @param {string} [clientId]
 * @returns {Promise<string|null>} the hash the receipt is stored under, or null when a receipt was
 *   already stored under this id
 */
export async function putReceiptIfNew(userSub, receiptId, receipt, actor, clientId) {
  return storeReceipt(userSub, receiptId, receipt, actor, clientId, { onlyIfNew: true });
}

async function storeReceipt(userSub, receiptId, receipt, actor, clientId, { onlyIfNew }) {
  logger.info({ message: `DynamoDB enabled, proceeding with putReceipt [table: ${process.env.RECEIPTS_DYNAMODB_TABLE_NAME}]` });

  try {
    const hashedSub = hashSub(userSub);
    logger.info({ message: "Storing receipt", hashedSub, userSub, receiptId });

    const tableName = getResourceName("RECEIPTS_DYNAMODB_TABLE_NAME");

    const now = new Date();
    const item = {
      hashedSub,
      receiptId,
      receipt,
      actor,
      clientId,
      saltVersion: getSaltVersion(),
      createdAt: now.toISOString(),
    };

    // TTL is 7 years (2555 days) after creation for HMRC tax record requirements, unless a test or synthetic actor filed it
    const { ttl, ttl_datestamp } = receiptRetention({ actor }, now);
    item.ttl = ttl;
    item.ttl_datestamp = ttl_datestamp;

    logger.info({
      message: "Storing receipt in DynamoDB as item",
      hashedSub,
      receiptId,
      ttl_datestamp: item.ttl_datestamp,
    });
    await executeDynamoDbCommand(
      (module) =>
        new module.PutCommand({
          TableName: tableName,
          Item: item,
          ...(onlyIfNew ? { ConditionExpression: "attribute_not_exists(receiptId)" } : {}),
        }),
    );

    logger.info({
      message: "Receipt stored in DynamoDB as item",
      hashedSub,
      receiptId,
    });
    return hashedSub;
  } catch (error) {
    if (onlyIfNew && error.name === "ConditionalCheckFailedException") {
      logger.info({ message: "Receipt already stored under this id", receiptId });
      return null;
    }
    logger.error({
      message: "Error storing receipt in DynamoDB",
      error: error.message,
      userSub,
      receiptId,
    });
    throw error;
  }
}

/**
 * Find the receipt a filer holds for one submission, under any salt version. The receipt id ends
 * with "Z-<submissionNumber>" and starts with a time no earlier than the submission was sent, so
 * the query reads only the filer's receipts stored since then.
 * @param {string} userSub
 * @param {string} submissionNumber
 * @param {string} sentAt - ISO time the submission was sent; no receipt of it is older
 * @returns {Promise<{receiptId: string, hashedSub: string, emailRequestedAt?: string, tokenChargedAt?: string}|null>}
 */
export async function findReceiptForSubmission(userSub, submissionNumber, sentAt) {
  const tableName = getResourceName("RECEIPTS_DYNAMODB_TABLE_NAME");
  const suffix = `Z-${submissionNumber}`;
  for (const { hashedSub } of subHashCandidates(userSub)) {
    let startKey;
    do {
      const exclusiveStartKey = startKey;
      const response = await executeDynamoDbCommand(
        (module) =>
          new module.QueryCommand({
            TableName: tableName,
            KeyConditionExpression: "hashedSub = :hashedSub AND receiptId >= :sentAt",
            ExpressionAttributeValues: { ":hashedSub": hashedSub, ":sentAt": sentAt },
            ProjectionExpression: "receiptId, emailRequestedAt, tokenChargedAt",
            ConsistentRead: true,
            ExclusiveStartKey: exclusiveStartKey,
          }),
      );
      const item = (response.Items ?? []).find((candidate) => candidate.receiptId.endsWith(suffix));
      if (item) return { ...item, hashedSub };
      startKey = response.LastEvaluatedKey;
    } while (startKey);
  }
  return null;
}

/**
 * Record on a stored receipt that one follow-up step of it has run, unless that step is already
 * recorded.
 * @param {string} hashedSub - the hash the receipt is stored under
 * @param {string} receiptId
 * @param {"emailRequestedAt"|"tokenChargedAt"} step
 * @returns {Promise<string|null>} the time recorded, or null when the step was already recorded
 */
export async function markReceiptStepDone(hashedSub, receiptId, step) {
  const recordedAt = new Date().toISOString();
  try {
    await executeDynamoDbCommand(
      (module) =>
        new module.UpdateCommand({
          TableName: getResourceName("RECEIPTS_DYNAMODB_TABLE_NAME"),
          Key: { hashedSub, receiptId },
          UpdateExpression: "SET #step = :now",
          ConditionExpression: "attribute_exists(receiptId) AND attribute_not_exists(#step)",
          ExpressionAttributeNames: { "#step": step },
          ExpressionAttributeValues: { ":now": recordedAt },
        }),
    );
    return recordedAt;
  } catch (error) {
    if (error.name === "ConditionalCheckFailedException") return null;
    logger.error({ message: "Error recording a receipt step", error: error.message, receiptId, step });
    throw error;
  }
}

/**
 * Stamp a stored receipt with the time its acknowledgement was accepted, and the language its
 * messages were first shown in, changing nothing else: the receipt keeps the actor, client, creation
 * time and ttl it was filed with.
 * @param {string} userSub
 * @param {string} receiptId
 * @param {{acknowledgedAt: string, presentedLanguage?: "en"|"cy"}} acknowledgement
 * @returns {Promise<boolean>} false when no receipt is stored under this id for this user
 */
export async function acknowledgeStoredReceipt(userSub, receiptId, { acknowledgedAt, presentedLanguage }) {
  const values = { ":at": acknowledgedAt, ...(presentedLanguage ? { ":language": presentedLanguage } : {}) };
  const updateExpression = presentedLanguage
    ? "SET #receipt.acknowledgedAt = :at, #receipt.presentedLanguage = :language"
    : "SET #receipt.acknowledgedAt = :at";
  for (const { hashedSub } of subHashCandidates(userSub)) {
    try {
      await executeDynamoDbCommand(
        (module) =>
          new module.UpdateCommand({
            TableName: getResourceName("RECEIPTS_DYNAMODB_TABLE_NAME"),
            Key: { hashedSub, receiptId },
            UpdateExpression: updateExpression,
            ConditionExpression: "attribute_exists(receiptId)",
            ExpressionAttributeNames: { "#receipt": "receipt" },
            ExpressionAttributeValues: values,
          }),
      );
      return true;
    } catch (error) {
      if (error.name === "ConditionalCheckFailedException") continue;
      logger.error({ message: "Error acknowledging a receipt", error: error.message, receiptId });
      throw error;
    }
  }
  return false;
}

/**
 * Remove a step recorded on a receipt, only when it still holds the time this caller recorded, so
 * the step runs again on the next record.
 * @param {string} hashedSub
 * @param {string} receiptId
 * @param {"emailRequestedAt"|"tokenChargedAt"} step
 * @param {string} recordedAt - the time markReceiptStepDone answered
 * @returns {Promise<boolean>} false when the step holds another time or none
 */
export async function clearReceiptStep(hashedSub, receiptId, step, recordedAt) {
  try {
    await executeDynamoDbCommand(
      (module) =>
        new module.UpdateCommand({
          TableName: getResourceName("RECEIPTS_DYNAMODB_TABLE_NAME"),
          Key: { hashedSub, receiptId },
          UpdateExpression: "REMOVE #step",
          ConditionExpression: "#step = :recordedAt",
          ExpressionAttributeNames: { "#step": step },
          ExpressionAttributeValues: { ":recordedAt": recordedAt },
        }),
    );
    return true;
  } catch (error) {
    if (error.name === "ConditionalCheckFailedException") return false;
    logger.error({ message: "Error clearing a receipt step", error: error.message, receiptId, step });
    throw error;
  }
}

/**
 * Get a receipt from DynamoDB by receiptId
 * @param {string} userSub - The user's subject identifier
 * @param {string} receiptId - The receipt identifier to retrieve
 * @returns {object} The receipt data
 */
export async function getReceipt(userSub, receiptId) {
  logger.info({
    message: `DynamoDB enabled, proceeding with getReceipt [table: ${process.env.RECEIPTS_DYNAMODB_TABLE_NAME}]`,
    userSub,
    receiptId,
  });

  try {
    const hashedSub = hashSub(userSub);
    logger.info({ message: "Retrieving receipt from DynamoDB", userSub, hashedSub, receiptId });
    const tableName = getResourceName("RECEIPTS_DYNAMODB_TABLE_NAME");

    const response = await executeDynamoDbCommand(
      (module) =>
        new module.GetCommand({
          TableName: tableName,
          Key: {
            hashedSub,
            receiptId,
          },
        }),
    );

    if (response.Item) {
      logger.info({ message: "Retrieved receipt from DynamoDB", hashedSub, receiptId });
      return response.Item.receipt;
    }

    // Fall back to previous salt versions during migration window
    for (const version of getPreviousVersions()) {
      const oldHash = hashSubWithVersion(userSub, version);
      const fallbackResponse = await executeDynamoDbCommand(
        (module) =>
          new module.GetCommand({
            TableName: tableName,
            Key: {
              hashedSub: oldHash,
              receiptId,
            },
          }),
      );
      if (fallbackResponse.Item) {
        logger.warn({ message: "Found receipt at old salt version", version, hashedSub: oldHash, receiptId });
        return fallbackResponse.Item.receipt;
      }
    }

    logger.info({ message: "Receipt not found in DynamoDB", hashedSub, receiptId });
    return null;
  } catch (error) {
    logger.error({
      message: "Error retrieving receipt from DynamoDB",
      error: error.message,
      userSub,
      receiptId,
    });
    throw error;
  }
}

/**
 * List a user's receipts, optionally narrowed to one of their practice's clients.
 * @param {string} userSub - The user's subject identifier
 * @param {string} [clientId] - When given, only that client's receipts are returned; when
 *   omitted, only the caller's own (no client id) receipts are returned
 * @returns {Array} Array of receipt metadata objects
 */
export async function listUserReceipts(userSub, clientId) {
  logger.info({
    message: `DynamoDB enabled, proceeding with listUserReceipts [table: ${process.env.RECEIPTS_DYNAMODB_TABLE_NAME}]`,
    userSub,
  });

  try {
    const tableName = getResourceName("RECEIPTS_DYNAMODB_TABLE_NAME");
    const itemsByReceiptId = new Map();

    // During a salt rotation a user's receipts can sit under two hashes at once, so every version
    // is read and merged.
    for (const { version, hashedSub } of subHashCandidates(userSub)) {
      // A query answers at most 1 MB a page, oldest first, and a receipt carries its filed copy, so
      // every page is read: a single page would drop the newest receipts of a user with many filings.
      let startKey;
      let itemCount = 0;
      do {
        const exclusiveStartKey = startKey;
        const response = await executeDynamoDbCommand(
          (module) =>
            new module.QueryCommand({
              TableName: tableName,
              KeyConditionExpression: "hashedSub = :hashedSub",
              ExpressionAttributeValues: {
                ":hashedSub": hashedSub,
              },
              ExclusiveStartKey: exclusiveStartKey,
            }),
        );
        for (const item of response.Items ?? []) {
          if (!itemsByReceiptId.has(item.receiptId)) itemsByReceiptId.set(item.receiptId, item);
        }
        itemCount += response.Count ?? 0;
        startKey = response.LastEvaluatedKey;
      } while (startKey);
      logger.info({ message: "Queried DynamoDB for user receipts", version, hashedSub, itemCount });
    }

    // Convert DynamoDB items to receipt metadata, narrowed to the requested client (or, with no
    // client id given, to the caller's own filings - a client's receipts never show by default).
    const receipts = [...itemsByReceiptId.values()]
      .filter((item) => (clientId ? item.clientId === clientId : !item.clientId))
      .map((item) => {
        // Extract timestamp and formBundleNumber from receiptId
        // Format: {ISO8601-timestamp}-{formBundleNumber}
        // ISO timestamps end with 'Z', so find the hyphen after 'Z'
        const zIndex = item.receiptId.indexOf("Z-");
        let timestamp;
        let formBundleNumber;

        if (zIndex > 0) {
          // Found 'Z-', so split there
          timestamp = item.receiptId.substring(0, zIndex + 1); // Include the 'Z'
          formBundleNumber = item.receiptId.substring(zIndex + 2); // Skip 'Z-'
        } else {
          // Fallback: no timestamp format found, treat whole string as formBundleNumber
          timestamp = item.receiptId;
          formBundleNumber = item.receiptId;
        }

        return {
          receiptId: item.receiptId,
          key: `receipts/${userSub}/${item.receiptId}.json`, // Legacy S3-style key for compatibility
          name: `${item.receiptId}.json`,
          timestamp: timestamp,
          formBundleNumber: formBundleNumber,
          createdAt: item.createdAt,
          lastModified: item.createdAt, // Use createdAt as lastModified for compatibility
          clientId: item.clientId || null,
          kind: item.receipt?.kind || null,
          jointFilingId: item.receipt?.jointFilingId || null,
          longPeriod: item.receipt?.longPeriod || null,
          amended: item.receipt?.amended === true,
          size: Buffer.byteLength(JSON.stringify(item.receipt ?? {})),
        };
      });

    // Sort by timestamp descending (most recent first)
    receipts.sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));

    logger.info({
      message: "Retrieved receipts from DynamoDB",
      count: receipts.length,
    });

    return receipts;
  } catch (error) {
    logger.error({
      message: "Error retrieving receipts from DynamoDB",
      error: error.message,
      userSub,
    });
    throw error;
  }
}
