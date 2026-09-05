// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/data/dynamoDbReceiptRepository.js

import { createLogger } from "../lib/logger.js";
import { hashSub, hashSubWithVersion, getSaltVersion, getPreviousVersions } from "../services/subHasher.js";
import { getDynamoDbDocClient } from "../lib/dynamoDbClient.js";
import { calculateHmrcTaxRecordTtl } from "../lib/dateUtils.js";

const logger = createLogger({ source: "app/data/dynamoDbReceiptRepository.js" });

function getTableName() {
  const tableName = process.env.RECEIPTS_DYNAMODB_TABLE_NAME;
  return tableName || "";
}

/**
 * Store a receipt in DynamoDB with 7-year retention (2555 days)
 * @param {string} userSub - The user's subject identifier
 * @param {string} receiptId - Unique receipt identifier (timestamp-formBundleNumber)
 * @param {object} receipt - The receipt data to store
 * @param {string} actor - Actor class of the filer ("customer", "test-user", "probe"),
 *   so real filings can be counted apart from CI and behaviour-test submissions
 */
export async function putReceipt(userSub, receiptId, receipt, actor) {
  logger.info({ message: `DynamoDB enabled, proceeding with putReceipt [table: ${process.env.RECEIPTS_DYNAMODB_TABLE_NAME}]` });

  try {
    const hashedSub = hashSub(userSub);
    logger.info({ message: "Storing receipt", hashedSub, userSub, receiptId });

    const { docClient, module } = await getDynamoDbDocClient();
    const tableName = getTableName();

    const now = new Date();
    const item = {
      hashedSub,
      receiptId,
      receipt,
      actor,
      saltVersion: getSaltVersion(),
      createdAt: now.toISOString(),
    };

    // Calculate TTL as 7 years (2555 days) after creation for HMRC tax record requirements
    const { ttl, ttl_datestamp } = calculateHmrcTaxRecordTtl(now);
    item.ttl = ttl;
    item.ttl_datestamp = ttl_datestamp;

    logger.info({
      message: "Storing receipt in DynamoDB as item",
      hashedSub,
      receiptId,
      ttl_datestamp: item.ttl_datestamp,
    });
    await docClient.send(
      new module.PutCommand({
        TableName: tableName,
        Item: item,
      }),
    );

    logger.info({
      message: "Receipt stored in DynamoDB as item",
      hashedSub,
      receiptId,
    });
  } catch (error) {
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
    const { docClient, module } = await getDynamoDbDocClient();
    const tableName = getTableName();

    const response = await docClient.send(
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
      const fallbackResponse = await docClient.send(
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
 * List all receipts for a user
 * @param {string} userSub - The user's subject identifier
 * @returns {Array} Array of receipt metadata objects
 */
export async function listUserReceipts(userSub) {
  logger.info({
    message: `DynamoDB enabled, proceeding with listUserReceipts [table: ${process.env.RECEIPTS_DYNAMODB_TABLE_NAME}]`,
    userSub,
  });

  try {
    const hashedSub = hashSub(userSub);
    logger.info({ message: "Retrieving receipts from DynamoDB", userSub, hashedSub });
    const { docClient, module } = await getDynamoDbDocClient();
    const tableName = getTableName();

    let response = await docClient.send(
      new module.QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "hashedSub = :hashedSub",
        ExpressionAttributeValues: {
          ":hashedSub": hashedSub,
        },
      }),
    );
    logger.info({ message: "Queried DynamoDB for user receipts", hashedSub, itemCount: response.Count });

    // Fall back to previous salt versions during migration window
    if (!response.Items || response.Items.length === 0) {
      for (const version of getPreviousVersions()) {
        const oldHash = hashSubWithVersion(userSub, version);
        response = await docClient.send(
          new module.QueryCommand({
            TableName: tableName,
            KeyConditionExpression: "hashedSub = :hashedSub",
            ExpressionAttributeValues: {
              ":hashedSub": oldHash,
            },
          }),
        );
        if (response.Items && response.Items.length > 0) {
          logger.warn({ message: "Found receipts at old salt version", version, hashedSub: oldHash });
          break;
        }
      }
    }

    // Convert DynamoDB items to receipt metadata
    const receipts = (response.Items || []).map((item) => {
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
      };
    });

    // Sort by timestamp descending (most recent first)
    receipts.sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));

    logger.info({
      message: "Retrieved receipts from DynamoDB",
      hashedSub,
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
