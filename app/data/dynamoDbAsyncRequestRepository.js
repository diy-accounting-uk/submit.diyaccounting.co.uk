// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/data/dynamoDbAsyncRequestRepository.js

import { createLogger } from "../lib/logger.js";
import { hashSub, hashSubWithVersion, getSaltVersion, getPreviousVersions } from "../services/subHasher.js";
import { executeDynamoDbCommand } from "../lib/dynamoDbClient.js";
import { calculateOneHourTtl } from "../lib/dateUtils.js";

const logger = createLogger({ source: "app/data/dynamoDbAsyncRequestRepository.js" });

/**
 * Store an async request state in DynamoDB
 * @param {string} userId - The user ID
 * @param {string} requestId - The request ID
 * @param {string} status - Request status: 'pending', 'processing', 'completed', 'failed'
 * @param {object} data - Optional data (result for completed, error for failed)
 * @param {string} tableName - Optional table name (defaults to env var)
 */
export async function putAsyncRequest(userId, requestId, status, data = null, tableName = null) {
  const actualTableName = tableName || process.env.ASYNC_REQUESTS_DYNAMODB_TABLE_NAME;
  if (!actualTableName) {
    logger.warn({ message: "putAsyncRequest called but no table name provided or in env", requestId });
    return;
  }
  logger.info({
    message: `putAsyncRequest [table: ${actualTableName}]`,
    requestId,
    status,
  });

  try {
    const hashedSub = hashSub(userId);

    const now = new Date();
    const isoNow = now.toISOString();

    // Calculate TTL as 1 hour from now
    const { ttl, ttl_datestamp: ttlDatestamp } = calculateOneHourTtl(now);

    const expressionAttributeNames = {
      "#status": "status",
      "#updatedAt": "updatedAt",
      "#ttl": "ttl",
      "#ttl_datestamp": "ttl_datestamp",
      "#createdAt": "createdAt",
      "#saltVersion": "saltVersion",
    };

    const expressionAttributeValues = {
      ":status": status,
      ":updatedAt": isoNow,
      ":ttl": ttl,
      ":ttl_datestamp": ttlDatestamp,
      ":createdAt": isoNow,
      ":saltVersion": getSaltVersion(),
    };

    let updateExpression =
      "SET #status = :status, #updatedAt = :updatedAt, #ttl = :ttl, #ttl_datestamp = :ttl_datestamp, #createdAt = if_not_exists(#createdAt, :createdAt), #saltVersion = :saltVersion";

    if (data) {
      updateExpression += ", #data = :data";
      expressionAttributeNames["#data"] = "data";
      expressionAttributeValues[":data"] = data;
    } else {
      updateExpression += " REMOVE #data";
      expressionAttributeNames["#data"] = "data";
    }

    await executeDynamoDbCommand(
      (module) =>
        new module.UpdateCommand({
          TableName: actualTableName,
          Key: {
            hashedSub,
            requestId,
          },
          UpdateExpression: updateExpression,
          ExpressionAttributeNames: expressionAttributeNames,
          ExpressionAttributeValues: expressionAttributeValues,
        }),
    );

    logger.info({
      message: "AsyncRequest stored in DynamoDB",
      hashedSub,
      requestId,
      status,
      tableName: actualTableName,
    });
  } catch (error) {
    logger.error({
      message: "Error storing AsyncRequest in DynamoDB",
      error: error.message,
      requestId,
      status,
      tableName: actualTableName,
    });
    throw error;
  }
}

/**
 * Retrieve an async request state from DynamoDB
 * @param {string} userId - The user ID
 * @param {string} requestId - The request ID
 * @param {string} tableName - Optional table name (defaults to env var)
 * @returns {object|null} The request state or null if not found
 */
export async function getAsyncRequest(userId, requestId, tableName = null) {
  const actualTableName = tableName || process.env.ASYNC_REQUESTS_DYNAMODB_TABLE_NAME;
  if (!actualTableName) {
    logger.warn({ message: "getAsyncRequest called but no table name provided or in env", requestId });
    return null;
  }
  logger.info({
    message: `getAsyncRequest [table: ${actualTableName}]`,
    requestId,
  });

  try {
    const hashedSub = hashSub(userId);

    const result = await executeDynamoDbCommand(
      (module) =>
        new module.GetCommand({
          TableName: actualTableName,
          Key: {
            hashedSub,
            requestId,
          },
          ConsistentRead: true,
        }),
    );

    if (result.Item) {
      logger.info({
        message: "AsyncRequest retrieved from DynamoDB",
        hashedSub,
        requestId,
        status: result.Item.status,
        tableName: actualTableName,
      });
      return result.Item;
    }

    // Fall back to previous salt versions during migration window
    for (const version of getPreviousVersions()) {
      const oldHash = hashSubWithVersion(userId, version);
      const fallbackResult = await executeDynamoDbCommand(
        (module) =>
          new module.GetCommand({
            TableName: actualTableName,
            Key: {
              hashedSub: oldHash,
              requestId,
            },
            ConsistentRead: true,
          }),
      );
      if (fallbackResult.Item) {
        logger.warn({
          message: "Found async request at old salt version",
          version,
          hashedSub: oldHash,
          requestId,
          tableName: actualTableName,
        });
        return fallbackResult.Item;
      }
    }

    logger.info({
      message: "AsyncRequest not found in DynamoDB",
      hashedSub,
      requestId,
      tableName: actualTableName,
    });
    return null;
  } catch (error) {
    logger.error({
      message: "Error retrieving AsyncRequest from DynamoDB",
      error: error.message,
      requestId,
      tableName: actualTableName,
    });
    throw error;
  }
}
